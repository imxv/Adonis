import * as THREE from 'three';

export interface ReferenceBridgeOptions {
  quality: 'low' | 'high';
  stone: THREE.MeshStandardMaterial;
  mortar: THREE.MeshStandardMaterial;
  capstone: THREE.MeshStandardMaterial;
}

// Metres, local +X crosses the stream; the complete vault runs along Z.
const HALF_LENGTH = 3.6;
const HALF_WIDTH = 1.2;
const BRIDGE_WIDTH = HALF_WIDTH * 2;
const PAVING_HALF_WIDTH = HALF_WIDTH - .20;
const COPING_INNER_Z = HALF_WIDTH - .235;
const SPANDREL_INNER_Z = HALF_WIDTH - .285;
const MORTAR_HALF_WIDTH = HALF_WIDTH - .055;
const SPRING_Y = 0.45;
const INNER_RX = 2.3;
const INNER_RY = 1.24;
const OUTER_RX = 2.66;
const OUTER_RY = 1.43;
const PAVING_DEPTH = 0.095;
const JOINT = 0.014;

function noise(seed: number): number {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

function deckY(x: number): number {
  return 2 - 0.4 * Math.pow(Math.min(1, Math.abs(x) / HALF_LENGTH), 1.8);
}

function outerArchY(x: number): number {
  if (Math.abs(x) >= OUTER_RX) return SPRING_Y;
  return SPRING_Y + OUTER_RY * Math.sqrt(1 - (x / OUTER_RX) ** 2);
}

interface EdgeWeatherRecord {
  role: 'coping' | 'vault'; side: number; prominent: boolean; verticalLoss: number;
  corner: number[]; fractureCentre: number[];
}

const BANK_CORNERS = [-1, 1].flatMap(end => [-1, 1].map(side => ({
  end, side, leg: .145 + noise(end * 173 + side * 137) * .03,
})));

/** A sealed XZ chamfer across all courses, preserving local weather scalars. */
function trimBankEnds(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const corner of BANK_CORNERS) {
    const normal = new THREE.Vector3(corner.end, 0, corner.side).normalize();
    const recess = Number(geometry.userData.bankCapRecess) || 0;
    const plane = new THREE.Plane(normal, -(HALF_LENGTH + HALF_WIDTH - corner.leg) / Math.sqrt(2) + recess);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const extreme = new THREE.Vector3(corner.end > 0 ? box.max.x : box.min.x, 0, corner.side > 0 ? box.max.z : box.min.z);
    if (plane.distanceToPoint(extreme) <= 1e-7) continue;
    const source = geometry.index ? geometry.toNonIndexed() : geometry;
    const p = source.getAttribute('position'), wear = source.getAttribute('architectureWear'), tone = source.getAttribute('bridgeWeatherTone');
    type Vertex = { p: THREE.Vector3; wear: number; tone: number };
    const positions: number[] = [], wears: number[] = [], tones: number[] = [], rim = new Map<string, Vertex>();
    const emit = (a: Vertex, b: Vertex, c: Vertex) => {
      if (b.p.clone().sub(a.p).cross(c.p.clone().sub(a.p)).lengthSq() < 1e-18) return;
      for (const vertex of [a, b, c]) { positions.push(...vertex.p.toArray()); wears.push(vertex.wear); tones.push(vertex.tone); }
    };
    for (let i = 0; i < p.count; i += 3) {
      const input: Vertex[] = [0, 1, 2].map(j => ({ p: new THREE.Vector3().fromBufferAttribute(p, i + j), wear: wear?.getX(i + j) ?? 0, tone: tone?.getX(i + j) ?? 1 }));
      const clipped: Vertex[] = [];
      for (let j = 0; j < 3; j++) {
        const a = input[j], b = input[(j + 1) % 3], da = plane.distanceToPoint(a.p), db = plane.distanceToPoint(b.p);
        if (da <= 0) clipped.push(a);
        if ((da <= 0) !== (db <= 0)) {
          const t = da / (da - db), vertex = { p: a.p.clone().lerp(b.p, t), wear: a.wear + (b.wear - a.wear) * t, tone: a.tone + (b.tone - a.tone) * t };
          clipped.push(vertex); rim.set(vertex.p.toArray().map(value => Math.round(value * 1e7)).join(','), vertex);
        }
      }
      for (let j = 1; j < clipped.length - 1; j++) emit(clipped[0], clipped[j], clipped[j + 1]);
    }
    const boundary = [...rim.values()];
    if (boundary.length >= 3) {
      const centre: Vertex = { p: new THREE.Vector3(), wear: 0, tone: 0 };
      for (const vertex of boundary) { centre.p.add(vertex.p); centre.wear += vertex.wear; centre.tone += vertex.tone; }
      centre.p.divideScalar(boundary.length); centre.wear /= boundary.length; centre.tone /= boundary.length;
      const u = new THREE.Vector3(0, 0, 1).cross(normal).normalize(), v = normal.clone().cross(u);
      boundary.sort((a, b) => Math.atan2(a.p.clone().sub(centre.p).dot(v), a.p.clone().sub(centre.p).dot(u)) - Math.atan2(b.p.clone().sub(centre.p).dot(v), b.p.clone().sub(centre.p).dot(u)));
      for (let j = 0; j < boundary.length; j++) emit(centre, boundary[j], boundary[(j + 1) % boundary.length]);
    }
    const next = new THREE.BufferGeometry();
    next.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (wear) next.setAttribute('architectureWear', new THREE.Float32BufferAttribute(wears, 1));
    if (tone) next.setAttribute('bridgeWeatherTone', new THREE.Float32BufferAttribute(tones, 1));
    next.computeVertexNormals(); next.userData = { ...geometry.userData };
    if (source !== geometry) source.dispose(); geometry.dispose(); geometry = next;
  }
  return geometry;
}

