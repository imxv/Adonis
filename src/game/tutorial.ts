import Phaser from 'phaser';
import { audio } from '../audio/audio';
import { TAU, hexToNum } from '../core/math';
import { E } from '../pixel/palette';
import { setTutorialStatus } from '../tutorial/progress';
import { el, px, pxBlock } from '../ui/pxhtml';
import { MenuNav, menuRow } from '../ui/screens';
import { ui } from '../ui/ui';
import '../ui/coach.css';
import { T, roomAt, roomCenter, type DRoom } from './dungeon';
import type { Pickup, Proj } from './entities';
import { DEPTH } from './fx';
import type { GameScene } from './GameScene';

/*
 * The combat half of the beginner tutorial. It runs on a fixed practice floor and only watches the
 * scene: each step polls the state its lesson changes (distance walked, arrows in flight, the dash
 * timer, cleared rooms, crystals, chests, weapons), so the combat code needs no tutorial branches.
 * The scene keeps three promises for it: the practice run is never saved, never scored, and the
 * knight is caught instead of dying.
 */

/** The practice floor: a fixed seed and a bright, readable style, whatever the URL says. */
export const TUTORIAL_PARAMS = 'seed=20261022&styles=garden';

interface Step {
  title: string;
  /** Keyboard and mouse wording, then the touch wording when it differs. */
  text: string;
  touch?: string;
  /** Said instead while a fight in a room is running. */
  fighting?: string;
  enter?(): void;
  /** Where the arrow points, when there is somewhere to go. */
  target?(): { x: number; y: number } | undefined;
  done(): boolean;
}

export class TutorialCoach {
  private readonly steps: Step[];
  private readonly card = el('div', 'coach panel');
  private readonly arrow: Phaser.GameObjects.Graphics;
  private readonly marker: Phaser.GameObjects.Graphics;
  private index = -1;
  private shownFor = 0;
  /** Seconds since the current step's goal was met; the card shows a tick before moving on. */
  private doneFor = -1;
  private cardKey = '';
  private finished = false;
  private clock = 0;
  /** Seconds the current fight has run; the card folds down to its title so it hides less of the room. */
  private fightFor = 0;
  private routeT = 0;
  private route = 0;
  // What the player has done so far. A lesson already learned passes as soon as its card has been read.
  private walked = 0;
  private last?: { x: number; y: number };
  private shots = 0;
  private seen = new WeakSet<Proj>();
  private dashed = false;
  private dual = false;
  private swapped = false;
  private held = 0;
  private skillChest?: Pickup;
  private weaponChest?: Pickup;

