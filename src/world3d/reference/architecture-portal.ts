import * as THREE from 'three';
import { ArchitectureBatch, stoneBlock } from './architecture-geometry';
import type { ArchitectureMaterials } from './architecture-materials';

export interface TemplePortalOptions {
  d: number;
  /** Centre plane of the front wall, matching buildReferenceTemple's wallFront. */
  wallFront: number;
  wallThickness: number;
  doorHalfWidth: number;
  doorHeight: number;
  quality: 'high' | 'low';
}

interface ProfilePoint { u: number; z: number; next: 'marble' | 'blue' | 'gold' }

class PortalFaces {
  private parts = new Map<THREE.MeshStandardMaterial, { p: number[]; uv: number[] }>();

  triangle(material: THREE.MeshStandardMaterial, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, uv: [THREE.Vector2, THREE.Vector2, THREE.Vector2]): void {
    if (b.clone().sub(a).cross(c.clone().sub(a)).lengthSq() < 1e-18) return;
    const part = this.parts.get(material) ?? { p: [], uv: [] };
    for (const point of [a, b, c]) part.p.push(point.x, point.y, point.z);
    for (const point of uv) part.uv.push(point.x, point.y);
    this.parts.set(material, part);
  }

  quad(material: THREE.MeshStandardMaterial, points: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3], uv: [THREE.Vector2, THREE.Vector2, THREE.Vector2, THREE.Vector2]): void {
    this.triangle(material, points[0], points[1], points[2], [uv[0], uv[1], uv[2]]);
    this.triangle(material, points[0], points[2], points[3], [uv[0], uv[2], uv[3]]);
  }

  flush(batch: ArchitectureBatch): void {
    let seed = 4701;
    for (const [material, part] of this.parts) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(part.p, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(part.uv, 2));
      geometry.computeVertexNormals();
      // Authored UVs are physical metres; ArchitectureBatch applies the shared
      // material metersPerTile convention. All material ownership stays outside.
      batch.add(geometry, material, [0, 0, 0], [0, 0, 0], seed++, true);
    }
    this.parts.clear();
  }
}

/** Closed section: full wall reveal, broad fascia, recessed step, convex bead,
 * and a narrow deep incision. next selects only that section edge's material. */
function portalProfile(d: number, back: number, face: number, high: boolean): ProfilePoint[] {
  const points: ProfilePoint[] = [];
  const add = (u: number, z: number, next: ProfilePoint['next'] = 'marble') => points.push({ u: u * d, z: face + z * d, next });
  points.push({ u: 0, z: back, next: 'marble' }, { u: .61 * d, z: back, next: 'marble' });
  add(.61, .19); add(.59, .235); add(.355, .235);
  add(.335, .215); add(.335, .155); add(.30, .155); add(.285, .23);
  const beadSegments = high ? 24 : 12;
  for (let i = 1; i <= beadSegments; i++) {
    const angle = i * Math.PI / beadSegments;
    add(.225 + .06 * Math.cos(angle), .23 + .06 * Math.sin(angle));
  }
  add(.15, .23); add(.15, .09, 'blue');
  add(.136, .09, 'gold'); add(.130, .09, 'blue'); add(.115, .09);
  add(.115, .19); add(.09, .215); add(0, .215);
  return points;
}

function addContinuousFrame(batch: ArchitectureBatch, m: ArchitectureMaterials, o: TemplePortalOptions): void {
  const face = o.wallFront + o.wallThickness / 2, back = o.wallFront - o.wallThickness / 2;
  const profile = portalProfile(o.d, back, face, o.quality === 'high');
  const width = o.doorHalfWidth, height = o.doorHeight;
  const station = (node: number, point: ProfilePoint): THREE.Vector3 => {
    if (node === 0) return new THREE.Vector3(-width - point.u, 0, point.z);
    if (node === 1) return new THREE.Vector3(-width - point.u, height + point.u, point.z);
    if (node === 2) return new THREE.Vector3(width + point.u, height + point.u, point.z);
    return new THREE.Vector3(width + point.u, 0, point.z);
  };
  const pathS = [0, height, height + width * 2, height * 2 + width * 2];
  const perimeter = [0];
  for (let j = 1; j <= profile.length; j++) {
    const a = profile[j - 1], b = profile[j % profile.length];
    perimeter.push(perimeter[j - 1] + Math.hypot(b.u - a.u, b.z - a.z));
  }
  const faces = new PortalFaces();
  for (let node = 0; node < 3; node++) for (let j = 0; j < profile.length; j++) {
    const next = (j + 1) % profile.length;
    faces.quad(m[profile[j].next], [station(node, profile[j]), station(node, profile[next]), station(node + 1, profile[next]), station(node + 1, profile[j])], [
      new THREE.Vector2(pathS[node], perimeter[j]), new THREE.Vector2(pathS[node], perimeter[j + 1]),
      new THREE.Vector2(pathS[node + 1], perimeter[j + 1]), new THREE.Vector2(pathS[node + 1], perimeter[j]),
    ]);
  }
  const contour = profile.map(point => new THREE.Vector2(point.u, point.z));
  for (const node of [0, 3]) for (const triangle of THREE.ShapeUtils.triangulateShape(contour, [])) {
    const points = triangle.map(index => station(node, profile[index])) as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
    // Both open path ends sit on y=0; their sealed soles face downward.
    if (points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).y > 0) [points[1], points[2]] = [points[2], points[1]];
    faces.triangle(m.marble, ...points, points.map(point => new THREE.Vector2(point.x, point.z)) as [THREE.Vector2, THREE.Vector2, THREE.Vector2]);
  }
  faces.flush(batch);
}

