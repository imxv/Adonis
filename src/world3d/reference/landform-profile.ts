import type { ReferenceLayout, ReferenceVec3 } from './contracts';
import { REFERENCE_GROVE_POOL, REFERENCE_LANDFORM_REVISION, REFERENCE_TERRACE_CONTOURS } from './landform-layout';

type XZ = readonly [number, number];
interface Polygon { points: readonly XZ[]; minX: number; maxX: number; minZ: number; maxZ: number }
interface Segment { a: ReferenceVec3; b: ReferenceVec3; dx: number; dz: number; length2: number; width: number; id: string }
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const finite = (values: readonly number[], label: string) => { if (!values.every(Number.isFinite)) throw new Error(`Non-finite landform ${label}`); };
function polygon(points: readonly XZ[]): Polygon {
  if (points.length < 3) throw new Error('Landform polygon needs at least three points');
  points.forEach(p => finite(p, 'polygon point'));
  const copy = points.map(p => [p[0], p[1]] as const);
  return { points: copy, minX: Math.min(...copy.map(p => p[0])), maxX: Math.max(...copy.map(p => p[0])), minZ: Math.min(...copy.map(p => p[1])), maxZ: Math.max(...copy.map(p => p[1])) };
}
/** Positive outside, negative inside. The same distance controls both shores,
 * including concave notches; there is no separate hard inside/outside height. */
