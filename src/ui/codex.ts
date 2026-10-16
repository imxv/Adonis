import type Phaser from 'phaser';
import { TAG_NAMES } from '../core/stats';
import { ENEMIES, PETS, PET_ORDER, type EnemyKind } from '../data/enemies';
import { ELEMENT_COLOR, ELEMENT_NAME } from '../game/entities';
import type { Element } from '../core/stats';
import { FUSE_LEVEL, FUSION_ORDER, MAX_SPELL_LEVEL, SPELLS, SPELL_ORDER, fusionOf } from '../data/spells';
import { RARITY_INFO, UPGRADES, UPGRADE_BY_ID } from '../data/upgrades';
import { STAT_MEANING, WEAPONS, WEAPON_ORDER, type Delivery } from '../data/weapons';
import { FLOOR, T, WALL, type Dungeon } from '../game/dungeon';
import { BIOMES, SCALES, type Biome } from '../pixel/biomes';
import { Grid } from '../pixel/draw';
import { E } from '../pixel/palette';
import { K, buildKitTextures, buildLevel } from '../styles/textures';
import { themeProps } from '../pixel/themeProps';
import { DECO_NAMES } from '../pixel/decor';

/** A picture for the codex: a data URL with its pixel size. */
export interface Pic {
  src: string;
  w: number;
  h: number;
}

export interface CodexEntry {
  id: string;
  name: string;
  /** Grid icon: a picture, or a single glyph for upgrades. */
  icon: Pic | { glyph: string; color: string };
  /** Detail art; defaults to the icon, enlarged. */
  art?: Pic;
  tag?: string;
  tagColor?: string;
  desc: string;
  stats?: [string, string][];
  sections?: { title: string; lines: string[] }[];
  gallery?: { title: string; pics: Pic[] };
}

export interface CodexTab {
  id: string;
  name: string;
  entries: CodexEntry[];
}

const KIND_NAME: Record<Delivery, string> = {
  bolt: '单发',
  spread: '散射',
  beam: '光束',
  mortar: '抛射',
  rocket: '火箭',
  boomerang: '回旋',
  chain: '链电',
  flame: '喷火',
  slash: '近战斩击',
};

const ENEMY_NOTES: Record<EnemyKind, string> = {
  wanderer: '慢慢朝你蠕动过来，单只很弱，但数量多，是尸潮的主力。',
  bat: '飞得快、走位飘忽；尸潮里会成群从一侧横扫过来。飞在空中，地刺扎不到它。',
  charger: '靠近后停下蓄力，地上出现一条红线，随后沿直线猛冲。冲完会喘一会儿，是反击的好时机。',
  shooter: '和你保持距离、绕着走位，停下来瞄准后发射魔弹。精英会一次射出五发。',
  bomber: '直冲过来，贴身后点燃引信爆炸。爆炸会伤到你，也会炸到附近的怪物。',
  shield: '举盾正对着你，正面打来的子弹会被挡掉。绕到侧面打，或者用光束、电磁枪、爆炸、冰冻对付它。',
  brute: '第三层起出现的大块头，又慢又厚。贴近你时会在拍点上举起棒子，地上亮出红圈，下一拍砸下来，赶紧离开红圈。',
  sporeling: '森林遗迹的蘑菇人。慢吞吞地走，死的时候会炸出一圈孢子弹，别贴着它打死。',
  yeti: '冰封雪原的雪怪。皮糙肉厚，踩着拍子扔出大雪球。',
  scorpion: '黄沙神殿的沙蝎。爬得飞快，贴近后在拍点上扑过来，再喷出三根毒刺。',
  magma: '熔岩深渊的熔岩史莱姆。打死后会裂成两只小的。',
  turret: '蒸汽工坊的炮台，钉在地上不动，每隔两拍朝四周喷一圈子弹。层数越深子弹越多。',
  ghost: '幽魂古堡的幽灵。穿墙飘过来，时不时变透明，透明时打不到它。',
  ninja: '东方庭院的忍者。踩着拍子瞬移到你身边，下一拍扔出三枚手里剑。',
  angel: '文艺复兴宫殿的天使石像。你看着它时它一动不动、只受一半伤害；一转开视线它就飞快扑过来。',
  jelly: '深海遗迹的电水母。慢慢漂过来，贴近后积蓄电流，下一拍放出电圈。',
  drone: '霓虹都市的无人机。飞在空中无视墙壁，保持距离绕着你飞，踩拍打出两连发。',
};

