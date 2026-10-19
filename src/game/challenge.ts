import type Phaser from 'phaser';
import { audio } from '../audio/audio';
import { dist2, hexToNum } from '../core/math';
import { E } from '../pixel/palette';
import type { SavedChallenge, SavedRun } from '../save';
import { textTexture } from '../styles/textures';
import { ui } from '../ui/ui';
import { T, openSpot, roomAt, roomCenter, solidAt, type DRoom } from './dungeon';
import type { Img } from './entities';
import { DEPTH } from './fx';
import type { GameScene } from './GameScene';
import { resetWeaponPreview } from './interactions';
import { settleTraps } from './traps';

const DURATION = 20;
export interface Challenge extends SavedChallenge {
  room: DRoom; x: number; y: number; sprite: Img; label: Img;
  gfx: Phaser.GameObjects.Graphics; targets: [number, number][]; digits: Img[];
  elapsed: number; next: number; active: boolean; lastSecond: number;
}

export function populateChallenges(s: GameScene, saved?: SavedRun) {
  if (s.sys.settings.key !== 'game') return;
  for (const room of s.dungeon.rooms) {
    if (room.type !== 'challenge') continue;
    const progress = saved?.rooms.find((r) => r.id === room.id)?.challenge;
    const attempted = progress?.attempted === true;
    // Reloading an unfinished attempt ends it safely. The one attempt is already spent in its checkpoint.
    if (attempted) room.cleared = true;
    const targets = (room.challengeTargets ?? []).map(([tx, ty]): [number, number] => [tx * T + T / 2, ty * T + T / 2]);
    const center = openSpot(s.dungeon, ...roomCenter(room));
    const spots: [number, number][] = [];
    for (let ty = room.y0 + 2; ty < room.y1 - 2; ty++) for (let tx = room.x0 + 2; tx < room.x1 - 2; tx++) {
      const px = tx * T + T / 2, py = ty * T + T / 2;
      if (solidAt(s.dungeon, px, py) || s.obstacles.some((o) => !o.dead && dist2(o.x, o.y, px, py) < (o.r + 12) ** 2)) continue;
      if ([[T, 0], [-T, 0], [0, T], [0, -T]].some(([dx, dy]) => solidAt(s.dungeon, px + dx, py + dy))) continue;
      if (targets.some(([x, y]) => dist2(x, y, px, py) < 28 ** 2)) continue;
      spots.push([px, py]);
    }
    spots.sort(([ax, ay], [bx, by]) => dist2(ax, ay, ...center) - dist2(bx, by, ...center));
    const [x, y] = spots[0] ?? center;
    const challenge: Challenge = {
      room, x, y, attempted, completed: progress?.completed === true, rewarded: progress?.rewarded === true,
      active: false, elapsed: 0, next: 0, lastSecond: -1, targets, digits: [],
      sprite: s.add.image(x, y, 'altar').setDepth(DEPTH.decal + 0.7).setTint(hexToNum(E.cyan)),
      label: s.add.image(x, y + 20, textTexture(s, attempted ? '挑战已结束' : '机关试炼 · 可选', { color: E.cyan, outline: E.ink })).setDepth(DEPTH.numbers - 0.5),
      gfx: s.add.graphics().setDepth(DEPTH.shadow + 0.8),
    };
    if (attempted) challenge.sprite.setAlpha(0.35);
    s.challenges.push(challenge);
  }
}

export function challengeProgress(s: GameScene, room: DRoom): SavedChallenge | undefined {
  const c = s.challenges.find((c) => c.room === room);
  return c ? { attempted: c.attempted, completed: c.completed, rewarded: c.rewarded } : undefined;
}

