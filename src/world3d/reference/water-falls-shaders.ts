/** GPU animation shared by all waterfall reaches. No emissive/additive water. */
export const fallNoise = /* glsl */ `
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise21(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1., 0.)), f.x),
             mix(hash21(i + vec2(0., 1.)), hash21(i + vec2(1.)), f.x), f.y);
}
vec2 periodicFlow(float u, float v, float scale, float seed) {
  float angle = u * 6.28318530718;
  return vec2(cos(angle) * scale + seed, sin(angle) * scale + v);
}
float fbm(vec2 p) {
  float n = noise21(p) * .55;
  p = mat2(1.6, -1.2, 1.2, 1.6) * p;
  n += noise21(p) * .28;
  return n + noise21(p * 2.03 + 11.7) * .17;
}
`;

export const fallVertex = /* glsl */ `
uniform float uTime;
attribute vec4 aData;
attribute vec2 aForm;
attribute vec4 aMotion;
attribute vec4 aLip;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec4 vData;
varying float vLifeOpacity;
${fallNoise}
float lipLead(float v, float height, float frontTravel) {
  v = clamp(v, 0., 1.);
  float d = v * height;
  float q = (sqrt(v + .001) - sqrt(.001)) / (sqrt(1.001) - sqrt(.001));
  float raw = max(0., (q - v) * frontTravel);
  return .5 * tanh(raw / .5) * (1. - smoothstep(.75, 1.8, d));
}
void main() {
  vUv = uv;
  vData = aData;
  vLifeOpacity = 1.0;
  float downstream = uv.y;
  float phase = sqrt(max(downstream, .001)) * 16.0 - uTime * aData.y * 9.0;
  float edge = sin(uv.x * 3.14159265);
  vec3 p = position;
  float fineAmplitude = min(.045, aForm.x * .65);
  float flutter = sin(phase + aData.x * 4.0 + uv.x * 6.28318530718) * fineAmplitude;
  flutter += sin(phase * 2.53 + aData.x * 7.0) * fineAmplitude * .4;
  float packet = sin(phase * 1.43 + aForm.y) * .62
                 + sin(phase * .83 + uv.x * 6.28318530718 + aForm.y * 2.0) * .38;
  float envelope = smoothstep(.015, .12, downstream) * (1.0 - smoothstep(.94, 1.0, downstream));
  float sideFold = .35 + sin(uv.x * 6.2831853 + aForm.y + phase * .37) * .65;
  float swell = packet * aForm.x * sideFold;
  // The combined displacement, including fine flutter, obeys the local ring
  // radius bound. Limiting the two terms separately would permit 42% swelling.
  float radial = clamp(swell + flutter * edge, -aForm.x, aForm.x);
  p += normal * radial * envelope;
  p.y += sin(phase * 1.17 + aForm.y) * aForm.x * .34 * envelope;
  if (aData.z > 1.5) {
    float cycle = fract(uTime * aData.y / max(aMotion.w, .01) + aForm.y);
    float descent = cycle * cycle;
    p = position + aMotion.xyz * (descent - aForm.x);
    float height = max(-aMotion.y, .01);
    float birthV = (aLip.x - position.y) / height;
    float actualV = (aLip.x - p.y) / height;
    float leadDelta = lipLead(actualV, height, aLip.y) - lipLead(birthV, height, aLip.y);
    p.xz += aLip.zw * leadDelta;
    p += normal * sin(cycle * 14.0 + uv.x * 4.0 + aData.x) * .028;
    vLifeOpacity = smoothstep(.025, .11, cycle) * (1.0 - smoothstep(.87, .995, cycle));
  }
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const fallFragment = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDirection;
uniform vec3 uWaterShadow;
uniform vec3 uWaterLight;
uniform vec3 uFoamColor;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec4 vData;
varying float vLifeOpacity;
${fallNoise}
void main() {
  float down = vUv.y;
  float time = uTime * vData.y;
  float closed = step(.18, vData.z) * (1.0 - step(.9, vData.z));
  // sqrt(down) is the travel time of a gravity accelerated sheet: visible
  // features get longer and faster towards the bottom instead of scrolling
  // a texture at one uniform speed.
  float travel = sqrt(max(down, .0001)) * 16.0 - time * 9.0;
  vec2 flowUv = mix(vec2(vUv.x * 3.5 + vData.x * 5.1, travel),
    periodicFlow(vUv.x, travel, .56, vData.x * 5.1), closed);
  float coarse = fbm(flowUv * vec2(.66, 1.3));
  float fine = noise21(flowUv * vec2(8.0, 2.0));
  float ribbon = noise21(mix(vec2(vUv.x * 2.5 + vData.x * 17.0, travel * .65),
    periodicFlow(vUv.x, travel * .65, .4, vData.x * 17.0), closed));
  float torn = fbm(flowUv * vec2(1.2, 1.1) + vec2(0., -time * .4));
  float edge = smoothstep(0.0, .08, vUv.x) * (1.0 - smoothstep(.91, 1.0, vUv.x));
  // Detached holes increase after the lip, retaining clear dark intervals.
  float holes = smoothstep(.22 + down * .10, .43 + down * .10,
                          torn + (1.0 - down) * .22);
  float fibre = smoothstep(.40, .76, ribbon) * (.16 + down * .25);
  float aerated = smoothstep(.30, .70, coarse + fibre * .30);
  aerated *= .68 + smoothstep(.02, .65, down) * .32;
  edge = mix(edge, 1.0, closed);
  float body = 1.0 - step(0.0, vData.z);
  float thin = clamp(vData.z, 0.0, 1.0);
  // Independent stretched white-water scales advect with travel. None cuts the
  // entire cross-section out of existence; a darker gathering core persists.
  float shortSheets = smoothstep(.36, .66,
    fbm(mix(vec2(vUv.x * 14.0 + vData.x * 3.1, travel * 1.35),
      periodicFlow(vUv.x, travel * 1.35, 2.23, vData.x * 3.1), closed)));
  float brokenAir = smoothstep(.39, .68,
    noise21(mix(vec2(vUv.x * 7.0 + vData.x * 5.1, travel * 1.75),
      periodicFlow(vUv.x, travel * 1.75, 1.11, vData.x * 5.1), closed)));
  float waterSilk = smoothstep(.48, .75,
    noise21(mix(vec2(vUv.x * 46.0 + vData.x * 11.1, travel * .85),
      periodicFlow(vUv.x, travel * .85, 7.32, vData.x * 11.1), closed)));
  // Gather air into irregular connected swathes. The slow field sets unequal
  // lengths/density, while stretched sheets and silk break up its boundaries.
  float gatheredAir = fbm(periodicFlow(vUv.x, travel * .22, .95, vData.x * .77));
  float connectedAir = smoothstep(.53, .65, gatheredAir + shortSheets * .18);
  float whiteWater = clamp(connectedAir * (.66 + shortSheets * .34)
    + brokenAir * .12 + waterSilk * .16, 0., 1.);
  aerated = min(1.0, aerated + (1.0 - thin) * .12 * vData.y);
  aerated = mix(aerated, .18 + whiteWater * .77, closed);
  aerated *= mix(1.0, .22, body);
  // Each broad sheet tears away before it reaches the pool. Independent
  // strands and fast falling droplets carry the last part of the descent.
  float endLine = .79 + noise21(mix(vec2(vUv.x * 5.0 + vData.x * 3.0, 0.0),
    periodicFlow(vUv.x, 0.0, .8, vData.x * 3.0), closed)) * .17;
  float endFade = 1.0 - smoothstep(endLine, .997, down);
  vec3 actualNormal = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (dot(actualNormal, vNormal) < 0.0) actualNormal = -actualNormal;
  vec3 n = normalize(mix(vNormal, actualNormal, .45));
  if (!gl_FrontFacing) n = -n;
  n = normalize(n + vec3(sin(travel * 2.0 + vUv.x * 12.56637061436) * .055,
                         (fine - .5) * .11, (ribbon - .5) * .10));
  vec3 viewDir = normalize(cameraPosition - vWorld);
  float fresnel = .025 + .975 * pow(1.0 - abs(dot(n, viewDir)), 5.0);
  float sun = max(dot(n, normalize(uSunDirection)), 0.);
  vec3 halfVector = normalize(normalize(uSunDirection) + viewDir);
  float specular = pow(max(dot(n, halfVector), 0.), 110.0);
  float broadSpecular = pow(max(dot(n, halfVector), 0.), 22.0);
  float airRoughness = clamp(aerated * closed, 0., 1.);
  vec3 color = mix(uWaterShadow, uWaterLight,
    .25 + fresnel * (.45 - airRoughness * .28) + sun * .22);
  color = mix(color, uFoamColor * (.78 + sun * .20), aerated * .94);
  color += uFoamColor * (specular * .52 + broadSpecular * .11) * (.35 + fine)
    * (1.0 - aerated * .70) * (1.0 - airRoughness * .60);
  float opacity = (.17 + aerated * .66 + fibre * .20 + fresnel * .18);
  opacity = mix(opacity, .25 + whiteWater * .75 + fresnel * .04, closed);
  opacity *= mix(.95, 1.0, thin) * edge * mix(holes, .82 + holes * .18, closed) * vData.w;
  opacity *= mix(endFade, 1.0, thin);
  float jetBreak = smoothstep(.26, .51,
    noise21(vec2(vData.x * 5.7, travel * 1.8)) + (1.0 - down) * .13);
  opacity *= mix(1.0, jetBreak, thin * (1.0 - closed));
  if (vData.z > 1.5) {
    float tornSkin = smoothstep(.28, .52, fbm(vUv * vec2(4., 6.) + vData.x));
    float fineFoam = noise21(vUv * vec2(15., 22.) + vData.x * 3.);
    opacity = edge * smoothstep(0., .10, vUv.y) * (1.0 - smoothstep(.78, 1., vUv.y));
    opacity *= tornSkin * vLifeOpacity * (.58 + fineFoam * .30);
    color = uFoamColor * (.76 + sun * .20) * (.85 + fineFoam * .15);
  }
  if (opacity < .022) discard;
  gl_FragColor = vec4(color, min(opacity, .90));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const impactVertex = /* glsl */ `