const FLOOR_NAME: Record<Biome['px']['floor'], string> = { grass: '草地', ice: '冰面', sand: '沙地', lava: '熔岩裂隙', metal: '铁板', checker: '棋盘地砖', paper: '宣纸地板', marble: '大理石' };
const WALL_NAME: Record<Biome['px']['wall'], string> = { brick: '石砖', ice: '冰墙', sandstone: '砂岩', rock: '岩壁', brass: '黄铜', gothic: '哥特石墙', wood: '朱漆木墙', marble: '大理石' };
const SCALE_NAME: Record<keyof typeof SCALES, string> = {
  dorian: '多利亚调式',
  phrygian: '弗里几亚调式',
  aeolian: '自然小调',
  harmonicMinor: '和声小调',
  majorPenta: '大调五声音阶',
  minorPenta: '小调五声音阶',
  gong: '宫调式',
  miyakobushi: '都节音阶',
  lydian: '利底亚调式',
  mixolydian: '混合利底亚调式',
  wholeTone: '全音音阶',
};
const LEAD_NAME: Record<Biome['audio']['lead'], string> = { pluck: '拨弦', bell: '钟琴', marimba: '马林巴', glass: '玻璃琴' };

const FLOOR_NO = ['一', '二', '三', '四', '五'];

/** Build every codex page from the game's own data tables and generated art. */
export function buildCodex(scene: Phaser.Scene): CodexTab[] {
  for (const kit of BIOMES) buildKitTextures(scene, kit);
  const forest = BIOMES[0];

  const canvases = new Map<string, HTMLCanvasElement>();
  const canvasOf = (key: string) => {
    let c = canvases.get(key);
    if (!c) {
      c = scene.textures.get(key).getSourceImage() as HTMLCanvasElement;
      canvases.set(key, c);
    }
    return c;
  };
  const pic = (c: HTMLCanvasElement): Pic => ({ src: c.toDataURL(), w: c.width, h: c.height });
  const tex = (key: string) => pic(canvasOf(key));
  // Big sprites are halved (nearest neighbour) so they fit a grid cell.
  const half = (key: string): Pic => {
    const src = canvasOf(key);
    const c = document.createElement('canvas');
    c.width = Math.ceil(src.width / 2);
    c.height = Math.ceil(src.height / 2);
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, c.width, c.height);
    return pic(c);
  };
  const across = (key: (k: Biome) => string) => BIOMES.map((k) => tex(key(k)));

  // ---------------------------------------------------------------- weapons
  const weapons: CodexEntry[] = WEAPON_ORDER.map((id) => {
    const w = WEAPONS[id];
    const m = STAT_MEANING[w.kind];
    const damage =
      w.kind === 'spread' ? `${w.damage} × ${w.count} 颗` : w.kind === 'flame' ? `${w.damage} × 每团火焰` : w.kind === 'chain' ? `${w.damage}，连跳 ${w.count} 次` : w.kind === 'mortar' || w.kind === 'rocket' ? `${w.damage}（范围爆炸）` : `${w.damage}`;
    const pierce =
      w.kind === 'beam' || w.kind === 'flame' || w.kind === 'boomerang' ? '穿透全部' : w.kind === 'slash' ? '扇形内全部' : w.kind === 'chain' ? '在敌人间跳跃' : w.kind === 'mortar' || w.kind === 'rocket' ? '范围伤害' : w.pierce > 0 ? `${w.pierce} 个敌人` : '无';
    const stats: [string, string][] = [
      ['伤害', damage],
      ['射速', `${(1 / w.cooldown).toFixed(1)} 次/秒`],
      ['射程', `${Math.max(1, Math.round(w.range / T))} 格`],
      ['穿透', pierce],
    ];
    stats.push(['弹匣', w.mag ? `${w.mag} 发，换弹 ${w.reload} 秒` : w.kind === 'slash' ? '近战，无需换弹' : w.kind === 'boomerang' ? '飞轮回收，无需换弹' : '能量武器，无需换弹']);
    if (w.element === 'fire') stats.push(['元素', '火，命中点燃']);
    return {
      id,
      name: w.name,
      icon: tex(`gun-${id}`),
      tag: id === 'pistol' ? `${KIND_NAME[w.kind]} · 起始武器` : KIND_NAME[w.kind],
      tagColor: E.cyan,
      desc: `${w.desc}。`,
      stats,
      sections: [{ title: '通用加成在它身上的效果', lines: [`数量 +1：${m.count}`, `范围变大：${m.area}`, `穿透 +1：${m.pierce}`] }],
    };
  });

  // ---------------------------------------------------------------- spells, then the fusions they make
  const spells: CodexEntry[] = SPELL_ORDER.map((id) => {
    const s = SPELLS[id];
    const key = s.evolveWith ? UPGRADE_BY_ID[s.evolveWith] : undefined;
    const f = fusionOf(id);
    const sections: { title: string; lines: string[] }[] = [{ title: '升级', lines: s.levels.map((l, i) => `Lv${i + 2}　${l}`) }];
    if (s.evolved && key) sections.push({ title: `进化：${s.evolved.name}`, lines: [s.evolved.desc, `条件：升到 ${MAX_SPELL_LEVEL} 级，并拿到加成「${key.name}」，之后升级或开宝箱时出现进化。`] });
    if (f) sections.push({ title: `融合：${SPELLS[f.fusion].name}`, lines: [`和「${SPELLS[f.partner].name}」都升到 ${FUSE_LEVEL} 级时自动融合，空出一个法术栏。`] });
    return {
      id,
      name: s.name,
      icon: tex(`spell-${id}`),
      tag: '自动施放',
      tagColor: E.yellow,
      desc: `${s.desc}。升级时可以选到它，最多同时带 4 个法术。`,
      sections,
    };
  });
  for (const id of FUSION_ORDER) {
    const s = SPELLS[id];
    const [a, b] = s.fusion!;
    spells.push({
      id,
      name: s.name,
      icon: tex(`spell-${id}`),
      tag: '融合法术',
      tagColor: E.magenta,
      desc: `${s.desc}。`,
      sections: [
        { title: '配方', lines: [`「${SPELLS[a].name}」+「${SPELLS[b].name}」，两者都到 ${FUSE_LEVEL} 级时自动融合。`, '融合后不再升级，但威力远超两者之和，还会空出一个法术栏。'] },
      ],
      gallery: { title: '由这两个法术融合', pics: [tex(`spell-${a}`), tex(`spell-${b}`)] },
    });
  }

  // ---------------------------------------------------------------- upgrades
  const upgrades: CodexEntry[] = UPGRADES.map((u) => {
    const r = RARITY_INFO[u.rarity];
    const evolves = SPELL_ORDER.map((id) => SPELLS[id]).filter((s) => s.evolveWith === u.id && s.evolved);
    return {
      id: u.id,
      name: u.name,
      icon: tex(`upg-${u.id}`),
      tag: r.name,
      tagColor: r.color,
      desc: `${u.desc}。`,
      stats: [
        ['最多叠加', `${u.max} 层`],
        ['流派', u.tags.map((t) => TAG_NAMES[t]).join('、')],
      ],
      sections: evolves.length ? [{ title: '进化钥匙', lines: evolves.map((s) => `法术「${s.name}」满级后，有它就能进化成「${s.evolved!.name}」。`) }] : undefined,
    };
  });

  // ---------------------------------------------------------------- pets
  const pets: CodexEntry[] = PET_ORDER.map((kind) => ({
    id: kind,
    name: PETS[kind].name,
    icon: tex(`pet-${kind}`),
    tag: PETS[kind].role,
    tagColor: E.pink,
    desc: `${PETS[kind].desc}。`,
    stats: [['获得', '升级招募 / 宝物房'], ['队伍', '每种一只，最多九只']],
    sections: [
      { title: '成长', lines: ['默认继承 50% 伤害加成与元素概率；「羁绊」提高继承，「群猎」加快出招。', '「驯兽术」「野性本能」「回响追击」强化输出；「兽灵领域」扩大攻击范围。'] },
      { title: '宠物流派', lines: ['「同心协力」随伙伴数量提升全队宠物伤害，「兽群守护」提供格挡几率。', '拥有至少三只伙伴后，可遇到传说加成「万兽之王」。宠物不会受伤，非战斗时只跟随。'] },
    ],
    gallery: { title: '待机 · 行走 · 出招', pics: ['idle-0', 'walk-1', 'walk-3', 'attack-0', 'attack-1', 'attack-2'].map((frame) => tex(`pet-${kind}-${frame}`)) },
  }));

  // ---------------------------------------------------------------- monsters
  const speedWord = (v: number) => (v < 30 ? '慢' : v < 45 ? '中等' : v < 60 ? '快' : '很快');
  const monsters: CodexEntry[] = (Object.keys(ENEMIES) as EnemyKind[]).map((kind) => {
    const d = ENEMIES[kind];
    return {
      id: kind,
      name: d.name,
      icon: tex(K(`en-${kind}-a`, d.biome ? (BIOMES.find((b) => b.id === d.biome) ?? forest) : forest)),
      tag: d.biome ? `${BIOMES.find((b) => b.id === d.biome)?.name ?? ''}专属` : d.minLevel === 0 ? '第一层起' : `第${FLOOR_NO[d.minLevel]}层起`,
      tagColor: d.biome ? E.yellow : E.grey,
      desc: ENEMY_NOTES[kind],
      stats: [
        ['生命', `${d.hp}（越深越厚）`],
        ['速度', speedWord(d.speed)],
        ['接触伤害', `${d.contact}`],
      ],
      gallery: d.biome ? undefined : { title: '各画风下的样子', pics: across((k) => K(`en-${kind}-a`, k)) },
    };
  });
  monsters.push({
    id: 'elite',
    name: '精英怪',
    icon: pic(eliteIcon(canvasOf(K('en-shield-a', forest)))),
    tag: '随机出现',
    tagColor: E.hot,
    desc: '体型更大，脚下有红色光圈，生命是普通怪的 5 倍。打倒后必掉一个宝箱和一颗心。每个精英都带一个词缀：',
    sections: [{ title: '词缀', lines: ['迅捷：移动速度 +40%', '坚韧：生命 +40%，受到的伤害 -20%', '分裂：死后分裂成两只小怪', '弹幕：死后向四周射出一圈子弹'] }],
  });

  // ---------------------------------------------------------------- bosses
  const bosses: CodexEntry[] = [
    {
      id: 'guardian',
      name: '守卫',
      icon: half(K('boss-guardian', forest)),
      art: tex(K('boss-guardian', forest)),
      tag: '第一至四层 Boss',
      tagColor: E.hot,
      desc: '每种画风的守门者，名字和模样随画风变化。它悬浮在空中，柱子挡不住它，但挡得住它的光臂。',
      sections: [
        { title: '招式', lines: ['环形弹幕：连放三圈旋转的子弹环', '扇形射击：瞄准你连射三组', '旋转光臂：先闪烁预警再扫过全场，躲到柱子后面', '召唤：叫来几只小怪'] },
        { title: '第二阶段', lines: ['生命低于 55% 时进入：贴着你走位，加入黄金角螺旋弹幕，光臂更多更快。'] },
        { title: '各画风的守卫', lines: [BIOMES.map((k) => `${k.name}：${k.bossNames.guardian}`).join('；')] },
      ],
      gallery: { title: '各画风下的样子', pics: across((k) => K('boss-guardian', k)) },
    },
    {
      id: 'boar',
      name: '宿敌野猪',
      icon: half('boss-boar'),
      art: tex('boss-boar'),
      tag: '第五层 Boss',
      tagColor: E.hot,
      desc: '那头撞死阿多尼斯的野猪。每一次轮回，它都在最深处等着。',
      sections: [
        { title: '招式', lines: ['冲撞：地上出现红线后直线猛冲；撞到墙或柱子会眩晕，这时它受到的伤害 +35%', '践踏：跳起后砸向你的位置，落地前有圆形预警', '扇形弹：朝你喷出一扇子弹', '召唤：叫来四只小野猪'] },
        { title: '第二阶段：怒', lines: ['生命低于一半时暴怒：冲撞会在墙上反弹两次，撞墙和落地都会溅出一圈子弹。'] },
        { title: '各画风的野猪', lines: [BIOMES.map((k) => `${k.name}：${k.bossNames.boar}`).join('；')] },
      ],
    },
  ];

  // ---------------------------------------------------------------- maps: art styles and room types
  const scaleName = (k: Biome) => {
    const hit = (Object.keys(SCALES) as (keyof typeof SCALES)[]).find((n) => SCALES[n] === k.audio.scale || SCALES[n].join() === k.audio.scale.join());
    return hit ? SCALE_NAME[hit] : '';
  };
  const maps: CodexEntry[] = BIOMES.map((kit) => ({
    id: kit.id,
    name: kit.name,
    icon: tex(K('pillar', kit)),
    art: pic(postcard(scene, kit, canvasOf)),
    tag: kit.en,
    tagColor: E.grey,
    desc: `「${kit.subtitle}」每局从十种画风里不重复地抽五种，一层一种。`,
    stats: [
      ['守卫', kit.bossNames.guardian],
      ['野猪', kit.bossNames.boar],
      ['地面与墙', `${FLOOR_NAME[kit.px.floor]}、${WALL_NAME[kit.px.wall]}`],
      ['音乐', `${scaleName(kit)}，${LEAD_NAME[kit.audio.lead]}`],
    ],
  }));
  const rooms: [string, string, string, string, string][] = [
    ['start', '起点', '每层从这里出发，没有敌人。第一层的地上写着操作提示。', E.greyM, E.white],
    ['combat', '战斗房', '走进门两格后铁栅门会关上，打完两三波敌人才打开。房间有矩形、切角、十字、L 形、柱厅、回廊几种形状，里面有掩体，越深的层越常见机关。清完有概率掉宝箱、武器箱或生命。', E.slate, E.red],
    ['horde', '尸潮房', '每层一个。坚持 20 到 28 秒，敌人源源不断，还会有蝙蝠群横扫和史莱姆包围圈。撑到最后必掉一个宝箱和一个武器箱。', E.purple, E.magenta],
    ['treasure', '宝物房', '藏在死胡同里。三个台子上各放一件宝物，通常有新武器、新法术和宠物，靠近按 F 领取。只能拿一件，拿走后其余的会碎掉。', E.slate, E.yellow],
    ['boss', 'Boss 房', '每层最深处的死胡同，四根掩体柱可以挡子弹。打倒 Boss 后出现通往下一层的地洞。', E.redD, E.hot],
  ];
  for (const [id, name, desc, floor, mark] of rooms) maps.push({ id: `room-${id}`, name, icon: pic(roomIcon(floor, mark)), tag: '房间', tagColor: E.grey, desc });

  // ---------------------------------------------------------------- traps and pickups
  const things: CodexEntry[] = [
    { id: 'spikes', name: '地刺', icon: tex('spikes-up'), tag: '机关', tagColor: E.hot, desc: '战斗时周期性弹起：先冒出尖头预警，约半秒后整片弹起。扎到掉 1 点生命，也会扎伤地上的敌人。清完房间就收起。' },
    { id: 'saw', name: '锯片', icon: tex('saw'), tag: '机关', tagColor: E.hot, desc: '沿地上的滑槽来回移动，碰到掉 1 点生命；怪物碰到也会受伤并被弹开，可以引怪过去。只在战斗时运转。' },
    { id: 'barrel', name: '爆炸物', icon: tex(K('prop-barrel', forest)), tag: '道具', tagColor: E.orange, desc: `打几下就会爆炸，范围伤害很高，还会带上元素：${BIOMES.map((k) => themeProps(k.id).names[1]).join('、')}。能用来清怪，也会炸到你自己。`, gallery: { title: '各画风的爆炸物', pics: across((k) => K('prop-barrel', k)) } },
    { id: 'crate', name: '可破坏道具', icon: tex(K('prop-crate', forest)), tag: '道具', tagColor: E.tan, desc: `每种画风各不相同：${BIOMES.map((k) => themeProps(k.id).names[0]).join('、')}。任何攻击都能打碎，有时掉出生命或宝石。`, gallery: { title: '各画风的可破坏道具', pics: across((k) => K('prop-crate', k)) } },
    {
      id: 'props',
      name: '画风装饰',
      icon: tex(K('pillar', forest)),
      tag: '障碍',
      tagColor: E.grey,
      desc: '十种画风各有六种场景摆件，成对靠墙摆放：冰封石门、沙漠遗物、蒸汽机械、庭院竹簇等各有特色。打不坏，会挡路也会挡子弹，怪物会绕开走。部分摆件会发光。地面的冰纹、沙丘、铺装、落花与小碎片只是装饰，不会挡路。',
      gallery: { title: '各画风的装饰', pics: BIOMES.flatMap((k) => DECO_NAMES[k.id].map((_, i) => tex(K(`deco-${i}`, k)))) },
    },
    { id: 'chest', name: '技能/强化箱', icon: tex('chest'), tag: '奖励', tagColor: E.yellow, desc: '靠近按 F 打开，直接给一件奖励：法术升级、稀有加成，满足条件时是法术进化。' },
    { id: 'chest-w', name: '武器箱', icon: tex('chest-w'), tag: '奖励', tagColor: E.cyan, desc: '钢制的箱子，按 F 只开出一把武器，升起后悬浮在箱子上，再按 F 拾取。非战斗时靠近可观看当前角色攻击假人的演示和武器指标。已带两把时可任选一把替换；取消会保留箱上武器，旧武器保留等级与弹药落地。清房、尸潮房和守卫都可能掉落。' },
    { id: 'level-token', name: '升级水晶', icon: tex('lvl-token'), tag: '成长', tagColor: E.yellow, desc: '升级时落在身边，名称旁标明等级；靠近按 F 打开成长选项，自己选择升级时机。留在地上的升级水晶会跟随你进入下一层。' },
    { id: 'crystal', name: '元素护盾水晶', icon: tex('crystal'), tag: '掉落', tagColor: E.yellow, desc: '元素结晶反应形成，靠近按 F 拾取可回复 1 格护甲。不会自动吸取，地上会标明所属元素。' },
    { id: 'gems', name: '经验宝石', icon: tex('gem-2'), tag: '掉落', tagColor: E.cyan, desc: '击杀掉落，蓝色 1 点、绿色 2 点、红色 5 点经验。清完房间会自动飞向你。', gallery: { title: '三种宝石', pics: ['gem-1', 'gem-2', 'gem-3'].map(tex) } },
    { id: 'heart', name: '生命', icon: tex('heart'), tag: '掉落', tagColor: E.red, desc: '回复 1 点生命。精英怪必掉，木箱和清房偶尔掉。护甲会在 2 秒不受伤后自动回复。' },
    { id: 'trapdoor', name: '地洞', icon: half('trapdoor'), art: tex('trapdoor'), tag: '出口', tagColor: E.grey, desc: '打倒 Boss 后出现，走进去前往下一层。最后一层出现的是一朵银莲花，走上去结束这次轮回。' },
    { id: 'bloom', name: '银莲花', icon: tex('bloom'), tag: '传说', tagColor: E.red, desc: '阿多尼斯的血开出的花。打倒第五层的野猪后，它会在最深处盛开，走上去就能结束这一次轮回。' },
  ];

  return [
    { id: 'weapons', name: '武器', entries: weapons },
    { id: 'spells', name: '法术', entries: spells },
    { id: 'upgrades', name: '加成', entries: upgrades },
    { id: 'pets', name: '宠物', entries: pets },
    { id: 'monsters', name: '怪物', entries: monsters },
    { id: 'bosses', name: 'Boss', entries: bosses },
    { id: 'maps', name: '地图', entries: maps },
    { id: 'things', name: '机关', entries: things },
    { id: 'elements', name: '元素', entries: elementEntries(tex) },
  ];
}

