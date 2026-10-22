import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, version as esbuildVersion } from 'esbuild';
import { defineConfig, type Plugin } from 'vite';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const evidenceRoot = '/Users/sunmozong/.codex/visualizations/2026/10/21/01a15cba-2afb-7841-bff7-385c50f04529/water-outlet-optics-r1';
const contextSourceRoot = join(evidenceRoot, 'harness-context-source');
const contextBundle = join(evidenceRoot, 'harness-context.mjs');
const baselineSourceRoot = join(evidenceRoot, 'baseline-water-source');
const baselineBundle = join(evidenceRoot, 'baseline-water.mjs');
const metaFile = join(evidenceRoot, 'harness-build-meta.json');
const htmlEntry = '/src/world3d/reference/water-outlet-preview.html';
const sourcePrefix = 'src/world3d/reference/';
const baselineNames = [
  'water.ts', 'water-streams.ts', 'water-surface.ts', 'water-surface-shaders.ts',
  'water-falls.ts', 'water-falls-shaders.ts', 'water-shore.ts',
].sort();
const currentNames = [...baselineNames, 'water-streams-optics.ts'].sort();
const contextExports = [
  'REFERENCE_LAYOUT', 'REFERENCE_LAYOUT_REVISION', 'referenceTerrainHeight', 'referenceWalkHeight',
  'buildReferenceBridge', 'loadArchitectureMaterials', 'createReferenceRenderContext',
].sort();
const contextEntry = [
  "export { REFERENCE_LAYOUT, REFERENCE_LAYOUT_REVISION } from './src/world3d/reference/layout';",
  "export { referenceTerrainHeight, referenceWalkHeight } from './src/world3d/reference/composition';",
  "export { buildReferenceBridge } from './src/world3d/reference/architecture-bridge';",
  "export { loadArchitectureMaterials } from './src/world3d/reference/architecture-materials';",
  "export { createReferenceRenderContext } from './src/world3d/reference/render-context';",
  '',
].join('\n');

type Hashes = Record<string, string>;
interface FrozenBundle {
  sourceDirectory: string;
  sourceHashes: Hashes;
  closureInputs: string[];
  bundlePath: string;
  bundleSha256: string;
  exports: string[];
  externalImports: string[];
}
interface HarnessMeta {
  schemaVersion: 1;
  capturedAt: string;
  repositoryRoot: string;
  frozenContext: FrozenBundle & { entrySha256: string; provenanceOnlySources: string[] };
  baseline: FrozenBundle & { manifestSha256: string };
  runtime: { threeVersion: string; threeModulePath: string; threeModuleSha256: string; esbuildVersion: string };
}

const sha256 = (content: Uint8Array | string) => createHash('sha256').update(content).digest('hex');
const fileHash = async (path: string) => sha256(await readFile(path));
const portable = (path: string) => path.split(sep).join('/');
const exists = async (path: string) => {
  try { await access(path); return true; }
  catch (error) { if ((error as { code?: string }).code === 'ENOENT') return false; throw error; }
};
function inside(root: string, path: string) {
  const name = relative(root, path);
  return name !== '..' && !name.startsWith(`..${sep}`) && !isAbsolute(name);
}
async function checkHash(path: string, expected: string) {
  const actual = await fileHash(path);
  if (actual !== expected) throw new Error(`Frozen harness hash mismatch: ${path}\nexpected ${expected}\nactual   ${actual}`);
}
async function hashFiles(root: string, names: readonly string[]): Promise<Hashes> {
  return Object.fromEntries(await Promise.all([...names].sort().map(async name => [name, await fileHash(join(root, name))])));
}

async function baselineInputs() {
  const manifestPath = join(baselineSourceRoot, 'SHA256.json');
  const text = await readFile(manifestPath, 'utf8');
  const hashes = JSON.parse(text) as Hashes;
  if (Object.keys(hashes).sort().join('\n') !== baselineNames.join('\n')) {
    throw new Error('Baseline manifest must contain exactly the seven approved frozen water sources.');
  }
  for (const [name, hash] of Object.entries(hashes)) {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error(`Invalid baseline SHA-256: ${name}`);
    await checkHash(join(baselineSourceRoot, name), hash);
  }
  return { hashes, manifestSha256: sha256(text) };
}

