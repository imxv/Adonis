const waterWaveGLSL = /* glsl */ `
  uniform vec4 uImpacts[4]; // world X/Z, radius, strength
  uniform int uImpactCount;
  float waterHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  // Value plus analytic derivatives. Three rotated, independently advected bands
  // avoid the coherent crossing sine waves that read as a plastic woven grid.
  vec3 waterNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    vec2 du = 6.0 * f * (1.0 - f);
    float a = waterHash(i), b = waterHash(i + vec2(1.0, 0.0));
    float c = waterHash(i + vec2(0.0, 1.0)), d = waterHash(i + vec2(1.0));
    float k = a - b - c + d;
    return vec3(a + (b - a) * u.x + (c - a) * u.y + k * u.x * u.y,
      du * vec2(b - a + k * u.y, c - a + k * u.x));
  }

  vec3 waterWave(vec2 p, float t, float fineDetail) {
    mat2 r0 = mat2(0.838, 0.545, -0.545, 0.838);
    mat2 r1 = mat2(0.374, -0.927, 0.927, 0.374);
    mat2 r2 = mat2(-0.731, 0.682, -0.682, -0.731);
    vec3 n0 = waterNoise(r0 * p * 1.65 + vec2(t * 0.11, -t * 0.06));
    vec3 n1 = waterNoise(r1 * p * 4.05 + vec2(-t * 0.23, t * 0.09));
    vec3 n2 = waterNoise(r2 * p * 10.8 + vec2(t * 0.18, t * 0.21));
    vec2 g0 = vec2(dot(r0[0], n0.yz), dot(r0[1], n0.yz)) * 1.65;
    vec2 g1 = vec2(dot(r1[0], n1.yz), dot(r1[1], n1.yz)) * 4.05;
    vec2 g2 = vec2(dot(r2[0], n2.yz), dot(r2[1], n2.yz)) * 10.8;
    vec3 wave = vec3(n0.x * 0.62 + n1.x * 0.27 + n2.x * 0.11 - 0.5,
      g0 * 0.62 + g1 * 0.27 + g2 * 0.11 * fineDetail);
    for (int i = 0; i < 4; i++) {
      if (i >= uImpactCount) break;
      vec2 delta = p - uImpacts[i].xy;
      float radius = max(uImpacts[i].z, 0.3);
      float r = max(length(delta), 0.001);
      float envelope = exp(-r * 1.35 / radius) * smoothstep(0.06, 0.35, r);
      float brokenPhase = waterNoise(p * 0.73 + vec2(-t * 0.05, t * 0.08)).x * 2.8;
      float phase = r * 6.5 - t * 4.8 + brokenPhase;
      float amplitude = 0.22 * uImpacts[i].w * envelope;
      wave.x += sin(phase) * amplitude;
      wave.yz += delta / r * (cos(phase) * 6.5 - sin(phase) * 1.35 / radius) * amplitude;
    }
    return wave;
  }
`;

/** Linear-light water composition. Scene captures are deliberately tone mapped only here. */
export const waterSurfaceVertexShader = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>

  uniform float uTime;
  uniform float uWaveAmplitude;
  uniform mat4 uReflectionMatrix;
  uniform mat4 uRefractionMatrix;

  attribute float aWaterDepth;
  varying vec3 vWaterWorld;
  varying vec4 vReflectionCoord;
  varying vec4 vRefractionCoord;
  varying float vWaterDepth;

  ${waterWaveGLSL}

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec3 wave = waterWave(world.xz, uTime, 1.0);
    // Keep wave geometry quiet at the very shallow shoreline.
    float shore = smoothstep(0.02, 0.45, aWaterDepth);
    world.y += wave.x * uWaveAmplitude * shore;
    vWaterWorld = world.xyz;
    vWaterDepth = aWaterDepth;
    vReflectionCoord = uReflectionMatrix * world;
    vRefractionCoord = uRefractionMatrix * world;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