/** A little scene for each art style: its wall, floor, torches, prop and two locals, with the knight. */
function postcard(scene: Phaser.Scene, kit: Biome, canvasOf: (key: string) => HTMLCanvasElement): HTMLCanvasElement {
  const w = 9;
  const h = 6;
  const tiles = new Uint8Array(w * h).fill(FLOOR);
  for (let x = 0; x < w; x++) tiles[x] = tiles[w + x] = WALL;
  const room = {
    id: 'postcard', gx: 0, gy: 0, depth: 0, type: 'start', seed: 7,
    doors: { up: false, down: false, left: false, right: false }, cleared: true, visited: true, seen: true,
    x0: 0, y0: 2, x1: w, y1: h, shape: 'rect', gates: [], props: [], traps: [], decor: [],
  };
  const fake = { w, h, tiles, blocked: new Set<number>(), rooms: [room], byId: new Map(), start: room, boss: room,
    torches: [[2 * T + 8, T + 4], [7 * T + 8, T + 4]] } as unknown as Dungeon;
  const base = canvasOf(buildLevel(scene, kit, fake, 7, `codex-level@${kit.id}`));
  const c = document.createElement('canvas');
  c.width = base.width;
  c.height = base.height;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(base, 0, 0);
  // Sprites stand on their feet: anchor at bottom centre, drawn back to front.
  const put = (key: string, x: number, y: number) => {
    const s = canvasOf(key);
    ctx.drawImage(s, Math.round(x - s.width / 2), Math.round(y - s.height));
  };
  put(K('pillar', kit), 1.5 * T, 4.4 * T);
  put(K('en-bat-a', kit), 6.6 * T, 3.4 * T);
  put('knight-a', 4.0 * T, 5.1 * T);
  put(K('en-wanderer-a', kit), 6.1 * T, 5.4 * T);
  put(K('prop-crate', kit), 8.1 * T, 5.8 * T);
  return c;
}

