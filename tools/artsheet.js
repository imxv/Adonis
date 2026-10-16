// Dev only: lay textures out side by side, scaled up, over the game, to check pixel art.
// Usage in the dev console: const a = await import('/tools/artsheet.js'); a.show(['chest', 'crate'], 6);
export function show(keys, k = 5, bg = '#1d1a2b') {
  hide();
  const game = window.__game;
  const scene = game.scene.keys.game;
  const imgs = keys.map((key) => [key, scene.textures.exists(key) ? scene.textures.get(key).getSourceImage() : null]);
  const pad = 6;
  const w = imgs.reduce((s, [, im]) => s + (im ? im.width * k : 0) + pad, pad);
  const h = Math.max(...imgs.map(([, im]) => (im ? im.height * k : 0))) + pad * 2;
  const c = document.createElement('canvas');
  c.id = '__art';
  c.width = w;
  c.height = h;
  Object.assign(c.style, { position: 'fixed', left: '8px', top: '8px', zIndex: 99999, imageRendering: 'pixelated', background: bg, maxWidth: '98vw' });
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  let x = pad;
  for (const [key, im] of imgs) {
    if (!im) continue;
    ctx.drawImage(im, x, pad, im.width * k, im.height * k);
    x += im.width * k + pad;
  }
  document.body.appendChild(c);
  return imgs.map(([key, im]) => [key, im ? [im.width, im.height] : null]);
}

export function hide() {
  document.getElementById('__art')?.remove();
}
