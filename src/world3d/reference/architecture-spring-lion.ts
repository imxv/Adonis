import * as THREE from 'three';
import { ArchitectureBatch } from './architecture-geometry';
import { createLionHeadGeometry } from './architecture-spring-lion-mesh';
import type { ReferenceSpringShrineOptions } from './architecture-spring-shrine';

type LionOptions = Pick<ReferenceSpringShrineOptions, 'body' | 'spout' | 'quality'>;

/** The CC0 processed head is mouth-centred in metres: U/across, V/up, W/forward.
 * createLionHeadGeometry returns a private copy. This helper owns and transforms
 * only that copy; the source template/cache is never deformed or disposed here.
 */
export function addSpringLion(batch: ArchitectureBatch, bronze: THREE.MeshStandardMaterial, o: LionOptions): void {
  const geometry = createLionHeadGeometry(o.quality);
  const forward = new THREE.Vector3(...o.spout.direction).normalize();
  const across = new THREE.Vector3(forward.z, 0, -forward.x);
  const transform = new THREE.Matrix4().makeBasis(across, new THREE.Vector3(0, 1, 0), forward).setPosition(...o.spout.position);
  // applyMatrix4 also rotates normals. No scale, recentering, second assembly
  // transform or change to the fixed mouth/guard aperture is introduced.
  geometry.applyMatrix4(transform);
  batch.add(geometry, bronze, [0, 0, 0], [0, 0, 0], 12631);
}

/** Retains only the existing pipe's depth-local deposits. The real sculpted
 * face receives the borrowed bronze material without procedural eye/nose paint.
 */
export function finishSpringLion(root: THREE.Group, bronze: THREE.MeshStandardMaterial, o: LionOptions): void {
  const forward = new THREE.Vector3(...o.spout.direction).normalize(), across = new THREE.Vector3(forward.z, 0, -forward.x), mouth = new THREE.Vector3(...o.spout.position);
  const feedRear = new THREE.Vector3(o.body.centerX + o.body.width * .262, o.spout.position[1], o.body.frontZ - .17).sub(mouth), feedRearU = feedRear.dot(across), feedRearW = feedRear.dot(forward);
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object.material !== bronze) return;
    const positions = object.geometry.getAttribute('position'), color = object.geometry.getAttribute('color'), wear = object.geometry.getAttribute('architectureWear'), p = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
      p.fromBufferAttribute(positions, i).sub(mouth); const u = p.dot(across), v = p.y, w = p.dot(forward);
      const channelT = w < -o.spout.length ? THREE.MathUtils.clamp((w + o.spout.length) / (feedRearW + o.spout.length), 0, 1) : 0;
      const channelRadius = Math.hypot(u - feedRearU * channelT, v);
      const innerWall = w < -.004 && w > feedRearW - .003 && Math.abs(channelRadius - o.spout.width / 2) < .0012;
      if (!innerWall) continue;
      const deposit = THREE.MathUtils.smoothstep(-w, .012, .14) * .70;
      color.setXYZ(i, color.getX(i) * (1 - deposit), color.getY(i) * (1 - deposit), color.getZ(i) * (1 - deposit * .96));
      wear.setX(i, wear.getX(i) + deposit * .16);
    }
  });
}