/** The minimap's look for a room type: a box with doors and a coloured mark. */
function roomIcon(floor: string, mark: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 20;
  c.height = 16;
  const ctx = c.getContext('2d')!;
  const P = (x: number, y: number, w: number, h: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
  };
  P(1, 1, 18, 14, E.ink);
  P(2, 2, 16, 12, E.slateD);
  P(3, 4, 14, 9, floor);
  P(3, 3, 14, 1, E.slate);
  for (const [x, y, w, h] of [
    [8, 1, 4, 3],
    [8, 13, 4, 2],
    [1, 7, 2, 3],
    [17, 7, 2, 3],
  ]) P(x, y, w, h, floor);
  P(8, 6, 4, 4, E.ink);
  P(9, 7, 2, 2, mark);
  P(8, 6, 4, 1, mark);
  return c;
}

/** An elite: the sprite standing in its red ring. */
function eliteIcon(sprite: HTMLCanvasElement): HTMLCanvasElement {
  const g = new Grid(20, 22);
  g.ellipse(9.5, 18, 8.5, 2.6, 'r').ellipse(9.5, 18, 6.5, 1.4, '.');
  const ring = g.render({ outline: false, margin: 0 });
  const ctx = ring.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite, Math.round(10 - sprite.width / 2), Math.round(19 - sprite.height));
  return ring;
}