async function bundleFrozen(root: string, entry: string, outfile: string, allowedInputs?: ReadonlySet<string>) {
  const result = await build({
    absWorkingDir: root, entryPoints: [entry], outfile, bundle: true, write: false,
    format: 'esm', platform: 'browser', target: 'es2022', treeShaking: true,
    external: ['three', 'three/*'], metafile: true, logLevel: 'silent',
  });
  const inputs = Object.keys(result.metafile!.inputs).map(name => portable(relative(root, resolve(root, name)))).sort();
  for (const name of inputs) {
    if (!inside(root, resolve(root, name)) || (allowedInputs && !allowedInputs.has(name))) {
      throw new Error(`Frozen bundle escaped its approved source closure: ${name}`);
    }
  }
  const output = result.outputFiles!.find(file => resolve(file.path) === resolve(outfile));
  const outputMeta = Object.values(result.metafile!.outputs).find(file => file.entryPoint);
  if (!output || !outputMeta) throw new Error(`Missing frozen bundle output: ${outfile}`);
  const externalImports = [...new Set(outputMeta.imports.map(item => item.path))].sort();
  if (externalImports.some(name => name !== 'three' && !name.startsWith('three/'))) {
    throw new Error(`Unexpected frozen runtime dependency: ${externalImports.join(', ')}`);
  }
  return { contents: output.contents, inputs, exports: outputMeta.exports.sort(), externalImports };
}

async function verifyFrozen(meta: HarnessMeta) {
  if (meta.schemaVersion !== 1 || meta.repositoryRoot !== repoRoot
    || meta.frozenContext.sourceDirectory !== contextSourceRoot || meta.frozenContext.bundlePath !== contextBundle
    || meta.baseline.sourceDirectory !== baselineSourceRoot || meta.baseline.bundlePath !== baselineBundle) {
    throw new Error('Existing harness metadata does not describe this frozen preview. Refusing to re-freeze it.');
  }
  const baseline = await baselineInputs();
  if (baseline.manifestSha256 !== meta.baseline.manifestSha256
    || JSON.stringify(Object.entries(baseline.hashes).sort()) !== JSON.stringify(Object.entries(meta.baseline.sourceHashes).sort())) {
    throw new Error('The frozen baseline source manifest changed. Refusing a live fallback or re-freeze.');
  }
  for (const [name, hash] of Object.entries(meta.frozenContext.sourceHashes)) {
    const path = resolve(contextSourceRoot, name);
    if (!inside(contextSourceRoot, path)) throw new Error(`Invalid frozen context source: ${name}`);
    await checkHash(path, hash);
  }
  await checkHash(join(contextSourceRoot, 'entry.ts'), meta.frozenContext.entrySha256);
  await checkHash(contextBundle, meta.frozenContext.bundleSha256);
  await checkHash(baselineBundle, meta.baseline.bundleSha256);
  await checkHash(meta.runtime.threeModulePath, meta.runtime.threeModuleSha256);
  if (meta.runtime.threeModulePath !== join(repoRoot, 'node_modules/three/build/three.module.js')) {
    throw new Error('The frozen context and live water must share the approved Three.js module.');
  }
  return meta;
}

