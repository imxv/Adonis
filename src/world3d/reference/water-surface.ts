import {
  BufferGeometry, Camera, Color, DepthFormat, DepthTexture, Float32BufferAttribute, FrontSide, Group,
  HalfFloatType, LinearFilter, LinearSRGBColorSpace, Matrix4, Mesh, NearestFilter,
  Plane, PlaneGeometry, ShaderMaterial, ShapeUtils, UniformsLib, UniformsUtils, UnsignedIntType,
  Vector2, Vector3, Vector4, WebGLRenderTarget,
} from 'three';
import type { ColorRepresentation, Object3D } from 'three';
import type { ReferenceRenderFrame } from './contracts';
import { waterSurfaceFragmentShader, waterSurfaceVertexShader } from './water-surface-shaders';

export type WaterSurfaceQuality = 'low' | 'medium' | 'high';

export interface WaterSurfaceOptions {
  quality: WaterSurfaceQuality;
  /** World-space centre; the current implementation is a horizontal water plane. */
  center: Vector3;
  size: Vector2;
  /** Optional simple world-space X/Z boundary. Water remains at center.y. */
  outline?: readonly Vector3[];
  /** False keeps the same wave geometry but allocates no reflection/refraction RTs. */
  capture?: boolean;
  /** Unit direction from the water towards the sun, in world space. */
  sunDirection: Vector3;
  /** Actual still-water depth in metres at a world X/Z. Sampled once on the mesh. */
  depthAt?: (worldX: number, worldZ: number) => number;
  /** Other water surfaces/effects that must not be recaptured. Not the bed/shore. */
  excludeFromCapture?: readonly Object3D[];
  maxDepth?: number;
  waveAmplitude?: number;
  distortion?: number;
  causticStrength?: number;
  deepColor?: ColorRepresentation;
  shallowColor?: ColorRepresentation;
  skyZenith?: ColorRepresentation;
  skyHorizon?: ColorRepresentation;
  /** Cheap sky exposure approximation for enclosed pools; 1=open sea, ~.3=cliff pool. */
  analyticSkyVisibility?: number;
  /** Up to four local, still-water-level waterfall impact disturbances. */
  /** Position/radius are fixed; strength is read on update for controlled falls. */
  impacts?: readonly { position: Vector3; radius: number; strength: number }[];
  /** Per-metre RGB extinction in linear light; red is absorbed first. */
  absorption?: Vector3;
}

export interface WaterSurfaceDiagnostics {
  mode: 'transparent-analytic-sky' | 'planar-reflection-depth-refraction';
  reflectionSize: readonly [number, number];
  refractionSize: readonly [number, number];
  captureInterval: number;
  /** Number of actual additional scene renders in the most recent beforeRender. */
  capturePasses: number;
  reflectionValid: boolean;
  refractionValid: boolean;
  reflectionFrame: number;
  refractionFrame: number;
  /** Resident colour/depth targets only, excluding driver padding. */
  estimatedTargetBytes: number;
}

export interface WaterSurface {
  /** Caller owns adding/removing this group. Moving/rotating it after creation is unsupported. */
  group: Group;
  update(timeSeconds: number, deltaSeconds: number): void;
  /** Invoke once before the main scene render; never starts a RAF of its own. */
  beforeRender(frame: ReferenceRenderFrame): void;
  resize(width: number, height: number): void;
  setQuality(quality: WaterSurfaceQuality): void;
  readonly diagnostics: WaterSurfaceDiagnostics;
  dispose(): void;
}

const biasMatrix = new Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
const qualityBudget = {
  low: { reflection: 0, refraction: 0, interval: 1, segments: 36 },
  medium: { reflection: 512, refraction: 768, interval: 2, segments: 64 },
  high: { reflection: 1024, refraction: 1024, interval: 1, segments: 96 },
} as const;

/**
 * A shallow-water optical surface, using Three's Reflector/Refractor oblique-plane
 * technique. Captures are requested through D's renderOffscreen contract only;
 * the integrator owns renderer-state restoration. Captures are linear HDR and
 * output mapping happens once. This factory retains no scene/renderer/context.
 *
 * This is planar reflection + projected normal-perturbed refraction, not raytraced
 * refraction or simulated fluid. It expects conventional (non-logarithmic) depth.
 */