// ---------------------------------------------------------------- elements (Genshin's rules)

const EL_INFO: [Element, string, string][] = [
  ['fire', '火元素', '喷火器、陨石、余烬、加成「火种」。蒸发（遇水，×1.5）、融化（遇冰，×2）、超载（遇雷）、燃烧（遇草）。'],
  ['water', '水元素', '潮汐枪、加成「潮涌」。蒸发（遇火，×2）、感电（遇雷）、冻结（遇冰）、绽放（遇草）。'],
  ['shock', '雷元素', '电磁枪、天罚雷击、电弧、加成「雷鸣」。超载（遇火）、超导（遇冰）、感电（遇水）、原激化（遇草）。'],
  ['ice', '冰元素', '冰锥枪、冰霜新星、加成「霜结」。融化（遇火，×1.5）、超导（遇雷）、冻结（遇水）。'],
  ['wind', '风元素', '风之扇、黑洞、加成「疾风」。不会附着，打在带火、水、雷、冰的敌人身上会扩散。'],
  ['rock', '岩元素', '岩晶炮、加成「磐石」。不会附着，打在带火、水、雷、冰的敌人身上会结晶；也能砸碎冻结的敌人。'],
  ['grass', '草元素', '藤种枪、毒雾、瘟疫领域、加成「萌芽」。燃烧（遇火）、绽放（遇水）、原激化（遇雷）。'],
];

