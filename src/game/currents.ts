import { K } from '../styles/textures';
import { T, type DRoom } from './dungeon';
import type { Img } from './entities';
import { DEPTH } from './fx';
import type { GameScene } from './GameScene';

export interface Current {
  room: DRoom;
  plan: NonNullable<DRoom['currents']>[number];
  cells: Set<string>;
  sprites: Img[];
}

export function populateCurrents(s: GameScene, room: DRoom) {
  for (const plan of room.currents ?? []) {
    const key = K(`flow-${plan.kind}`, s.kit);
    const sprites = s.textures.exists(key) ? plan.tiles.map(([tx, ty]) => s.add.image(tx * T + T / 2, ty * T + T / 2, key)
      .setDepth(DEPTH.decal + 0.3).setRotation(Math.atan2(plan.direction[1], plan.direction[0])).setAlpha(0.35)) : [];
    s.currents.push({ room, plan, cells: new Set(plan.tiles.map(([tx, ty]) => `${tx},${ty}`)), sprites });
  }
}

/** Add displacement before the actor's existing wall/prop collision pass; never change its steering velocity. */
export function currentPush(s: GameScene, x: number, y: number): [number, number] {
  if (s.mode !== 'play' || s.fusing || !s.active || s.active.cleared) return [0, 0];
  const key = `${Math.floor(x / T)},${Math.floor(y / T)}`;
  let vx = 0, vy = 0;
  for (const current of s.currents) {
    if (current.room !== s.active || !current.cells.has(key)) continue;
    const speed = current.plan.kind === 'wind' ? 18 : current.plan.kind === 'water' ? 14 : 20;
    const [dx, dy] = current.plan.direction;
    const length = Math.hypot(dx, dy) || 1;
    vx += dx / length * speed;
    vy += dy / length * speed;
  }
  const length = Math.hypot(vx, vy);
  return length > 20 ? [vx / length * 20, vy / length * 20] : [vx, vy];
}

export function updateCurrents(s: GameScene) {
  for (const current of s.currents) {
    const active = s.mode === 'play' && !s.fusing && s.active === current.room && !current.room.cleared;
    const frame = active ? Math.floor(s.time0 * 6) % 3 : 0;
    const key = K(`flow-${current.plan.kind}${frame ? `-${frame}` : ''}`, s.kit);
    for (const sprite of current.sprites) {
      if (s.textures.exists(key)) sprite.setTexture(key);
      sprite.setAlpha(active ? 0.7 : 0.35);
    }
  }
}

export function destroyCurrents(s: GameScene) {
  for (const current of s.currents) current.sprites.forEach((sprite) => sprite.destroy());
  s.currents = [];
}