async function prepareHarness(): Promise<HarnessMeta> {
  if (await exists(metaFile)) return verifyFrozen(JSON.parse(await readFile(metaFile, 'utf8')) as HarnessMeta);
  if (await exists(contextBundle) || await exists(baselineBundle) || await exists(contextSourceRoot)) {
    throw new Error('Incomplete frozen harness artifacts exist without metadata. Preserve and inspect them before retrying; no automatic re-freeze is allowed.');
  }
  const capturedAt = new Date().toISOString();
  const baseline = await baselineInputs();
  const baselineOutput = await bundleFrozen(baselineSourceRoot, 'water.ts', baselineBundle, new Set(baselineNames));
  if (baselineOutput.inputs.join('\n') !== baselineNames.join('\n') || baselineOutput.exports.join('\n') !== 'createReferenceWater') {
    throw new Error('Baseline bundle must use all seven approved sources and export only createReferenceWater.');
  }

  const referenceFiles = (await readdir(join(repoRoot, sourcePrefix))).filter(name => name.endsWith('.ts')).sort();
  const candidates = [...referenceFiles.map(name => `${sourcePrefix}${name}`), 'src/world3d/types.ts', 'src/world3d/painterly.ts'].sort();
  const capturedSources = new Map(await Promise.all(candidates.map(async name => [name, await readFile(join(repoRoot, name))] as const)));
  await mkdir(contextSourceRoot, { recursive: true });
  for (const [name, contents] of capturedSources) {
    const destination = join(contextSourceRoot, name);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, contents, { flag: 'wx' });
  }
  await writeFile(join(contextSourceRoot, 'entry.ts'), contextEntry, { flag: 'wx' });
  const contextOutput = await bundleFrozen(contextSourceRoot, 'entry.ts', contextBundle);
  if (contextOutput.exports.join('\n') !== contextExports.join('\n')) throw new Error('Unexpected frozen context export contract.');
  // Keep the actual esbuild closure plus the original assembly/type contracts as provenance.
  const proofSources = [`${sourcePrefix}architecture.ts`, `${sourcePrefix}water.ts`, `${sourcePrefix}contracts.ts`, 'src/world3d/types.ts'];
  const retained = new Set([...contextOutput.inputs, ...proofSources]);
  for (const [name, contents] of capturedSources) {
    if (retained.has(name) && await fileHash(join(repoRoot, name)) !== sha256(contents)) {
      throw new Error(`Source changed during context capture: ${name}. Keep this incomplete capture for inspection.`);
    }
  }
  for (const name of candidates) if (!retained.has(name)) await rm(join(contextSourceRoot, name));
  const sourceHashes = Object.fromEntries([...capturedSources].filter(([name]) => retained.has(name)).map(([name, contents]) => [name, sha256(contents)]));
  const threeModulePath = join(repoRoot, 'node_modules/three/build/three.module.js');
  const threePackage = JSON.parse(await readFile(join(repoRoot, 'node_modules/three/package.json'), 'utf8')) as { version: string };
  const meta: HarnessMeta = {
    schemaVersion: 1, capturedAt, repositoryRoot: repoRoot,
    frozenContext: {
      sourceDirectory: contextSourceRoot, sourceHashes,
      closureInputs: contextOutput.inputs.filter(name => name !== 'entry.ts'),
      provenanceOnlySources: proofSources.filter(name => !contextOutput.inputs.includes(name)),
      entrySha256: sha256(contextEntry), bundlePath: contextBundle, bundleSha256: sha256(contextOutput.contents),
      exports: contextOutput.exports, externalImports: contextOutput.externalImports,
    },
    baseline: {
      sourceDirectory: baselineSourceRoot, sourceHashes: baseline.hashes, manifestSha256: baseline.manifestSha256,
      closureInputs: baselineOutput.inputs, bundlePath: baselineBundle, bundleSha256: sha256(baselineOutput.contents),
      exports: baselineOutput.exports, externalImports: baselineOutput.externalImports,
    },
    runtime: { threeVersion: threePackage.version, threeModulePath, threeModuleSha256: await fileHash(threeModulePath), esbuildVersion },
  };
  await writeFile(contextBundle, contextOutput.contents, { flag: 'wx' });
  await writeFile(baselineBundle, baselineOutput.contents, { flag: 'wx' });
  await writeFile(metaFile, `${JSON.stringify(meta, null, 2)}\n`, { flag: 'wx' });
  return verifyFrozen(meta);
}

class EvidenceRequestError extends Error {
  constructor(readonly statusCode: number, message: string) { super(message); }
}

function boundedBody(request: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    const cleanup = () => {
      request.removeListener('data', onData);
      request.removeListener('end', onEnd);
      request.removeListener('error', onError);
      request.removeListener('aborted', onAborted);
    };
    const onError = (error: Error) => { cleanup(); rejectBody(error); };
    const onAborted = () => onError(new EvidenceRequestError(400, 'Evidence upload was aborted.'));
    const onEnd = () => { cleanup(); resolveBody(Buffer.concat(chunks, bytes)); };
    const onData = (chunk: Buffer | string) => {
      const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += data.byteLength;
      if (bytes > limit) {
        cleanup(); chunks.length = 0; request.resume();
        rejectBody(new EvidenceRequestError(413, `Evidence exceeds the ${limit}-byte limit.`));
        return;
      }
      chunks.push(data);
    };
    request.on('data', onData);
    request.once('end', onEnd);
    request.once('error', onError);
    request.once('aborted', onAborted);
  });
}

