import Phaser from 'phaser';
import { clamp, hexToNum, TAU } from '../core/math';
import { rand } from '../core/rng';
import { audio } from '../audio/audio';
import { K } from '../styles/textures';
import { FLOATING, HEAVY, type Pose } from '../pixel/bossArt';
import { E } from '../pixel/palette';
import type { BossState, Enemy } from './entities';
import { DEPTH } from './fx';
import type { GameScene } from './GameScene';

/*
 * A boss's body language, worked out every frame on top of its moves: it breathes, walks with a stride (or bobs in
 * the air), leans into its motion and turns to face the knight. Every move is gathered before it is let go: the
 * guardian crouches into its casting pose while light is drawn into it, then snaps into its striking pose with a
 * stretch, a flash and a ring. Fast moves leave afterimages; heavy ones shake the floor with each step. The second
 * act lights a turning sigil under it; a fallen boss breaks into pieces.
 */

/** Seconds a guardian spends gathering each move (shorter in the second act). */
export const WINDUP = [0.55, 0.4];

/** Each style's guardian and the colour its moves glow with. */
const ACCENT: Record<string, string> = {
  forest: E.green,
  glacier: E.cyan,
  desert: E.yellow,
  volcano: E.orange,
  factory: E.amber,
  castle: E.red,
  garden: E.pink,
  palace: E.yellow,
  reef: E.magenta,
  neon: E.cyan,
};

/** The name a move is called out with as it is gathered. */
const MOVE_NAME: Record<string, string> = {
  vines: '荆棘鞭笞',
  roots: '缠根',
  icicles: '冰棱坠落',
  blizzard: '暴风雪',
  boneSpears: '骨矛阵',
  sandVortex: '流沙漩涡',
  jackalDash: '冥犬突袭',
  curseCross: '十字诅咒',
  meteors: '陨火',
  lavaPools: '熔岩涌泉',
  flameBreath: '烈焰吐息',
  gearSaws: '齿轮锯',
  steamVents: '蒸汽喷口',
  missiles: '追踪导弹',
  batSwarm: '蝠群',
  blink: '影步',
  iaido: '居合',
  swordQi: '剑气',
  petalStorm: '落英缤纷',
  swordRain: '剑雨',
  judgment: '审判',
  featherFan: '羽刃',
  bellRings: '丧钟',
  tentacles: '触手横扫',
  bubbles: '泡影',
  whirlpool: '漩涡',
  laserGrid: '激光网格',
  drones: '无人机群',
  summon: '召唤',
  spiral: '螺旋弹幕',
};

/** Moves where the boss itself flies across the room: it keeps its striking pose and trails afterimages. */
const DASHES = new Set(['jackalDash', 'iaido', 'blink']);

export interface BossLook {
  lastX: number;
  lastY: number;
  /** Velocity measured from how the boss actually moved, so moves that place it directly count too. */
  vx: number;
  vy: number;
  walk: number;
  lean: number;
  /** Squash (+: wide and flat) or stretch (-: tall and thin), easing back to zero. */
  sq: number;
  strike: number;
  lastStep: number;
  lastPattern: string;
  ghostT: number;
  /** Height still to fall on the way in. */
  drop: number;
  dropV: number;
  landed: boolean;
  /** White flicker while it changes act. */
  flicker: number;
  accent: string;
  float: boolean;
  heavy: boolean;
  ambient?: Phaser.GameObjects.Particles.ParticleEmitter;
  sigil?: Phaser.GameObjects.Graphics;
  sigilA: number;
}

const tex = (s: GameScene, e: Enemy, pose: Pose, p2: boolean) => K(`boss-guardian-${pose}${p2 ? '-2' : ''}`, s.kit);

export function initLook(s: GameScene, e: Enemy): BossLook {
  const id = s.kit.id;
  const guardian = e.kind === 'guardian';
  const look: BossLook = {
    lastX: e.x,
    lastY: e.y,
    vx: 0,
    vy: 0,
    walk: 0,
    lean: 0,
    sq: 0,
    strike: 0,
    lastStep: 0,
    lastPattern: '',
    ghostT: 0,
    drop: guardian && FLOATING.has(id) ? 110 : 170,
    dropV: 0,
    landed: false,
    flicker: 0,
    accent: guardian ? (ACCENT[id] ?? E.yellow) : E.red,
    float: guardian && FLOATING.has(id),
    heavy: !guardian || HEAVY.has(id),
    sigilA: 0,
  };
  look.ambient = ambientFor(s, e, look);
  return look;
}