/** Clip a real corner from a closed stone and seal its new exposed fracture. */
function fractureCorner(geometry: THREE.BufferGeometry, corner: THREE.Vector3, normal: THREE.Vector3, verticalLoss: number): { geometry: THREE.BufferGeometry; centre: THREE.Vector3 } {
  const plane = new THREE.Plane(normal, -normal.dot(corner) + verticalLoss * normal.y);
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const p = source.getAttribute('position'), output: number[] = [], intersections = new Map<string, THREE.Vector3>();
  const triangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    if (b.clone().sub(a).cross(c.clone().sub(a)).lengthSq() < 1e-18) return;
    for (const point of [a, b, c]) output.push(point.x, point.y, point.z);
  };
  for (let i = 0; i < p.count; i += 3) {
    const input = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(p, i + j));
    const clipped: THREE.Vector3[] = [];
    for (let j = 0; j < 3; j++) {
      const a = input[j], b = input[(j + 1) % 3], da = plane.distanceToPoint(a), db = plane.distanceToPoint(b);
      if (da <= 0) clipped.push(a);
      if ((da <= 0) !== (db <= 0)) {
        const point = a.clone().lerp(b, da / (da - db));
        clipped.push(point);
        intersections.set(point.toArray().map(value => Math.round(value * 1e7)).join(','), point);
      }
    }
    for (let j = 1; j < clipped.length - 1; j++) triangle(clipped[0], clipped[j], clipped[j + 1]);
  }
  const rim = [...intersections.values()], centre = new THREE.Vector3();
  for (const point of rim) centre.add(point);
  if (rim.length) centre.divideScalar(rim.length);
  const u = new THREE.Vector3(0, 0, 1).cross(normal).normalize(), v = normal.clone().cross(u);
  rim.sort((a, b) => Math.atan2(a.clone().sub(centre).dot(v), a.clone().sub(centre).dot(u)) - Math.atan2(b.clone().sub(centre).dot(v), b.clone().sub(centre).dot(u)));
  for (let i = 0; i < rim.length; i++) triangle(centre, rim[i], rim[(i + 1) % rim.length]);
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(output, 3));
  result.computeVertexNormals();
  if (source !== geometry) source.dispose(); geometry.dispose();
  return { geometry: result, centre };
}

