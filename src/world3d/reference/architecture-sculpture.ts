import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ArchitectureBatch } from './architecture-geometry';
import type { ArchitectureMaterials } from './architecture-materials';

export interface PedimentSculptureOptions {
  width: number;
  rise: number;
  baseY: number;
  faceZ: number;
  frontSign: 1 | -1;
  quality: 'high' | 'low';
}

type Point = [number, number, number];
type Section = { x: number; y: number; z: number; w: number; d: number };
type BodyPose = { x: number; y: number; angle: number; turn: number; shoulder?: number };

const gaussian = (x: number, width: number): number => Math.exp(-(x * x) / (width * width));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Each section is authored against a joint or a cloth support, in adult-height units. */
function interpolateSections(sections: readonly Section[], count: number): Section[] {
  const result: Section[] = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count * (sections.length - 1), k = Math.min(sections.length - 2, Math.floor(t)), u = t - k;
    const a = sections[k], b = sections[k + 1];
    // Smoothstep preserves the deliberately placed elbow/knee silhouettes.
    const s = u * u * (3 - 2 * u);
    result.push({ x: lerp(a.x, b.x, s), y: lerp(a.y, b.y, s), z: lerp(a.z, b.z, s), w: lerp(a.w, b.w, s), d: lerp(a.d, b.d, s) });
  }
  return result;
}

