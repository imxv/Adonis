import * as THREE from 'three';
import type { ReferenceLayout, ReferenceStream, ReferenceVec3, ReferenceWaterfall } from './contracts';
import { REFERENCE_SACRED_WATER } from './landform-layout';

type V3 = readonly [number, number, number];
type Batch = { positions: number[]; uvs: number[]; colors: number[]; solids: number };
type Station = { point: THREE.Vector3; side: THREE.Vector3; widthScale: number; distance: number; lip: boolean };
export interface ReferenceSpringCarrierDetails {
  status: 'created' | 'layout-not-supported' | 'no-cascade-mesh' | 'unsupported-cascade-mesh' | 'contact-not-found';
  reason?: string;
  model: string | null;
  source: ReferenceVec3 | null;
  rill: string | null;
  basin: string | null;
  sourceFacadeImplemented: false;
  sourceFacade: string;
  contacts: { id: string; point: number[]; support: 'terrain' | 'actual-cascade-triangles' }[];
  rayQueries: number;
  sourceMeshes: number;
  channelStations: number;
  raisedFloorStations: number;
  maximumFloorRaiseM: number;
  maximumRockCarriedHeightM: number;
  spillLipLengthM: number;
  foundationSpanM: number;
  foundationDeckY: number;
  outputTriangles: number;
  mainDraws: number;
  method: string;
}

const EXPECTED_SOURCE = REFERENCE_SACRED_WATER.source;
const REAR_CONTACT = REFERENCE_SACRED_WATER.contacts.rearDryContact;
const BASIN_CONTACT = REFERENCE_SACRED_WATER.contacts.frontRockContact;
const BASIN_WATER_Y = REFERENCE_SACRED_WATER.contacts.catchBasinWaterY;
const DECK_Y = REFERENCE_SACRED_WATER.contacts.foundationDeckY;
const SPILL_LENGTH = REFERENCE_SACRED_WATER.contacts.spillLipLengthM;
const near = (a: V3, b: V3, tolerance = .025) => a.every((v, i) => Math.abs(v - b[i]) <= tolerance);
const finite = (p: V3) => p.every(Number.isFinite);

/** A detached, world-space, short structural carrier. The supplied material,
 * cascade meshes, geometry and maps remain borrowed. The caller owns every
 * returned geometry, including when it replaces a quality candidate. There is
 * no scene service, renderer, capture pass, timer, input or independent loop.
 *
 * Only the small foundation spans the dry-bank gap. The rill is supported by
 * actual downward intersections with C's current world triangles; its final
 * metre is an explicitly bounded cantilever, never a wall to the lower shore.
 * A's fountain facade/nozzle above the Y18 foundation is deliberately absent.
 */
