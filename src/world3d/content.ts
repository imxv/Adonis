import type { Discovery, WorldPoint } from './types';

export const AREAS = [
  { name: '爱琴海岸', subtitle: '潮汐留下的记忆', x: 0, z: 25 },
  { name: '橄榄圣林', subtitle: '让沉睡的圣泉再次流动', x: 0, z: -65 },
  { name: '山巅神庙', subtitle: '追随第一束光', x: 0, z: -155 },
] as const;
export const DISCOVERIES: readonly Discovery[] = [
  { id: 'greek.coast.navigator', title: '无名领航者的星盘', area: '爱琴海岸', x: -14, z: 24, radius: 3.8,
    body: '残舟停在海水曾经抵达的地方。铜盘上没有国王的名字，只有五颗被磨得明亮的星。\n\n“若风不再记得归路，就让岸上的灯先亮起来。”\n\n你将这句航海者的愿望记进画册。远处山巅的白色神庙，像一盏尚未点亮的灯。',
    footnote: '原创神话叙事 · 铜盘图案借用航海与星象意象，不指称真实出土文物。' },
  { id: 'greek.coast.tide-mural', title: '潮汐与月桂的壁画', area: '爱琴海岸', x: 14, z: 4, radius: 4,
    body: '蓝色颜料渗进石壁，三条水线绕过海螺、橄榄叶与太阳。壁画边缘刻着：\n\n“海螺归向山，橄榄迎向海；日轮追随落日。”\n\n山在北方，海在南方，落日在西方。这正是圣林三座引水盘的方向。沿金色碎石路继续向山走吧。',
    footnote: '谜题线索：海螺 → 北；橄榄 → 南；日轮 → 西。方向以画中罗盘为准。' },
  { id: 'greek.grove.olive-oath', title: '老橄榄树下的誓言', area: '橄榄圣林', x: -15, z: -58, radius: 4,
    body: '树根抱住一块断碑。有人曾在这里许愿，希望圣泉为每个过路人留下同样多的清水。\n\n“让海螺望山，让橄榄望海，让日轮望向落日。水不应被囚于任何一座门后。”\n\n三座圆盘各有四个朝向。将它们转到壁画所说的方向，失水的渠道便能重新连通。',
    footnote: '原创改编 · 可前往圣泉旁的三座引水盘，用 E 或触控按钮旋转。' },
  { id: 'greek.grove.spring-restored', title: '重新流动的圣泉', area: '橄榄圣林', x: 0, z: -75, radius: 5, requiresSpring: true,
    body: '水先是一滴，接着是一线，最后越过干涸的石槽。细碎的金光随着泉水流向山门。\n\n圣林没有要求你献上宝物，只要求你读懂岸边的人留下的话。远处的两扇门缓缓分开，通向山巅的路终于开放。\n\n你把一抹清澈的泉蓝带回画册。',
    footnote: '环境谜题已完成 · 山门开启；继续上山可进入神庙内殿。' },
  { id: 'greek.temple.first-light', title: '第一束光的回廊', area: '山巅神庙', x: 0, z: -160, radius: 5, requiresSpring: true,
    body: '内殿没有神像。镂空的石顶将阳光落在一片金色橄榄叶上，四周是旅人留下的海岸、树木与群山。\n\n这座神庙守护的也许不是某一位英雄，而是每个愿意停下脚步、修复一条水渠的人。\n\n从露台回望，来时的海湾、圣林与曲折山路已连成一幅完整的画。首区的故事在这里收束；更远的群岛等待下一幅画。',
    footnote: '首区终点 · 可从菜单随时返回画廊；已发现的收藏由画廊记录。' },
];
export const VALVES: readonly (WorldPoint & { name: string; symbol: string; target: number })[] = [
  { name: '海螺', symbol: '◉', x: -7, z: -68, target: 0 },
  { name: '橄榄', symbol: '❧', x: 0, z: -62, target: 2 },
  { name: '日轮', symbol: '☀', x: 7, z: -68, target: 3 },
];
export const DIRECTIONS = ['北 · 山巅', '东 · 晨光', '南 · 大海', '西 · 落日'] as const;