/** Sparse physical fractures plus Euclidean masks; no global dirt/lighting tint. */
function edgeWeather(geometry: THREE.BufferGeometry, seed: number, role: EdgeWeatherRecord['role'], side: number, prominent = false): THREE.BufferGeometry {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!, centre = box.getCenter(new THREE.Vector3());
  const signX = noise(seed + 1201) > .5 ? 1 : -1;
  const target = new THREE.Vector3(signX > 0 ? box.max.x : box.min.x, box.max.y, side > 0 ? box.max.z : box.min.z);
  const closest = (g: THREE.BufferGeometry, point: THREE.Vector3): THREE.Vector3 => {
    const p = g.getAttribute('position'), best = new THREE.Vector3(); let distance = Infinity;
    for (let i = 0; i < p.count; i++) {
      const candidate = new THREE.Vector3().fromBufferAttribute(p, i), next = candidate.distanceToSquared(point);
      if (next < distance) { distance = next; best.copy(candidate); }
    }
    return best;
  };
  const corner = closest(geometry, target);
  const verticalLoss = prominent ? .065 + noise(seed + 1213) * .014 : .013 + noise(seed + 1213) * .013;
  // Z is weighted strongly enough that even the prominent 6–8cm vertical chip
  // retreats less than 5cm along the exterior Z contour, including its pore.
  const normal = new THREE.Vector3(signX * .7, 1, side * 1.8).normalize();
  const fracture = fractureCorner(geometry, corner, normal, verticalLoss);
  geometry = fracture.geometry;
  const p = geometry.getAttribute('position');
  // The sealed fracture fan has a centre vertex: pulling only that local point
  // produces a shallow, real cavity instead of painting a dark spot on a face.
  const poreRadius = prominent ? .034 : .018, poreDepth = .0025 + noise(seed + 1223) * .002;
  for (let i = 0; i < p.count; i++) {
    const point = new THREE.Vector3().fromBufferAttribute(p, i);
    const mask = Math.pow(Math.max(0, 1 - point.distanceTo(fracture.centre) / poreRadius), 2);
    point.addScaledVector(normal, -poreDepth * mask); p.setXYZ(i, point.x, point.y, point.z);
  }
  geometry.computeVertexNormals();
  const rub = closest(geometry, new THREE.Vector3(corner.x, box.max.y, side > 0 ? box.min.z : box.max.z));
  const deposit = closest(geometry, new THREE.Vector3(corner.x, box.min.y, side > 0 ? box.max.z : box.min.z));
  const wear = new Float32Array(p.count), tone = new Float32Array(p.count);
  const rough = .08 + noise(seed + 1231) * .05, polish = .08 + noise(seed + 1237) * .04;
  for (let i = 0; i < p.count; i++) {
    const point = new THREE.Vector3().fromBufferAttribute(p, i);
    const mask = (at: THREE.Vector3, radius: number) => Math.pow(Math.max(0, 1 - point.distanceTo(at) / radius), 2);
    const broken = mask(fracture.centre, prominent ? .105 : .065), rubbed = mask(rub, .065), settled = mask(deposit, .047);
    wear[i] = THREE.MathUtils.clamp(broken * rough - rubbed * polish + settled * .035, -.13, .13);
    // Scalar modulation preserves the original stone's warm/cool relationship.
    // Deposition affects a few corner centimetres, never an entire joint line.
    tone[i] = 1 + broken * .013 + rubbed * .025 - settled * (.045 + noise(seed + 1249) * .025);
  }
  geometry.setAttribute('architectureWear', new THREE.BufferAttribute(wear, 1));
  geometry.setAttribute('bridgeWeatherTone', new THREE.BufferAttribute(tone, 1));
  geometry.userData.bridgeEdgeWeather = { role, side, prominent, verticalLoss, corner: corner.toArray(), fractureCentre: fracture.centre.toArray() } satisfies EdgeWeatherRecord;
  return geometry;
}

/** A few merged meshes keep real masonry joints without a draw call per stone. */
class MasonryBatch {
  private positions: number[] = [];
  private normals: number[] = [];
  private uvs: number[] = [];
  private colors: number[] = [];
  private wear: number[] = [];
  private weathered: EdgeWeatherRecord[] = [];
  blocks = 0;