function closedSurface(rings: number, sides: number, sample: (row: number, angle: number) => Point): THREE.BufferGeometry {
  const positions: number[] = [], indices: number[] = [];
  for (let r = 0; r < rings; r++) for (let c = 0; c < sides; c++) positions.push(...sample(r, c / sides * Math.PI * 2));
  for (let r = 0; r < rings - 1; r++) for (let c = 0; c < sides; c++) {
    const a = r * sides + c, b = (r + 1) * sides + c, n = (c + 1) % sides;
    indices.push(a, b, r * sides + n, r * sides + n, b, (r + 1) * sides + n);
  }
  // Real closed back / bottom surfaces: relief is not a cut-out facing the camera.
  for (const end of [0, rings - 1]) {
    const center: Point = [0, 0, 0];
    for (let c = 0; c < sides; c++) {
      const i = (end * sides + c) * 3;
      center[0] += positions[i] / sides; center[1] += positions[i + 1] / sides; center[2] += positions[i + 2] / sides;
    }
    const index = positions.length / 3; positions.push(...center);
    for (let c = 0; c < sides; c++) {
      const a = end * sides + c, b = end * sides + (c + 1) % sides;
      if (end === 0) indices.push(index, a, b); else indices.push(index, b, a);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function posePoint(pose: BodyPose, x: number, y: number, z: number): Point {
  const c = Math.cos(pose.angle), s = Math.sin(pose.angle);
  return [pose.x + x * c - y * s, pose.y + x * s + y * c, z];
}

/** One continuous pelvis / thorax / shoulder / neck / head surface, with a carved face. */
function torso(pose: BodyPose, high: boolean): THREE.BufferGeometry {
  const sections: Section[] = [
    { x: 0, y: 0, z: .054, w: .121, d: .070 },
    { x: .008, y: .042, z: .055, w: .125, d: .074 },
    { x: .012, y: .100, z: .057, w: .092, d: .059 },
    { x: .008, y: .155, z: .058, w: .100, d: .066 },
    { x: 0, y: .210, z: .061, w: .127, d: .086 },
    { x: -.005, y: .269, z: .060, w: .143, d: .076 },
    { x: -.003, y: .302, z: .058, w: .140, d: .062 },
    { x: 0, y: .328, z: .059, w: .090, d: .043 },
    { x: .006, y: .346, z: .061, w: .036, d: .032 },
    { x: .006, y: .378, z: .068, w: .031, d: .032 },
    { x: .007, y: .393, z: .082, w: .036, d: .036 },
    { x: .009, y: .410, z: .075, w: .046, d: .046 },
    { x: .010, y: .442, z: .073, w: .050, d: .052 },
    { x: .009, y: .470, z: .070, w: .048, d: .048 },
    { x: .007, y: .496, z: .066, w: .038, d: .038 },
    { x: .004, y: .512, z: .064, w: .010, d: .011 },
  ];
  const rows = interpolateSections(sections, high ? 44 : 32);
  return closedSurface(rows.length, high ? 24 : 18, (row, theta) => {
    const s = rows[row], cs = Math.cos(theta), sn = Math.sin(theta);
    let x = cs * s.w, z = sn * s.d;
    const shoulder = pose.shoulder ?? .012;
    const shoulderSlope = cs * shoulder * gaussian(s.y - .290, .055);
    if (s.y < .321) {
      // Chiton pleats fan from two shoulder clasps into a tied, offset waist.
      const v = Math.max(0, Math.min(1, s.y / .32));
      const front = Math.max(0, sn), back = Math.max(0, -sn);
      const anchors = [-.70, -.08, .64];
      let fold = 0;
      for (let i = 0; i < anchors.length; i++) {
        const a = anchors[i], path = lerp(a * .43 + .12, a, v) + .12 * Math.sin(v * Math.PI) * (a < 0 ? 1 : -1);
        const u = x / Math.max(.03, s.w), depth = (.018 + .006 * (i % 3)) * (.60 + .40 * v);
        fold += depth * (gaussian(u - path, .16) - .66 * gaussian(u - path - .16, .12));
      }
      // Cloth crosses the chest obliquely instead of horizontal rings or a radial ripple.
      const sash = .024 * gaussian(s.y - (.165 + x * .64), .027);
      z += (fold + sash) * front - fold * back * .45;
      z += .006 * gaussian(s.y - .10, .007) * front; // compressed waist fold
      // A clavicle curves into the deltoid; the suprasternal hollow belongs to
      // the same skin. The chest turns slightly instead of a symmetric barrel.
      z += front * (.010 * gaussian(s.y - (.300 - Math.abs(x) * .18), .010)
        - .007 * gaussian(x, .020) * gaussian(s.y - .317, .011));
      z += cs * shoulder * .55 * gaussian(s.y - .251, .071);
    } else if (s.y > .386) {
      const faceAngle = theta - Math.PI / 2;
      const front = gaussian(Math.atan2(Math.sin(faceAngle), Math.cos(faceAngle)), .72);
      // Nose bridge, brow and cheek planes belong to the head mesh itself.
      z += front * (.027 * gaussian(s.y - .437, .017) * gaussian(x - .006, .011)
        + .010 * gaussian(s.y - .456, .008)
        - .008 * gaussian(s.y - .449, .007) * gaussian(Math.abs(x) - .023, .010)
        + .009 * gaussian(s.y - .440, .012) * gaussian(Math.abs(x) - .030, .014)
        + .005 * gaussian(s.y - .414, .005)
        + .010 * gaussian(s.y - .399, .008) * gaussian(x, .026)
        - .004 * gaussian(s.y - .421, .003));
      const hair = Math.max(0, 1 - front * .90) * Math.min(1, Math.max(0, (s.y - .437) / .022));
      z += sn * .004 * hair * (1 + .35 * Math.cos(theta * 9 + s.y * 21));
      x += cs * .004 * hair;
      // The ears and mandibular angle are silhouette changes, not separate
      // balls. A narrower crown, projecting chin and throat recess read in yaw.
      x += Math.sign(cs) * .006 * Math.abs(cs) ** 18 * gaussian(s.y - .439, .018);
      const yaw = pose.turn * Math.min(1, (s.y - .386) / .035), tx = x;
      x = x * Math.cos(yaw) - z * Math.sin(yaw);
      z = tx * Math.sin(yaw) + z * Math.cos(yaw);
    }
    return posePoint(pose, s.x + x, s.y + shoulderSlope, s.z + z);
  });
}

/** Anatomical sweep: deltoid, biceps, elbow, forearm, wrist and the attached hand share one skin. */
function arm(points: readonly Point[], high: boolean, handTurn = 0, thumbSide: 1 | -1 = 1): THREE.BufferGeometry {
  const joints = points.map(p => new THREE.Vector3(...p));
  const lengths = joints.slice(1).map((p, i) => p.distanceTo(joints[i]));
  const total = lengths.reduce((sum, value) => sum + value, 0);
  const elbow = lengths[0] / total, wrist = (lengths[0] + lengths[1]) / total;
  const widths = [.047, .057, .043, .025, .038, .016, .028, .023, .005];
  const depths = [.044, .050, .037, .024, .032, .015, .013, .012, .004];
  const fractions = [0, elbow * .27, elbow * .65, elbow, lerp(elbow, wrist, .32), wrist, lerp(wrist, 1, .38), lerp(wrist, 1, .78), 1];
  // Preserve the humerus / forearm angles with a short rounded joint instead
  // of letting a spline bend the entire limb into an undifferentiated hose.
  const path = new THREE.CurvePath<THREE.Vector3>();
  let previous = joints[0];
  for (let joint = 1; joint < joints.length - 1; joint++) {
    const radius = Math.min(.050, lengths[joint - 1] * .43, lengths[joint] * .43);
    const incoming = joints[joint - 1].clone().sub(joints[joint]).normalize();
    const outgoing = joints[joint + 1].clone().sub(joints[joint]).normalize();
    const entry = joints[joint].clone().addScaledVector(incoming, radius);
    const exit = joints[joint].clone().addScaledVector(outgoing, radius);
    path.add(new THREE.LineCurve3(previous, entry));
    path.add(new THREE.QuadraticBezierCurve3(entry, joints[joint], exit)); previous = exit;
  }
  path.add(new THREE.LineCurve3(previous, joints[joints.length - 1]));
  const rows = high ? 19 : 11, sides = high ? 12 : 8;
  return closedSurface(rows + 1, sides, (row, theta) => {
    const elbowRow = high ? 7 : 4, wristRow = high ? 13 : 7;
    // Spend the same rings on actual landmarks: even the low tier retains
    // a wrist, palm, thumb web and fingers when the hand is a short segment.
    const t = row <= elbowRow ? elbow * row / elbowRow
      : row <= wristRow ? lerp(elbow, wrist, (row - elbowRow) / (wristRow - elbowRow))
        : lerp(wrist, 1, (row - wristRow) / (rows - wristRow));
    const p = path.getPointAt(t), tangent = path.getTangentAt(t);
    const outward = new THREE.Vector3(tangent.y, -tangent.x, 0).normalize();
    let k = 0; while (k < fractions.length - 2 && t > fractions[k + 1]) k++;
    const s = (t - fractions[k]) / (fractions[k + 1] - fractions[k]);
    const w = lerp(widths[k], widths[k + 1], s), d = lerp(depths[k], depths[k + 1], s);
    // The shoulder cloth overlaps the deltoid; an angular sleeve hem gives way
    // to biceps / elbow planes, a forearm crest and a visibly narrow wrist.
    const sleeve = .008 * gaussian(t - elbow * .28, elbow * .19) * (1 + .28 * Math.cos(theta * 3));
    const muscle = 1 + .14 * Math.cos(theta * 2 - .4) * Math.sin(t * Math.PI);
    const biceps = .009 * gaussian(t - elbow * .65, elbow * .26) * Math.max(0, Math.sin(theta));
    const ulna = .005 * gaussian(t - lerp(elbow, wrist, .52), (wrist - elbow) * .35) * Math.cos(theta * 2);
    const hand = Math.max(0, (t - wrist) / (1 - wrist));
    const thumb = .021 * gaussian(hand - .31, .20) * Math.max(0, Math.cos(theta) * thumbSide) ** 6;
    let lateral = Math.cos(theta) * (w * muscle + sleeve) + thumbSide * thumb;
    let depth = Math.sin(theta) * (d + sleeve * .6 + ulna) + biceps;
    if (hand > 0) {
      // Flattened palm / metacarpal planes, thumb web and three finger channels
      // remain part of this connected hand skin, on the existing ring budget.
      depth -= .0035 * gaussian(hand - .77, .22) * Math.max(0, Math.sin(theta))
        * (gaussian(Math.cos(theta) - .34, .15) + gaussian(Math.cos(theta) + .34, .15));
      const twist = handTurn * Math.min(1, hand * 3), saved = lateral;
      lateral = lateral * Math.cos(twist) - depth * Math.sin(twist);
      depth = saved * Math.sin(twist) + depth * Math.cos(twist);
    }
    return [p.x + outward.x * lateral, p.y + outward.y * lateral, p.z + depth];
  });
}

type DrapeRow = { y: number; x: number; w: number; d: number; z?: number };

/** Closed cloth envelope over an explicit hip / thigh / knee / ground profile. */
function garment(profile: readonly DrapeRow[], mode: 'stand' | 'seat' | 'kneel' | 'recline', high: boolean): THREE.BufferGeometry {
  const sections = profile.map(row => ({ ...row, z: row.z ?? .048 }));
  const rows = interpolateSections(sections, high ? 28 : 19);
  return closedSurface(rows.length, high ? 24 : 18, (row, theta) => {
    const s = rows[row], t = row / (rows.length - 1), sn = Math.sin(theta), cs = Math.cos(theta);
    const u = cs, front = Math.max(0, sn), rear = Math.max(0, -sn);
    let fold = 0;
    // Four broad folds remain legible at facade distance. They gather at the
    // belt or the raised knee; their valleys change the cloth's real planes.
    const hems = [-.82, -.29, .26, .76];
    const anchors = mode === 'stand' ? [-.71, -.23, .26, .71]
      : mode === 'seat' ? [-.68, -.19, .34, .86]
        : mode === 'kneel' ? [-.89, -.14, .49, .83] : [-.76, -.22, .42, .81];
    for (let i = 0; i < hems.length; i++) {
      const support = mode === 'stand' ? .13 * Math.sin(t * Math.PI) : .23 * Math.sin(t * Math.PI * 1.1) * (i < 3 ? -1 : 1);
      const path = lerp(hems[i], anchors[i], t) + support;
      const amplitude = (.018 + (i % 3) * .004) * (.68 + .32 * Math.sin(t * Math.PI));
      fold += amplitude * (gaussian(u - path, .14) - .70 * gaussian(u - path - .16, .12));
    }
    // Diagonal folds are dragged over the bent thigh; the sharp knee is a real section bulge.
    const kneeTension = mode === 'stand' ? 0 : .025 * gaussian(t - (.38 + u * .19), .060) + .017 * gaussian(t - (.60 - u * .22), .055);
    const thighPile = mode === 'seat'
      ? .026 * gaussian(t - (.73 + u * .11), .065) + .022 * gaussian(t - (.86 - u * .08), .060) - .010 * gaussian(t - (.79 + u * .10), .050)
      : mode === 'kneel' ? .024 * gaussian(t - (.57 + u * .15), .070) : 0;
    const loadedLeg = mode === 'stand' ? .023 * gaussian(u - .43, .28) * gaussian(t - .57, .22) - .008 * gaussian(u + .20, .12) * gaussian(t - .46, .24) : 0;
    return [s.x + cs * s.w, s.y + .002 * Math.cos(theta * 3) * (1 - t), s.z + sn * s.d + (fold + kneeTension + thighPile + loadedLeg) * front - fold * rear * .4];
  });
}

/** Stitch the open waist rings, then close only the feet and the crown. There
 * is no horizontal cap, overlapping cut edge, or separate shaded waist seam. */
function clothedFigure(pose: BodyPose, profile: readonly DrapeRow[], mode: 'stand' | 'seat' | 'kneel' | 'recline', high: boolean): THREE.BufferGeometry {
  const upper = torso(pose, high), lower = garment(profile, mode, high), sides = high ? 24 : 18;
  const up = upper.getAttribute('position'), lp = lower.getAttribute('position');
  const sourceUpperCount = up.count - 2, lowerCount = lp.count - 2;
  // A horizontal skirt rim may reach beyond the pelvis along a leaning body's
  // axis. Keep only torso rings beyond the entire rim, not its center: joining
  // the old pelvis ring made the skin double back through the skirt surface.
  const axisX = -Math.sin(pose.angle), axisY = Math.cos(pose.angle);
  let rimEnd = -Infinity;
  for (let c = lowerCount - sides; c < lowerCount; c++) rimEnd = Math.max(rimEnd, (lp.getX(c) - pose.x) * axisX + (lp.getY(c) - pose.y) * axisY);
  let firstUpper = 0;
  while (firstUpper + sides < sourceUpperCount) {
    let ringStart = Infinity;
    for (let c = firstUpper; c < firstUpper + sides; c++) ringStart = Math.min(ringStart, (up.getX(c) - pose.x) * axisX + (up.getY(c) - pose.y) * axisY);
    if (ringStart > rimEnd + .006) break;
    firstUpper += sides;
  }
  const upperCount = sourceUpperCount - firstUpper;
  const p = [...Array.from(lp.array).slice(0, lowerCount * 3), ...Array.from(up.array).slice(firstUpper * 3, sourceUpperCount * 3)];
  const ids: number[] = [];
  for (const [g, start, end, offset] of [[lower, 0, lowerCount, 0], [upper, firstUpper, sourceUpperCount, lowerCount - firstUpper]] as const) {
    const index = g.index!;
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
      if (a >= start && b >= start && c >= start && a < end && b < end && c < end) ids.push(a + offset, b + offset, c + offset);
    }
  }
  for (let c = 0; c < sides; c++) {
    const n = (c + 1) % sides, a = lowerCount - sides + c, b = lowerCount + c;
    ids.push(a, b, lowerCount - sides + n, lowerCount - sides + n, b, lowerCount + n);
  }
  for (const [start, top] of [[0, false], [lowerCount + upperCount - sides, true]] as const) {
    const center: Point = [0, 0, 0];
    for (let c = 0; c < sides; c++) for (let axis = 0; axis < 3; axis++) center[axis] += p[(start + c) * 3 + axis] / sides;
    const k = p.length / 3; p.push(...center);
    for (let c = 0; c < sides; c++) { const a = start + c, b = start + (c + 1) % sides; if (top) ids.push(k, b, a); else ids.push(k, a, b); }
  }
  let firstKeptProjection = Infinity;
  for (let c = firstUpper; c < firstUpper + sides; c++) firstKeptProjection = Math.min(firstKeptProjection, (up.getX(c) - pose.x) * axisX + (up.getY(c) - pose.y) * axisY);
  upper.dispose(); lower.dispose();
  const result = new THREE.BufferGeometry(); result.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); result.setIndex(ids); result.computeVertexNormals();
  result.userData.waistJoin = { mode, removedTorsoRings: firstUpper / sides, minimumAxialGap: firstKeptProjection - rimEnd };
  return result;
}

/** Broad marble-carved himation from a shoulder clasp, across the thorax and
 * over the hip. Three deep, oblique folds replace small decorative ripples. */
function mantle(pose: BodyPose, high: boolean, seated = false): THREE.BufferGeometry {
  const rows = high ? 10 : 6, columns = high ? 10 : 6;
  const p: number[] = [], ids: number[] = [];
  const contour = [
    seated ? { x: -.170, y: -.170, w: .075, z: .133 } : { x: .015, y: -.240, w: .075, z: .136 },
    seated ? { x: -.145, y: -.075, w: .160, z: .143 } : { x: .025, y: -.110, w: .148, z: .140 },
    { x: .008, y: .065, w: .137, z: .142 },
    { x: -.030, y: .153, w: .123, z: .140 },
    { x: -.090, y: .248, w: .078, z: .130 },
    { x: -.123, y: .307, w: .029, z: .108 },
  ];
  for (let back = 0; back <= 1; back++) for (let r = 0; r <= rows; r++) {
    const t = r / rows, s = t * (contour.length - 1), k = Math.min(contour.length - 2, Math.floor(s)), v = s - k;
    const a = contour[k], b = contour[k + 1], x = lerp(a.x, b.x, v), y = lerp(a.y, b.y, v), w = lerp(a.w, b.w, v), z = lerp(a.z, b.z, v);
    for (let c = 0; c <= columns; c++) {
      const u = c / columns * 2 - 1;
      const folds = .030 * gaussian(u - (-.56 + .25 * t), .25) + .035 * gaussian(u - (.05 - .20 * t), .24) + .018 * gaussian(u - (.64 - .18 * t), .25);
      const valley = .010 * gaussian(u - .30, .17), edge = .012 * Math.abs(u) ** 5;
      const rolledEdge = .016 * gaussian(Math.abs(u) - .93, .12) + .019 * gaussian(t, .11) * (1 - .2 * Math.abs(u));
      const sag = -.035 * (1 - u * u) * (1 - t) * (seated ? .55 : 1);
      const thickness = .041 + .010 * (1 - t);
      p.push(...posePoint(pose, x + u * w, y + u * (.028 + .025 * (1 - t)) + sag, z + folds + rolledEdge - valley - edge - back * thickness));
    }
  }
  const layer = (rows + 1) * (columns + 1);
  for (let back = 0; back <= 1; back++) for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
    const a = back * layer + r * (columns + 1) + c, b = a + columns + 1;
    if (back) ids.push(a, b, a + 1, a + 1, b, b + 1); else ids.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const edge = (a: number, b: number): void => { ids.push(a, b, a + layer, b, b + layer, a + layer); };
  for (let c = 0; c < columns; c++) { edge(c + 1, c); edge(rows * (columns + 1) + c, rows * (columns + 1) + c + 1); }
  for (let r = 0; r < rows; r++) { edge(r * (columns + 1), (r + 1) * (columns + 1)); edge((r + 1) * (columns + 1) + columns, r * (columns + 1) + columns); }
  const result = new THREE.BufferGeometry(); result.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); result.setIndex(ids); result.computeVertexNormals(); return result;
}

