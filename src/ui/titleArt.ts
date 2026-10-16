import { audio } from '../audio/audio';
import { E } from '../pixel/palette';
import { ICONS } from '../styles/textures';
import { icon, px } from './pxhtml';

/** What the painting's caption says for each title menu item. */
const CAPTIONS = [
  '回到你上次倒下的地方。',
  '血落处开出银莲花。这一次，走得更远些。',
  '看看谁走得最深。',
  '踩着拍子挥剑，整座地牢为你伴奏。',
  '十种画风里的一切，都记在这里。',
  '音量、难度、画面，按你的习惯来。',
];

/** Layers and how far each drifts with the mouse, back to front. */
const DEPTHS: Record<string, number> = { 'pt-stars': 1, 'pt-moon': 3, 'pt-ruins': 4, 'pt-petals': 6, 'pt-cliff': 7, 'pt-david': 5 };

/**
 * The title painting: a Greek night. A marble David stands on his plinth among temple ruins, the anemone (the flower
 * of Adonis's blood) hangs behind his head as the moon, petals drift down. Moonlight runs over the marble now and
 * then, and whenever the mouse finds him; the layers drift with the mouse; a click scatters petals; the caption under
 * the frame follows the menu.
 */
export class TitlePainting {
  readonly el: HTMLElement;
  private canvas: HTMLElement;
  private caption: HTMLElement;
  private layers: [HTMLElement, number][] = [];

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'painting';
    const stars = Array.from({ length: 26 }, (_, i) => {
      const x = (i * 97) % 214;
      const y = (i * 53) % 70;
      return `<i style="left:${x + 3}px;top:${y + 3}px;animation-delay:${(i * 0.37) % 3}s"></i>`;
    }).join('');
    const petals = Array.from({ length: 7 }, (_, i) => `<i style="left:${40 + i * 27}px;animation-delay:${i * 0.9}s;animation-duration:${5 + (i % 3)}s">${icon('petal')}</i>`).join('');
    this.el.innerHTML = `
      <div class="pt-canvas">
        <div class="pt-sky"></div>
        <div class="pt-stars">${stars}</div>
        <div class="pt-moon"><div class="halo"></div>${icon('emblem')}</div>
        <div class="pt-ruins">${icon('temple')}</div>
        <div class="pt-petals">${petals}</div>
        <div class="pt-cliff">${icon('terrace')}</div>
        <div class="pt-david">${icon('david')}<i class="shine"></i><i class="glint">${icon('sparkle')}</i></div>
      </div>
      <div class="pt-frame"></div>
      <div class="pt-meander">${icon('meander')}</div>
      <div class="pt-caption"></div>`;
    this.canvas = this.el.querySelector('.pt-canvas') as HTMLElement;
    this.caption = this.el.querySelector('.pt-caption') as HTMLElement;
    for (const [cls, depth] of Object.entries(DEPTHS)) this.layers.push([this.canvas.querySelector(`.${cls}`) as HTMLElement, depth]);

    // The moonlight that runs over the statue is cut to the statue's own shape.
    const statue = this.canvas.querySelector('.pt-david') as HTMLElement;
    const shine = statue.querySelector('.shine') as HTMLElement;
    const mask = `url(${ICONS.david})`;
    shine.style.maskImage = mask;
    shine.style.webkitMaskImage = mask;
    statue.addEventListener('mouseenter', () => {
      this.replay(statue, 'gleam');
      this.replay(this.canvas.querySelector('.pt-moon') as HTMLElement, 'pulse');
      audio.swap();
    });
    this.canvas.addEventListener('click', (e) => this.burst(e));
  }

  /** Drift the layers against the mouse; nearer layers move further. */
  look(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width) return;
    const dx = Math.max(-1, Math.min(1, ((clientX - r.left) / r.width) * 2 - 1));
    const dy = Math.max(-1, Math.min(1, ((clientY - r.top) / r.height) * 2 - 1));
    for (const [el, depth] of this.layers) el.style.translate = `${Math.round(-dx * depth)}px ${Math.round(-dy * depth * 0.5)}px`;
  }

  setCaption(i: number) {
    this.caption.innerHTML = px(CAPTIONS[i] ?? '', E.greyM);
    this.replay(this.caption, 'in');
  }

  /** A click scatters petals from where it landed, and the moon answers. */
  private burst(e: MouseEvent) {
    const r = this.canvas.getBoundingClientRect();
    const zoom = r.width / this.canvas.offsetWidth || 1;
    const x = Math.round((e.clientX - r.left) / zoom);
    const y = Math.round((e.clientY - r.top) / zoom);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.random() * 0.5;
      const d = 14 + Math.random() * 16;
      const p = document.createElement('i');
      p.className = 'pt-pop';
      p.innerHTML = icon('petal');
      p.style.left = `${x}px`;
      p.style.top = `${y}px`;
      p.style.setProperty('--dx', `${Math.round(Math.cos(a) * d)}px`);
      p.style.setProperty('--dy', `${Math.round(Math.sin(a) * d)}px`);
      this.canvas.appendChild(p);
      setTimeout(() => p.remove(), 800);
    }
    this.replay(this.canvas.querySelector('.pt-moon') as HTMLElement, 'pulse');
    audio.pickup(Math.floor(Math.random() * 8));
  }

  private replay(el: HTMLElement, cls: string) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }
}
