import { E } from '../pixel/palette';
import { WEAPONS, type WeaponInstance } from '../data/weapons';
import { textTexture } from '../styles/textures';
import { ui, type PreviewKeepClear } from '../ui/ui';
import { raycast } from './dungeon';
import { ELEMENT_COLOR, ELEMENT_NAME, type Img, type Pickup } from './entities';
import { DEPTH } from './fx';
import type { GameScene } from './GameScene';
import { collectLevelToken, type LevelToken } from './levelTokens';
import type { Choice } from './run';

const INTERACT_RADIUS = 28;
type Pedestal = GameScene['pedestals'][number];
type Target =
  | { kind: 'pickup'; item: Pickup }
  | { kind: 'level'; item: LevelToken }
  | { kind: 'pedestal'; item: Pedestal };

function candidates(s: GameScene): Target[] {
  const targets: Target[] = [];
  for (const p of s.pickups) {
    if (!p.dead && (p.kind === 'chest' || p.kind === 'wchest' || p.kind === 'crystal' || (p.kind === 'weapon' && p.weapon))) targets.push({ kind: 'pickup', item: p });
  }
  for (const k of s.levelTokens) if (k.landed && !k.dead) targets.push({ kind: 'level', item: k });
  for (const p of s.pedestals) targets.push({ kind: 'pedestal', item: p });
  return targets;
}

function canInteract(s: GameScene) {
  return s.mode === 'play' && !s.fusing && performance.now() - ui.closedAt > 250;
}

/** One reachable target wins, so a key press never opens several overlapping rewards. */
function nearest(s: GameScene, targets: Target[]) {
  let best: Target | undefined;
  let bestDistance = INTERACT_RADIUS;
  for (const target of targets) {
    if (target.kind === 'pickup' && (target.item.revealT ?? 0) > 0) continue;
    const dx = target.item.x - s.player.x;
    const dy = target.item.y - s.player.y;
    const distance = Math.hypot(dx, dy);
    if (distance > bestDistance || (best && distance === bestDistance)) continue;
    if (distance > 0 && raycast(s.dungeon, s.player.x, s.player.y, dx / distance, dy / distance, distance).axis !== null) continue;
    best = target;
    bestDistance = distance;
  }
  return best;
}

function choiceCategory(choice: Choice) {
  switch (choice.type) {
    case 'weapon-new':
    case 'weapon-up': return '武器';
    case 'spell-new': return '技能';
    case 'spell-up': return '技能升级';
    case 'evolve': return '技能进化';
    case 'upgrade': return '强化';
    case 'pet': return '伙伴';
    case 'heal': return '生命';
  }
}

/** Stack cached pixel-text lines on one texture, preserving one owned label image per reward. */
function labelTexture(s: GameScene, lines: string[], color: string, action?: string) {
  const input = s.usesTouchControls() ? '交互' : 'F';
  const key = `interaction:${JSON.stringify([lines, color, action, input])}`;
  if (s.textures.exists(key)) return key;
  const parts = [...lines.map((text) => ({ text, color })), ...(action ? [{ text: `[${input}] ${action}`, color: E.white }] : [])]
    .map((line) => s.textures.get(textTexture(s, line.text, { color: line.color, outline: E.ink })).getSourceImage() as HTMLCanvasElement);
  const gap = 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(...parts.map((part) => part.width));
  canvas.height = parts.reduce((height, part) => height + part.height, 0) + gap * (parts.length - 1);
  const ctx = canvas.getContext('2d')!;
  let y = 0;
  for (const part of parts) {
    ctx.drawImage(part, Math.floor((canvas.width - part.width) / 2), y);
    y += part.height + gap;
  }
  s.textures.addCanvas(key, canvas);
  return key;
}

/** Names remain visible; only the nearest actionable reward carries the F hint. */
export function updateInteractionHints(s: GameScene) {
  const targets = candidates(s);
  const selected = canInteract(s) ? nearest(s, targets) : undefined;
  for (const target of targets) {
    const focused = target === selected;
    let label: Img;
    let lines: string[];
    let color: string;
    let action: string;
    let x = target.item.x;
    let y = target.item.y;
    if (target.kind === 'level') {
      const k = target.item;
      label = k.label;
      lines = ['升级水晶', `Lv.${k.level}`];
      color = E.yellow;
      action = '打开';
      y = k.y - 35 + Math.sin(k.t * 3);
      label.setOrigin(0.5, 1);
    } else if (target.kind === 'pedestal') {
      const p = target.item;
      label = p.label;
      lines = [choiceCategory(p.choice), ui.describe(p.choice, s.run).name];
      color = E.yellow;
      action = '领取';
      y += 17;
      label.setOrigin(0.5, 0);
    } else {
      const p = target.item;
      if (p.kind === 'weapon' && p.weapon) {
        lines = [p.weapon.def.name, `Lv.${p.weapon.level}`];
        color = E.cyan;
        action = '拾取';
      } else if (p.kind === 'crystal') {
        const element = p.element ?? 'rock';
        lines = [`${ELEMENT_NAME[element]}元素`, '护盾水晶'];
        color = ELEMENT_COLOR[element];
        action = '拾取';
      } else {
        lines = [p.kind === 'wchest' ? '武器箱' : '技能/强化箱'];
        color = p.kind === 'wchest' ? E.cyan : E.yellow;
        action = '打开';
      }
      const texture = labelTexture(s, lines, color, focused ? action : undefined);
      if (!p.label) p.label = s.add.image(p.x, p.y, texture);
      label = p.label;
      x = p.sprite.x;
      y = p.chest ? p.y + 13 : p.sprite.y + 13;
      label.setOrigin(0.5, 0);
    }
    const texture = labelTexture(s, lines, color, focused ? action : undefined);
    if (label.texture.key !== texture) label.setTexture(texture);
    label.setPosition(Math.round(x), Math.round(y)).setDepth(DEPTH.numbers - 0.5).setAlpha(focused ? 1 : 0.85);
  }
}

