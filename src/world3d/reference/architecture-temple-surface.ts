import * as THREE from 'three';
import type { ArchitectureMaterials } from './architecture-materials';
import { templeProportions } from './architecture-proportions';

export interface TempleSurfaceOptions {
  size: readonly [number, number, number];
  quality: 'low' | 'high';
  materials: Pick<ArchitectureMaterials, 'marble' | 'limestone'>;
}

export interface TempleSurfaceReport {
  revision: 'temple-positioned-wear-v2-local-contrast';
  extraTriangleBudget: number;
  extraTriangles: number;
  replacedGeometries: number;
  affectedVertices: number;
  colorMultiplierRange: [number, number];
  wearRange: [number, number];
  zones: { wall: number; portal: number; columnFoot: number; tread: number; wallRunoffExterior: number; wallRunoffInterior: number };
}

type Point = readonly [number, number, number];
interface Triangle { ids: [number, number, number]; depth: number; score: number }
interface Crack { points: readonly (readonly [number, number])[] }

const clamp = THREE.MathUtils.clamp;
const gaussian = (x: number, radius: number): number => Math.exp(-(x * x) / (radius * radius));
const noise = (seed: number): number => { const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453123; return n - Math.floor(n); };

function segmentDistance(x: number, y: number, a: readonly [number, number], b: readonly [number, number]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t);
}

/** A tiny queue keeps the local refinement budget spatially balanced. */
class RefinementQueue {
  private heap: Triangle[] = [];
  push(value: Triangle): void {
    const h = this.heap; h.push(value); let i = h.length - 1;
    while (i > 0) { const parent = (i - 1) >> 1; if (h[parent].score >= value.score) break; h[i] = h[parent]; i = parent; }
    h[i] = value;
  }
  pop(): Triangle | undefined {
    const h = this.heap, result = h[0], end = h.pop();
    if (!h.length || !end) return result;
    let i = 0;
    while (i * 2 + 1 < h.length) {
      let child = i * 2 + 1;
      if (child + 1 < h.length && h[child + 1].score > h[child].score) child++;
      if (h[child].score <= end.score) break;
      h[i] = h[child]; i = child;
    }
    h[i] = end; return result;
  }
}

/**
 * Temple-only, construction-time surface field. It changes stone color and the
 * existing roughness offset, with no material/texture allocation or position
 * displacement. A few large porch faces receive linear in-plane refinement;
 * every original vertex and triangle plane remains in place. Invoke once after
 * ArchitectureBatch.finish and before AO baking / first GPU upload.
 */
