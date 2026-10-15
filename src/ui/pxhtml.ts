import { ICONS, ICON_SIZE } from '../styles/textures';
import { E } from '../pixel/palette';
import { Grid, pxMeasure, pxText } from '../pixel/draw';

/** Small HTML builders for the pixel UI: every piece of text is a rasterised pixel-font image. */

export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

export function el(tag: string, cls?: string, html?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

// ---------------------------------------------------------------- pixel text and icons as <img>

export interface PxOpts {
  small?: boolean;
  scale?: number;
  outline?: string | false;
  shadow?: string;
}

const pxCache = new Map<string, { src: string; w: number; h: number }>();

export function pxImg(text: string, color: string, o: PxOpts) {
  // The 8px font only has Latin glyphs; Chinese always uses the 12px pixel font.
  if (o.small && /[\u2E80-\u9FFF\uFF00-\uFFEF]/.test(text)) o = { ...o, small: false };
  const key = `${text}|${color}|${o.small ? 1 : 0}|${o.scale ?? 1}|${o.outline ?? ''}|${o.shadow ?? ''}`;
  let hit = pxCache.get(key);
  if (!hit) {
    const c = pxText(text, {
      color,
      small: o.small,
      size: (o.small ? 8 : 12) * (o.scale ?? 1),
      outline: o.outline === false ? undefined : (o.outline ?? E.ink),
      shadow: o.shadow,
    });
    hit = { src: c.toDataURL(), w: c.width, h: c.height };
    pxCache.set(key, hit);
  }
  return hit;
}

/** One line of pixel text as an image, sized in UI pixels. */
export function px(text: string, color: string = E.white, o: PxOpts = {}, cls = ''): string {
  if (!text) return '';
  const h = pxImg(text, color, o);
  return `<img class="px ${cls}" src="${h.src}" style="width:${h.w}px;height:${h.h}px" alt="">`;
}

/** Break text into lines that fit `maxW`, keeping numbers and Latin words whole. */
export function wrap(text: string, maxW: number): string[] {
  const tokens = text.match(/[A-Za-z0-9+\-%.:/→×~]+|\s+|./gu) ?? [];
  const lines: string[] = [];
  let cur = '';
  for (const tk of tokens) {
    const next = cur + tk;
    if (cur.trim() && pxMeasure(next) > maxW && !/^[，。、；：！？）,.;:!?)]/.test(tk)) {
      lines.push(cur.trimEnd());
      cur = tk.trimStart();
    } else cur = next;
  }
  if (cur.trim()) lines.push(cur.trimEnd());
  return lines;
}

export function pxBlock(text: string, color: string, maxW: number): string {
  return `<div class="lines">${wrap(text, maxW - 2)
    .map((l) => px(l, color))
    .join('')}</div>`;
}

export function icon(name: string, scale = 1, cls = ''): string {
  const src = ICONS[name];
  if (!src) return '';
  const [w, h] = ICON_SIZE[name];
  return `<img class="px ${cls}" src="${src}" style="width:${w * scale}px;height:${h * scale}px" alt="">`;
}

let diamondSrc = '';
/** ACHROMA-style red diamond cursor. */
export function diamond(): string {
  if (!diamondSrc) diamondSrc = Grid.ascii(['..r..', '.rrr.', 'rrwrr', '.rRr.', '..R..']).render({ outline: false, margin: 0 }).toDataURL();
  return `<img class="px dia" src="${diamondSrc}" style="width:5px;height:5px" alt="">`;
}

/** Any image (a data URL) at a whole-number scale. */
export function img(src: string, w: number, h: number, scale = 1, cls = ''): string {
  return `<img class="px ${cls}" src="${src}" style="width:${w * scale}px;height:${h * scale}px" alt="">`;
}