  add(geometry: THREE.BufferGeometry, seed: number, damp = false): void {
    geometry = trimBankEnds(geometry);
    const source = geometry.index ? geometry.toNonIndexed() : geometry;
    const p = source.getAttribute('position');
    if (!p.count) { if (source !== geometry) source.dispose(); geometry.dispose(); return; }
    const n = source.getAttribute('normal');
    const wear = source.getAttribute('architectureWear'), tone = source.getAttribute('bridgeWeatherTone');
    if (geometry.userData.bridgeEdgeWeather) this.weathered.push(geometry.userData.bridgeEdgeWeather as EdgeWeatherRecord);
    const variation = 0.88 + noise(seed + 19) * 0.14;
    const warmth = (noise(seed + 71) - 0.5) * 0.055;
    // A single rigid UV transform per stone preserves physical texture scale
    // and local coherence while breaking the shared 1m wallpaper alignment.
    const rotation = noise(seed + 313) * Math.PI * 2;
    const cos = Math.cos(rotation), sin = Math.sin(rotation);
    const offsetU = (noise(seed + 719) - .5) * 3, offsetV = (noise(seed + 827) - .5) * 3;
    for (let i = 0; i < p.count; i += 3) {
      const abx = p.getX(i + 1) - p.getX(i), aby = p.getY(i + 1) - p.getY(i), abz = p.getZ(i + 1) - p.getZ(i);
      const acx = p.getX(i + 2) - p.getX(i), acy = p.getY(i + 2) - p.getY(i), acz = p.getZ(i + 2) - p.getZ(i);
      const cx = aby * acz - abz * acy, cy = abz * acx - abx * acz, cz = abx * acy - aby * acx;
      // Extrude can produce zero-area bevel caps where a clipped curved bed
      // becomes tangent. Discard those caps rather than shipping invalid faces.
      if (cx * cx + cy * cy + cz * cz < 1e-14) continue;
      // Per-face working UV projection: one unit is one metre, including
      // the vault soffit and bevels. No stretched front-face atlas on the sides.
      const nx = Math.abs(n.getX(i));
      const ny = Math.abs(n.getY(i));
      const nz = Math.abs(n.getZ(i));
      for (let j = i; j < i + 3; j++) {
        const x = p.getX(j), y = p.getY(j), z = p.getZ(j);
        this.positions.push(x, y, z);
        this.normals.push(n.getX(j), n.getY(j), n.getZ(j));
        this.wear.push(wear?.getX(j) ?? 0);
        const u = ny >= nx && ny >= nz ? x : nx >= nz ? z : x;
        const v = ny >= nx && ny >= nz ? z : y;
        this.uvs.push(u * cos - v * sin + offsetU, u * sin + v * cos + offsetV);
        const wet = damp ? Math.max(0, 0.35 - y) * 0.14 : 0;
        const surface = (variation - wet + (noise(seed + x * 7.1 + z * 11.7) - 0.5) * 0.035) * (tone?.getX(j) ?? 1);
        this.colors.push(surface * (1 + warmth - wet * 0.2), surface, surface * (1 - warmth - wet * 0.36));
      }
    }
    this.blocks++;
    if (source !== geometry) source.dispose();
    geometry.dispose();
  }

  mesh(material: THREE.MeshStandardMaterial, name: string): THREE.Mesh {
    const geometry = new THREE.BufferGeometry();
    const metresPerTile = Math.max(.01, Number(material.userData.metersPerTile) || 1);
    const physicalUV = this.uvs.map(value => value / metresPerTile);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(physicalUV, 2));
    geometry.setAttribute('uv1', new THREE.Float32BufferAttribute(physicalUV, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setAttribute('architectureWear', new THREE.Float32BufferAttribute(this.wear, 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.stoneCount = this.blocks;
    mesh.userData.metersPerTile = metresPerTile;
    mesh.userData.edgeWeather = this.weathered;
    return mesh;
  }
}

function prism(
  points: readonly THREE.Vector2[], z0: number, z1: number, bevel: number,
  seed = 0, high = false, chip = false,
): THREE.ExtrudeGeometry {
  let outline = points.map(point => point.clone());
  if (chip && noise(seed + 431) > .82) {
    const maxY = Math.max(...outline.map(point => point.y));
    const candidates = outline.map((point, i) => ({ point, i })).filter(({ point, i }) => {
      if (point.y < maxY - .10) return false;
      const a = outline[(i + outline.length - 1) % outline.length].clone().sub(point).normalize();
      const b = outline[(i + 1) % outline.length].clone().sub(point).normalize();
      return a.dot(b) > -.82;
    });
    if (candidates.length) {
      const index = candidates[Math.floor(noise(seed + 439) * candidates.length)].i;
      const point = outline[index], previous = outline[(index + outline.length - 1) % outline.length], next = outline[(index + 1) % outline.length];
      const cut = .022 + noise(seed + 443) * .031;
      const a = point.clone().lerp(previous, Math.min(.22, cut / previous.distanceTo(point)));
      const b = point.clone().lerp(next, Math.min(.22, cut / next.distanceTo(point)));
      outline.splice(index, 1, a, b);
    }
  }
  const box = new THREE.Box2().setFromPoints(outline), size = box.getSize(new THREE.Vector2());
  bevel = Math.min(bevel, size.x * .15, size.y * .19, (z1 - z0) * .22);
  const shape = new THREE.Shape(outline);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, z1 - z0 - bevel * 2),
    steps: 1,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    // Keep the block's exterior on the authored outline and cut its face
    // inwards. The default outward bevel would consume narrow mortar joints.
    bevelOffset: -bevel,
    bevelSegments: high ? 3 : 2,
    curveSegments: 1,
  });
  geometry.translate(0, 0, z0 + bevel);
  return geometry;
}