export function applyTempleSurface(root: THREE.Group, options: TempleSurfaceOptions): TempleSurfaceReport {
  const q = templeProportions(options.size), high = options.quality === 'high';
  const { d, wallX, wallFront, wallBack, wallThickness, wallHeight, doorHalfWidth, doorHeight, columnX, frontZ, backZ, columnDiameter } = q;
  const frontFace = wallFront + wallThickness / 2;
  const courseH = wallHeight / Math.ceil(wallHeight / (d * .62));
  const cracks: Crack[] = [
    { points: [[4.18 * d, 2.0 * d], [4.29 * d, 2.30 * d], [4.23 * d, 2.43 * d], [4.40 * d, 2.78 * d]] },
    { points: [[-4.40 * d, 4.45 * d], [-4.31 * d, 4.73 * d], [-4.40 * d, 4.90 * d], [-4.24 * d, 5.21 * d]] },
  ];
  const columnCentres: [number, number][] = [];
  for (let i = 0; i < q.frontColumns; i++) for (const z of [frontZ, backZ]) columnCentres.push([-columnX + 2 * columnX * i / (q.frontColumns - 1), z]);
  for (let i = 1; i < q.sideRows - 1; i++) for (const x of [-columnX, columnX]) columnCentres.push([x, frontZ + (backZ - frontZ) * i / (q.sideRows - 1)]);
  const report: TempleSurfaceReport = {
    revision: 'temple-positioned-wear-v2-local-contrast', extraTriangleBudget: high ? 8000 : 2500,
    extraTriangles: 0, replacedGeometries: 0, affectedVertices: 0,
    colorMultiplierRange: [1, 1], wearRange: [Infinity, -Infinity],
    zones: { wall: 0, portal: 0, columnFoot: 0, tread: 0, wallRunoffExterior: 0, wallRunoffInterior: 0 },
  };

  const crackDistance = (x: number, y: number): number => {
    let distance = Infinity;
    for (const crack of cracks) for (let i = 1; i < crack.points.length; i++) distance = Math.min(distance, segmentDistance(x, y, crack.points[i - 1], crack.points[i]));
    return distance;
  };
  const classify = (x: number, y: number, z: number, ny: number, limestone: boolean) => {
    const wall = limestone && y >= -.02 && y < wallHeight + .03 && (
      Math.abs(z - wallFront) < wallThickness * .55 && Math.abs(x) < wallX + .03 ||
      Math.abs(z - wallBack) < wallThickness * .55 && Math.abs(x) < wallX + .03 ||
      Math.abs(Math.abs(x) - wallX) < wallThickness * .55 && z > wallBack - .03 && z < wallFront + .03
    );
    const portal = !limestone && Math.abs(x) < doorHalfWidth + d * .78 && y >= -.02 && y < doorHeight + d && z > wallFront - wallThickness * .55 && z < frontFace + d * .38;
    const tread = !limestone && ny > .82 && Math.abs(y) < .012 && Math.abs(x) < d * 2.4 && z > wallFront - d * .5 && z < options.size[2] / 2 + .01;
    return { wall, portal, tread };
  };

  root.traverse(object => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
    const limestone = object.material === options.materials.limestone;
    if (!limestone && object.material !== options.materials.marble) return;
    if (object.geometry.userData.templePositionedWear) return;
    let geometry = object.geometry as THREE.BufferGeometry;
    const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
    if (!position || !normal || !geometry.getAttribute('color') || !geometry.getAttribute('architectureWear')) return;

    const attributes = Object.fromEntries(Object.entries(geometry.attributes).map(([name, attribute]) => [name, { size: attribute.itemSize, normalized: attribute.normalized, values: Array.from(attribute.array) }]));
    const p = attributes.position.values, n = attributes.normal.values;
    const point = (id: number): Point => [p[id * 3], p[id * 3 + 1], p[id * 3 + 2]];
    const distanceSq = (a: Point, b: Point): number => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
    const queue = new RefinementQueue(), complete: number[] = [], midpoints = new Map<string, number>();
    const meshBudget = limestone ? (high ? 5900 : 1800) : (high ? 2100 : 700);
    let extra = 0;
    const score = (ids: Triangle['ids'], depth: number): number => {
      const a = point(ids[0]), b = point(ids[1]), c = point(ids[2]);
      const x = (a[0] + b[0] + c[0]) / 3, y = (a[1] + b[1] + c[1]) / 3, z = (a[2] + b[2] + c[2]) / 3;
      const ny = (n[ids[0] * 3 + 1] + n[ids[1] * 3 + 1] + n[ids[2] * 3 + 1]) / 3;
      const region = classify(x, y, z, ny, limestone);
      const porchWall = region.wall && Math.abs(z - frontFace) < .025 * d && Math.abs(n[ids[0] * 3 + 2]) > .96;
      if (!porchWall && !region.portal && !region.tread) return 0;
      if (depth >= (region.tread ? 2 : 11)) return 0;
      const longest = Math.sqrt(Math.max(distanceSq(a, b), distanceSq(b, c), distanceSq(c, a)));
      let target = (high ? .36 : .64) * d;
      // Only the two short authored fissures need close samples. They are an
      // albedo/roughness scar, never a hole or a displaced structural crack.
      if (porchWall && crackDistance(x, y) < longest * .65 + d * .10) target = (high ? .075 : .15) * d;
      if (region.tread) target = d * .7;
      return longest > target ? longest / target : 0;
    };
    const enqueue = (ids: Triangle['ids'], depth: number): void => {
      const priority = score(ids, depth);
      if (priority > 0) queue.push({ ids, depth, score: priority }); else complete.push(...ids);
    };
    const source = geometry.index;
    for (let i = 0; i < (source?.count ?? position.count); i += 3) enqueue([source ? source.getX(i) : i, source ? source.getX(i + 1) : i + 1, source ? source.getX(i + 2) : i + 2], 0);
    let triangle: Triangle | undefined;
    while ((triangle = queue.pop())) {
      const { ids, depth } = triangle;
      if (extra >= meshBudget || report.extraTriangles + extra >= report.extraTriangleBudget) { complete.push(...ids); continue; }
      const lengths = [distanceSq(point(ids[0]), point(ids[1])), distanceSq(point(ids[1]), point(ids[2])), distanceSq(point(ids[2]), point(ids[0]))];
      const edge = lengths.indexOf(Math.max(...lengths)), a = ids[edge], b = ids[(edge + 1) % 3], c = ids[(edge + 2) % 3];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      let mid = midpoints.get(key);
      if (mid === undefined) {
        mid = p.length / 3;
        for (const attribute of Object.values(attributes)) for (let component = 0; component < attribute.size; component++) attribute.values.push((attribute.values[a * attribute.size + component] + attribute.values[b * attribute.size + component]) / 2);
        const length = Math.hypot(n[mid * 3], n[mid * 3 + 1], n[mid * 3 + 2]);
        if (length > 0) for (let axis = 0; axis < 3; axis++) n[mid * 3 + axis] /= length;
        midpoints.set(key, mid);
      }
      extra++; enqueue([a, mid, c], depth + 1); enqueue([mid, b, c], depth + 1);
    }
    if (extra > 0) {
      const replacement = new THREE.BufferGeometry();
      for (const [name, attribute] of Object.entries(attributes)) replacement.setAttribute(name, new THREE.BufferAttribute(new Float32Array(attribute.values), attribute.size, attribute.normalized));
      replacement.setIndex(complete); replacement.computeBoundingBox(); replacement.computeBoundingSphere();
      replacement.userData = { ...geometry.userData };
      object.geometry = replacement; geometry.dispose(); geometry = replacement;
      report.extraTriangles += extra; report.replacedGeometries++;
    }

    const gPosition = geometry.getAttribute('position'), gNormal = geometry.getAttribute('normal'), color = geometry.getAttribute('color'), wear = geometry.getAttribute('architectureWear');
    for (let i = 0; i < gPosition.count; i++) {
      const x = gPosition.getX(i), y = gPosition.getY(i), z = gPosition.getZ(i), ny = gNormal.getY(i);
      const region = classify(x, y, z, ny, limestone);
      let deposit = 0, runoff = 0, seam = 0, fissure = 0, polish = 0, mineral = 0, blockVariation = 0, foot = 0;
      if (region.wall) {
        report.zones.wall++;
        const alongX = Math.abs(z - wallFront) < wallThickness * .56 || Math.abs(z - wallBack) < wallThickness * .56;
        const tangent = alongX ? x : z, origin = alongX ? -wallX : wallBack;
        const row = Math.floor((y + .0001) / courseH), blockWidth = d * 1.9, offset = row % 2 ? -blockWidth / 2 : 0;
        const block = Math.floor((tangent - origin - offset) / blockWidth), seed = row * 83 + block * 19 + (alongX ? 7 : 61);
        blockVariation = (noise(seed) - .5) * .11;
        mineral = gaussian((tangent - d * .8) / d, 2.5) * gaussian((y - d * 3.1) / d, 1.7) * .035;
        deposit = Math.exp(-Math.max(0, y) / (d * .34)) * (.25 + .75 * noise(block * 37 + 11));
        const jointY = Math.abs(y / courseH - Math.round(y / courseH)) * courseH;
        const jointX = Math.abs((tangent - origin - offset) / blockWidth - Math.round((tangent - origin - offset) / blockWidth)) * blockWidth;
        // A minority of joints retain sediment; all remaining joints keep the
        // actual bevel/AO instead of receiving a uniform black grid.
        seam = gaussian(jointY, d * .035) * (noise(row * 11 + block * 3) > .68 ? .45 : .06) + gaussian(jointX, d * .028) * (noise(seed + 9) > .78 ? .28 : 0);
        const nx = gNormal.getX(i), nz = gNormal.getZ(i);
        const exterior = z > wallFront + wallThickness * .44 && nz > .85 ||
          z < wallBack - wallThickness * .44 && nz < -.85 ||
          x > wallX + wallThickness * .44 && nx > .85 ||
          x < -wallX - wallThickness * .44 && nx < -.85;
        const frontExterior = exterior && z > wallFront + wallThickness * .44 && nz > .85;
        // Two visible front-wall drainage paths, rather than a faint repeated
        // field on every face. The source is a top ledge / one selected course;
        // a broad mineral head narrows and fades downward over a few stones.
        if (frontExterior) {
          const lowerJoint = Math.round(d * 5.65 / courseH) * courseH;
          for (const [location, sourceY, width, length, strength] of [
            [4.36 * d, wallHeight - d * .09, d * .30, d * 2.65, 2.45],
            [-4.35 * d, lowerJoint, d * .24, d * 1.10, 1.95],
          ]) {
            const t = sourceY - y;
            if (t <= 0) continue;
            const path = location + Math.sin(t / d * 1.7 + location) * d * .055;
            const widthAtY = width * (.68 + .32 * Math.exp(-t / (d * .9)));
            runoff += gaussian(x - path, widthAtY) * Math.exp(-t / length) * clamp(t / (d * .12), 0, 1) * clamp((length * 2.2 - t) / (length * .3), 0, 1) * strength;
          }
          // The right-hand drainage path also leaves one uneven deposit at
          // its foot. Most of the wall base retains the earlier subtle field.
          deposit += gaussian(x - d * 4.15, d * .68) * Math.exp(-Math.max(0, y) / (d * .60)) * .85;
        }
        runoff = exterior ? Math.min(2.45, runoff) : 0;
        if (runoff > .000001) {
          if (exterior) report.zones.wallRunoffExterior++; else report.zones.wallRunoffInterior++;
        }
        if (Math.abs(z - frontFace) < .03 * d && gNormal.getZ(i) > .8) fissure = gaussian(crackDistance(x, y), d * .020);
      }
      if (region.portal) {
        report.zones.portal++;
        const jamb = gaussian(Math.abs(x) - (doorHalfWidth + d * .43), d * .19);
        deposit += Math.exp(-Math.max(0, y) / (d * .29)) * .65;
        if (gNormal.getZ(i) > .85 && z > frontFace + d * .14) runoff += jamb * gaussian(y - doorHeight * .68, doorHeight * .35) * .38;
        seam += gaussian(y - doorHeight - d * .68, d * .035) * .20;
        // Hand-height contact and the inner arris are smoother, not dirtier.
        polish += gaussian(y - d * 1.0, d * .42) * gaussian(Math.abs(x) - doorHalfWidth - d * .04, d * .10) * .42;
      }
      if (!limestone && y < d * .86 && y > -.02) {
        let nearest = Infinity, centre: [number, number] | undefined;
        for (const column of columnCentres) { const distance = Math.hypot(x - column[0], z - column[1]); if (distance < nearest) { nearest = distance; centre = column; } }
        if (centre && nearest < columnDiameter * .77) {
          foot = Math.exp(-Math.max(0, y) / (d * .24)) * (.38 + .22 * Math.sin((x - centre[0]) * 5 / d + (z - centre[1]) * 2 / d) ** 2);
          // One exposed front-right plinth receives a stronger, asymmetric
          // grey-ochre patch. Other nineteen bases keep the original wear.
          if (Math.abs(centre[0] - columnX) < .01 && Math.abs(centre[1] - frontZ) < .01) {
            const facing = clamp((z - centre[1]) / (columnDiameter * .48) + .28, 0, 1);
            foot += Math.exp(-Math.max(0, y) / (d * .48)) * facing * (1 + .1 * Math.sin((x - centre[0]) * 9 / d)) * 1.1;
          }
          report.zones.columnFoot++; deposit += foot;
          seam += gaussian(y - columnDiameter * .17, d * .025) * .16;
        }
      }
      if (region.tread) {
        report.zones.tread++;
        polish += gaussian(x - d * .12 * Math.sin(z / d * .4), d * 1.1) * (.38 + .27 * gaussian(z - frontFace, d * 1.8));
        deposit += (1 - gaussian(x, d * 1.8)) * .17;
      }
      if (!region.wall && !region.portal && !region.tread && foot === 0) {
        report.wearRange[0] = Math.min(report.wearRange[0], wear.getX(i)); report.wearRange[1] = Math.max(report.wearRange[1], wear.getX(i)); continue;
      }
      const loss = deposit * .145 + runoff * .10 + seam * .095 + fissure * .19;
      const base = 1 + blockVariation - loss;
      // The deposited mineral is warm grey/ochre at a location, not a global
      // warming transform. Clean ivory keeps its original PBR color.
      const multipliers: [number, number, number] = [base + mineral + deposit * .023 + runoff * .012 + polish * .022, base + mineral * .43 + polish * .020, base - mineral * .35 - deposit * .025 - runoff * .012 + polish * .017];
      color.setXYZ(i, ...multipliers.map((multiplier, channel) => {
        report.colorMultiplierRange[0] = Math.min(report.colorMultiplierRange[0], multiplier); report.colorMultiplierRange[1] = Math.max(report.colorMultiplierRange[1], multiplier);
        return clamp(color.getComponent(i, channel) * multiplier, .46, 1.06);
      }) as [number, number, number]);
      const roughnessOffset = clamp(wear.getX(i) + deposit * .10 + seam * .035 + fissure * .06 - runoff * .025 - polish * .115, -.16, .18);
      wear.setX(i, roughnessOffset); report.wearRange[0] = Math.min(report.wearRange[0], roughnessOffset); report.wearRange[1] = Math.max(report.wearRange[1], roughnessOffset); report.affectedVertices++;
    }
    color.needsUpdate = wear.needsUpdate = true;
    geometry.userData.templePositionedWear = report.revision;
  });
  if (!Number.isFinite(report.wearRange[0])) report.wearRange = [0, 0];
  // No material, texture, lights or borrowed environment resources are touched.
  return report;
}
