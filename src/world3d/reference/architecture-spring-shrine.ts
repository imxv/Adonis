import * as THREE from 'three';
import type { ArchitectureMaterialQuality, ArchitectureMaterials } from './architecture-materials';
import { ArchitectureBatch, stoneBlock } from './architecture-geometry';
import { addSpringLion, finishSpringLion } from './architecture-spring-lion';

type XZ = readonly [number, number];
type XYZ = readonly [number, number, number];
type ShrineMaterials = Pick<ArchitectureMaterials, 'limestone' | 'marble' | 'blue' | 'gold' | 'bronze' | 'darkStone'>;

export interface ReferenceSpringShrineOptions {
  /** Both polygons and every dimension are in the caller's one assembly frame. */
  supportPolygon: readonly XZ[];
  occupiablePolygon: readonly XZ[];
  /** A front facing aedicule. No world position, yaw, pedestal or basin is inferred. */
  body: { centerX: number; rearZ: number; frontZ: number; width: number; height: number };
  /** position is the exact centre of the downstream lip, not the pipe's centre. */
  spout: { position: XYZ; direction: XYZ; width: number; length: number; wallThickness: number };
  quality: ArchitectureMaterialQuality;
  materials: ShrineMaterials;
}

/** Inclusive even/odd containment, including the supplied polygon's boundary. */
export function springShrinePointInPolygon(point: XZ, polygon: readonly XZ[], tolerance = 1e-6): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i], vx = b[0] - a[0], vz = b[1] - a[1];
    const lengthSq = vx * vx + vz * vz;
    const t = lengthSq > 0 ? THREE.MathUtils.clamp(((point[0] - a[0]) * vx + (point[1] - a[1]) * vz) / lengthSq, 0, 1) : 0;
    if (Math.hypot(point[0] - a[0] - t * vx, point[1] - a[1] - t * vz) <= tolerance) return true;
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function checkPolygon(polygon: readonly XZ[], name: string): void {
  if (polygon.length < 3 || !polygon.every(point => point.length === 2 && point.every(Number.isFinite))) throw new Error(`Spring shrine requires a finite ${name} polygon`);
  const area = polygon.reduce((sum, p, i) => { const q = polygon[(i + 1) % polygon.length]; return sum + p[0] * q[1] - p[1] * q[0]; }, 0);
  if (Math.abs(area) < 1e-5) throw new Error(`Spring shrine ${name} polygon is degenerate`);
}

function assertFootprint(footprint: readonly XZ[], o: ReferenceSpringShrineOptions): void {
  // Sampling complete edges also catches a rectangle crossing a concave cutout.
  for (let i = 0; i < footprint.length; i++) {
    const a = footprint[i], b = footprint[(i + 1) % footprint.length];
    const segments = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / .025));
    for (let j = 0; j <= segments; j++) {
      const t = j / segments, p: XZ = [THREE.MathUtils.lerp(a[0], b[0], t), THREE.MathUtils.lerp(a[1], b[1], t)];
      if (!springShrinePointInPolygon(p, o.supportPolygon) || !springShrinePointInPolygon(p, o.occupiablePolygon)) throw new Error('Spring shrine feet exceed the authoritative support or occupiable polygon');
    }
  }
}

/** Explicit closed polyhedron faces retain sharp stone joints and hard moulding arrises. */
class Faces {
  private positions: number[] = [];
  private normals: number[] = [];

  face(points: readonly XYZ[], outward: XYZ): void {
    if (points.length < 3) return;
    const a = new THREE.Vector3(...points[0]), n = new THREE.Vector3(...points[1]).sub(a).cross(new THREE.Vector3(...points[2]).sub(a));
    if (n.lengthSq() < 1e-18) return;
    n.normalize();
    if (n.dot(new THREE.Vector3(...outward)) < 0) { points = [...points].reverse(); n.negate(); }
    for (let i = 1; i < points.length - 1; i++) for (const p of [points[0], points[i], points[i + 1]]) { this.positions.push(...p); this.normals.push(n.x, n.y, n.z); }
  }

  geometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    return geometry;
  }
}

/** One closed arch voussoir, with an inward, not expanded, front bevel. */
function archStone(centerX: number, springY: number, rx: number, ry: number, band: number, a0: number, a1: number, rear: number, front: number, high: boolean): THREE.BufferGeometry {
  const faces = new Faces(), segments = high ? 3 : 2, inset = .007;
  const point = (a: number, outer: boolean, z: number, bevel: number): XYZ => [centerX + Math.cos(a) * (rx + (outer ? band - bevel : bevel)), springY + Math.sin(a) * (ry + (outer ? band - bevel : bevel)), z];
  const rings: { z: number; bevel: number }[] = [{ z: rear, bevel: 0 }, { z: front - inset, bevel: 0 }, { z: front, bevel: inset }];
  for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < segments; i++) {
    const a = THREE.MathUtils.lerp(a0, a1, i / segments), b = THREE.MathUtils.lerp(a0, a1, (i + 1) / segments), mid = (a + b) / 2;
    for (const outer of [false, true]) {
      const sign = outer ? 1 : -1;
      faces.face([point(a, outer, rings[k].z, rings[k].bevel), point(b, outer, rings[k].z, rings[k].bevel), point(b, outer, rings[k + 1].z, rings[k + 1].bevel), point(a, outer, rings[k + 1].z, rings[k + 1].bevel)], [Math.cos(mid) * sign, Math.sin(mid) * sign, 0]);
    }
  }
  for (const ring of [rings[0], rings[rings.length - 1]]) for (let i = 0; i < segments; i++) {
    const a = THREE.MathUtils.lerp(a0, a1, i / segments), b = THREE.MathUtils.lerp(a0, a1, (i + 1) / segments);
    faces.face([point(a, false, ring.z, ring.bevel), point(b, false, ring.z, ring.bevel), point(b, true, ring.z, ring.bevel), point(a, true, ring.z, ring.bevel)], [0, 0, ring.z === rear ? -1 : 1]);
  }
  for (const a of [a0, a1]) for (let k = 0; k < rings.length - 1; k++) faces.face([point(a, false, rings[k].z, rings[k].bevel), point(a, true, rings[k].z, rings[k].bevel), point(a, true, rings[k + 1].z, rings[k + 1].bevel), point(a, false, rings[k + 1].z, rings[k + 1].bevel)], [-Math.sin(a) * (a === a0 ? 1 : -1), Math.cos(a) * (a === a0 ? 1 : -1), 0]);
  return faces.geometry();
}