/** Called through the existing F/touch interaction, never by stepping onto the altar. */
export function startChallenge(s: GameScene, c: Challenge) {
  if (s.sys.settings.key !== 'game' || s.mode !== 'play' || s.fusing || c.attempted || s.active || c.room.cleared || roomAt(s.dungeon, s.player.x, s.player.y, 1) !== c.room) return;
  if (c.targets.length !== 3 || new Set(c.targets.map(([x, y]) => `${x},${y}`)).size !== 3 || c.targets.some(([x, y]) => solidAt(s.dungeon, x, y))) {
    ui.toast('这间试炼暂不可用，可继续探索', 1600);
    return;
  }
  resetWeaponPreview(s);
  c.attempted = true; c.active = true; c.elapsed = 0; c.next = 0;
  s.active = c.room;
  s.activeChallenge = c;
  s.closeGates(c.room);
  c.label.setVisible(false);
  c.digits = c.targets.map(([x, y], i) => s.add.image(x, y - 17, textTexture(s, `${i + 1}`, { color: E.cyan, outline: E.ink })).setDepth(DEPTH.numbers - 0.5));
  audio.setIntensity(1);
  ui.toast('20秒内依次踏过 1 → 2 → 3；受击即失败', 2100);
  // Commit the attempt before any movement/feedback can yield; quitting cannot restore a free attempt.
  s.saveProgress();
}

export function finishChallenge(s: GameScene, success: boolean) {
  const c = s.activeChallenge;
  if (!c?.active) return;
  c.active = false; c.completed = success; c.room.cleared = true;
  s.activeChallenge = undefined;
  if (s.active === c.room) s.active = undefined;
  settleTraps(s, c.room);
  c.gfx.clear(); c.digits.forEach((digit) => digit.destroy()); c.digits = [];
  c.sprite.setAlpha(0.35);
  c.label.setTexture(textTexture(s, success ? '试炼完成 · 奖励已领取' : '试炼结束 · 下次再来', { color: success ? E.yellow : E.grey, outline: E.ink })).setVisible(true);
  s.openGates();
  audio.setIntensity(0);
  if (success && !c.rewarded) {
    c.rewarded = true;
    s.run.score += 150;
    s.run.hp = Math.min(s.run.mods.maxHp, s.run.hp + 1);
    s.run.armor = Math.min(s.run.mods.maxArmor, s.run.armor + 1);
    audio.clear();
    s.fx.ring(c.x, c.y, 50, E.cyan, 450, 2);
    ui.toast('试炼完成：+150分，回复1生命与1护甲', 2300);
  } else ui.toast('试炼结束，本房机关已关闭', 1600);
  // Reward and its receipt share one snapshot, so continue cannot grant it twice.
  s.saveProgress();
}

export function updateChallenge(s: GameScene, dt: number) {
  const c = s.activeChallenge;
  if (!c?.active || s.mode !== 'play' || s.fusing) return;
  c.elapsed += dt;
  if (c.elapsed >= DURATION || roomAt(s.dungeon, s.player.x, s.player.y, 0) !== c.room) { finishChallenge(s, false); return; }
  const [tx, ty] = c.targets[c.next];
  if (dist2(s.player.x, s.player.y, tx, ty) < 12 ** 2) {
    c.next++;
    audio.select();
    if (c.next === c.targets.length) { finishChallenge(s, true); return; }
  }
  const g = c.gfx;
  g.clear();
  c.targets.forEach(([x, y], i) => {
    const done = i < c.next, focus = i === c.next;
    g.lineStyle(focus ? 2 : 1, hexToNum(done ? E.green : E.cyan), focus ? 1 : 0.4).strokeCircle(x, y, focus ? 12 : 9);
    if (focus) g.lineStyle(1, hexToNum(E.white), 0.7).strokeCircle(x, y, 15 + Math.floor(Math.sin(c.elapsed * 5) * 2));
    c.digits[i].setAlpha(done ? 0.3 : focus ? 1 : 0.5);
  });
  const second = Math.ceil(DURATION - c.elapsed);
  if (second !== c.lastSecond) {
    c.lastSecond = second;
    c.label.setTexture(textTexture(s, `${second}秒 · ${c.next}/3`, { color: second <= 5 ? E.orange : E.cyan, outline: E.ink })).setVisible(true);
  }
}

export function destroyChallenges(s: GameScene) {
  for (const c of s.challenges) { c.sprite.destroy(); c.label.destroy(); c.gfx.destroy(); c.digits.forEach((digit) => digit.destroy()); }
  s.challenges = []; s.activeChallenge = undefined;
}
