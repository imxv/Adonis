import * as THREE from 'three';
import type { ArchitectureBatch } from './architecture-geometry';
import type { ArchitectureMaterials } from './architecture-materials';

type Point = readonly [number, number];
type OrnamentFrame = { x: number; y: number; z: number; yaw?: number; high: boolean };

/** Closed, chamfered ribbons: the gold has a raised face and an actual edge. */
function ribbon(points: readonly Point[], width: number, depth: number): THREE.BufferGeometry {
  const positions: number[] = [], indices: number[] = [];
  const profile = [[-.5, 0], [.5, 0], [.5, .67], [.34, 1], [-.34, 1], [-.5, .67]];
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const tangent = new THREE.Vector2(b[0] - a[0], b[1] - a[1]).normalize();
    for (const [u, z] of profile) positions.push(points[i][0] - tangent.y * width * u, points[i][1] + tangent.x * width * u, depth * z);
    if (i < points.length - 1) for (let j = 0; j < 6; j++) {
      const a = i * 6 + j, b = a + 6, c = i * 6 + (j + 1) % 6, d = c + 6;
      indices.push(a, c, b, c, d, b);
    }
  }
  for (const end of [0, points.length - 1]) {
    const center = positions.length / 3;
    positions.push(points[end][0], points[end][1], depth / 2);
    for (let j = 0; j < 6; j++) {
      const a = end * 6 + j, b = end * 6 + (j + 1) % 6;
      if (end === 0) indices.push(center, b, a); else indices.push(center, a, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function bezier(a: Point, b: Point, c: Point, d: Point, segments: number): Point[] {
  return new THREE.CubicBezierCurve(new THREE.Vector2(...a), new THREE.Vector2(...b), new THREE.Vector2(...c), new THREE.Vector2(...d))
    .getPoints(segments).map(point => [point.x, point.y]);
}

function add(batch: ArchitectureBatch, m: ArchitectureMaterials, g: THREE.BufferGeometry, frame: OrnamentFrame, seed: number): void {
  batch.add(g, m.gold, [frame.x, frame.y, frame.z], [0, frame.yaw ?? 0, 0], seed);
}

function leaf(batch: ArchitectureBatch, m: ArchitectureMaterials, frame: OrnamentFrame, start: Point, end: Point, width: number, depth: number, seed: number): void {
  const dx = end[0] - start[0], dy = end[1] - start[1], length = Math.hypot(dx, dy);
  const nx = -dy / length * width, ny = dx / length * width;
  let outline = [[0, 0], [.24, .65], [.65, .42], [1, 0], [.58, -.48], [.18, -.28]];
  // Counterclockwise outline, six planes and a raised midrib rather than a dense curved extrusion.
  outline = outline.reverse();
  const positions: number[] = [], indices: number[] = [];
  for (const z of [0, depth * .45]) for (const [along, across] of outline) positions.push(start[0] + dx * along + nx * across, start[1] + dy * along + ny * across, z);
  positions.push(start[0] + dx * .46, start[1] + dy * .46, depth * 1.3, start[0] + dx * .46, start[1] + dy * .46, 0);
  for (let j = 0; j < 6; j++) {
    const next = (j + 1) % 6;
    indices.push(12, j + 6, next + 6, 13, next, j, j, next, j + 6, j + 6, next, next + 6);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  add(batch, m, geometry, frame, seed);
}

/** Linked anthemion tendrils occupy the band instead of separated badge icons. */
export function addTempleFrieze(batch: ArchitectureBatch, m: ArchitectureMaterials, frame: OrnamentFrame & { length: number; height: number }): void {
  const { length, height } = frame;
  const count = Math.max(1, Math.round(length / (height * 1.65))), pitch = length / count;
  const samples = frame.high ? 5 : 4, stroke = height * .047, depth = height * .030;
  for (let i = 0; i < count; i++) {
    const cx = -length / 2 + (i + .5) * pitch;
    for (const side of [-1, 1]) {
      const transform = (points: Point[]) => points.map(([x, y]) => [cx + side * x * pitch, y * height] as Point);
      const vine = bezier([0, -.28], [.20, -.31], [.54, -.19], [.43, .09], samples);
      const curl = bezier([.43, .09], [.37, .31], [.15, .11], [.29, .025], samples);
      add(batch, m, ribbon(transform([...vine, ...curl.slice(1)]), stroke, depth), frame, i + side * 79);
      leaf(batch, m, frame, [cx + side * pitch * .38, -.10 * height], [cx + side * pitch * .49, .23 * height], height * .075, depth * 1.25, i + 3);
    }
    add(batch, m, ribbon([[cx, -.30 * height], [cx, .04 * height]], stroke * 1.2, depth), frame, i);
    for (let fan = -2; fan <= 2; fan++) {
      leaf(batch, m, frame, [cx, -.015 * height], [cx + fan * pitch * .068, height * (.39 - .047 * Math.abs(fan))], height * .068, depth * 1.35, i * 13 + fan);
    }
  }
}

/** A climbing relief and folded key borders fill the existing blue door panels. */
export function addTemplePilasterOrnament(batch: ArchitectureBatch, m: ArchitectureMaterials, frame: OrnamentFrame & { width: number; height: number }): void {
  const { width, height } = frame, levels = 7, pitch = height / levels;
  const depth = width * .029, stroke = width * .032, samples = frame.high ? 7 : 5;
  add(batch, m, ribbon([[0, -height * .465], [0, height * .465]], stroke, depth), frame, 7);
  for (let i = 0; i < levels; i++) {
    const y = -height / 2 + (i + .5) * pitch;
    for (const side of [-1, 1]) {
      const points = bezier([0, -.30], [.39, -.31], [.44, .11], [.21, .13], samples)
        .map(([x, v]) => [side * width * x, y + v * pitch] as Point);
      add(batch, m, ribbon(points, stroke, depth), frame, i + side * 37);
      leaf(batch, m, frame, [side * width * .21, y + pitch * .13], [side * width * .11, y + pitch * .36], width * .090, depth * 1.25, i);
      leaf(batch, m, frame, [0, y - pitch * .10], [side * width * .29, y + pitch * .31], width * .140, depth * 1.35, i + 17);
    }
    leaf(batch, m, frame, [0, y + pitch * .04], [0, y + pitch * .39], width * .105, depth * 1.45, i + 23);
    // Alternating inward returns form a fine architectural border, not more medallions.
    for (const side of [-1, 1]) {
      const x = side * width * .435, edge = side * width * .365;
      add(batch, m, ribbon([[x, y - pitch * .48], [x, y + pitch * .22], [edge, y + pitch * .22], [edge, y - pitch * .07]], stroke * .65, depth * .7), frame, i);
    }
  }
}