function quad(
  x0: number, x1: number, bottom0: number, bottom1: number, top0: number, top1: number,
): THREE.Vector2[] {
  return [
    new THREE.Vector2(x0, bottom0), new THREE.Vector2(x1, bottom1),
    new THREE.Vector2(x1, top1), new THREE.Vector2(x0, top0),
  ];
}

function addVault(batch: MasonryBatch, high: boolean): void {
  const depthCourses = high ? 5 : 3;
  const divisions = high ? 23 : 17;
  const arcSegments = high ? 3 : 2;
  const depthCuts = [-HALF_WIDTH];
  for (let course = 1; course < depthCourses; course++) depthCuts.push(-HALF_WIDTH + course * BRIDGE_WIDTH / depthCourses + (noise(course * 113) - .5) * .13);
  depthCuts.push(HALF_WIDTH);
  for (let course = 0; course < depthCourses; course++) {
    const z0 = depthCuts[course] + JOINT / 2;
    const z1 = depthCuts[course + 1] - JOINT / 2;
    // Neighbouring vault courses do not share continuous radial joints.
    const cuts = [0];
    for (let j = 1; j < divisions; j++) {
      cuts.push(Math.PI * (j + (course % 2 ? 0.28 : -0.08) + (noise(course * 137 + j * 41) - .5) * .23) / divisions);
    }
    cuts.push(Math.PI);
    for (let j = 0; j < cuts.length - 1; j++) {
      const a = cuts[j] + 0.0035;
      const b = cuts[j + 1] - 0.0035;
      const points: THREE.Vector2[] = [];
      const seed = 10000 + course * 1009 + j * 61;
      const wear = (noise(seed + 17) - 0.5) * 0.017;
      for (let s = 0; s <= arcSegments; s++) {
        const angle = a + (b - a) * s / arcSegments;
        points.push(new THREE.Vector2(
          (OUTER_RX + wear) * Math.cos(angle),
          SPRING_Y + (OUTER_RY + wear) * Math.sin(angle),
        ));
      }
      for (let s = arcSegments; s >= 0; s--) {
        const angle = a + (b - a) * s / arcSegments;
        points.push(new THREE.Vector2(
          INNER_RX * Math.cos(angle), SPRING_Y + INNER_RY * Math.sin(angle),
        ));
      }
      let geometry: THREE.BufferGeometry = prism(points, z0, z1, high ? .017 : .014, seed, high, true);
      const exposed = course === 0 || course === depthCourses - 1;
      const awayFromCrown = Math.abs((a + b) / 2 - Math.PI / 2) > .18;
      if (exposed && j % 4 === 2 && awayFromCrown) geometry = edgeWeather(geometry, seed, 'vault', course === 0 ? -1 : 1);
      batch.add(geometry, seed, true);
    }
  }
}

function addAbutments(batch: MasonryBatch, high: boolean): void {
  const depthCourses = high ? 4 : 3;
  const bedHeights = [-0.4, -0.115, 0.17, 0.46];
  for (const side of [-1, 1]) {
    for (let bed = 0; bed < bedHeights.length - 1; bed++) {
      const xCuts = bed % 2 ? [2.3, 2.76, 3.6] : [2.3, 3.03, 3.6];
      for (let segment = 0; segment < xCuts.length - 1; segment++) {
        for (let course = 0; course < depthCourses; course++) {
          const seed = 20000 + bed * 1237 + course * 103 + segment * 19 + (side + 1) * 37;
          const xa = side * (xCuts[segment] + JOINT / 2);
          const xb = side * (xCuts[segment + 1] - JOINT / 2);
          const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb);
          const z0 = -HALF_WIDTH + course * BRIDGE_WIDTH / depthCourses + JOINT / 2;
          const z1 = -HALF_WIDTH + (course + 1) * BRIDGE_WIDTH / depthCourses - JOINT / 2;
          const y0 = bedHeights[bed] + JOINT / 2;
          const y1 = bedHeights[bed + 1] - JOINT / 2;
          batch.add(prism(quad(x0, x1, y0, y0, y1, y1 + (noise(seed) - 0.5) * 0.022), z0, z1, .021, seed, high, true), seed, true);
        }
      }
    }
  }
}