/** A hollow bronze tube. Both annular ends seal only the wall, never the water aperture. */
function hollowSpout(o: ReferenceSpringShrineOptions['spout'], body: ReferenceSpringShrineOptions['body'], high: boolean): THREE.BufferGeometry {
  const axis = new THREE.Vector3(...o.direction).normalize(), horizontal = new THREE.Vector3(axis.z, 0, -axis.x), up = new THREE.Vector3(0, 1, 0);
  const lip = new THREE.Vector3(...o.position), inner = o.width / 2, outer = inner + o.wallThickness, faces = new Faces(), count = high ? 40 : 24;
  const back = lip.clone().addScaledVector(axis, -o.length);
  // A cast offset throat runs into the chamber. Parallel section planes and
  // monotonically upstream stations form a real open duct without a solid cap.
  // The first full .15 m stays straight; the offset starts behind that clear bore.
  const rear = new THREE.Vector3(body.centerX + body.width * .262, o.position[1], body.frontZ - .17);
  const elbow = new THREE.Vector3().lerpVectors(rear, back, .52);
  const profile: { center: THREE.Vector3; radius: number; inside: boolean }[] = [
    { center: rear, radius: outer + .012, inside: false },
    { center: elbow, radius: outer + .008, inside: false },
    { center: back, radius: outer, inside: false },
    ...([[-o.length + .018, outer + .006], [-.048, outer], [-.030, outer + .013], [-.006, outer + .013], [0, outer], [0, inner], [-o.length, inner]] as [number, number][]).map(([along, radius]) => ({ center: lip.clone().addScaledVector(axis, along), radius, inside: radius === inner })),
    { center: elbow, radius: inner, inside: true }, { center: rear, radius: inner, inside: true },
  ];
  const point = (angle: number, station: typeof profile[number]): XYZ => {
    const p = station.center.clone().addScaledVector(horizontal, Math.cos(angle) * station.radius).addScaledVector(up, Math.sin(angle) * station.radius);
    return [p.x, p.y, p.z];
  };
  for (let p = 0; p < profile.length; p++) for (let i = 0; i < count; i++) {
    const q = (p + 1) % profile.length, a = i / count * Math.PI * 2, b = (i + 1) / count * Math.PI * 2, mid = (a + b) / 2;
    const along = profile[q].center.clone().sub(profile[p].center).dot(axis), radius = profile[q].radius - profile[p].radius;
    const outward = horizontal.clone().multiplyScalar(Math.cos(mid) * along).addScaledVector(up, Math.sin(mid) * along).addScaledVector(axis, -radius).normalize();
    faces.face([point(a, profile[p]), point(b, profile[p]), point(b, profile[q]), point(a, profile[q])], [outward.x, outward.y, outward.z]);
  }
  return faces.geometry();
}

type XY = [number, number];

function clip2D(polygon: XY[], axis: 0 | 1, boundary: number, greater: boolean): XY[] {
  const result: XY[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length], ia = greater ? a[axis] >= boundary : a[axis] <= boundary, ib = greater ? b[axis] >= boundary : b[axis] <= boundary;
    if (ia) result.push(a);
    if (ia !== ib) { const t = (boundary - a[axis]) / (b[axis] - a[axis]); result.push([THREE.MathUtils.lerp(a[0], b[0], t), THREE.MathUtils.lerp(a[1], b[1], t)]); }
  }
  return result;
}

/** Closed cut-stone fragments reserve a true through slot for the cast duct. */
function addCutArchStone(batch: ArchitectureBatch, material: THREE.MeshStandardMaterial, centerX: number, springY: number, rx: number, ry: number, band: number, a0: number, a1: number, rear: number, front: number, slot: [number, number, number, number], high: boolean, seed: number): void {
  const points: XY[] = [], segments = high ? 3 : 2;
  for (let i = 0; i <= segments; i++) { const a = THREE.MathUtils.lerp(a0, a1, i / segments); points.push([centerX + Math.cos(a) * (rx + band), springY + Math.sin(a) * (ry + band)]); }
  for (let i = segments; i >= 0; i--) { const a = THREE.MathUtils.lerp(a0, a1, i / segments); points.push([centerX + Math.cos(a) * rx, springY + Math.sin(a) * ry]); }
  const [x0, x1, y0, y1] = slot;
  const middle = clip2D(clip2D(points, 0, x0, true), 0, x1, false);
  const pieces = [clip2D(points, 0, x0, false), clip2D(points, 0, x1, true), clip2D(middle, 1, y0, false), clip2D(middle, 1, y1, true)];
  for (const piece of pieces) {
    const clean = piece.filter((p, i) => !i || Math.hypot(p[0] - piece[i - 1][0], p[1] - piece[i - 1][1]) > 1e-7);
    if (clean.length < 3) continue;
    const area = clean.reduce((sum, p, i) => { const q = clean[(i + 1) % clean.length]; return sum + p[0] * q[1] - p[1] * q[0]; }, 0);
    if (Math.abs(area) < 1e-8) continue;
    const shape = new THREE.Shape(clean.map(([x, y]) => new THREE.Vector2(x, y)));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: front - rear, steps: 1, bevelEnabled: false, curveSegments: 1 });
    geometry.translate(0, 0, rear); batch.add(geometry, material, [0, 0, 0], [0, 0, 0], seed++);
  }
}