async function saveEvidence(request: IncomingMessage) {
  const filename = request.headers['x-outlet-filename'];
  const match = typeof filename === 'string'
    ? /^outlet-(baseline|current)-(low|medium)-(near|bridge|sea)-t\d{1,6}\.\d{2}-\d{8}T\d{9}Z\.(png|webm|json)$/.exec(filename)
    : null;
  if (!match || match[0] !== filename) throw new EvidenceRequestError(400, 'Invalid x-outlet-filename.');
  const extension = match[4] as 'png' | 'webm' | 'json';
  const formats = {
    png: { mime: 'image/png', limit: 16 * 1024 * 1024 },
    webm: { mime: 'video/webm', limit: 64 * 1024 * 1024 },
    json: { mime: 'application/json', limit: 8 * 1024 * 1024 },
  };
  const format = formats[extension];
  const contentType = request.headers['content-type']?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== format.mime) throw new EvidenceRequestError(415, `Expected ${format.mime} for .${extension}.`);
  const declaredLength = request.headers['content-length'];
  if (declaredLength !== undefined && (typeof declaredLength !== 'string' || !/^\d+$/.test(declaredLength))) {
    throw new EvidenceRequestError(400, 'Invalid Content-Length.');
  }
  if (declaredLength !== undefined && Number(declaredLength) > format.limit) {
    throw new EvidenceRequestError(413, `Evidence exceeds the ${format.limit}-byte limit.`);
  }
  const contents = await boundedBody(request, format.limit);
  if (contents.byteLength === 0) throw new EvidenceRequestError(400, 'Evidence upload is empty.');
  const directory = join(evidenceRoot, 'evidence');
  const path = join(directory, filename as string);
  await mkdir(directory, { recursive: true });
  await writeFile(path, contents, { flag: 'wx' });
  return { saved: true, filename, path, bytes: contents.byteLength, sha256: sha256(contents) };
}

function sourceMetadataPlugin(): Plugin {
  return {
    name: 'independent-water-outlet-frozen-harness',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://127.0.0.1:5211').pathname;
        const readRequest = request.method === 'GET' || request.method === 'HEAD';
        if (pathname === '/__water_outlet_evidence') {
          response.setHeader('Cache-Control', 'no-store, max-age=0');
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          if (request.method !== 'POST') {
            response.statusCode = 405; response.setHeader('Allow', 'POST'); response.end(); return;
          }
          try {
            const receipt = await saveEvidence(request);
            response.statusCode = 200; response.end(JSON.stringify(receipt));
          } catch (error) {
            request.resume();
            response.statusCode = error instanceof EvidenceRequestError ? error.statusCode
              : (error as { code?: string }).code === 'EEXIST' ? 409 : 500;
            response.end(JSON.stringify({ saved: false, error: error instanceof Error ? error.message : String(error) }));
          }
          return;
        }
        if (readRequest && pathname === htmlEntry) {
          const accept = request.headers.accept ?? '';
          if (request.headers['sec-fetch-dest'] === 'document' || accept.includes('text/html') || !accept) {
            server.moduleGraph.invalidateAll();
          }
        }
        if (pathname !== '/__water_outlet_sources') { next(); return; }
        response.setHeader('Cache-Control', 'no-store, max-age=0');
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        if (!readRequest) { response.statusCode = 405; response.setHeader('Allow', 'GET, HEAD'); response.end(); return; }
        try {
          const [sourceHashes, previewHashes] = await Promise.all([
            hashFiles(repoRoot, currentNames.map(name => `${sourcePrefix}${name}`)),
            hashFiles(repoRoot, [`${sourcePrefix}water-outlet-preview.ts`, `${sourcePrefix}water-outlet-preview.html`, 'water-outlet-preview.vite.config.ts']),
          ]);
          const body = JSON.stringify({
            schemaVersion: 1, capturedAt: new Date().toISOString(),
            current: { sourceCount: currentNames.length, sourceHashes },
            preview: { sourceHashes: previewHashes },
          }, null, 2);
          response.statusCode = 200;
          response.end(request.method === 'HEAD' ? undefined : body);
        } catch (error) {
          response.statusCode = 500;
          response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
      });
    },
  };
}

export default defineConfig(async () => {
  const meta = await prepareHarness();
  return {
    root: repoRoot, base: '/', appType: 'mpa', cacheDir: join(evidenceRoot, 'vite-cache'),
    plugins: [sourceMetadataPlugin()],
    define: {
      __OUTLET_CONTEXT_URL__: JSON.stringify(`/@fs${contextBundle}`),
      __OUTLET_BASELINE_URL__: JSON.stringify(`/@fs${baselineBundle}`),
      __OUTLET_BOOT_META__: JSON.stringify(meta),
    },
    resolve: {
      alias: [
        { find: /^three$/, replacement: join(repoRoot, 'node_modules/three/build/three.module.js') },
        { find: /^three\/addons\//, replacement: `${join(repoRoot, 'node_modules/three/examples/jsm')}/` },
      ],
      dedupe: ['three'],
    },
    // Native ESM keeps frozen bundles and live sources on the same canonical Three.js URL.
    optimizeDeps: { noDiscovery: true, include: [] },
    server: {
      host: '127.0.0.1', port: 5211, strictPort: true, hmr: false, watch: null,
      fs: { strict: true, allow: [repoRoot, evidenceRoot] },
      headers: { 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache', Expires: '0' },
    },
  };
});