  constructor(private readonly s: GameScene) {
    setTutorialStatus('started');
    this.arrow = s.add.graphics().setDepth(DEPTH.numbers - 0.3);
    this.marker = s.add.graphics().setDepth(DEPTH.numbers - 0.3);
    this.steps = [
      {
        title: '移动',
        text: '用 WASD 走动，先走几步试试。',
        touch: '拖动左摇杆走动，先走几步试试。',
        done: () => this.walked > 56,
      },
      {
        title: '瞄准射击',
        text: '鼠标指向哪里就瞄准哪里，按住左键射箭。',
        touch: '右摇杆推向哪里就朝哪里射箭，按住连射。',
        done: () => this.shots >= 3,
      },
      {
        title: '冲刺',
        text: '按空格或 Shift 冲刺。冲刺途中无敌，能穿过子弹和敌人。',
        touch: '点「冲刺」按钮。冲刺途中无敌，能穿过子弹和敌人。',
        done: () => this.dashed,
      },
      {
        title: '清理房间',
        text: '跟着黄色箭头走进战斗房。门会关上，打完每一波敌人才会打开。',
        fighting: '门关上了！边走边射，被围住就冲刺脱身。教程里不会倒下。',
        target: () => (this.s.active ? undefined : this.nextFight()),
        done: () => this.s.dungeon.rooms.some((r) => r.cleared && (r.type === 'combat' || r.type === 'horde')),
      },
      {
        title: '经验与升级',
        text: '敌人掉的宝石会自动吸过来，攒满经验就会掉出金色升级水晶。走到水晶旁按 F，三张卡里挑一张。',
        touch: '敌人掉的宝石会自动吸过来，攒满经验就会掉出金色升级水晶。走到水晶旁点「交互」，三张卡里挑一张。',
        enter: () => {
          const run = this.s.run;
          // One room nearly always fills the first level; top it up so the crystal is never missing.
          if (run.xpLevel < 2 && !this.s.levelTokens.some((k) => !k.dead)) this.s.gainXp(run.xpNext - run.xp);
        },
        target: () => this.s.levelTokens.find((k) => !k.dead && k.landed),
        done: () => this.s.run.xpLevel >= 2 && !this.s.levelTokens.some((k) => !k.dead) && this.s.mode === 'play',
      },
      {
        title: '技能宝箱',
        text: '金色宝箱是技能宝箱：靠近按 F 打开，从法术、加成和伙伴里挑一张。',
        touch: '金色宝箱是技能宝箱：靠近点「交互」打开，从法术、加成和伙伴里挑一张。',
        enter: () => (this.skillChest = this.drop(false)),
        target: () => (this.skillChest?.dead ? undefined : this.skillChest),
        done: () => !!this.skillChest?.dead && this.s.mode === 'play',
      },
      {
        title: '武器箱',
        text: '钢色宝箱是武器箱：按 F 打开，武器浮起来后再按 F 拾取。最多带两把武器。',
        touch: '钢色宝箱是武器箱：点「交互」打开，武器浮起来后再点一次拾取。最多带两把武器。',
        enter: () => {
          if (this.s.run.weapons.length < 2) this.weaponChest = this.drop(true);
        },
        target: () => this.s.pickups.find((p) => !p.dead && (p === this.weaponChest || (p.kind === 'weapon' && p.chest))),
        done: () => this.s.run.weapons.length >= 2 && this.s.mode === 'play',
      },
      {
        title: '换枪',
        text: '按 Q 或滚动鼠标滚轮换枪。弹匣打空会自动换弹，R 可以提前换。',
        touch: '点「换枪」按钮换枪。弹匣打空会自动换弹，「换弹」可以提前换。',
        enter: () => (this.swapped = false),
        done: () => this.swapped,
      },
      {
        title: '双持',
        text: '按 E 或右键双持：两把武器一起开火 4 秒，之后冷却 14 秒。留给精英和 Boss。',
        touch: '点「双持」按钮：两把武器一起开火 4 秒，之后冷却 14 秒。留给精英和 Boss。',
        done: () => this.dual,
      },
      {
        title: '去下一层',
        text: '右上角是小地图：白点是你，红点是 Boss，黄点是宝物房。打倒每层深处的 Boss，走进地洞去下一层。',
        done: () => this.shownFor > 5,
      },
    ];
    ui.coach(this.card);
    this.held = s.run.held;
    this.show(0);
  }

  /** Called by the scene every frame, whatever its mode. */
  update(dt: number) {
    if (this.finished) return;
    const s = this.s;
    this.clock += dt;
    if (s.mode === 'play') {
      this.track();
      this.shownFor += dt;
      this.fightFor = s.active ? this.fightFor + dt : 0;
    }
    const step = this.steps[this.index];
    this.render();
    if (this.doneFor < 0 && this.shownFor > 1.6 && step.done()) {
      this.doneFor = 0;
      audio.select();
      this.render();
    } else if (this.doneFor >= 0) {
      this.doneFor += dt;
      if (this.doneFor > 0.7) {
        if (this.index < this.steps.length - 1) this.show(this.index + 1);
        else this.finish(true);
        return;
      }
    }
    this.point(step, dt);
  }

  private track() {
    const s = this.s;
    const p = s.player;
    if (this.last) this.walked += Math.min(20, Math.hypot(p.x - this.last.x, p.y - this.last.y));
    this.last = { x: p.x, y: p.y };
    for (const proj of s.pproj) {
      if (this.seen.has(proj)) continue;
      this.seen.add(proj);
      this.shots++;
    }
    if (p.dashT > 0) this.dashed = true;
    if (p.skillT > 0) this.dual = true;
    if (s.run.held !== this.held) this.swapped = true;
    this.held = s.run.held;
  }