/** Clip a masonry course against the actual extrados and curved deck. */
function spandrelPolygon(x0: number, x1: number, y0: number, y1: number): THREE.Vector2[] | null {
  const bottom = (x: number) => Math.max(y0, outerArchY(x) + 0.008);
  const top = (x: number) => Math.min(y1, deckY(x) - PAVING_DEPTH - .012);
  const height = (x: number) => top(x) - bottom(x);
  // On either side of the crown height is monotonic, so a clipped interval is
  // contiguous. Split the centre cell first to avoid an inverted polygon.
  if (height(x0) < 0.035 && height(x1) < 0.035) return null;
  let left = x0, right = x1;
  if (height(left) < 0.035) {
    let a = left, b = right;
    for (let i = 0; i < 12; i++) {
      const mid = (a + b) / 2;
      if (height(mid) < 0.035) a = mid; else b = mid;
    }
    left = b;
  }
  if (height(right) < 0.035) {
    let a = left, b = right;
    for (let i = 0; i < 12; i++) {
      const mid = (a + b) / 2;
      if (height(mid) < 0.035) b = mid; else a = mid;
    }
    right = a;
  }
  if (right - left < 0.09) return null;
  const samples = [left, right];
  for (let i = 1; i < 4; i++) samples.push(left + (right - left) * i / 4);
  // Uniform X samples undersample the near-vertical extrados at the springs.
  // Add angle-spaced cuts so fill blocks meet the arch, including in low LOD.
  for (let i = 0; i <= 80; i++) {
    const x = OUTER_RX * Math.cos(Math.PI * i / 80);
    if (x > left + 0.0001 && x < right - 0.0001) samples.push(x);
  }
  samples.sort((a, b) => a - b);
  const points: THREE.Vector2[] = [];
  for (const x of samples) points.push(new THREE.Vector2(x, bottom(x)));
  for (const x of samples.slice().reverse()) points.push(new THREE.Vector2(x, top(x)));
  // Retain curvature cuts, discard redundant points on horizontal bed joints;
  // tiny collinear segments otherwise create zero-area bevel triangles.
  return points.filter((point, i) => {
    const previous = points[(i + points.length - 1) % points.length];
    const next = points[(i + 1) % points.length];
    return Math.abs((point.x - previous.x) * (next.y - point.y) - (point.y - previous.y) * (next.x - point.x)) > 1e-7;
  });
}

function addSpandrels(batch: MasonryBatch, high: boolean): void {
  const beds = [0.46, 0.755, 1.065, 1.365, 1.655, 1.865];
  for (const side of [-1, 1]) {
    for (let bed = 0; bed < beds.length - 1; bed++) {
      // Irregular block lengths and staggered beds break a tiled-box reading.
      const cuts = [-HALF_LENGTH];
      let x = -HALF_LENGTH + (bed % 2 ? 0.31 : 0.63);
      for (let j = 0; x < HALF_LENGTH - 0.14; j++) {
        cuts.push(x);
        x += (high ? 0.57 : 0.72) + noise(j * 31 + bed * 13) * 0.24;
      }
      cuts.push(0, HALF_LENGTH);
      cuts.sort((a, b) => a - b);
      for (let j = 0; j < cuts.length - 1; j++) {
        const points = spandrelPolygon(cuts[j] + JOINT / 2, cuts[j + 1] - JOINT / 2, beds[bed] + JOINT / 2, beds[bed + 1] - JOINT / 2);
        if (!points) continue;
        const seed = 30000 + bed * 829 + j * 71 + (side + 1) * 372;
        const faceZ = side * (HALF_WIDTH - 0.012 + noise(seed) * 0.012);
        const innerZ = side * SPANDREL_INNER_Z;
        batch.add(prism(points, Math.min(faceZ, innerZ), Math.max(faceZ, innerZ), .016, seed, high, true), seed);
      }
    }
  }
}