function foot(ankle: Point, outward: number, high: boolean): THREE.BufferGeometry {
  const rows: Section[] = [
    { x: ankle[0], y: ankle[1] + .052, z: ankle[2], w: .024, d: .026 },
    { x: ankle[0] + outward * .009, y: ankle[1] + .022, z: ankle[2] + .018, w: .037, d: .052 },
    { x: ankle[0] + outward * .025, y: ankle[1] + .011, z: ankle[2] + .039, w: .043, d: .066 },
    { x: ankle[0] + outward * .035, y: ankle[1] + .008, z: ankle[2] + .046, w: .033, d: .057 },
  ].reverse();
  const sections = interpolateSections(rows, high ? 6 : 4);
  return closedSurface(sections.length, high ? 12 : 10, (row, theta) => {
    const s = sections[row]; return [s.x + Math.cos(theta) * s.w, s.y, s.z + Math.sin(theta) * s.d];
  });
}

function shield(high: boolean): THREE.BufferGeometry {
  const rows = high ? 10 : 6, sides = high ? 32 : 24;
  return closedSurface(rows + 1, sides, (row, theta) => {
    const t = row / rows, radius = Math.max(.008, Math.sin(t * Math.PI));
    const rim = .008 * gaussian(t - .5, .045), boss = .019 * gaussian(t - .38, .14);
    return [.222 + Math.cos(theta) * .112 * radius, .718 + Math.sin(theta) * .153 * radius, .110 + .027 * Math.cos(t * Math.PI) + rim + boss];
  });
}