const REACTIONS: [string, Element, Element, string][] = [
  ['蒸发', 'water', 'fire', '水打火：这一下伤害 ×2；火打水：×1.5。'],
  ['融化', 'fire', 'ice', '火打冰：这一下伤害 ×2；冰打火：×1.5。'],
  ['超载', 'fire', 'shock', '火雷相遇，原地爆炸，造成火伤并把周围的敌人炸飞。'],
  ['超导', 'ice', 'shock', '冰雷相遇，周围敌人受到冰伤，并且 8 秒内受到的伤害 +40%。'],
  ['感电', 'water', 'shock', '水雷共存，每秒放一次电，并跳到附近带水的敌人身上。'],
  ['冻结', 'water', 'ice', '水冰相遇，敌人被冻住动弹不得（Boss 只冻一瞬）。'],
  ['碎冰', 'rock', 'ice', '重击（战锤的下砸和震地、爆炸、岩元素）打在冻结的敌人身上，敲碎冰块，打出高额伤害。'],
  ['扩散', 'wind', 'fire', '风把敌人身上的火、水、雷、冰扩散给周围，被扩散到的敌人还会继续反应。'],
  ['结晶', 'rock', 'water', '岩打在带火、水、雷、冰的敌人身上，掉出元素晶片，捡起来回一格护甲。'],
  ['燃烧', 'grass', 'fire', '草火相遇，敌人持续燃烧，身边的敌人也会被灼伤。'],
  ['绽放', 'grass', 'water', '草水相遇，地上长出草原核，三秒后爆开；地上最多五颗。'],
  ['超绽放', 'shock', 'grass', '雷打在草原核附近，草原核化作两枚追踪种子。'],
  ['烈绽放', 'fire', 'grass', '火打在草原核附近，草原核原地大爆炸。'],
  ['原激化', 'grass', 'shock', '草雷相遇，敌人进入激化状态 8 秒：之后雷击伤害更高（超激化），草击伤害更高（蔓激化）。'],
];