/** Motes drifting about the guardian in its style's own particle: leaves, snow, sand, embers, bubbles. */
function ambientFor(s: GameScene, e: Enemy, look: BossLook) {
  const id = e.kind === 'boar' ? 'boar' : s.kit.id;
  const rising = ['volcano', 'reef', 'castle', 'neon', 'factory', 'boar'].includes(id);
  const texture = id === 'garden' ? 'petal' : id === 'boar' ? 'smoke' : K('pt', s.kit);
  const em = s.add
    .particles(0, 0, texture, {
      lifespan: { min: 900, max: 1600 },
      speedX: { min: -14, max: 14 },
      speedY: rising ? { min: -34, max: -12 } : { min: 6, max: 22 },
      alpha: { start: 0.9, end: 0 },
      scale: { start: 1, end: 0.5 },
      frequency: id === 'boar' ? 260 : 150,
      quantity: 1,
      tint: id === 'boar' ? 0x8a6a60 : 0xffffff,
      emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-24, rising ? -40 : -76, 48, rising ? 40 : 40) } as Phaser.Types.GameObjects.Particles.EmitZoneData,
    })
    .setDepth(DEPTH.enemy + 0.6);
  em.startFollow(e.sprite);
  look.ambient = em;
  return em;
}

/** Afterimage: a copy of the boss's current frame in its glow colour, fading where it stood. */
function ghost(s: GameScene, sp: Phaser.GameObjects.Image, color: string) {
  const g = s.add
    .image(sp.x, sp.y, sp.texture.key)
    .setOrigin(sp.originX, sp.originY)
    .setScale(sp.scaleX, sp.scaleY)
    .setAngle(sp.angle)
    .setFlipX(sp.flipX)
    .setTintFill(hexToNum(color))
    .setAlpha(0.5)
    .setDepth(DEPTH.enemy + 0.3);
  s.tweens.add({ targets: g, alpha: 0, duration: 280, onComplete: () => g.destroy() });
}

/** A guardian starts gathering a move: its name is called, light is drawn into it, it crouches. */
export function beginWindup(s: GameScene, e: Enemy, b: BossState, dur: number) {
  const look = b.look;
  if (!look) return;
  const name = MOVE_NAME[b.pattern];
  // Under its feet: the boss bar covers the top of the screen, where the guardian usually stands.
  if (name) s.fx.callout(e.x, e.y + 16, name, look.accent);
  s.fx.implode(e.x, e.y - 22, 64, look.accent, dur * 1000, 2);
  s.fx.implode(e.x, e.y - 22, 40, E.white, dur * 800, 1);
  s.fx.glowPop(e.x, e.y - 22, 30, look.accent, dur * 1000);
  audio.bossGather(dur);
}

/** The gathered move is let go: a snap into the striking pose, a stretch, a ring and a little shake. */
export function release(s: GameScene, e: Enemy, b: BossState) {
  const look = b.look;
  if (!look) return;
  look.strike = 0.34;
  look.sq = -0.2;
  s.fx.ring(e.x, e.y - 18, 46, look.accent, 280, 2);
  s.fx.glowPop(e.x, e.y - 22, 24, E.white, 120);
  s.light.flash(e.x, e.y - 18, 90, look.accent, 0.22);
  s.fx.shake(0.12);
}

/** The second act: the guardian flickers white, rays break out of it, and a sigil starts turning under it. */
export function actTwo(s: GameScene, e: Enemy) {
  const look = e.boss?.look;
  if (!look) return;
  look.flicker = 1.1;
  look.sq = 0.3;
  s.fx.burstRays(e.x, e.y - 24, 120, look.accent, 1300);
  s.fx.sparks(e.x, e.y - 20, 24, 'white');
  if (!look.sigil) look.sigil = s.add.graphics().setDepth(DEPTH.shadow + 0.5);
  if (look.ambient) look.ambient.frequency = 70;
}