/** Closed Y/Z section extruded across X, with inward-cut rounded arrises. */
function crossPrism(section: THREE.Shape, x0: number, x1: number, bevel: number, high: boolean): THREE.ExtrudeGeometry {
  const geometry = new THREE.ExtrudeGeometry(section, {
    depth: x1 - x0 - bevel * 2, steps: 1, curveSegments: high ? 12 : 7,
    bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel,
    bevelOffset: -bevel, bevelSegments: high ? 3 : 2,
  });
  geometry.rotateY(-Math.PI / 2); geometry.translate(x1 - bevel, 0, 0);
  return geometry;
}

function addCrown(batch: ArchitectureBatch, m: ArchitectureMaterials, o: TemplePortalOptions): void {
  const { d, doorHalfWidth: half, doorHeight: height } = o, high = o.quality === 'high';
  const face = o.wallFront + o.wallThickness / 2, back = o.wallFront - o.wallThickness / 2;
  const beamHalf = half + .65 * d, beamFront = face + .225 * d;
  // A full bearing beam ties the two jambs; it is not a front-facing plate.
  batch.add(stoneBlock(beamHalf * 2, .29 * d, beamFront - back, 4811, 0, .018 * d), m.marble, [0, height + .535 * d, (back + beamFront) / 2], [0, 0, 0], 4811);
  const section = new THREE.Shape([
    new THREE.Vector2(back, height + .68 * d),
    new THREE.Vector2(face + .18 * d, height + .68 * d),
    new THREE.Vector2(face + .21 * d, height + .71 * d),
    new THREE.Vector2(face + .21 * d, height + .755 * d),
    new THREE.Vector2(face + .31 * d, height + .80 * d),
    new THREE.Vector2(face + .35 * d, height + .84 * d),
    new THREE.Vector2(face + .35 * d, height + .92 * d),
    new THREE.Vector2(face + .32 * d, height + .95 * d),
    new THREE.Vector2(back, height + .95 * d),
  ]);
  batch.add(crossPrism(section, -half - .73 * d, half + .73 * d, .008 * d, high), m.marble, [0, 0, 0], [0, 0, 0], 4819);

  for (const side of [-1, 1]) {
    const x = side * (half + .45 * d), section = new THREE.Shape();
    section.moveTo(face - .025 * d, height + .20 * d);
    section.lineTo(face + .08 * d, height + .20 * d);
    section.bezierCurveTo(face + .08 * d, height + .36 * d, face + .12 * d, height + .44 * d, face + .22 * d, height + .48 * d);
    section.bezierCurveTo(face + .40 * d, height + .57 * d, face + .35 * d, height + .75 * d, face + .20 * d, height + .77 * d);
    section.lineTo(face + .01 * d, height + .77 * d);
    section.lineTo(face - .025 * d, height + .72 * d); section.closePath();
    batch.add(crossPrism(section, x - .145 * d, x + .145 * d, .008 * d, high), m.marble, [0, 0, 0], [0, 0, 0], 4831 + side);
    for (const end of [-1, 1]) {
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= 48; i++) {
        const t = i / 48, angle = t * Math.PI * 3.1, radius = d * (.075 * (1 - t) + .020);
        points.push(new THREE.Vector3(x + end * .146 * d, height + .627 * d + Math.sin(angle) * radius, face + .228 * d + Math.cos(angle) * radius));
      }
      const curl = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), high ? 32 : 20, .0075 * d, high ? 6 : 5, false);
      batch.add(curl, m.marble, [0, 0, 0], [0, 0, 0], 4841 + side * 3 + end, false);
    }
  }
}

/** Adds only the architectural surround. Opening x±doorHalfWidth, y0..doorHeight
 * stays unobstructed. Local +Z is outside; wallFront is the wall centre plane.
 * Jamb width is .61D; reveal reaches the wall back; fascia protrudes .29D and
 * crown .35D beyond the wall's outside face, with top y=doorHeight+.95D.
 * All new geometry is transferred to batch. No material is mutated or disposed.
 */
export function addTemplePortal(batch: ArchitectureBatch, m: ArchitectureMaterials, o: TemplePortalOptions): void {
  if (![o.d, o.wallFront, o.wallThickness, o.doorHalfWidth, o.doorHeight].every(Number.isFinite) || o.d <= 0 || o.wallThickness <= 0 || o.doorHalfWidth <= 0 || o.doorHeight <= 0) {
    throw new Error('Temple portal requires finite positive dimensions.');
  }
  addContinuousFrame(batch, m, o);
  addCrown(batch, m, o);
}