function elementEntries(tex: (key: string) => Pic): CodexEntry[] {
  const entries: CodexEntry[] = EL_INFO.map(([el, name, desc]) => ({ id: `el-${el}`, name, icon: tex(`el-${el}`), tag: '元素', tagColor: ELEMENT_COLOR[el], desc }));
  for (const [name, a, b, desc] of REACTIONS) entries.push({ id: `re-${name}`, name, icon: tex(`el-${a}`), tag: `${ELEMENT_NAME[a]} + ${ELEMENT_NAME[b]}`, tagColor: ELEMENT_COLOR[a], desc });
  entries.push({
    id: 'el-counter',
    name: '元素克制',
    icon: tex('el-rock'),
    tag: '规则',
    tagColor: E.grey,
    desc: '有元素的画风里，怪物会带着当地的元素：熔岩和工坊是火，雪原是冰，深海是水，霓虹是雷，森林是草，沙漠和宫殿是岩，庭院是风。它们只受同元素三成的伤害，身上的元素被反应用掉后会再长回来，用克制的元素去打就能一直反应。',
  });
  entries.push({
    id: 'el-shield',
    name: '元素护盾',
    icon: tex('el-fire'),
    tag: '规则',
    tagColor: E.grey,
    desc: '精英怪带着元素护盾，护盾在时伤害先打在护盾上。火盾怕水、水盾怕冰、冰盾怕火、雷盾怕冰、草盾怕火（2.5 倍），岩盾怕岩和重击；同元素几乎打不动，没有元素只有一半效果。护盾破碎时精英会晕眩 2 秒。',
  });
  return entries;
}