function addOutletEscutcheon(batch: ArchitectureBatch, m: ShrineMaterials, b: ReferenceSpringShrineOptions['body'], s: ReferenceSpringShrineOptions['spout']): void {
  const outer = new THREE.Shape();
  const x0 = b.centerX + b.width * .142, x1 = b.centerX + b.width / 2 + .033, y0 = s.position[1] - .215, y1 = s.position[1] + .194;
  // A cast perimeter has rolled corners rather than a sharp rectangular frame.
  // The clear inner window and all duct sections keep their existing dimensions.
  const r = .028;
  outer.moveTo(x0 + r, y0); outer.lineTo(x1 - r, y0); outer.quadraticCurveTo(x1, y0, x1, y0 + r);
  outer.lineTo(x1, y1 - r); outer.quadraticCurveTo(x1, y1, x1 - r, y1);
  outer.lineTo(x0 + r, y1); outer.quadraticCurveTo(x0, y1, x0, y1 - r);
  outer.lineTo(x0, y0 + r); outer.quadraticCurveTo(x0, y0, x0 + r, y0); outer.closePath();
  const hole = new THREE.Path(); hole.moveTo(x0 + .027, y0 + .027); hole.lineTo(x0 + .027, y1 - .015); hole.lineTo(x1 - .024, y1 - .015); hole.lineTo(x1 - .024, y0 + .027); hole.closePath(); outer.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(outer, { depth: .026, bevelEnabled: false, steps: 1, curveSegments: 3 }); geometry.translate(0, 0, b.frontZ - .009);
  batch.add(geometry, m.bronze, [0, 0, 0], [0, 0, 0], 12511);
}

function leafRelief(width: number, height: number, depth: number, high: boolean): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0); shape.bezierCurveTo(-width * .55, height * .3, -width * .55, height * .66, 0, height);
  shape.bezierCurveTo(width * .55, height * .66, width * .55, height * .3, 0, 0);
  return new THREE.ExtrudeGeometry(shape, { depth, steps: 1, bevelEnabled: true, bevelSize: .003, bevelThickness: .003, bevelSegments: 1, curveSegments: high ? 5 : 3 });
}

function finishSurface(root: THREE.Group, front: number, mouth: XYZ, bodyWidth: number): void {
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshStandardMaterial) || object.material.metalness >= .5) return;
    const p = object.geometry.getAttribute('position'), normal = object.geometry.getAttribute('normal'), color = object.geometry.getAttribute('color'), roughness = object.geometry.getAttribute('architectureWear');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const below = Math.max(0, mouth[1] - y), frontFace = Math.max(0, normal.getZ(i));
      const streak = frontFace * Math.exp(-(((x - mouth[0] + below * .035) / .115) ** 2)) * Math.min(1, below * 4) * Math.exp(-below / 1.4) * Math.exp(-Math.abs(z - front) / .10);
      const jointDeposit = Math.exp(-Math.max(0, y) / .17) * (.04 + .025 * Math.cos(x * 13 + bodyWidth));
      const damp = Math.min(.14, streak * .12 + jointDeposit);
      color.setXYZ(i, color.getX(i) * (1 - damp * .77), color.getY(i) * (1 - damp * .66), color.getZ(i) * (1 - damp * .57));
      roughness.setX(i, roughness.getX(i) + jointDeposit * .6 - streak * .07);
    }
  });
}

/**
 * Compact ashlar aedicule, actual recessed arch chamber, continuous mouldings,
 * and an open-bore outlet in the explicitly supplied direction. Geometry is
 * frame-local and starts at y=0; the caller alone applies its world transform.
 * All generated geometry transfers to the returned group. Materials are borrowed.
 */