uniform float uTime;
attribute vec3 aOrigin;
attribute vec3 aFlowAxis;
attribute vec3 aFlowFront;
attribute vec4 aParams;
attribute vec4 aShape;
varying vec2 vUv;
varying vec3 vFoamNormal;
varying float vFade;
varying float vSeed;
varying float vAge;
void main() {
  vUv = uv;
  vSeed = aParams.w + aShape.y * 9.1;
  float t = fract(uTime / aParams.x + aParams.y);
  float age = t * aParams.x;
  vAge = t;
  float moving = step(.5, aShape.x);
  float child = step(.5, abs(aShape.y));
  float size = aParams.z * mix(.36 + sin(t * 3.14159) * .78,
                              .32 + sqrt(t) * 1.12, moving);
  size *= mix(1.0, .66, child);
  float split = aShape.y * smoothstep(.27, .86, t) * aParams.z * 1.85;
  float drift = sin(aParams.w * 4.3) * age * .11;
  float surge = age * aShape.w;
  vec3 local = position;
  float scaleX = size;
  float scaleZ = size * mix(.86, 1.10 + t * .6, moving);
  float scaleY = size * mix(1.5 - t * .8, .68 - t * .42, moving);
  local.x *= scaleX;
  local.z *= scaleZ;
  float throwHeight = 4.0 * aShape.z * t * (1.0 - t);
  float shellHeight = local.y * scaleY;
  local.y = shellHeight + mix(throwHeight, .018, moving);
  vec3 p = aOrigin + aFlowAxis * (local.x + split + drift)
                      + aFlowFront * (local.z + surge);
  p.y += local.y;
  vec3 scaledNormal = normalize(normal / max(vec3(scaleX, scaleY, scaleZ), vec3(.001)));
  vec3 foamNormal = normalize(aFlowAxis * scaledNormal.x + vec3(0., scaledNormal.y, 0.) + aFlowFront * scaledNormal.z);
  vFoamNormal = normalize(mat3(modelMatrix) * foamNormal);
  float birth = smoothstep(0., .085, t);
  float death = 1.0 - smoothstep(.68, 1., t);
  float family = mix(1.0 - smoothstep(.43, .72, t), smoothstep(.27, .42, t), child);
  vFade = birth * death * mix(1.0, family, moving);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
}
`;

export const impactFragment = /* glsl */ `
uniform float uTime;
uniform vec3 uFoamColor;
uniform vec3 uSunDirection;
varying vec2 vUv;
varying vec3 vFoamNormal;
varying float vFade;
varying float vSeed;
varying float vAge;
${fallNoise}
void main() {
  float n = fbm(vUv * vec2(5., 8.) + vSeed + vec2(0., uTime * -.28));
  float tear = noise21(vUv * vec2(12., 16.) + vSeed * 3.7);
  float side = smoothstep(0., .13, vUv.x) * (1.0 - smoothstep(.85, 1., vUv.x));
  float tip = smoothstep(0., .10, vUv.y) * (1.0 - smoothstep(.82, 1., vUv.y));
  float holes = smoothstep(.22 + vAge * .17, .48 + vAge * .14, n + tear * .19);
  float opacity = side * tip * holes * vFade * (.56 + n * .30);
  if (opacity < .018) discard;
  vec3 normal = normalize(vFoamNormal);
  float light = .64 + max(dot(normal, normalize(uSunDirection)), 0.) * .30;
  vec3 color = uFoamColor * light * (.90 + tear * .1);
  gl_FragColor = vec4(color, min(opacity, .87));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const sprayVertex = /* glsl */ `
uniform float uTime;
uniform float uMist;
attribute vec3 aOrigin;
attribute vec3 aVelocity;
attribute vec4 aParams;
varying vec2 vUv;
varying float vFade;
varying float vSeed;
void main() {
  vUv = uv;
  vSeed = abs(aParams.w);
  float falling = 1.0 - step(0.0, aParams.w);
  float t = fract(uTime / aParams.x + aParams.y);
  float age = t * aParams.x;
  vec3 p = aOrigin + aVelocity * age;
  p.y -= mix(4.905, .012, uMist) * age * age;
  p.x += sin(age * 2.0 + aParams.w * 19.0) * uMist * .11;
  p.z += cos(age * 1.7 + aParams.w * 7.0) * uMist * .08;
  vec4 mv = modelViewMatrix * vec4(p, 1.);
  float size = aParams.z * mix(.65 + sin(t * 3.14159) * .35,
                               .58 + t * .68, uMist);
  vec2 stretch = mix(vec2(.48, 1.4 + falling * 3.5), vec2(1.5, 1.0), uMist);
  // Genuine view-aligned quads, retaining world scale at every resolution.
  mv.xy += position.xy * size * stretch;
  vFade = smoothstep(0., .12, t) * (1.0 - smoothstep(.60, 1.0, t));
  gl_Position = projectionMatrix * mv;
}
`;

export const sprayFragment = /* glsl */ `
uniform float uTime;
uniform float uMist;
uniform vec3 uFoamColor;
varying vec2 vUv;
varying float vFade;
varying float vSeed;
${fallNoise}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float soft = 1.0 - smoothstep(mix(.20, .06, uMist), 1.0, r);
  float noise = fbm(vUv * 5.0 + vec2(vSeed * 18., uTime * -.11));
  float detail = mix(.70 + noise * .30, smoothstep(.20, .70, noise), uMist);
  float alpha = pow(soft, mix(2.0, 1.2, uMist)) * detail * vFade * mix(.88, .24, uMist);
  if (alpha < .006) discard;
  gl_FragColor = vec4(uFoamColor * mix(.87, .74, uMist), alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