function addPaving(batch: MasonryBatch, high: boolean): void {
  const rows = high ? 5 : 4;
  const columns = high ? 13 : 10;
  const rowCuts = [-PAVING_HALF_WIDTH];
  for (let row = 1; row < rows; row++) rowCuts.push(-PAVING_HALF_WIDTH + row * PAVING_HALF_WIDTH * 2 / rows + (noise(row * 181) - .5) * .12);
  rowCuts.push(PAVING_HALF_WIDTH);
  for (let row = 0; row < rows; row++) {
    const z0 = rowCuts[row] + JOINT / 2;
    const z1 = rowCuts[row + 1] - JOINT / 2;
    const cuts = [-HALF_LENGTH];
    for (let j = 1; j < columns; j++) cuts.push(-HALF_LENGTH + (j + (row % 2 ? 0.31 : 0) + (noise(row * 193 + j * 59) - .5) * .24) * 7.2 / columns);
    cuts.push(HALF_LENGTH);
    for (let j = 0; j < cuts.length - 1; j++) {
      const x0 = cuts[j] + JOINT / 2, x1 = cuts[j + 1] - JOINT / 2;
      const seed = 40000 + row * 521 + j * 47;
      const settling = noise(seed) * 0.009;
      const y0 = deckY(x0) - settling, y1 = deckY(x1) - settling;
      const thickness = PAVING_DEPTH + (noise(seed + 53) - .5) * .016;
      batch.add(prism(quad(x0, x1, y0 - thickness, y1 - thickness, y0, y1), z0, z1, high ? .021 : .018, seed, high, true), seed);
    }
  }
}

function addLowCoping(stone: MasonryBatch, capstone: MasonryBatch, high: boolean): void {
  const divisions = high ? 14 : 11;
  for (const side of [-1, 1]) {
    const cuts = [-HALF_LENGTH];
    for (let i = 1; i < divisions; i++) cuts.push(-HALF_LENGTH + (i + (noise(i * 179 + side * 41) - .5) * .32) * 7.2 / divisions);
    cuts.push(HALF_LENGTH);
    for (let i = 0; i < divisions; i++) {
      const x0 = cuts[i] + JOINT / 2;
      const x1 = cuts[i + 1] - JOINT / 2;
      const seed = 50000 + i * 97 + (side + 1) * 1549;
      const rise = .045 + noise(seed) * .045;
      const top0 = deckY(x0) + rise;
      const top1 = deckY(x1) + THREE.MathUtils.clamp(rise + (noise(seed + 9) - .5) * .018, .045, .09);
      const outerZ = side * (HALF_WIDTH - 0.018);
      const innerZ = side * COPING_INNER_Z;
      const batch = i === Math.floor(divisions * .37) + (side > 0 ? 1 : 0) ? capstone : stone;
      let geometry: THREE.BufferGeometry = prism(quad(x0, x1, deckY(x0) - .085, deckY(x1) - .085, top0, top1), Math.min(innerZ, outerZ), Math.max(innerZ, outerZ), .022, seed, high, true);
      const prominent = side > 0 && [.21, .5, .78].some(fraction => i === Math.floor(divisions * fraction));
      if (prominent || side < 0 && i % 4 === 1) geometry = edgeWeather(geometry, seed, 'coping', side, prominent);
      batch.add(geometry, seed);
    }
  }
}

function addMortarBacking(batch: MasonryBatch, high: boolean): void {
  const points: THREE.Vector2[] = [
    new THREE.Vector2(-3.58, -0.39), new THREE.Vector2(-2.313, -0.39),
    new THREE.Vector2(-2.313, SPRING_Y),
  ];
  const segments = high ? 64 : 40;
  for (let i = 0; i <= segments; i++) {
    const angle = Math.PI - i * Math.PI / segments;
    points.push(new THREE.Vector2(2.313 * Math.cos(angle), SPRING_Y + (INNER_RY + .012) * Math.sin(angle)));
  }
  points.push(new THREE.Vector2(2.313, -0.39), new THREE.Vector2(3.58, -0.39));
  for (let i = 0; i <= 32; i++) {
    const x = 3.58 - i * 7.16 / 32;
    points.push(new THREE.Vector2(x, deckY(x) - .027));
  }
  const geometry = prism(points, -MORTAR_HALF_WIDTH, MORTAR_HALF_WIDTH, 0);
  // The core overlaps its cladding internally. Recess its newly exposed bank
  // cap so it cannot coincide with the outer stone's chamfered face.
  geometry.userData.bankCapRecess = .005;
  batch.add(geometry, 901, true);
}