export function buildReferenceSpringShrine(o: ReferenceSpringShrineOptions): THREE.Group {
  checkPolygon(o.supportPolygon, 'support'); checkPolygon(o.occupiablePolygon, 'occupiable');
  const { body: b, spout: s, materials: m } = o, high = o.quality === 'high';
  if (!Object.values(b).every(Number.isFinite) || b.width < 1.1 || b.height < 2 || b.rearZ >= b.frontZ || b.frontZ - b.rearZ < .25) throw new Error('Spring shrine requires explicit finite body dimensions');
  if (![...s.position, ...s.direction, s.width, s.length, s.wallThickness].every(Number.isFinite) || s.width < .3 || s.length < .08 || s.wallThickness < .018 || Math.abs(s.direction[1]) > 1e-8 || Math.hypot(s.direction[0], s.direction[2]) < 1e-8) throw new Error('Spring shrine requires a horizontal, hollow outlet at least .30 m wide');
  const left = b.centerX - b.width / 2, right = b.centerX + b.width / 2, depth = b.frontZ - b.rearZ;
  const footprint: XZ[] = [[left, b.rearZ], [right, b.rearZ], [right, b.frontZ], [left, b.frontZ]];
  assertFootprint(footprint, o);
  if (s.position[1] < .7 || s.position[1] + s.width / 2 + s.wallThickness > b.height - .1) throw new Error('Spring shrine outlet exceeds the body height');

  const batch = new ArchitectureBatch(), springY = b.height * .66, rise = b.width * .25, rx = b.width * .305;
  const nicheX = b.centerX + b.width * .025, sillY = .43, innerLeft = nicheX - rx, innerRight = nicheX + rx;
  const backThickness = Math.min(.105, depth * .23), backFace = b.rearZ + backThickness;
  // The rear panel is an actual chamber back, not a flat facade pretending to be a niche.
  const rearPanelHeight = b.height - .302;
  batch.add(stoneBlock(b.width - .008, rearPanelHeight, backThickness, 12001, .005, .009), m.limestone, [b.centerX, rearPanelHeight / 2, b.rearZ + backThickness / 2], [0, 0, 0], 12001);
  // Flanking masonry remains individually cut, staggered and within the feet polygon.
  const courses = 7, courseH = (springY - .16) / courses, frontDepth = depth - backThickness;
  for (let course = 0; course < courses; course++) for (const side of [-1, 1]) {
    const x0 = side < 0 ? left : innerRight, x1 = side < 0 ? innerLeft : right;
    batch.add(stoneBlock(x1 - x0, courseH - .004, frontDepth, 12031 + course * 7 + side, course < 2 ? .01 : .005, .009), m.limestone,
      [(x0 + x1) / 2, .16 + courseH * (course + .5), backFace + frontDepth / 2], [0, 0, 0], 12031 + course * 7 + side);
  }
  // Low sill is part of the wall, never a new basin, pedestal or walk surface.
  batch.add(stoneBlock(b.width, .16, depth, 12141, .009, .012), m.marble, [b.centerX, .08, (b.rearZ + b.frontZ) / 2], [0, 0, 0], 12141);
  batch.add(stoneBlock(rx * 2, .10, depth - backThickness, 12143, .005, .009), m.marble, [nicheX, sillY - .05, (backFace + b.frontZ) / 2], [0, 0, 0], 12143);
  const band = b.width * .13, archCount = high ? 11 : 9;
  for (let i = 0; i < archCount; i++) {
    const a0 = i / archCount * Math.PI + .002, a1 = (i + 1) / archCount * Math.PI - .002;
    const slot: [number, number, number, number] = [b.centerX + b.width * .158, b.centerX + b.width / 2 + .01, s.position[1] - .195, s.position[1] + .195];
    const maxX = nicheX + Math.max(Math.cos(a0), Math.cos(a1)) * (rx + band), maxY = springY + Math.max(Math.sin(a0), Math.sin(a1)) * (rise + band);
    if (maxX > slot[0] && maxY > slot[2]) addCutArchStone(batch, m.marble, nicheX, springY, rx, rise, band, a0, a1, backFace, b.frontZ, slot, high, 12161 + i * 5);
    else batch.add(archStone(nicheX, springY, rx, rise, band, a0, a1, backFace, b.frontZ, high), m.marble, [0, 0, 0], [0, 0, 0], 12161 + i);
  }
  // Pilaster mouldings, continuous blue panel and thin raised gold borders.
  for (const side of [-1, 1]) {
    const center = side < 0 ? (left + innerLeft) / 2 : (innerRight + right) / 2, pilasterW = (side < 0 ? innerLeft - left : right - innerRight) * .70;
    batch.add(stoneBlock(pilasterW, springY - .43, .035, 12211 + side, .002, .005), m.blue, [center, (.43 + springY) / 2, b.frontZ - .009], [0, 0, 0], 12211 + side);
    for (const edge of [-1, 1]) batch.add(stoneBlock(.012, springY - .47, .016, 12221 + side * 3 + edge, 0, .002), m.gold, [center + edge * pilasterW * .40, (.43 + springY) / 2, b.frontZ + .003], [0, 0, 0], 12221 + side * 3 + edge);
    const leafCount = high ? 6 : 5;
    const stemPoints = Array.from({ length: 9 }, (_, i) => new THREE.Vector3(center + Math.sin(i / 8 * Math.PI * 3) * pilasterW * .07, .52 + i / 8 * (springY - .67), b.frontZ + .016));
    batch.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(stemPoints), high ? 18 : 12, .006, high ? 5 : 4, false), m.gold, [0, 0, 0], [0, 0, 0], 12241 + side);
    for (let i = 0; i < leafCount; i++) {
      const y = .57 + i * (springY - .78) / leafCount, direction = i % 2 ? -1 : 1;
      batch.add(leafRelief(pilasterW * .61, .16, .010, high), m.gold, [center, y, b.frontZ + .005], [0, 0, direction * .46], 12251 + i * 7 + side);
      const start = new THREE.Vector3(center, y + .005, b.frontZ + .020), end = new THREE.Vector3(center - direction * .060, y + .13, b.frontZ + .020);
      batch.add(new THREE.TubeGeometry(new THREE.LineCurve3(start, end), 1, .004, 4, false), m.gold, [0, 0, 0], [0, 0, 0], 12271 + i * 7 + side);
    }
    for (const [y, h, factor] of [[.25, .12, 1], [springY - .035, .10, 1], [springY + .045, .05, 1.04]] as const) {
      const width = Math.min((side < 0 ? innerLeft - left : right - innerRight) * factor, (side < 0 ? innerLeft - left : right - innerRight));
      batch.add(stoneBlock(width, h, depth, 12301 + y * 31 + side, .003, .008), m.marble, [center, y, (b.rearZ + b.frontZ) / 2], [0, 0, 0], 12301 + y * 31 + side);
    }
  }
  // A shallow conch relief grows from the niche back, with real radial flutes.
  const shellCenterY = springY - .05, shellRadius = rx * .72, fluteCount = high ? 13 : 9;
  for (let i = 0; i < fluteCount; i++) {
    const angle = .12 + i / (fluteCount - 1) * (Math.PI - .24), points: THREE.Vector3[] = [];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8, radius = .07 + t * shellRadius;
      points.push(new THREE.Vector3(nicheX + Math.cos(angle) * radius, shellCenterY + Math.sin(angle) * radius * .86, backFace + .012 + Math.sin(t * Math.PI) * .045));
    }
    batch.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), high ? 10 : 6, .014, high ? 6 : 4, false), m.marble, [0, 0, 0], [0, 0, 0], 12341 + i);
  }
  // The horizontal frieze reads as an architectural band, rather than isolated logos.
  const corniceBase = b.height - .24, friezeH = .12;
  const headerBottom = springY + rise + band - .015, headerTop = b.height - .18;
  // This hidden bearing core retreats on every overlapping outside plane: front
  // 18 mm, rear 12 mm, sides 6 mm. No coplanar core face survives under the band.
  if (headerTop > headerBottom) batch.add(stoneBlock(b.width - .012, headerTop - headerBottom, depth - .030, 12399, .003, .008), m.limestone, [b.centerX, (headerBottom + headerTop) / 2, (b.rearZ + b.frontZ) / 2 - .003], [0, 0, 0], 12399);
  batch.add(stoneBlock(b.width, friezeH, depth, 12401, .003, .007), m.blue, [b.centerX, corniceBase, (b.rearZ + b.frontZ) / 2], [0, 0, 0], 12401);
  for (const y of [corniceBase - friezeH / 2 + .008, corniceBase + friezeH / 2 - .008]) batch.add(stoneBlock(b.width - .035, .012, .014, 12403 + y, 0, .002), m.gold, [b.centerX, y, b.frontZ + .001], [0, 0, 0], 12403 + y);
  for (let i = 0; i < 7; i++) {
    const x = left + .11 + i * (b.width - .22) / 6;
    batch.add(leafRelief(.105, .074, .011, high), m.gold, [x, corniceBase - .032, b.frontZ + .004], [0, 0, i % 2 ? -.35 : .35], 12411 + i);
  }
  const friezeStem = Array.from({ length: 15 }, (_, i) => new THREE.Vector3(left + .055 + i / 14 * (b.width - .11), corniceBase - .015 + Math.sin(i / 14 * Math.PI * 6) * .022, b.frontZ + .020));
  batch.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(friezeStem), high ? 28 : 18, .005, 4, false), m.gold, [0, 0, 0], [0, 0, 0], 12431);
  for (const [y, h, inset] of [[b.height - .18, .09, .02], [b.height - .09, .09, 0]] as const) batch.add(stoneBlock(b.width - inset * 2, h, depth - inset, 12441 + y, .006, .012), m.marble, [b.centerX, y + h / 2, (b.rearZ + b.frontZ) / 2 - inset / 2], [0, 0, 0], 12441 + y);
  addSpringLion(batch, m.bronze, o);
  batch.add(hollowSpout(s, b, high), m.bronze, [0, 0, 0], [0, 0, 0], 12501);
  const root = batch.finish('reference-spring-shrine');
  finishSurface(root, b.frontZ, s.position, b.width);
  finishSpringLion(root, m.bronze, o);
  root.userData = {
    kind: 'reference-spring-shrine', quality: o.quality, geometryOnly: true, frameLocal: true, materialOwnership: 'borrowed',
    outletSculpture: {
      kind: 'bronze-lion', revision: 'r5-v10-polyhaven',
      source: { url: 'https://polyhaven.com/a/lion_head', license: 'CC0-1.0', creator: 'Tina' },
    },
    body: { ...b }, supportFootprints: [footprint], supportPolygon: o.supportPolygon.map(p => [...p]), occupiablePolygon: o.occupiablePolygon.map(p => [...p]),
    spout: { position: [...s.position], direction: new THREE.Vector3(...s.direction).normalize().toArray(), clearDiameter: s.width, wallThickness: s.wallThickness, length: s.length, openBore: true,
      feedChannel: { rearCenter: [b.centerX + b.width * .262, s.position[1], b.frontZ - .17], castOffsetThroat: true, stoneSlotCutThrough: true } },
    niche: { centerX: nicheX, innerHalfWidth: rx, springY, rise, sillY, depth: depth - backThickness },
    resourceOwnership: 'Only returned geometry; no material, texture, scene, light or world transform is owned here',
  };
  return root;
}