  private show(index: number) {
    this.index = index;
    this.shownFor = 0;
    this.doneFor = -1;
    this.cardKey = '';
    this.steps[index].enter?.();
    this.render();
  }

  /** Redraw the card only when what it says has changed. */
  private render() {
    const step = this.steps[this.index];
    const touch = this.s.usesTouchControls();
    const text = this.s.active && step.fighting ? step.fighting : touch && step.touch ? step.touch : step.text;
    const done = this.doneFor >= 0;
    const folded = this.fightFor > 4 && !done;
    const key = `${this.index}|${text}|${done}|${folded}`;
    if (key === this.cardKey) return;
    this.cardKey = key;
    this.card.classList.toggle('done', done);
    this.card.classList.toggle('folded', folded);
    this.card.innerHTML = `
      <div class="coach-head"><span class="tagred">${px('TUTORIAL', E.white, { small: true, outline: false })}</span>${px(`${this.index + 1}/${this.steps.length}`, E.greyM, { small: true })}<button type="button" class="coach-skip">${px('跳过', E.greyM)}</button></div>
      <div class="coach-title">${px(step.title, done ? E.green : E.yellow)}${done ? px('✓', E.green) : ''}</div>
      ${pxBlock(text, E.white, 140)}`;
    this.card.querySelector('.coach-skip')!.addEventListener('click', () => {
      if (this.s.mode === 'play') this.finish(false);
    });
  }