/**
 * Original carved seven-figure assembly. Adult scale is constant: triangular
 * space is occupied by seated, kneeling and reclining bodies, not miniatures.
 * All geometry is handed to ArchitectureBatch; this function owns no resources.
 */
export function addPedimentSculpture(batch: ArchitectureBatch, materials: ArchitectureMaterials, options: PedimentSculptureOptions): void {
  const { width, rise, baseY, faceZ, frontSign, quality } = options;
  if (!(width > 0 && rise > 0) || !Number.isFinite(width + rise + baseY + faceZ)) throw new Error('Invalid pediment sculpture envelope');
  const high = quality === 'high', adult = rise * .81;
  const reliefDepthScale = Math.min(1, .44 / (adult * .226));
  let seed = 703;
  const emit = (geometry: THREE.BufferGeometry, x = 0, y = 0, mirror = 1): void => {
    const p = geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      p.setXYZ(i, x + p.getX(i) * adult * mirror, baseY + y + p.getY(i) * adult, faceZ + frontSign * p.getZ(i) * adult * reliefDepthScale);
    }
    if (frontSign * mirror < 0) {
      const index = geometry.index!;
      for (let i = 0; i < index.count; i += 3) { const b = index.getX(i + 1); index.setX(i + 1, index.getX(i + 2)); index.setX(i + 2, b); }
    }
    // A thin cloth edge, sole, or sharply bent elbow must not borrow normals
    // from its reverse side. Preserve smooth carving below 60 degrees, split
    // real hard folds above that angle; positions and face winding stay intact.
    const carved = toCreasedNormals(geometry, Math.PI / 3);
    carved.userData = geometry.userData;
    if (carved !== geometry) geometry.dispose();
    batch.add(carved, materials.marble, [0, 0, 0], [0, 0, 0], seed++);
  };

  // The central guardian bears weight on the right leg, with the left knee relaxed.
  const center: BodyPose = { x: .012, y: .468, angle: -.025, turn: .33, shoulder: -.015 };
  emit(clothedFigure(center, [
    { y: .015, x: -.010, w: .174, d: .075 }, { y: .060, x: -.006, w: .165, d: .078 },
    { y: .180, x: .005, w: .145, d: .085 }, { y: .285, x: .014, w: .129, d: .097 },
    { y: .370, x: .018, w: .124, d: .087 }, { y: .435, x: .017, w: .125, d: .071 },
    { y: .480, x: .012, w: .121, d: .069 },
  ], 'stand', high));
  emit(mantle(center, high));
  emit(arm([posePoint(center, -.126, .285, .063), [-.229, .700, .076], [-.271, .800, .097], [-.279, .840, .104]], high, -.28, -1));
  emit(arm([posePoint(center, .125, .284, .068), [.204, .665, .090], [.245, .704, .122], [.236, .735, .139]], high, .35, 1));
  emit(foot([-.092, .007, .071], -1, high)); emit(foot([.104, .003, .062], 1, high));
  emit(shield(high));

  for (const sign of [-1, 1]) {
    const mirror = -sign, innerX = sign * width * (sign < 0 ? .115 : .120);
    // Seated attendant: horizontal thigh, projecting knee, and folds falling from it to the plinth.
    const seated: BodyPose = sign < 0
      ? { x: -.017, y: .286, angle: -.26, turn: -.60, shoulder: .018 }
      : { x: .012, y: .294, angle: -.05, turn: -.78, shoulder: -.020 };
    emit(clothedFigure(seated, [
      { y: .012, x: -.096, w: .179, d: .078 }, { y: .045, x: -.103, w: .159, d: .084 },
      { y: .115, x: -.133, w: .111, d: .087 }, { y: .209, x: -.177, w: .119, d: .099 },
      { y: .267, x: -.184, w: .139, d: .119 }, { y: .300, x: -.130, w: .151, d: .103 },
      { y: .316, x: -.052, w: .145, d: .081 }, { y: .333, x: -.006, w: .123, d: .070 },
    ], 'seat', high), innerX, 0, mirror);
    emit(mantle(seated, high, true), innerX, 0, mirror);
    emit(arm(sign < 0
      ? [posePoint(seated, -.125, .282, .064), [-.149, .479, .091], [-.203, .372, .122], [-.171, .311, .144]]
      : [posePoint(seated, -.125, .282, .064), [-.179, .468, .102], [-.173, .348, .139], [-.112, .327, .149]], high), innerX, 0, mirror);
    // The left attendant reaches to the central guardian's hand. The right
    // one settles a hand into the lap instead of repeating a mirrored salute.
    emit(arm(sign < 0
      ? [posePoint(seated, .125, .282, .063), [.285, .728, .114], [.467, .811, .112], [.496, .835, .112]]
      : [posePoint(seated, .125, .282, .063), [.242, .512, .107], [.196, .366, .147], [.100, .322, .154]], high, sign < 0 ? .28 : -.24, -1), innerX, 0, mirror);
    emit(foot([-.187, .002, .081], -1, high), innerX, 0, mirror);
    emit(foot([.036, .002, .061], 1, high), innerX, 0, mirror);

    const middleX = sign * width * .25;
    // The kneeling torso bends towards the center; one arm carries its weight on the raised knee.
    const kneeling: BodyPose = sign < 0
      ? { x: -.025, y: .190, angle: -.82, turn: -.65, shoulder: .012 }
      : { x: -.018, y: .182, angle: -1.04, turn: -.45, shoulder: -.016 };
    emit(clothedFigure(kneeling, [
      { y: .009, x: -.040, w: .234, d: .080 }, { y: .039, x: -.080, w: .230, d: .090 },
      { y: .078, x: -.104, w: .205, d: .103 }, { y: .128, x: -.112, w: .174, d: .120 },
      { y: .181, x: -.075, w: .142, d: .096 }, { y: .220, x: -.016, w: .127, d: .077 },
    ], 'kneel', high), middleX, 0, mirror);
    emit(arm([posePoint(kneeling, -.115, .280, .065), [.074, .272, .084], [.134, .201, .111], [.137, .139, .120]], high), middleX, 0, mirror);
    emit(arm([posePoint(kneeling, .121, .277, .061), [.346, .294, .088], [.302, .155, .106], [.241, .082, .112]], high), middleX, 0, mirror);
    emit(foot([-.205, .001, .066], -1, high), middleX, 0, mirror);

    const outerX = sign * width * .399;
    // River figure: the chest is propped on an elbow while hips and bent legs settle along the bed.
    const reclining: BodyPose = sign < 0
      ? { x: .008, y: .094, angle: -1.36, turn: -.58, shoulder: .012 }
      : { x: .016, y: .077, angle: -1.24, turn: -.31, shoulder: -.012 };
    emit(clothedFigure(reclining, [
      { y: .008, x: -.187, w: .312, d: .070 }, { y: .030, x: -.153, w: .309, d: .091 },
      { y: .058, x: -.120, w: .271, d: .102 }, { y: .090, x: -.083, w: .205, d: .108 },
      { y: .127, x: -.029, w: .142, d: .083 },
    ], 'recline', high), outerX, 0, mirror);
    emit(arm([posePoint(reclining, -.124, .277, .067), [.215, .083, .092], [.336, .027, .107], [.389, .039, .113]], high), outerX, 0, mirror);
    emit(arm([posePoint(reclining, .120, .276, .070), [.329, .156, .113], [.198, .145, .131], [.080, .103, .140]], high), outerX, 0, mirror);
    emit(foot([-.450, .002, .059], -1, high), outerX, 0, mirror);
  }
}