export const waterSurfaceFragmentShader = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>

  uniform sampler2D uReflection;
  uniform sampler2D uRefraction;
  uniform sampler2D uRefractionDepth;
  uniform mat4 uRefractionInverseViewProjection;
  uniform vec3 uCaptureRight;
  uniform vec3 uCaptureUp;
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform vec3 uAbsorption;
  uniform vec3 uSkyZenith;
  uniform vec3 uSkyHorizon;
  uniform float uSkyVisibility;
  uniform float uTime;
  uniform float uWaveAmplitude;
  uniform float uWaterLevel;
  uniform float uMaxDepth;
  uniform float uUseCapture;
  uniform float uDistortion;
  uniform float uCausticStrength;

  varying vec3 vWaterWorld;
  varying vec4 vReflectionCoord;
  varying vec4 vRefractionCoord;
  varying float vWaterDepth;

  ${waterWaveGLSL}

  vec3 surfaceNormal(vec2 p, float t) {
    float footprint = max(length(dFdx(p)), length(dFdy(p)));
    float fineDetail = 1.0 - smoothstep(0.035, 0.20, footprint);
    vec2 slope = waterWave(p, t, fineDetail).yz * uWaveAmplitude * 1.6;
    slope *= smoothstep(0.02, 0.38, vWaterDepth);
    return normalize(vec3(-slope.x, 1.0, -slope.y));
  }

  vec3 analyticSky(vec3 direction) {
    float elevation = clamp(direction.y, 0.0, 1.0);
    vec3 openSky = mix(uSkyHorizon, uSkyZenith, pow(elevation, 0.48));
    // Low/capture-disabled only: enclosure colour preservation, not a claim of
    // scene/environment-map reflection. The main pass still shows the real bed.
    return mix(uDeepColor * 0.75, openSky, uSkyVisibility);
  }

  vec3 unprojectBottom(vec2 uv, float depth) {
    // The capture uses an oblique clip plane. Inverting that exact VP is essential:
    // perspectiveDepthToViewZ(near, far) would give an incorrect water thickness.
    vec4 world = uRefractionInverseViewProjection * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    return world.xyz / world.w;
  }

  float causticPattern(vec2 p, float t) {
    // An inexpensive moving focusing pattern, not a photon/volume simulation.
    float f = abs(sin(p.x * 3.8 + sin(p.y * 2.9 + t * 0.73)) + sin(p.y * 4.3 - p.x * 1.4 - t * 0.61) * 0.57);
    float g = abs(sin(p.y * 4.8 + sin(p.x * 3.2 - t * 0.47)) + sin(p.x * 5.1 + p.y * 1.8 + t * 0.83) * 0.52);
    return pow(1.0 - smoothstep(0.035, 0.25, f), 2.0) * 0.64
      + pow(1.0 - smoothstep(0.025, 0.18, g), 2.0) * 0.36;
  }

  void main() {
    vec3 normal = surfaceNormal(vWaterWorld.xz, uTime);
    vec3 toEye = normalize(cameraPosition - vWaterWorld);
    float cosTheta = max(dot(normal, toEye), 0.001);
    float fresnel = 0.0204 + 0.9796 * pow(1.0 - cosTheta, 5.0);
    vec3 reflectedDirection = reflect(-toEye, normal);
    vec3 reflectionColor = analyticSky(reflectedDirection);
    float thickness = max(vWaterDepth, 0.015);
    float pathLength = thickness / max(cosTheta, 0.25);
    vec3 belowColor = uShallowColor;
    vec3 bottom = vec3(vWaterWorld.x, uWaterLevel - thickness, vWaterWorld.z);
    vec2 refractionUV = vec2(0.0), reflectionUV = vec2(0.0);
    float captureUsable = 0.0;
    if (uUseCapture > 0.5 && vRefractionCoord.w > 0.00001 && vReflectionCoord.w > 0.00001) {
      refractionUV = vRefractionCoord.xy / vRefractionCoord.w;
      reflectionUV = vReflectionCoord.xy / vReflectionCoord.w;
      float minimumEdge = min(min(refractionUV.x, refractionUV.y), min(reflectionUV.x, reflectionUV.y));
      float maximumEdge = max(max(refractionUV.x, refractionUV.y), max(reflectionUV.x, reflectionUV.y));
      // Cached captures may be behind/outside the current view after a skipped
      // round-robin frame or a turn. Fade to the transparent fallback at their
      // frustum edges; never stretch a clamped edge or output opaque fake water.
      captureUsable = smoothstep(0.001, 0.026, minimumEdge) * smoothstep(0.001, 0.026, 1.0 - maximumEdge);
    }

    if (captureUsable > 0.001) {
      vec3 perturbation = normal - vec3(0.0, 1.0, 0.0);
      vec2 offset = vec2(dot(perturbation, uCaptureRight), dot(perturbation, uCaptureUp));
      offset *= uDistortion / max(vRefractionCoord.w * 0.035, 1.0);
      vec2 refractedUV = clamp(refractionUV + offset, vec2(0.001), vec2(0.999));
      float depth = texture2D(uRefractionDepth, refractedUV).x;
      bottom = unprojectBottom(refractedUV, depth);
      // Prevent a disturbed sample from dragging foreground/above-water rock into water.
      if (bottom.y > uWaterLevel + 0.10 || depth < 0.00001) {
        refractedUV = clamp(refractionUV, vec2(0.001), vec2(0.999));
        depth = texture2D(uRefractionDepth, refractedUV).x;
        bottom = unprojectBottom(refractedUV, depth);
      }
      belowColor = texture2D(uRefraction, refractedUV).rgb;
      if (depth < 0.99999 && bottom.y <= uWaterLevel + 0.10) {
        thickness = clamp(uWaterLevel - bottom.y, 0.0, uMaxDepth);
        pathLength = min(length(bottom - vWaterWorld), uMaxDepth * 4.0);
      } else {
        thickness = uMaxDepth;
        pathLength = uMaxDepth * 2.0;
        belowColor = uDeepColor;
      }
      vec2 reflectedUV = clamp(reflectionUV + vec2(offset.x, -offset.y) * 1.25, vec2(0.002), vec2(0.998));
      reflectionColor = texture2D(uReflection, reflectedUV).rgb;
    }

    vec3 transmission = exp(-uAbsorption * min(pathLength, 40.0));
    float caustic = causticPattern(bottom.xz, uTime) * exp(-thickness * 0.9) * uCausticStrength;
    belowColor *= 1.0 + caustic;
    vec3 transmittedColor = belowColor * transmission + uDeepColor * (1.0 - transmission);
    // Tiny suspended particles provide some cyan in clear water, without covering the bottom.
    transmittedColor = mix(transmittedColor, uShallowColor, min(thickness * 0.012, 0.055));
    vec3 color = mix(transmittedColor, reflectionColor, fresnel);
    float specular = pow(max(dot(reflectedDirection, uSunDirection), 0.0), 620.0);
    color += uSunColor * specular * 2.4 * smoothstep(0.02, 0.3, thickness);

    // Captured refraction already contains the real bottom, so alpha=1 is optical
    // compositing, not an opaque blue sheet. Low uses ordinary alpha to show the
    // main-pass bottom and has zero capture textures/passes.
    float lowAlpha = clamp(0.10 + (1.0 - exp(-pathLength * 0.11)) * 0.42 + fresnel * 0.72, 0.08, 0.88);
    gl_FragColor = vec4(color, mix(lowAlpha, 1.0, captureUsable));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    // Captured scene materials already include atmosphere along their view path.
    // Applying surface fog again would wash out the water twice.
    if (captureUsable < 0.001) {
      #include <fog_fragment>
    }
  }
`;