export function createWaterSurface(options: WaterSurfaceOptions): WaterSurface {
  const center = options.center.clone();
  const size = options.size.clone();
  const maxDepth = Math.max(0.1, options.maxDepth ?? 7);
  let quality = options.quality;
  let disposed = false;
  let forceCapture = true;
  let hasReflection = false;
  let hasRefraction = false;
  let nextSingleCapture: 'water-reflection' | 'water-refraction' = 'water-reflection';
  let viewWidth = 16;
  let viewHeight = 9;
  let targetLimit = 1024;
  let reflectionTarget: WebGLRenderTarget | null = null;
  let refractionTarget: WebGLRenderTarget | null = null;
  const cameras = new WeakMap<Camera, { reflection: Camera; refraction: Camera }>();
  const group = new Group();
  group.name = 'reference-water-surface';
  const reflectionMatrix = new Matrix4();
  const refractionMatrix = new Matrix4();
  const refractionInverseViewProjection = new Matrix4();
  const worldPosition = new Vector3();
  const worldDirection = new Vector3();
  const mirrorTarget = new Vector3();
  const worldUp = new Vector3();
  const surfaceNormal = new Vector3(0, 1, 0);
  const captureRight = new Vector3();
  const captureUp = new Vector3();
  const clipPlane = new Plane();
  const clipVector = new Vector4();
  const q = new Vector4();
  const inverseProjection = new Matrix4();
  const diagnostics: WaterSurfaceDiagnostics = {
    mode: 'transparent-analytic-sky',
    reflectionSize: [0, 0], refractionSize: [0, 0],
    captureInterval: qualityBudget[quality].interval, capturePasses: 0, estimatedTargetBytes: 0,
    reflectionValid: false, refractionValid: false, reflectionFrame: -1, refractionFrame: -1,
  };

  const impacts = (options.impacts ?? []).filter(impact => Math.abs(impact.position.y - center.y) <= 0.3).slice(0, 4);
  const impactUniforms = Array.from({ length: 4 }, (_, i) => {
    const impact = impacts[i];
    return impact ? new Vector4(impact.position.x, impact.position.z, Math.max(0.3, impact.radius), Math.max(0, impact.strength)) : new Vector4();
  });

  const material = new ShaderMaterial({
    name: 'ReferenceDepthWater',
    uniforms: UniformsUtils.merge([UniformsLib.fog, {
      uTime: { value: 0 }, uWaveAmplitude: { value: options.waveAmplitude ?? 0.033 },
      uReflectionMatrix: { value: reflectionMatrix }, uRefractionMatrix: { value: refractionMatrix },
      uRefractionInverseViewProjection: { value: refractionInverseViewProjection },
      uReflection: { value: null }, uRefraction: { value: null }, uRefractionDepth: { value: null },
      uCaptureRight: { value: captureRight }, uCaptureUp: { value: captureUp },
      uSunDirection: { value: options.sunDirection.clone().normalize() },
      uSunColor: { value: new Color('#fff0d5') },
      uDeepColor: { value: new Color(options.deepColor ?? '#075c69') },
      uShallowColor: { value: new Color(options.shallowColor ?? '#3ca99f') },
      uSkyZenith: { value: new Color(options.skyZenith ?? '#4e91c3') },
      uSkyHorizon: { value: new Color(options.skyHorizon ?? '#bed8e4') },
      uSkyVisibility: { value: Math.max(0, Math.min(1, options.analyticSkyVisibility ?? 1)) },
      uImpacts: { value: impactUniforms }, uImpactCount: { value: impacts.length },
      uAbsorption: { value: (options.absorption ?? new Vector3(0.38, 0.085, 0.052)).clone() },
      uWaterLevel: { value: center.y }, uMaxDepth: { value: maxDepth },
      uUseCapture: { value: 0 }, uDistortion: { value: options.distortion ?? 0.065 },
      uCausticStrength: { value: options.causticStrength ?? 0.28 },
    }]),
    vertexShader: waterSurfaceVertexShader,
    fragmentShader: waterSurfaceFragmentShader,
    transparent: true,
    depthWrite: false,
    side: FrontSide,
    fog: true,
  });
  // UniformsUtils clones matrix/vector values. Use their actual live objects below.
  const liveReflectionMatrix = material.uniforms.uReflectionMatrix.value as Matrix4;
  const liveRefractionMatrix = material.uniforms.uRefractionMatrix.value as Matrix4;
  const liveInverseVP = material.uniforms.uRefractionInverseViewProjection.value as Matrix4;
  const liveRight = material.uniforms.uCaptureRight.value as Vector3;
  const liveUp = material.uniforms.uCaptureUp.value as Vector3;

  function createOutlineGeometry(): BufferGeometry {
    const contour = options.outline!.map(point => new Vector2(point.x, point.z));
    if (contour.length > 1 && contour[0].distanceToSquared(contour[contour.length - 1]) < 1e-10) contour.pop();
    const faces = ShapeUtils.triangulateShape(contour, []);
    const minimum = new Vector2(Infinity, Infinity), maximum = new Vector2(-Infinity, -Infinity);
    contour.forEach(point => { minimum.min(point); maximum.max(point); });
    const bounds = maximum.clone().sub(minimum);
    const triangleBudget = quality === 'high' ? 18000 : quality === 'medium' ? 12000 : 5000;
    // Clipping a regular grid against the triangulated outline gives interior
    // depth samples, shared grid intersections, and no giant corner-only faces.
    let cell = Math.max(quality === 'low' ? 2.3 : 1.75, Math.sqrt(bounds.x * bounds.y * 3 / triangleBudget));
    function clip(points: Vector2[], axis: 'x' | 'y', boundary: number, keepGreater: boolean): Vector2[] {
      const result: Vector2[] = [];
      if (!points.length) return result;
      let previous = points[points.length - 1];
      let previousInside = keepGreater ? previous[axis] >= boundary : previous[axis] <= boundary;
      for (const point of points) {
        const inside = keepGreater ? point[axis] >= boundary : point[axis] <= boundary;
        if (inside !== previousInside) {
          const t = (boundary - previous[axis]) / (point[axis] - previous[axis]);
          result.push(previous.clone().lerp(point, t));
        }
        if (inside) result.push(point);
        previous = point;
        previousInside = inside;
      }
      return result;
    }
    let vertices: number[] = [];
    for (let attempt = 0; attempt < 4; attempt++) {
      vertices = [];
      for (const face of faces) {
        const triangle = face.map(i => contour[i]);
        const min = triangle.reduce((result, point) => result.min(point), new Vector2(Infinity, Infinity));
        const max = triangle.reduce((result, point) => result.max(point), new Vector2(-Infinity, -Infinity));
        const x0 = Math.floor((min.x - minimum.x) / cell), x1 = Math.ceil((max.x - minimum.x) / cell);
        const z0 = Math.floor((min.y - minimum.y) / cell), z1 = Math.ceil((max.y - minimum.y) / cell);
        for (let x = x0; x < x1; x++) for (let z = z0; z < z1; z++) {
          const left = minimum.x + x * cell, bottom = minimum.y + z * cell;
          let polygon = clip(triangle, 'x', left, true);
          polygon = clip(polygon, 'x', left + cell, false);
          polygon = clip(polygon, 'y', bottom, true);
          polygon = clip(polygon, 'y', bottom + cell, false);
          for (let i = 1; i + 1 < polygon.length; i++) {
            const a = polygon[0], b = polygon[i], c = polygon[i + 1];
            const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
            if (Math.abs(area) < 1e-9) continue;
            // +Y winding in Three world coordinates (XZ projection reverses Y).
            const points = area < 0 ? [a, b, c] : [a, c, b];
            points.forEach(point => vertices.push(point.x, center.y, point.y));
          }
        }
      }
      if (vertices.length / 9 <= triangleBudget) break;
      cell *= Math.sqrt(vertices.length / 9 / triangleBudget) * 1.06;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    return geometry;
  }

  function createGeometry(): BufferGeometry {
    const segments = qualityBudget[quality].segments;
    let geometry: BufferGeometry;
    if (options.outline && options.outline.length >= 3) {
      geometry = createOutlineGeometry();
    } else {
      geometry = new PlaneGeometry(size.x, size.y, segments, Math.max(12, Math.round(segments * size.y / size.x)));
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(center.x, center.y, center.z);
    }
    const positions = geometry.attributes.position;
    const depths = new Float32Array(positions.count);
    for (let i = 0; i < depths.length; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      const supplied = options.depthAt?.(x, z);
      // A depth callback is strongly recommended. The default is a smooth basin,
      // used only by the cheap shoreline wave/low-quality transparency estimate.
      const edge = Math.min(1 - Math.abs((x - center.x) * 2 / size.x), 1 - Math.abs((z - center.z) * 2 / size.y));
      const fallback = 0.12 + maxDepth * Math.pow(Math.max(0, edge), 0.7);
      depths[i] = Math.max(0, Math.min(maxDepth, Number.isFinite(supplied) ? supplied! : fallback));
    }
    geometry.setAttribute('aWaterDepth', new Float32BufferAttribute(depths, 1));
    geometry.computeBoundingBox();
    if (geometry.boundingBox) {
      geometry.boundingBox.min.y -= 0.1;
      geometry.boundingBox.max.y += 0.1;
    }
    geometry.computeBoundingSphere();
    if (geometry.boundingSphere) geometry.boundingSphere.radius += 0.1;
    return geometry;
  }
  const mesh = new Mesh(createGeometry(), material);
  mesh.name = 'clear-pool-optical-surface';
  mesh.renderOrder = 2;
  group.add(mesh);

  function targetSize(longSide: number): [number, number] {
    const aspect = viewWidth / viewHeight;
    return aspect >= 1
      ? [longSide, Math.max(1, Math.round(longSide / aspect))]
      : [Math.max(1, Math.round(longSide * aspect)), longSide];
  }

  function releaseTargets(): void {
    reflectionTarget?.dispose();
    if (refractionTarget) {
      refractionTarget.depthTexture?.dispose();
      refractionTarget.dispose();
    }
    reflectionTarget = null;
    refractionTarget = null;
    material.uniforms.uReflection.value = null;
    material.uniforms.uRefraction.value = null;
    material.uniforms.uRefractionDepth.value = null;
    material.uniforms.uUseCapture.value = 0;
    hasReflection = false;
    hasRefraction = false;
    nextSingleCapture = 'water-reflection';
    diagnostics.reflectionValid = diagnostics.refractionValid = false;
    diagnostics.reflectionFrame = diagnostics.refractionFrame = -1;
    diagnostics.reflectionSize = [0, 0];
    diagnostics.refractionSize = [0, 0];
    diagnostics.estimatedTargetBytes = 0;
  }

  function configureTargets(): void {
    releaseTargets();
    diagnostics.mode = 'transparent-analytic-sky';
    diagnostics.captureInterval = qualityBudget[quality].interval;
    if (quality === 'low' || options.capture === false) return;
    const reflectionSize = targetSize(Math.min(targetLimit, qualityBudget[quality].reflection));
    const refractionSize = targetSize(Math.min(targetLimit, qualityBudget[quality].refraction));
    reflectionTarget = new WebGLRenderTarget(...reflectionSize, {
      type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: true,
    });
    refractionTarget = new WebGLRenderTarget(...refractionSize, {
      type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: true,
    });
    reflectionTarget.texture.name = 'water-planar-reflection-linear';
    refractionTarget.texture.name = 'water-underwater-refraction-linear';
    reflectionTarget.texture.colorSpace = refractionTarget.texture.colorSpace = LinearSRGBColorSpace;
    reflectionTarget.texture.generateMipmaps = refractionTarget.texture.generateMipmaps = false;
    refractionTarget.depthTexture = new DepthTexture(...refractionSize, UnsignedIntType);
    refractionTarget.depthTexture.format = DepthFormat;
    refractionTarget.depthTexture.minFilter = refractionTarget.depthTexture.magFilter = NearestFilter;
    refractionTarget.depthTexture.name = 'water-underwater-oblique-depth';
    material.uniforms.uReflection.value = reflectionTarget.texture;
    material.uniforms.uRefraction.value = refractionTarget.texture;
    material.uniforms.uRefractionDepth.value = refractionTarget.depthTexture;
    diagnostics.reflectionSize = reflectionSize;
    diagnostics.refractionSize = refractionSize;
    // RGBA16F colour + depth24/32, conservatively counted as 12 bytes/pixel.
    diagnostics.estimatedTargetBytes = (reflectionSize[0] * reflectionSize[1] + refractionSize[0] * refractionSize[1]) * 12;
    forceCapture = true;
  }

  function clipCamera(camera: Camera, aboveWater: boolean): void {
    // Same oblique near-plane derivation as Three Reflector/Refractor. A general
    // inverse-projection corner also handles orthographic camera projections.
    clipPlane.setFromNormalAndCoplanarPoint(
      surfaceNormal.set(0, aboveWater ? 1 : -1, 0),
      mirrorTarget.set(center.x, center.y + (aboveWater ? -0.025 : 0.045), center.z),
    ).applyMatrix4(camera.matrixWorldInverse);
    clipVector.set(clipPlane.normal.x, clipPlane.normal.y, clipPlane.normal.z, clipPlane.constant);
    inverseProjection.copy(camera.projectionMatrix).invert();
    q.set(Math.sign(clipVector.x), Math.sign(clipVector.y), 1, 1).applyMatrix4(inverseProjection);
    clipVector.multiplyScalar(2 / clipVector.dot(q));
    const e = camera.projectionMatrix.elements;
    e[2] = clipVector.x - e[3];
    e[6] = clipVector.y - e[7];
    e[10] = clipVector.z - e[11] - 0.00025;
    e[14] = clipVector.w - e[15];
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  function prepareCameras(camera: Camera): { reflection: Camera; refraction: Camera } {
    let pair = cameras.get(camera);
    if (!pair) {
      pair = { reflection: camera.clone(), refraction: camera.clone() };
      pair.reflection.clear();
      pair.refraction.clear();
      cameras.set(camera, pair);
    }
    const { reflection, refraction } = pair;
    reflection.copy(camera, false);
    reflection.matrixAutoUpdate = true;
    reflection.parent = null;
    worldPosition.setFromMatrixPosition(camera.matrixWorld);
    worldDirection.set(0, 0, -1).transformDirection(camera.matrixWorld);
    mirrorTarget.copy(worldPosition).add(worldDirection);
    mirrorTarget.y = center.y * 2 - mirrorTarget.y;
    reflection.position.copy(worldPosition);
    reflection.position.y = center.y * 2 - worldPosition.y;
    worldUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    worldUp.y *= -1;
    reflection.up.copy(worldUp);
    reflection.scale.set(1, 1, 1);
    reflection.lookAt(mirrorTarget);
    reflection.updateMatrixWorld(true);
    reflection.projectionMatrix.copy(camera.projectionMatrix);
    // Only x/y projection is used for reflection, so clip before/after is equivalent.
    clipCamera(reflection, true);
    reflectionMatrix.copy(biasMatrix).multiply(reflection.projectionMatrix).multiply(reflection.matrixWorldInverse);
    reflection.userData.referenceWaterCapture = true;

    refraction.copy(camera, false);
    refraction.matrixAutoUpdate = false;
    refraction.parent = null;
    refraction.matrixWorld.copy(camera.matrixWorld);
    refraction.matrix.copy(camera.matrixWorld);
    refraction.matrixWorldInverse.copy(camera.matrixWorld).invert();
    refraction.projectionMatrix.copy(camera.projectionMatrix);
    clipCamera(refraction, false);
    refractionMatrix.copy(biasMatrix).multiply(refraction.projectionMatrix).multiply(refraction.matrixWorldInverse);
    refractionInverseViewProjection.copy(refraction.projectionMatrix).multiply(refraction.matrixWorldInverse).invert();
    captureRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    captureUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    refraction.userData.referenceWaterCapture = true;
    return pair;
  }

  configureTargets();

  return {
    group,
    diagnostics,
    update(timeSeconds) {
      if (disposed) return;
      material.uniforms.uTime.value = Number.isFinite(timeSeconds) ? timeSeconds : 0;
      impacts.forEach((impact, i) => { material.uniforms.uImpacts.value[i].w = Math.max(0, impact.strength); });
    },
    beforeRender(frame) {
      diagnostics.capturePasses = 0;
      if (disposed) return;
      const syncCaptureValidity = () => {
        const paired = hasReflection && hasRefraction;
        material.uniforms.uUseCapture.value = paired ? 1 : 0;
        diagnostics.mode = paired ? 'planar-reflection-depth-refraction' : 'transparent-analytic-sky';
        diagnostics.reflectionValid = hasReflection;
        diagnostics.refractionValid = hasRefraction;
      };
      const { camera } = frame;
      if (quality === 'low' || options.capture === false || !group.visible
        || camera.userData.referenceWaterCapture) {
        syncCaptureValidity();
        return;
      }
      worldPosition.setFromMatrixPosition(camera.matrixWorld);
      if (worldPosition.y <= center.y + 0.015) return; // Above-water exploration only.
      if (frame.offscreenBudget.maxTargetSize < 1 || frame.offscreenBudget.maxPasses < 1) {
        // A non-selected pool must retain its last successful captures/matrices.
        syncCaptureValidity();
        return;
      }
      const nextLimit = Math.max(1, Math.floor(Math.min(1024, frame.offscreenBudget.maxTargetSize)));
      const aspect = frame.viewport.width / frame.viewport.height;
      if (nextLimit !== targetLimit || Math.abs(aspect - viewWidth / viewHeight) > 0.015) {
        targetLimit = nextLimit;
        viewWidth = Math.max(1, frame.viewport.width);
        viewHeight = Math.max(1, frame.viewport.height);
        configureTargets();
      }
      if (!reflectionTarget || !refractionTarget) { syncCaptureValidity(); return; }
      const singlePass = frame.offscreenBudget.maxPasses < 2;
      diagnostics.captureInterval = singlePass ? 2 : qualityBudget[quality].interval;
      if (!singlePass && !forceCapture && hasReflection && hasRefraction
        && frame.frameNumber % qualityBudget[quality].interval !== 0) return;
      const { reflection, refraction } = prepareCameras(camera);
      const exclude = [...new Set<Object3D>([group, ...(options.excludeFromCapture ?? [])])];
      const requested: ('water-reflection' | 'water-refraction')[] = singlePass
        ? [nextSingleCapture] : ['water-reflection', 'water-refraction'];
      if (singlePass) nextSingleCapture = nextSingleCapture === 'water-reflection' ? 'water-refraction' : 'water-reflection';
      for (const kind of requested) {
        try {
          const target = kind === 'water-reflection' ? reflectionTarget : refractionTarget;
          const passCamera = kind === 'water-reflection' ? reflection : refraction;
          if (!frame.renderOffscreen({ kind, target, camera: passCamera, exclude })) continue;
          diagnostics.capturePasses++;
          // Never publish a newly prepared matrix before its own RT was rendered.
          // Rejection/motion/round-robin skips leave each old texture + matrix paired.
          if (kind === 'water-reflection') {
            liveReflectionMatrix.copy(reflectionMatrix);
            hasReflection = true;
            diagnostics.reflectionFrame = frame.frameNumber;
          } else {
            liveRefractionMatrix.copy(refractionMatrix);
            liveInverseVP.copy(refractionInverseViewProjection);
            liveRight.copy(captureRight);
            liveUp.copy(captureUp);
            hasRefraction = true;
            diagnostics.refractionFrame = frame.frameNumber;
          }
        } catch (error) {
          // A thrown render may have partially overwritten its target. A false
          // response, in contrast, is a contractual skip and preserves validity.
          if (kind === 'water-reflection') hasReflection = false;
          else hasRefraction = false;
          forceCapture = true;
          syncCaptureValidity();
          throw error;
        }
      }
      forceCapture = !(hasReflection && hasRefraction);
      syncCaptureValidity();
    },
    resize(width, height) {
      if (disposed || !Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return;
      const oldAspect = viewWidth / viewHeight;
      viewWidth = width;
      viewHeight = height;
      if (Math.abs(width / height - oldAspect) > 0.015) configureTargets();
    },
    setQuality(nextQuality) {
      if (disposed || nextQuality === quality) return;
      quality = nextQuality;
      const oldGeometry = mesh.geometry;
      mesh.geometry = createGeometry();
      oldGeometry.dispose();
      configureTargets();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      mesh.geometry.dispose();
      releaseTargets();
      material.dispose();
      group.clear();
    },
  };
}