export function createReferenceSpringCarrier(
  layout: ReferenceLayout,
  actualCascadeModel: THREE.Object3D | null | undefined,
  terrainHeight: (x: number, z: number) => number,
  borrowedStoneMaterial: THREE.MeshStandardMaterial,
): { root: THREE.Group; geometries: Set<THREE.BufferGeometry>; details: ReferenceSpringCarrierDetails } {
  const root = new THREE.Group(); root.name = 'D / short sacred spring carrier';
  const geometries = new Set<THREE.BufferGeometry>();
  const details: ReferenceSpringCarrierDetails = {
    status: 'layout-not-supported', model: actualCascadeModel?.name ?? null, source: null, rill: null, basin: null,
    sourceFacadeImplemented: false,
    sourceFacade: 'A fountain facade and the spout at Y20.3 are not implemented here. This module supplies only the Y18 foundation, basin, rock-carried rill and short spill lip; it does not claim to support the high outlet with an invented facade.',
    contacts: [], rayQueries: 0, sourceMeshes: 0, channelStations: 0, raisedFloorStations: 0,
    maximumFloorRaiseM: 0, maximumRockCarriedHeightM: 0, spillLipLengthM: 0,
    foundationSpanM: 0, foundationDeckY: DECK_Y, outputTriangles: 0, mainDraws: 0,
    method: 'Immutable source geometry is raycast through private DoubleSide proxies in its actual world transform. Small closed stone solids are merged into two draws. Channel bottoms embed into local C contacts; the last <=1.10m is a constant-depth stone spout. No bounding-box foundation, full river wall, or borrowed material mutation.',
  };
  const result = () => { root.userData.springCarrier = details; return { root, geometries, details }; };
  const reject = (status: ReferenceSpringCarrierDetails['status'], reason: string) => {
    details.status = status; details.reason = reason; return result();
  };
  const source = layout.water.find((w): w is ReferenceStream => w.kind === 'stream' && w.id === 'water.sacred-spring');
  const rill = layout.water.find((w): w is ReferenceStream => w.kind === 'stream' && w.controlledBySpring &&
    w.points.length >= 3 && near(w.points[0], [BASIN_CONTACT[0], BASIN_WATER_Y, BASIN_CONTACT[2]]) && w.width <= .6);
  const basin = layout.water.find(w => w.kind === 'pool' && w.controlledBySpring &&
    w.outline.length >= 6 && w.outline.every(p => Math.abs(p[1] - BASIN_WATER_Y) < .025) &&
    w.outline.some(p => Math.hypot(p[0] - BASIN_CONTACT[0], p[2] - BASIN_CONTACT[2]) < .7));
  const falls = layout.water.filter((w): w is ReferenceWaterfall => w.kind === 'waterfall' && w.controlledBySpring);
  if (!source || !rill || !basin || source.points.length !== 2 || source.width > .35 ||
      new THREE.Vector3(...source.points[0]).distanceTo(new THREE.Vector3(...source.points[1])) > .2 ||
      !near(source.points[0], EXPECTED_SOURCE, .001) ||
      !rill.points.every(finite) || rill.width < .25 || rill.width > .45 ||
      !falls.some(w => w.tiers.some(t => near(t.top, EXPECTED_SOURCE) && near(t.bottom, rill.points[0]))) ||
      !falls.some(w => w.tiers.some(t => near(t.top, rill.points[rill.points.length - 1])))) {
    return reject('layout-not-supported', 'Expected the r5 fixed short source, upper drop, .4m rock rill and lower drop. No old long ribbon or approximate replacement was generated.');
  }
  details.source = source.points[0]; details.rill = rill.id; details.basin = basin?.id ?? null;
  if (!actualCascadeModel) return reject('no-cascade-mesh', 'The actual current cascade model is required; no proxy bbox or guessed rock contacts were used.');

  const foundation: Batch = { positions: [], uvs: [], colors: [], solids: 0 };
  const wetStone: Batch = { positions: [], uvs: [], colors: [], solids: 0 };
  let probeMaterial: THREE.MeshBasicMaterial | undefined;
  const proxies: THREE.Mesh[] = [];
  try {
    actualCascadeModel.updateWorldMatrix(true, true);
    probeMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    let unsupported = false, highest = -Infinity;
    actualCascadeModel.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object instanceof THREE.InstancedMesh || object instanceof THREE.SkinnedMesh) { unsupported = true; return; }
      const geometry = object.geometry, positions = geometry.getAttribute('position');
      if (!positions || !positions.count) return;
      const determinant = object.matrixWorld.determinant();
      if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) { unsupported = true; return; }
      const point = new THREE.Vector3();
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
        if (!finite(point.toArray() as [number, number, number])) throw new Error('Spring carrier source has a non-finite world vertex');
        highest = Math.max(highest, point.y);
      }
      // Geometry is borrowed. Only the temporary raycast material/proxy is owned.
      const proxy = new THREE.Mesh(geometry, probeMaterial!); proxy.matrixAutoUpdate = false;
      proxy.matrix.copy(object.matrixWorld); proxy.updateMatrixWorld(true); proxies.push(proxy);
    });
    details.sourceMeshes = proxies.length;
    if (unsupported) return reject('unsupported-cascade-mesh', 'A singular, skinned or instanced source requires its real deformed triangles; no approximate support was generated.');
    if (!proxies.length || !Number.isFinite(highest)) return reject('no-cascade-mesh', 'The supplied model has no readable world triangle meshes.');
    const raycaster = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
    const rock = (x: number, z: number) => {
      details.rayQueries++;
      raycaster.set(new THREE.Vector3(Math.fround(x), highest + 2, Math.fround(z)), down);
      raycaster.near = 0; raycaster.far = highest + 100;
      return raycaster.intersectObjects(proxies, false)[0]?.point.y ?? null;
    };
    const floor = (x: number, z: number) => {
      const y = terrainHeight(Math.fround(x), Math.fround(z));
      if (!Number.isFinite(y)) throw new Error(`Spring carrier has non-finite dry terrain at ${x},${z}`);
      return y;
    };
    const contact = rock(BASIN_CONTACT[0], BASIN_CONTACT[2]);
    if (contact === null || Math.abs(contact - BASIN_CONTACT[1]) > .25) {
      return reject('contact-not-found', 'The actual basin rock contact is absent or differs by more than .25m; no hanging foundation was generated.');
    }
    details.contacts.push({ id: 'basin-rock', point: [BASIN_CONTACT[0], contact, BASIN_CONTACT[2]], support: 'actual-cascade-triangles' });

    function emit(batch: Batch, a: V3, b: V3, c: V3, color: V3, expected?: THREE.Vector3) {
      const ab = new THREE.Vector3().subVectors(new THREE.Vector3(...b), new THREE.Vector3(...a));
      const ac = new THREE.Vector3().subVectors(new THREE.Vector3(...c), new THREE.Vector3(...a));
      const n = ab.cross(ac);
      if (!Number.isFinite(n.lengthSq()) || n.lengthSq() < 1e-16) throw new Error('Spring carrier attempted a degenerate/non-finite face');
      if (expected && n.dot(expected) < 0) [b, c] = [c, b];
      batch.positions.push(...a, ...b, ...c); batch.colors.push(...color, ...color, ...color);
      const axis = Math.abs(n.y) > Math.max(Math.abs(n.x), Math.abs(n.z)) ? 1 : Math.abs(n.x) > Math.abs(n.z) ? 0 : 2;
      for (const p of [a, b, c]) batch.uvs.push(axis === 0 ? p[2] : p[0], axis === 1 ? p[2] : p[1]);
    }
    function quad(batch: Batch, a: V3, b: V3, c: V3, d: V3, color: V3, expected?: THREE.Vector3) {
      emit(batch, a, b, c, color, expected); emit(batch, a, c, d, color, expected);
    }
    // Extrudes an actual section polygon, not a filled bounding rectangle.
    function extrudeSection(batch: Batch, profile: readonly THREE.Vector2[], origin: THREE.Vector3,
      axis: THREE.Vector3, halfWidth: number, color: V3) {
      const side = new THREE.Vector3(axis.z, 0, -axis.x);
      const point = (p: THREE.Vector2, w: number): V3 => [origin.x + axis.x * p.x + side.x * w, p.y, origin.z + axis.z * p.x + side.z * w];
      const faces = THREE.ShapeUtils.triangulateShape(profile.map(p => p.clone()), []);
      for (const face of faces) for (const w of [-halfWidth, halfWidth]) {
        emit(batch, point(profile[face[0]], w), point(profile[face[1]], w), point(profile[face[2]], w), color, side.clone().multiplyScalar(Math.sign(w)));
      }
      // A CCW section is outward along axis x up; orient its perimeter explicitly.
      for (let i = 0; i < profile.length; i++) {
        const a = profile[i], b = profile[(i + 1) % profile.length];
        const outward = axis.clone().multiplyScalar(b.y - a.y).addScaledVector(new THREE.Vector3(0, 1, 0), a.x - b.x);
        const p = [point(a, -halfWidth), point(b, -halfWidth), point(b, halfWidth), point(a, halfWidth)];
        emit(batch, p[0], p[1], p[2], color, outward); emit(batch, p[0], p[2], p[3], color, outward);
      }
      batch.solids++;
    }

    // The short asymmetric arch reaches a real rock shoulder. Its front edge
    // stops behind the falling water, rather than putting a slab over the basin.
    const rear = new THREE.Vector3(REAR_CONTACT[0], DECK_Y, REAR_CONTACT[2]);
    const front = new THREE.Vector3(24.35, DECK_Y, -21.8);
    const axis = front.clone().sub(rear), span = axis.length(); axis.normalize();
    const side = new THREE.Vector3(axis.z, 0, -axis.x), halfDeck = .86;
    const rearHeights: number[] = [], frontHeights: number[] = [];
    for (const s of [0, .18, .36]) for (const w of [-halfDeck, 0, halfDeck]) {
      const p = rear.clone().addScaledVector(axis, s).addScaledVector(side, w); rearHeights.push(floor(p.x, p.z));
      const q = front.clone().addScaledVector(axis, -s).addScaledVector(side, w), h = rock(q.x, q.z);
      if (h === null) return reject('contact-not-found', 'The short arch front foot has no actual rock contact across its footprint.');
      frontHeights.push(h);
    }
    const rearMin = Math.min(...rearHeights), rearMax = Math.max(...rearHeights), frontMin = Math.min(...frontHeights);
    if (rearMin < DECK_Y - .95 || rearMax > DECK_Y + .08 || frontMin < DECK_Y - 3.3 || frontMin > DECK_Y - .35) {
      return reject('contact-not-found', 'The short arch feet are outside their dry-bank/rock height bounds. A tall wall to the lower shore is deliberately not generated.');
    }
    const rearBottom = rearMin - .08, frontBottom = frontMin - .075;
    const profile = [
      [0, rearBottom], [.38, rearBottom], [.59, 17.38], [1.02, 17.57],
      [1.68, 17.63], [2.28, 17.45], [span - .56, 16.90], [span - .38, frontBottom],
      [span, frontBottom], [span, DECK_Y], [0, DECK_Y],
    ].map(p => new THREE.Vector2(p[0], p[1]));
    extrudeSection(foundation, profile, rear, axis, halfDeck, [.91, .875, .79]);
    details.foundationSpanM = span;
    details.contacts.push({ id: 'rear-dry-foot', point: [rear.x, rearMin, rear.z], support: 'terrain' },
      { id: 'front-arch-foot', point: [front.x, frontMin, front.z], support: 'actual-cascade-triangles' });

    // Closed basin floor with a lowered outlet groove and an open-front rim.
    const basinCentre = new THREE.Vector3(...rill.points[0]);
    const out = new THREE.Vector3(...rill.points[1]).sub(basinCentre); out.y = 0; out.normalize();
    const basinSide = new THREE.Vector3(out.z, 0, -out.x), outerRadius = .75, innerRadius = .535;
    const ringCount = 24, basinOuter: V3[] = [], basinInner: V3[] = [], basinBottom: V3[] = [];
    const wet = [.82, .80, .72] as const;
    const basinFloor = (x: number, z: number) => {
      const ahead = (x - basinCentre.x) * out.x + (z - basinCentre.z) * out.z;
      const lateral = (x - basinCentre.x) * basinSide.x + (z - basinCentre.z) * basinSide.z;
      const base = basinCentre.y - .28 - Math.max(0, ahead) * .14 + .10 * Math.min(1, (lateral / innerRadius) ** 2);
      const h = rock(x, z);
      if (h === null || h > basinCentre.y - .07) throw new ContactError('Basin floor has no usable rock contact or insufficient water depth.');
      return Math.max(base, h + .025);
    };
    const centreFloor = basinFloor(basinCentre.x, basinCentre.z);
    let bottomCentre = Infinity;
    for (let i = 0; i < ringCount; i++) {
      const a = i / ringCount * Math.PI * 2;
      const offset = out.clone().multiplyScalar(Math.cos(a)).addScaledVector(basinSide, Math.sin(a));
      const x = basinCentre.x + offset.x * outerRadius, z = basinCentre.z + offset.z * outerRadius;
      const rockY = rock(x, z); if (rockY === null) throw new ContactError('Basin perimeter is missing a real rock foot.');
      const top = basinFloor(x, z), bottom = Math.min(top - .16, rockY - .075);
      basinOuter.push([x, top, z]); basinBottom.push([x, bottom, z]); bottomCentre = Math.min(bottomCentre, bottom);
      basinInner.push([basinCentre.x + offset.x * innerRadius, basinCentre.y + .14, basinCentre.z + offset.z * innerRadius]);
    }
    const floorCentre: V3 = [basinCentre.x, centreFloor, basinCentre.z], underCentre: V3 = [basinCentre.x, bottomCentre, basinCentre.z];
    for (let i = 0; i < ringCount; i++) {
      const j = (i + 1) % ringCount;
      emit(wetStone, floorCentre, basinOuter[j], basinOuter[i], wet, new THREE.Vector3(0, 1, 0));
      emit(wetStone, underCentre, basinBottom[i], basinBottom[j], wet, new THREE.Vector3(0, -1, 0));
      const outward = new THREE.Vector3(basinOuter[i][0] + basinOuter[j][0] - basinCentre.x * 2, 0,
        basinOuter[i][2] + basinOuter[j][2] - basinCentre.z * 2);
      quad(wetStone, basinBottom[i], basinOuter[i], basinOuter[j], basinBottom[j], wet, outward);
    }
    wetStone.solids++;
    for (let i = 2; i < ringCount - 2; i++) {
      const j = i + 1;
      // Each rim voussoir is a closed small solid; the missing front sector is
      // the real outlet, not an invisible wall across the rill.
      const a = basinOuter[i], b = basinOuter[j], c = basinInner[j], d = basinInner[i];
      const aa: V3 = [a[0], a[1] - .055, a[2]], bb: V3 = [b[0], b[1] - .055, b[2]];
      const cc: V3 = [c[0], basinFloor(c[0], c[2]) - .055, c[2]], dd: V3 = [d[0], basinFloor(d[0], d[2]) - .055, d[2]];
      const at: V3 = [a[0], basinCentre.y + .14, a[2]], bt: V3 = [b[0], basinCentre.y + .14, b[2]];
      quad(wetStone, at, bt, c, d, wet); quad(wetStone, aa, dd, cc, bb, wet);
      quad(wetStone, aa, bb, bt, at, wet); quad(wetStone, dd, d, c, cc, wet);
      quad(wetStone, aa, at, d, dd, wet); quad(wetStone, bb, cc, c, bt, wet); wetStone.solids++;
    }

    const controls = rill.points.map(p => new THREE.Vector3(...p));
    const lastLength = controls[controls.length - 2].clone().setY(0).distanceTo(controls[controls.length - 1].clone().setY(0));
    if (lastLength > SPILL_LENGTH + .025 || lastLength < SPILL_LENGTH - .15) throw new ContactError('The final unsupported reach is not the bounded approximately 1.08m stone lip.');
    const stations: Station[] = [];
    let length = 0;
    for (let i = 0; i < controls.length - 1; i++) {
      const a = controls[i], b = controls[i + 1], segmentLength = a.distanceTo(b), n = Math.max(1, Math.ceil(segmentLength / .24));
      if (segmentLength < .001 || segmentLength > 6) throw new ContactError('Rill segment is degenerate or longer than the supported local carrier envelope.');
      for (let j = 0; j <= n; j++) {
        if (i && !j) continue;
        const t = j / n;
        stations.push({ point: a.clone().lerp(b, t), side: new THREE.Vector3(), widthScale: 1, distance: length + segmentLength * t, lip: i === controls.length - 2 });
      }
      length += segmentLength;
    }
    if (length > 15) throw new ContactError('This module supports a short rock-carried rill, not a long aqueduct wall.');
    const sectionRows: V3[][] = [];
    for (let i = 0; i < stations.length; i++) {
      const station = stations[i], p = station.point;
      const before = stations[Math.max(0, i - 1)].point, after = stations[Math.min(stations.length - 1, i + 1)].point;
      const t0 = p.clone().sub(before).setY(0), t1 = after.clone().sub(p).setY(0);
      if (!t0.lengthSq()) t0.copy(t1); if (!t1.lengthSq()) t1.copy(t0); t0.normalize(); t1.normalize();
      const s0 = new THREE.Vector3(t0.z, 0, -t0.x), s1 = new THREE.Vector3(t1.z, 0, -t1.x);
      station.side.copy(s0).add(s1).normalize(); station.widthScale = Math.min(1.5, 1 / Math.max(.5, station.side.dot(s1)));
      const outer = rill.width / 2 + .15, inner = rill.width / 2 + .025;
      const innerHits: number[] = [], allHits: number[] = [];
      for (const w of [-outer, -inner * .8, 0, inner * .8, outer]) {
        const q = p.clone().addScaledVector(station.side, w * station.widthScale), h = rock(q.x, q.z);
        if (h !== null) { allHits.push(h); if (Math.abs(w) < outer - .001) innerHits.push(h); }
        else if (!station.lip) throw new ContactError(`Rill station ${i} is not rock-carried across its footprint.`);
      }
      const nominalFloor = p.y - .28;
      let channelFloor = nominalFloor;
      if (!station.lip) {
        if (innerHits.length !== 3 || Math.max(...innerHits) > p.y - .075) throw new ContactError(`Rill station ${i} has insufficient clearance over its actual rock floor.`);
        channelFloor = Math.max(nominalFloor, Math.max(...innerHits) + .025);
      }
      const raised = channelFloor - nominalFloor;
      if (raised > .0001) details.raisedFloorStations++;
      details.maximumFloorRaiseM = Math.max(details.maximumFloorRaiseM, raised);
      const bottom = station.lip ? p.y - .50 : Math.min(channelFloor - .16, Math.min(...allHits) - .10);
      if (!station.lip) {
        details.maximumRockCarriedHeightM = Math.max(details.maximumRockCarriedHeightM, p.y + .12 - bottom);
        if (p.y + .12 - bottom > 1.65) throw new ContactError(`Rill station ${i} would require a tall stone wall rather than a local rock carrier.`);
      }
      const section: readonly (readonly [number, number])[] = [
        [-outer, bottom], [outer, bottom], [outer, p.y + .12], [inner, p.y + .12],
        [inner, channelFloor], [-inner, channelFloor], [-inner, p.y + .12], [-outer, p.y + .12],
      ];
      sectionRows.push(section.map(([w, y]) => [p.x + station.side.x * w * station.widthScale, y, p.z + station.side.z * w * station.widthScale]));
    }
    for (let i = 1; i < sectionRows.length; i++) for (let j = 0; j < sectionRows[i].length; j++) {
      const k = (j + 1) % sectionRows[i].length;
      quad(wetStone, sectionRows[i - 1][j], sectionRows[i - 1][k], sectionRows[i][k], sectionRows[i][j], wet);
    }
    for (const index of [0, sectionRows.length - 1]) {
      const station = stations[index], row = sectionRows[index];
      const shape = row.map(p => new THREE.Vector2((p[0] - station.point.x) * station.side.x + (p[2] - station.point.z) * station.side.z, p[1]));
      const tangent = new THREE.Vector3(-station.side.z, 0, station.side.x).multiplyScalar(index === 0 ? -1 : 1);
      for (const face of THREE.ShapeUtils.triangulateShape(shape, [])) emit(wetStone, row[face[0]], row[face[1]], row[face[2]], wet, tangent);
    }
    wetStone.solids++; details.channelStations = stations.length; details.spillLipLengthM = lastLength;

    function finish(batch: Batch, name: string) {
      if (!batch.positions.length) return;
      const geometry = new THREE.BufferGeometry(); geometries.add(geometry);
      geometry.name = name;
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(batch.positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(batch.uvs, 2));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(batch.colors, 3));
      geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, borrowedStoneMaterial); mesh.name = name;
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.closedSolids = batch.solids; root.add(mesh);
      details.outputTriangles += batch.positions.length / 9; details.mainDraws++;
    }
    finish(foundation, 'D / short asymmetric spring foundation arch');
    finish(wetStone, 'D / rock-carried spring basin rill and spill stone');
    details.status = 'created'; return result();
  } catch (error) {
    geometries.forEach(geometry => geometry.dispose()); geometries.clear(); root.clear();
    details.outputTriangles = 0; details.mainDraws = 0;
    if (error instanceof ContactError) return reject('contact-not-found', error.message);
    throw error;
  } finally {
    // Private probes never own C's geometry or the supplied stone material.
    proxies.length = 0; probeMaterial?.dispose();
  }
}

class ContactError extends Error {}