function signedDistance(p: Polygon, x: number, z: number): number {
  let inside = false, distance2 = Infinity;
  for (let i = 0, j = p.points.length - 1; i < p.points.length; j = i++) {
    const a = p.points[j], b = p.points[i], dx = b[0] - a[0], dz = b[1] - a[1], length2 = dx * dx + dz * dz;
    const t = length2 ? clamp(((x - a[0]) * dx + (z - a[1]) * dz) / length2, 0, 1) : 0;
    const ox = x - a[0] - dx * t, oz = z - a[1] - dz * t;
    distance2 = Math.min(distance2, ox * ox + oz * oz);
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  const distance = Math.sqrt(distance2); return inside ? -distance : distance;
}
function segment(a: ReferenceVec3, b: ReferenceVec3, width: number, id: string): Segment {
  finite([...a, ...b, width], 'segment');
  if (width <= 0) throw new Error('Landform corridor width must be positive');
  const dx = b[0] - a[0], dz = b[2] - a[2];
  return { a: [...a], b: [...b], dx, dz, length2: dx * dx + dz * dz, width, id };
}
function sample(s: Segment, x: number, z: number) {
  const t = s.length2 ? clamp(((x - s.a[0]) * s.dx + (z - s.a[2]) * s.dz) / s.length2, 0, 1) : 0;
  return { distance: Math.hypot(x - s.a[0] - s.dx * t, z - s.a[2] - s.dz * t), y: s.length2 ? mix(s.a[1], s.b[1], t) : Math.min(s.a[1], s.b[1]) };
}

export interface ReferenceLandformContacts {
  revision: string;
  role: 'physical-soil-and-seabed-base';
  lowShoreY: number;
  contours: readonly { y: number; outlineXZ: readonly XZ[]; outsideBlendM: number }[];
  templeCaps: readonly { id: string; position: ReferenceVec3; yaw: number; size: ReferenceVec3; soilY: number; outsideBlendM: number; shoulders: readonly { y: number; outsideBlendM: number }[] }[];
  grovePool: null | { id: string; level: number; bankSoilY: number; bedYRange: readonly [number, number]; outlineXZ: readonly XZ[]; downhillBlendWidthM: readonly [number, number]; southernBlendM: number; outerFootTargetXZ: typeof REFERENCE_GROVE_POOL.outerFootTargetXZ };
  waters: readonly { id: string; kind: 'sea' | 'pool'; level: number; outlineXZ: readonly XZ[] }[];
  pathIds: readonly string[];
  carvedWaterIds: readonly string[];
  rootOverlays: readonly string[];
  notes: readonly string[];
}

/** A finite, continuous soil cap, not a visible cliff asset or walk-floor
 * provider. Water and paths are captured from the supplied layout; this file
 * never imports composition/current layout or the planning JSON. Root applies
 * the frozen main-cascade cut, actual bridge bed, stairs and narrow walk floors.
 * The non-nested terrace outlines are overlapping absolute-height footprints,
 * not additive rings: higher soil wins until a dry-route/wet-bed ceiling cuts it.
 */
export function createReferenceLandformProfile(layout: ReferenceLayout): { height(x: number, z: number): number; contacts: ReferenceLandformContacts } {
  const lowY = 1.4;
  const contours = REFERENCE_TERRACE_CONTOURS.map(c => ({ y: c.y, shape: polygon(c.outlineXZ), blend: c.y > 20 ? 4 : c.y > 16 ? 8 : 10 }));
  const referenceTop = Math.max(...contours.map(c => c.y));
  const shoulderLevels = contours.filter(c => c.y < referenceTop).sort((a, b) => b.y - a.y);
  const temples = layout.architecture.filter(p => p.kind === 'temple').map(p => {
    finite([...p.position, ...p.size, p.yaw], 'temple placement');
    if (p.size[0] <= 0 || p.size[2] <= 0) throw new Error('Landform temple footprint must have positive dimensions');
    const soilY = p.position[1] - 1.1;
    return { id: p.id, position: [...p.position] as ReferenceVec3, yaw: p.yaw, size: [...p.size] as ReferenceVec3, soilY, outsideBlendM: 6,
      shoulders: shoulderLevels.map((c, i) => ({ y: soilY - (referenceTop - c.y), outsideBlendM: 6 * (i + 2) })),
      c: Math.cos(p.yaw), s: Math.sin(p.yaw) };
  });
  const waters = layout.water.filter(w => w.kind === 'sea' || w.kind === 'pool').map(w => {
    if (!('outline' in w) || !w.outline.length) throw new Error('Landform water surface has no outline');
    w.outline.forEach(p => finite(p, 'water vertex'));
    const level = w.outline[0][1]; finite([level], 'water level');
    if (w.outline.some(p => Math.abs(p[1] - level) > .00001)) throw new Error('Landform water surface must be horizontal');
    return { id: w.id, kind: w.kind as 'sea' | 'pool', level, shape: polygon(w.outline.map(p => [p[0], p[2]] as const)), grove: w.id === 'water.grove-pool' };
  });
  const grove = waters.find(w => w.grove);
  const [minBlend, maxBlend] = REFERENCE_GROVE_POOL.downhillBlendWidthM;
  const southBlend = grove ? clamp(REFERENCE_GROVE_POOL.outerFootTargetXZ.z[1] - grove.shape.maxZ, minBlend, maxBlend) : minBlend;
  const paths: Segment[] = [];
  for (const p of layout.paths) for (let i = 1; i < p.points.length; i++) paths.push(segment(p.points[i - 1], p.points[i], p.width, p.id));
  const lowRouteTop = Math.min(...REFERENCE_TERRACE_CONTOURS.map(c => c.y)) + .4;
  const approaches = paths.filter(p => Math.max(p.a[1], p.b[1]) <= lowRouteTop);
  const channels: Segment[] = [];
  for (const w of layout.water) {
    if (w.kind === 'stream' && w.id !== 'water.cascade-ledge') {
      for (let i = 1; i < w.points.length; i++) channels.push(segment(w.points[i - 1], w.points[i], w.width, w.id));
    } else if (w.kind === 'waterfall' && w.controlledBySpring) {
      for (const tier of w.tiers) channels.push(segment(tier.top, tier.bottom, tier.width, w.id));
    }
  }
  const contacts: ReferenceLandformContacts = {
    revision: REFERENCE_LANDFORM_REVISION, role: 'physical-soil-and-seabed-base', lowShoreY: lowY,
    contours: contours.map(c => ({ y: c.y, outlineXZ: c.shape.points, outsideBlendM: c.blend })),
    templeCaps: temples.map(({ id, position, yaw, size, soilY, outsideBlendM, shoulders }) => ({ id, position, yaw, size, soilY, outsideBlendM, shoulders })),
    grovePool: grove ? { id: grove.id, level: grove.level, bankSoilY: grove.level - .4, bedYRange: [grove.level - 1.2, grove.level - .4], outlineXZ: grove.shape.points,
      downhillBlendWidthM: [minBlend, maxBlend], southernBlendM: southBlend, outerFootTargetXZ: REFERENCE_GROVE_POOL.outerFootTargetXZ } : null,
    waters: waters.map(w => ({ id: w.id, kind: w.kind, level: w.level, outlineXZ: w.shape.points })),
    pathIds: [...new Set(paths.map(p => p.id))], carvedWaterIds: [...new Set(channels.map(p => p.id))],
    rootOverlays: ['frozen main cascade cut', 'actual bridge riverbed', 'each stair tread minus .14m', 'narrow dry-route bearing and causeway crest'],
    notes: [
      'Only soil/seabed. C supplies complete visible rock faces, sides and backs.',
      'The 14/17.7 contours cross: they are overlapping supports, not simultaneously satisfiable contour lines.',
      'Temple caps follow supplied metre footprints and position.y-1.1; their six-metre outer blend is hidden bearing, not a visible cliff asset.',
      'Temple outer shoulders reuse the lower terrace levels at finite 12/18m toes, so the six-metre cap lip does not drop straight to low ground.',
      'Grove bank soil tends to waterY-.4 on both sides. C/B must resolve the actual visible waterline above this buried soil cap.',
      'The southern downhill interval is a real horizontal slope, not walkability approval. Paths/steps require their own floors.',
      'Main cascade tiers and ledge are deliberately left to the frozen root cut; validate it after all root overlays.',
    ],
  };
  return {
    contacts,
    height(x, z) {
      finite([x, z], 'query');
      const far = Math.max(smooth(-32, -48, x), smooth(-62, -80, z));
      const roll = .5 + .25 * Math.sin(x * .055 + z * .017) + .25 * Math.cos(z * .045 - x * .021);
      const base = lowY + far * (2 + 5 * roll * roll);
      let y = base;
      // Absolute-height fields share the same low ground; never sum 14+17.7+20.9.
      for (const c of contours) {
        if (x < c.shape.minX - c.blend || x > c.shape.maxX + c.blend || z < c.shape.minZ - c.blend || z > c.shape.maxZ + c.blend) continue;
        const outside = Math.max(0, signedDistance(c.shape, x, z));
        y = Math.max(y, mix(base, c.y, 1 - smooth(0, c.blend, outside)));
      }
      if (grove) {
        const d = Math.max(0, signedDistance(grove.shape, x, z));
        const blend = mix(minBlend, southBlend, smooth(grove.shape.maxZ - 3, grove.shape.maxZ + 3, z));
        y = Math.max(y, mix(base, grove.level - .4, 1 - smooth(0, blend, d)));
      }
      // Broad low approach earth, .35m below the exact future walk bearing.
      // High flights/temple routes do not create another wide northern ramp.
      for (const p of approaches) {
        const at = sample(p, x, z), crest = at.y - .35;
        const foot = clamp(6 + (crest - lowY) * .5, minBlend, maxBlend);
        const weight = 1 - smooth(p.width * .5, p.width * .5 + foot, at.distance);
        y = Math.max(y, mix(base, Math.max(base, crest), weight));
      }
      // A local dry-route ceiling only removes soil; it never substitutes for a
      // bridge deck, tread quantisation, or the root's exact road support.
      const uncut = y;
      for (const p of paths) {
        const at = sample(p, x, z), weight = 1 - smooth(p.width * .5, p.width * .5 + 3, at.distance);
        y = Math.min(y, mix(uncut, Math.min(uncut, at.y - .28), weight));
      }
      // Hidden soil under the complete actual temple, including its rear half.
      // A smooth rounded distance outside the footprint replaces hard rectangle
      // returns. Keep the cap after soft road cuts so a nearby lower side route
      // cannot excavate underneath the temple's fixed lowest foundation.
      for (const t of temples) {
        const dx = x - t.position[0], dz = z - t.position[2];
        const lx = t.c * dx - t.s * dz, lz = t.s * dx + t.c * dz;
        const outside = Math.hypot(Math.max(0, Math.abs(lx) - t.size[0] / 2), Math.max(0, Math.abs(lz) - t.size[2] / 2));
        y = Math.max(y, mix(base, t.soilY, 1 - smooth(0, t.outsideBlendM, outside)));
        for (const shoulder of t.shoulders) y = Math.max(y, mix(base, shoulder.y, 1 - smooth(0, shoulder.outsideBlendM, outside)));
      }
      // Wet domains are final upper bounds, preventing any terrace/ridge from
      // refilling the sea or either pool. Outside caps use the same shore value.
      for (const w of waters) {
        const d = signedDistance(w.shape, x, z), edgeY = w.level - (w.kind === 'sea' ? .4 : w.grove ? .4 : .45);
        if (d <= 0) {
          const depth = w.kind === 'sea' ? Math.min(16, -d * .35) : w.grove ? .8 * smooth(0, 3.5, -d) : Math.min(3.2, -d * .4);
          y = Math.min(y, edgeY - depth);
        } else {
          // A low sea collar is local: extending its grade plane inland would
          // incorrectly cut the separate 11.7m grove pond below its own bed.
          const width = w.kind === 'sea' ? 6 : w.grove ? 4 : 5;
          const ceiling = edgeY + d * (w.kind === 'sea' ? .8 : w.grove ? 3 : 1.2);
          y = mix(y, Math.min(y, ceiling), 1 - smooth(0, width, d));
        }
      }
      const beforeChannels = y;
      for (const s of channels) {
        const at = sample(s, x, z), radius = s.width * .5 + .05;
        const weight = 1 - smooth(radius, radius + 3, at.distance);
        y = Math.min(y, mix(beforeChannels, Math.min(beforeChannels, at.y - .22), weight));
      }
      return y;
    },
  };
}