/** Called every frame after the boss has moved: pick its pose and set how its sprite sits, turns and stretches. */
export function animateBoss(s: GameScene, e: Enemy, dt: number) {
  const b = e.boss!;
  const look = b.look;
  if (!look || dt <= 0) return;
  const sp = e.sprite;
  const t = s.time0;

  // How it really moved this frame (dashes and blinks set the position directly).
  const mvx = (e.x - look.lastX) / dt;
  const mvy = (e.y - look.lastY) / dt;
  look.lastX = e.x;
  look.lastY = e.y;
  const k = 1 - Math.exp(-dt * 12);
  look.vx += (clamp(mvx, -600, 600) - look.vx) * k;
  look.vy += (clamp(mvy, -600, 600) - look.vy) * k;
  const speed = Math.hypot(look.vx, look.vy);

  // On the way in: a fall from above, then the landing.
  let lift = 0;
  if (look.drop > 0) {
    if (look.float) {
      look.drop = Math.max(0, look.drop - dt * Math.max(40, look.drop * 2.4));
    } else {
      look.dropV += 900 * dt;
      look.drop = Math.max(0, look.drop - look.dropV * dt);
    }
    lift = look.drop;
    if (look.drop <= 0 && !look.landed) land(s, e, look);
  }

  // Strides on the ground, a slow bob in the air.
  const prevSide = Math.sign(Math.sin(look.walk * Math.PI));
  look.walk += (speed * dt) / (look.heavy ? 18 : 13);
  let bob = 0;
  if (look.float) bob = 5 + Math.sin(t * 2.2) * 3;
  else if (speed > 12) {
    bob = Math.abs(Math.sin(look.walk * Math.PI)) * (look.heavy ? 2 : 3);
    const side = Math.sign(Math.sin(look.walk * Math.PI));
    if (side !== prevSide && look.landed) footfall(s, e, look);
  }

  // Pose.
  if (b.pattern !== look.lastPattern) {
    look.lastPattern = b.pattern;
    look.lastStep = b.step;
  }
  if (b.step !== look.lastStep) {
    // Every volley of a move snaps the striking pose back for a moment.
    look.lastStep = b.step;
    if (b.pattern && (b.windup ?? 0) <= 0) {
      look.strike = Math.max(look.strike, 0.16);
      look.sq = Math.min(look.sq, -0.08);
    }
  }
  look.strike -= dt;
  const p2 = b.phase === 2;
  let pose: string;
  const gathering = (b.windup ?? 0) > 0;
  if (e.kind === 'boar') {
    pose = boarPose(e, look);
  } else {
    let g: Pose;
    if (gathering) g = 'cast';
    else if (b.leap) g = b.leap.glide ? 'strike' : 'cast';
    else if (look.strike > 0 || DASHES.has(b.pattern)) g = 'strike';
    else if (b.pattern || b.armLive > 0 || b.armWarn > 0) g = 'cast';
    else g = Math.floor(t * 1.7) % 2 ? 'breath' : 'idle';
    pose = tex(s, e, g, p2);
  }
  if (sp.texture.key !== pose) sp.setTexture(pose);

  // Squash and stretch, with a breath underneath.
  if (gathering) look.sq += (0.13 - look.sq) * (1 - Math.exp(-dt * 10));
  else look.sq *= Math.exp(-dt * 9);
  if (e.flash > 0.04) look.sq = Math.max(look.sq, 0.05);
  const breath = Math.sin(t * 2.6) * 0.025;
  const perspective = 1 + (b.air ?? 0) / 280;
  const sx = e.scale * perspective * (1 + look.sq - breath * 0.6);
  const sy = e.scale * perspective * (1 - look.sq + breath);
  sp.setScale(sx, sy);

  // Lean into the motion; face the knight (the boar faces where it runs).
  const leanTo = clamp(look.vx / 170, -1, 1) * (look.float ? 0.22 : 0.15);
  look.lean += (leanTo - look.lean) * (1 - Math.exp(-dt * 8));
  let angle = look.lean;
  if (e.kind === 'boar') {
    if (e.state === 'stunned') angle += Math.sin(e.t2 * 30) * 0.06;
    sp.setFlipX(Math.cos(e.facing) < 0);
  } else {
    sp.setFlipX(s.player.x < e.x - 4 ? true : s.player.x > e.x + 4 ? false : sp.flipX);
  }
  sp.setRotation(angle);

  // Shake in place while a charge is being wound up.
  const jitter = e.kind === 'boar' && e.state === 'windup' ? Math.round(Math.sin(e.t2 * 80) * 2) : gathering ? Math.round(rand(-1, 1) * look.sq * 6) : 0;
  sp.setPosition(Math.round(e.x + jitter), Math.round(e.y - (b.air ?? 0) - lift - bob));
  const up = lift + bob + (e.kind === 'guardian' ? (b.air ?? 0) : 0);
  e.shadow.setScale(4 * (1 - Math.min(0.5, up / 120)), 3 * (1 - Math.min(0.5, up / 120)));
  e.shadow.setAlpha(1 - Math.min(0.6, lift / 200));

  // Fast moves leave afterimages.
  look.ghostT -= dt;
  if ((speed > 150 || (DASHES.has(b.pattern) && look.strike <= 0) || b.leap?.glide) && look.ghostT <= 0 && speed > 40) {
    look.ghostT = 0.035;
    ghost(s, sp, look.accent);
  }

  // The second act's sigil, turning under the guardian.
  if (look.sigil) drawSigil(look, e, dt, t);

  // While it changes act, it flickers white.
  if (look.flicker > 0) {
    look.flicker -= dt;
    if (Math.floor(look.flicker * 14) % 2 === 0) sp.setTintFill(0xffffff);
  } else if (gathering && Math.floor(t * 16) % 2 === 0) sp.setTint(hexToNum(look.accent));
}