/** Return masonry across both bank ends instead of exposing a blank mortar core. */
function addEndReturns(batch: MasonryBatch, high: boolean): void {
  const beds = [.46, .81, 1.16, 1.51], columns = high ? 5 : 4;
  for (const side of [-1, 1]) for (let bed = 0; bed < beds.length - 1; bed++) {
    const zCuts = [-HALF_WIDTH];
    for (let j = 1; j < columns; j++) zCuts.push(-HALF_WIDTH + (j + (bed % 2 ? .23 : -.08) + (noise(j * 79 + bed * 193) - .5) * .16) * BRIDGE_WIDTH / columns);
    zCuts.push(HALF_WIDTH);
    for (let j = 0; j < columns; j++) {
      const seed = 60000 + bed * 877 + j * 107 + (side + 1) * 1721;
      const a = side * 3.44, b = side * (HALF_LENGTH - JOINT / 2);
      const x0 = Math.min(a, b), x1 = Math.max(a, b);
      const top0 = Math.min(beds[bed + 1], deckY(x0) - PAVING_DEPTH), top1 = Math.min(beds[bed + 1], deckY(x1) - PAVING_DEPTH);
      const geometry = prism(quad(x0, x1, beds[bed] + JOINT / 2, beds[bed] + JOINT / 2, top0 - JOINT / 2, top1 - JOINT / 2), zCuts[j] + JOINT / 2, zCuts[j + 1] - JOINT / 2, .018, seed, high, true);
      // End returns and side-wall stones overlap behind their visible faces.
      // Their cut caps need a separate depth layer too, even with one material.
      geometry.userData.bankCapRecess = .0015;
      batch.add(geometry, seed, true);
    }
  }
}

/**
 * Reference 02's low masonry footbridge, complete on both sides and underneath.
 * Three supplied materials stay caller-owned and are never mutated or cloned.
 * Enable vertexColors on stone/capstone for subdued per-block variation and damp
 * lower courses. Geometry uv/uv1 use material.userData.metersPerTile (default 1);
 * all generated geometries are
 * reachable by traversing this group and can be disposed by the caller.
 *
 * This module intentionally adds no stream, rocks, plants, lights or collisions.
 * The deck surface is y = 2 - .4 * (abs(x) / 3.6)^1.8; the low coping is raised.
 */
export function buildReferenceBridge(options: ReferenceBridgeOptions): THREE.Group {
  const high = options.quality === 'high';
  const stone = new MasonryBatch();
  const mortar = new MasonryBatch();
  const coping = new MasonryBatch();
  addMortarBacking(mortar, high);
  addVault(stone, high);
  addAbutments(stone, high);
  addSpandrels(stone, high);
  addEndReturns(stone, high);
  addPaving(stone, high);
  addLowCoping(stone, coping, high);
  const group = new THREE.Group();
  group.name = 'reference-masonry-footbridge';
  group.add(
    stone.mesh(options.stone, 'bridge-cut-limestone'),
    mortar.mesh(options.mortar, 'bridge-recessed-lime-mortar'),
    coping.mesh(options.capstone, 'bridge-low-weathered-coping'),
  );
  group.userData.reference = '02-sacred-grove / stone footbridge';
  group.userData.quality = options.quality;
  group.userData.actualWidth = BRIDGE_WIDTH;
  group.userData.footprint = { halfLength: HALF_LENGTH, halfWidth: HALF_WIDTH, centralWalkHalfWidth: .8, bankCornerChamfers: BANK_CORNERS.map(corner => ({ ...corner })), bankCapRecess: { outerStone: 0, endReturn: .0015, mortarCore: .005 } };
  group.userData.deckProfile = { halfLength: HALF_LENGTH, endY: 1.6, crownY: 2, exponent: 1.8 };
  group.userData.masonryProfile = { archInnerCrownY: SPRING_Y + INNER_RY, archOuterCrownY: SPRING_Y + OUTER_RY, crownMassDepth: 2 - SPRING_Y - INNER_RY, pavingDepth: PAVING_DEPTH, copingRiseRange: [.045, .09], perBlockUV: 'stable rigid rotation and offset; physical metre scale' };
  group.userData.geometryStats = {
    drawCalls: group.children.length,
    triangles: group.children.reduce((total, child) => total + (child as THREE.Mesh).geometry.getAttribute('position').count / 3, 0),
    masonryBlocks: stone.blocks + coping.blocks,
    exposedEdgeBlocks: 2 * (high ? 23 : 17) + 2 * (high ? 14 : 11),
    weatheredEdgeBlocks: group.children.reduce((total, child) => total + (child.userData.edgeWeather as EdgeWeatherRecord[]).length, 0),
  };
  return group;
}