interface PreviewFocus {
  item: Target['item'];
  weapon: WeaponInstance;
  dwell: number;
}

const previews = new WeakMap<GameScene, PreviewFocus>();

export function resetWeaponPreview(s: GameScene) {
  previews.delete(s);
  ui.hideWeaponPreview();
}

/** Protect the hero, nearby weapon art and their pickup labels from the preview panel. */
function previewKeepClear(s: GameScene): PreviewKeepClear[] {
  const images: (Img | undefined)[] = [s.player.sprite, s.player.gun, s.player.gun2];
  for (const p of s.pickups) {
    if (!p.dead && p.kind === 'weapon' && Math.hypot(p.x - s.player.x, p.y - s.player.y) < 48) {
      images.push(p.sprite, p.chest, p.label);
    }
  }
  for (const p of s.pedestals) {
    if ((p.choice.type === 'weapon-new' || p.choice.type === 'weapon-up') && Math.hypot(p.x - s.player.x, p.y - s.player.y) < 48) {
      images.push(p.ped, p.item, p.label);
    }
  }
  const camera = s.cameras.main;
  const origin = camera.getWorldPoint(0, 0);
  return images.filter((image): image is Img => !!image?.scene && image.visible).map((image) => {
    const b = image.getBounds();
    // The game camera pans and zooms without rotation; use its public world projection.
    const a = { x: (b.left - origin.x) * camera.zoomX, y: (b.top - origin.y) * camera.zoomY };
    const z = { x: (b.right - origin.x) * camera.zoomX, y: (b.bottom - origin.y) * camera.zoomY };
    // Include a little room for camera easing, hover and the next frame's movement.
    return { left: Math.min(a.x, z.x) - 10, top: Math.min(a.y, z.y) - 10, right: Math.max(a.x, z.x) + 10, bottom: Math.max(a.y, z.y) + 10 };
  });
}

/** Observe the same target as F. Safe-room browsing never pauses play or consumes input. */
export function updateNearbyWeaponPreview(s: GameScene, dt: number) {
  const unsafe = !canInteract(s) || !!s.active || !!s.altar?.started || s.pendingSpawns > 0
    || !!s.bt || s.enemies.some((e) => !e.dead) || s.eproj.some((p) => !p.dead)
    || s.ehazards.length > 0 || s.telegraphs.some((t) => t.kind === 'spawn')
    || s.isFiring() || s.input.activePointer.rightButtonDown()
    || s.player.skillT > 0 || s.player.sinceHit < 1;
  if (unsafe) return resetWeaponPreview(s);
  const target = nearest(s, candidates(s));
  const ground = target?.kind === 'pickup' && target.item.kind === 'weapon' ? target.item.weapon : undefined;
  const choice = target?.kind === 'pedestal' ? target.item.choice : undefined;
  if (!target || (!ground && choice?.type !== 'weapon-new' && choice?.type !== 'weapon-up')) return resetWeaponPreview(s);
  let focus = previews.get(s);
  if (focus?.item !== target.item) {
    ui.hideWeaponPreview();
    let weapon = ground;
    if (!weapon && choice?.type === 'weapon-new') weapon = choice.instance ?? { def: WEAPONS[choice.id], level: 1, cd: 0 };
    if (!weapon && choice?.type === 'weapon-up') {
      const owned = s.run.weapons[choice.index];
      if (owned) weapon = { ...owned, level: owned.level + 1 };
    }
    if (!weapon) return resetWeaponPreview(s);
    focus = { item: target.item, weapon, dwell: 0 };
    previews.set(s, focus);
  }
  focus!.dwell += dt;
  if (focus!.dwell >= 0.35) ui.previewWeapon(focus!.weapon, s.run, previewKeepClear(s));
}

/** F dispatches exactly one nearby interaction. Experience gems and hearts remain automatic. */
export function interactNearby(s: GameScene): boolean {
  if (!canInteract(s)) return false;
  const target = nearest(s, candidates(s));
  if (!target) return false;
  if (target.kind === 'level') collectLevelToken(s, target.item);
  else if (target.kind === 'pedestal') s.collectPedestal(target.item);
  else if (target.item.kind === 'weapon') s.pickupWeapon(target.item);
  else if (target.item.kind === 'crystal') s.collectCrystal(target.item);
  else s.openChest(target.item);
  return true;
}