/** The boar: head down for the charge, legs tucked in the air, galloping when it moves. */
function boarPose(e: Enemy, look: BossLook): string {
  const b = e.boss!;
  if (e.state === 'windup') return 'boss-boar-windup';
  if ((b.air ?? 0) > 8) return 'boss-boar-air';
  if (Math.hypot(look.vx, look.vy) > 20) return Math.floor(look.walk * 2) % 2 ? 'boss-boar-run' : 'boss-boar';
  return 'boss-boar';
}

function land(s: GameScene, e: Enemy, look: BossLook) {
  look.landed = true;
  look.sq = look.float ? 0.12 : 0.34;
  s.fx.ring(e.x, e.y, 80, look.accent, 420, 3);
  s.fx.dust(e.x, e.y, look.float ? 8 : 22);
  s.fx.shake(look.float ? 0.2 : 0.65);
  s.light.flash(e.x, e.y - 20, 120, look.accent, 0.3);
  if (!look.float) audio.explode(true);
}

function footfall(s: GameScene, e: Enemy, look: BossLook) {
  const side = Math.sin(look.walk * Math.PI * 0.5) > 0 ? 1 : -1;
  s.fx.dust(e.x + side * 8, e.y + 1, look.heavy ? 3 : 1);
  if (look.heavy) {
    s.fx.shake(0.05);
    audio.step();
  }
}

function drawSigil(look: BossLook, e: Enemy, dt: number, t: number) {
  const g = look.sigil!;
  look.sigilA += dt * 0.9;
  g.clear();
  const col = hexToNum(look.accent);
  const pulse = 0.6 + 0.25 * Math.sin(t * 4);
  const cx = e.x;
  const cy = e.y + 1;
  g.fillStyle(col, 0.1 + 0.05 * Math.sin(t * 4));
  g.fillEllipse(cx, cy, 76, 28);
  const ring = (r: number, a0: number, n: number, gap: number, alpha: number, width = 2) => {
    g.lineStyle(width, col, alpha);
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU;
      g.beginPath();
      for (let j = 0; j <= 6; j++) {
        const q = a + ((TAU / n - gap) * j) / 6;
        const x = cx + Math.cos(q) * r;
        const y = cy + Math.sin(q) * r * 0.36;
        if (j === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.strokePath();
    }
  };
  ring(34, look.sigilA, 8, 0.18, pulse);
  ring(24, -look.sigilA * 1.6, 5, 0.3, pulse * 0.8, 1);
  // Spokes between the rings, like runes.
  g.lineStyle(1, col, pulse * 0.7);
  for (let i = 0; i < 6; i++) {
    const a = look.sigilA * 0.5 + (i / 6) * TAU;
    g.lineBetween(cx + Math.cos(a) * 25, cy + Math.sin(a) * 9, cx + Math.cos(a) * 33, cy + Math.sin(a) * 12);
  }
}

/** A fallen boss breaks apart: its frame is cut into pieces that fly out, spin and fade. */
export function shatterBoss(s: GameScene, e: Enemy) {
  const sp = e.sprite;
  const look = e.boss?.look;
  const frame = sp.frame;
  const tw = frame.width;
  const th = frame.height;
  const n = 4;
  const pw = Math.ceil(tw / n);
  const ph = Math.ceil(th / n);
  const S = sp.scaleX;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const px = i * pw;
      const py = j * ph;
      const cx = px + pw / 2;
      const cy = py + ph / 2;
      const wx = sp.x + (cx - sp.originX * tw) * S;
      const wy = sp.y + (cy - sp.originY * th) * S;
      const piece = s.add
        .image(wx, wy, sp.texture.key)
        .setOrigin(cx / tw, cy / th)
        .setCrop(px, py, pw, ph)
        .setScale(S)
        .setDepth(DEPTH.enemy + 0.5);
      const a = Math.atan2(wy - (sp.y - th * S * 0.4), wx - sp.x) + rand(-0.4, 0.4);
      const d = rand(40, 90);
      s.tweens.add({ targets: piece, x: wx + Math.cos(a) * d, duration: 1300, ease: 'Quad.easeOut' });
      s.tweens.add({ targets: piece, y: wy + Math.sin(a) * d * 0.6 + 30, duration: 1300, ease: 'Back.easeIn' });
      s.tweens.add({ targets: piece, angle: rand(-240, 240), alpha: 0, duration: 1400, ease: 'Quad.easeIn', onComplete: () => piece.destroy() });
    }
  }
  sp.setVisible(false);
  if (look) {
    look.ambient?.stop();
    const em = look.ambient;
    s.time.delayedCall(2000, () => em?.destroy());
    look.sigil?.destroy();
    look.sigil = undefined;
  }
}
