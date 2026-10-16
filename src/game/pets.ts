import { ELEMENTS } from './elements';
import { TAU, dist, dist2 } from '../core/math';
import type { Element } from '../core/stats';
import { audio } from '../audio/audio';
import type { Enemy, Pet } from './entities';
import { DEPTH } from './fx';
import type { GameScene } from './GameScene';

export function syncPets(s: GameScene) {
  for (const kind of s.run.pets) {
    if (s.pets.some((p) => p.kind === kind)) continue;
    const sprite = s.add.image(s.player.x, s.player.y, `pet-${kind}`).setDepth(DEPTH.pet).setOrigin(0.5, 0.8);
    s.fx.petals(s.player.x, s.player.y, 12);
    s.fx.ring(s.player.x, s.player.y, 30, '#ffffff', 300);
    s.pets.push({ kind, x: s.player.x, y: s.player.y, vx: 0, vy: 0, t: 0, cd: 0.6, state: 'follow', angle: Math.random() * TAU, sprite, hitCd: new Map() });
  }
}

function petHit(s: GameScene, pet: Pet, e: Enemy, base: number, src: string) {
  const m = s.run.mods;
  const dmg = base * (1 + (s.damageMult() - 1) * m.petInherit);
  // Pets carry your elements too, at the rate they inherit your upgrades.
  const el = ELEMENTS.find((k) => m.elements[k] > 0 && Math.random() < m.elements[k] * m.petInherit);
  s.damageEnemy(e, dmg, { src, kx: e.x - pet.x, ky: e.y - pet.y, knock: 70, noElement: true, element: el });
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
          moveToward(p, pl.x - 14 + i * 3, pl.y + 6, dt, 6);
          if (p.cd <= 0) {
            let best: Enemy | undefined;
            let bd = 170 * 170;
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
          p.x += Math.cos(a) * 240 * dt;
          p.y += Math.sin(a) * 240 * dt;
          p.sprite.setFlipX(Math.cos(a) < 0);
          if (dist(p.x, p.y, t.x, t.y) < t.r + 5) {
            petHit(s, p, t, 7, '猎犬');
            s.fx.sparks(t.x, t.y, 4, 'accent');
            p.state = 'return';
            p.cd = 1.0;
          }
        } else {
          moveToward(p, pl.x - 14, pl.y + 6, dt, 7);
          if (dist(p.x, p.y, pl.x, pl.y) < 26) p.state = 'follow';
        }
        break;
      }
      case 'dove': {
        p.angle += dt * 1.7;
        moveToward(p, pl.x + Math.cos(p.angle) * 26, pl.y - 18 + Math.sin(p.angle) * 10, dt, 5);
        p.sprite.setTexture(Math.floor(p.t * 8) % 2 ? 'pet-dove-b' : 'pet-dove');
        break;
      }
      case 'swan': {
        p.angle += dt * 2.9 * m.petRate;
        p.x = pl.x + Math.cos(p.angle) * 20;
        p.y = pl.y - 2 + Math.sin(p.angle) * 15;
        p.sprite.setFlipX(Math.sin(p.angle) > 0);
        for (const b of s.eproj) {
          if (!b.dead && dist2(b.x, b.y, p.x, p.y - 4) < (b.r + 7) ** 2) {
            s.killProj(b, true);
            s.fx.sparks(b.x, b.y, 4, 'white');
            audio.block();
          }
        }
        for (const e of s.enemies) {
          if (e.dead) continue;
          if ((p.hitCd.get(e) ?? 0) > p.t) continue;
          if (dist2(e.x, e.y, p.x, p.y) < (e.r + 7) ** 2) {
            petHit(s, p, e, 3.5, '天鹅');
            p.hitCd.set(e, p.t + 0.4);
          }
        }
        break;
      }
    }
    p.sprite.setPosition(Math.round(p.x), Math.round(p.y));
  });
}
