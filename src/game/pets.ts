import { TAU, dist, dist2 } from '../core/math';
import type { Element } from '../core/stats';
import { audio } from '../audio/audio';
import { K } from '../styles/textures';
import type { Enemy, Pet } from './entities';
import { DEPTH } from './fx';
import type { GameScene } from './GameScene';

export function syncPets(s: GameScene) {
  for (const kind of s.run.pets) {
    if (s.pets.some((p) => p.kind === kind)) continue;
    const sprite = s.add.image(s.player.x, s.player.y, K(`pet-${kind}`, s.kit)).setDepth(DEPTH.pet).setScale(0.1);
    s.tweens.add({ targets: sprite, scale: 1, duration: 360, ease: 'Back.easeOut' });
    s.fx.petals(s.player.x, s.player.y, 16);
    s.pets.push({ kind, x: s.player.x, y: s.player.y, vx: 0, vy: 0, t: 0, cd: 0.6, state: 'follow', angle: Math.random() * TAU, sprite, hitCd: new Map() });
  }
}

function petDamage(s: GameScene, base: number) {
  const m = s.run.mods;
  return base * (1 + (s.damageMult() - 1) * m.petInherit);
}

function petHit(s: GameScene, pet: Pet, e: Enemy, base: number, src: string) {
  const dmg = petDamage(s, base);
  s.damageEnemy(e, dmg, { src, kx: e.x - pet.x, ky: e.y - pet.y, knock: 150, noElement: true });
  const m = s.run.mods;
  for (const el of ['fire', 'ice', 'shock'] as Element[]) {
    if (!e.dead && m.elements[el] > 0 && Math.random() < m.elements[el] * m.petInherit) s.applyElement(e, el, dmg);
  }
}

function moveToward(p: Pet, tx: number, ty: number, dt: number, k: number) {
  const f = Math.min(1, dt * k);
  p.x += (tx - p.x) * f;
  p.y += (ty - p.y) * f;
}

export function updatePets(s: GameScene, dt: number) {
  const pl = s.player;
  const m = s.run.mods;
  s.pets.forEach((p, i) => {
    p.t += dt;
    switch (p.kind) {
      case 'hound': {
        p.cd -= dt * m.petRate;
        if (p.state === 'follow') {
          moveToward(p, pl.x - 46 + i * 8, pl.y + 26, dt, 6);
          if (p.cd <= 0) {
            let best: Enemy | undefined;
            let bd = 430 * 430;
            for (const e of s.enemies) {
              if (e.dead) continue;
              const d = dist2(pl.x, pl.y, e.x, e.y);
              if (d < bd) {
                bd = d;
                best = e;
              }
            }
            if (best) {
              p.target = best;
              p.state = 'dash';
              p.t = 0;
            }
          }
        } else if (p.state === 'dash') {
          const t = p.target;
          if (!t || t.dead || p.t > 1.2) {
            p.state = 'return';
            break;
          }
          const a = Math.atan2(t.y - p.y, t.x - p.x);
          p.x += Math.cos(a) * 640 * dt;
          p.y += Math.sin(a) * 640 * dt;
          p.sprite.setFlipX(Math.cos(a) < 0);
          if (dist(p.x, p.y, t.x, t.y) < t.r + 14) {
            petHit(s, p, t, 18, '猎犬');
            s.fx.sparks(t.x, t.y, 6, 'accent');
            p.state = 'return';
            p.cd = 1.05;
          }
        } else {
          moveToward(p, pl.x - 46, pl.y + 26, dt, 7);
          if (dist(p.x, p.y, pl.x, pl.y) < 70) p.state = 'follow';
        }
        p.sprite.setRotation(Math.sin(p.t * 12) * 0.08);
        break;
      }
      case 'dove': {
        p.angle += dt * 1.7;
        moveToward(p, pl.x + Math.cos(p.angle) * 74, pl.y + Math.sin(p.angle) * 50 - 30, dt, 5);
        p.sprite.setScale(1, 0.85 + Math.abs(Math.sin(p.t * 9)) * 0.25);
        break;
      }
      case 'swan': {
        p.angle += dt * 2.9 * m.petRate;
        p.x = pl.x + Math.cos(p.angle) * 54;
        p.y = pl.y + Math.sin(p.angle) * 54;
        p.sprite.setRotation(p.angle + Math.PI / 2);
        for (const b of s.eproj) {
          if (!b.dead && dist2(b.x, b.y, p.x, p.y) < (b.r + 18) ** 2) {
            s.killProj(b, true);
            s.fx.sparks(b.x, b.y, 6, 'white');
            audio.block();
          }
        }
        for (const e of s.enemies) {
          if (e.dead) continue;
          const cd = p.hitCd.get(e) ?? 0;
          if (cd > p.t) continue;
          if (dist2(e.x, e.y, p.x, p.y) < (e.r + 18) ** 2) {
            petHit(s, p, e, 9, '天鹅');
            p.hitCd.set(e, p.t + 0.4);
          }
        }
        break;
      }
    }
    p.sprite.setPosition(p.x, p.y);
  });
}