  /** The nearest room with a fight still in it, by straight distance; the arrow finds the way there. */
  private nextFight() {
    const { player: p, dungeon } = this.s;
    let best: DRoom | undefined;
    let bestD = Infinity;
    for (const r of dungeon.rooms) {
      if (r.cleared || (r.type !== 'combat' && r.type !== 'horde')) continue;
      const [x, y] = roomCenter(r);
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < bestD) [best, bestD] = [r, d];
    }
    if (!best || roomAt(dungeon, p.x, p.y, 1) === best) return undefined;
    const [x, y] = roomCenter(best);
    return { x, y };
  }

  /** A reward of the lesson's own, set down beside the knight. */
  private drop(weapon: boolean) {
    const p = this.s.player;
    const before = this.s.pickups.length;
    this.s.dropChest(p.x + (weapon ? -26 : 26), p.y + 6, weapon);
    this.s.fx.ring(p.x + (weapon ? -26 : 26), p.y, 26, weapon ? E.cyan : E.yellow, 300, 2);
    return this.s.pickups[before];
  }

  /**
   * A yellow chevron circling the knight shows the way to the target, around walls: the walk is traced
   * back from the target along the enemies' flow field. A second chevron bobs over the target itself.
   */
  private point(step: Step, dt: number) {
    const s = this.s;
    const target = s.mode === 'play' ? step.target?.() : undefined;
    this.arrow.clear();
    this.marker.clear();
    if (!target) return;
    const p = s.player;
    const far = Math.hypot(target.x - p.x, target.y - p.y);
    this.routeT -= dt;
    if (this.routeT <= 0) {
      this.routeT = 0.12;
      this.route = this.routeAngle(target.x, target.y);
    }
    const bob = Math.round(Math.sin(this.clock * 6) * 1.5);
    const ink = hexToNum(E.ink);
    const gold = hexToNum(E.yellow);
    if (far > 34) {
      // Snapped to sixteen headings so the chevron does not shimmer while the route settles.
      const a = Math.round(this.route / (TAU / 16)) * (TAU / 16);
      const r = 20 + bob;
      this.arrow.setPosition(Math.round(p.x + Math.cos(a) * r), Math.round(p.y - 6 + Math.sin(a) * r)).setRotation(a);
      this.arrow.fillStyle(ink, 1).fillTriangle(6, 0, -4, -6, -4, 6);
      this.arrow.fillStyle(gold, 1).fillTriangle(4, 0, -3, -4, -3, 4);
    }
    const cam = s.cameras.main.worldView;
    if (far > 24 && cam.contains(target.x, target.y)) {
      const x = Math.round(target.x);
      const y = Math.round(target.y - 22 + bob);
      this.marker.fillStyle(ink, 1).fillTriangle(x - 6, y - 5, x + 6, y - 5, x, y + 3);
      this.marker.fillStyle(gold, 1).fillTriangle(x - 4, y - 4, x + 4, y - 4, x, y + 1);
    }
  }

  private routeAngle(x: number, y: number) {
    const s = this.s;
    const p = s.player;
    let cx = x;
    let cy = y;
    for (let i = 0; i < 160 && Math.hypot(cx - p.x, cy - p.y) > 3 * T; i++) {
      const a = s.flow.heading(cx, cy);
      if (a === undefined) break;
      cx += Math.cos(a) * T * 0.75;
      cy += Math.sin(a) * T * 0.75;
    }
    return Math.atan2(cy - (p.y - 6), cx - p.x);
  }

  /** The knight would have fallen: in the tutorial it is caught and healed instead. */
  spare() {
    const run = this.s.run;
    const p = this.s.player;
    run.hp = run.mods.maxHp;
    p.iframes = Math.max(p.iframes, 2);
    this.s.fx.ring(p.x, p.y - 6, 40, E.green, 500, 2);
    ui.toast('教程里不会倒下，生命已回满', 2600);
    return true;
  }

  /** The closing page: what was learned, then a real run or the hall. Skipping ends here too. */
  private finish(completed: boolean) {
    if (this.finished) return;
    this.finished = true;
    setTutorialStatus(completed ? 'done' : 'skipped');
    this.arrow.clear();
    this.marker.clear();
    this.card.remove();
    const s = this.s;
    s.mode = 'choose';
    const touch = s.usesTouchControls();
    const keys: [string, string][] = touch
      ? [['左摇杆', '移动'], ['右摇杆', '瞄准并射击'], ['冲刺', '冲刺途中无敌'], ['交互', '开箱、拾取、升级'], ['换枪 / 换弹', '最多两把'], ['双持', '两把一起开火']]
      : [['WASD', '移动'], ['鼠标左键', '瞄准并射击'], ['空格 / Shift', '冲刺，途中无敌'], ['F', '开箱、拾取、升级'], ['Q / 滚轮', '换枪，R 换弹'], ['E / 右键', '双持'], ['Esc', '暂停']];
    const ov = el('div', 'overlay coach-end');
    ov.innerHTML = `<div class="box panel">
      <div class="head"><span class="tagred">${px('TUTORIAL', E.white, { small: true, outline: false })}</span>${px(completed ? '教程完成' : '已跳过教程', E.yellow, { scale: 2 })}</div>
      ${pxBlock(completed ? '你已经会走、会射、会开箱了。接下来五层地牢，每层一种画风。' : '随时可以在「设置 → 新手教程」里重新开始。', E.grey, 300)}
      <div class="coach-keys">${keys.map(([k, v]) => `<div class="ck">${px(k, E.yellow)}${px(v, E.white)}</div>`).join('')}</div>
      ${pxBlock('拿近战武器时，踩着底部节拍条出招更强。更多见「游戏说明」。', E.greyM, 300)}
      <div class="menu"></div>
    </div>`;
    const rows = [menuRow('开始正式冒险'), menuRow('回到画廊')];
    ov.querySelector('.menu')!.append(...rows);
    let left = false;
    const nav = new MenuNav(rows, (i) => {
      if (left) return;
      left = true;
      audio.select();
      ui.close(layer);
      s.leaveTutorial(i === 0);
    });
    const layer = ui.push(ov, (e) => nav.key(e));
  }

  /** Remove everything the coach put in the world and the HUD. Leaving half way counts as skipping. */
  dispose() {
    if (!this.finished) setTutorialStatus('skipped');
    this.finished = true;
    this.card.remove();
    this.arrow.destroy();
    this.marker.destroy();
  }
}
