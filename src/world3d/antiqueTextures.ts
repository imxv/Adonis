import * as THREE from 'three';

/** Hand-painted locally at runtime. No external images or model assets. */
export function createAntiqueTextures() {
  let seed = 72811;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
  const owned: THREE.CanvasTexture[] = [];
  const dispose = () => { owned.splice(0).forEach(t => t.dispose()); };
  const paint = (draw: (c: CanvasRenderingContext2D) => void) => {
    try {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
      const c = canvas.getContext('2d'); if (!c) throw new Error('Antique painting canvas unavailable');
      draw(c);
      const map = new THREE.CanvasTexture(canvas); owned.push(map);
      map.colorSpace = THREE.SRGBColorSpace;
      map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 4; return map;
    } catch (error) {
      dispose();
      throw error;
    }
  };
  const stone = paint(c => {
    c.fillStyle = '#bcb8a7'; c.fillRect(0, 0, 512, 512);
    // Broad, overlapping scumbles keep the material painted rather than noisy.
    for (let i = 0; i < 240; i++) {
      c.fillStyle = ['#e2d9b9', '#d4c8aa', '#adb7af', '#b3ad98', '#ebe0c7'][i % 5];
      c.globalAlpha = .08 + random() * .17;
      const x = random() * 540 - 20, y = random() * 540 - 20;
      c.beginPath(); c.ellipse(x, y, 9 + random() * 75, 2 + random() * 16, -.3, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = .32;
    for (let i = 0; i < 15; i++) {
      const y = random() * 512; c.strokeStyle = i % 2 ? '#879995' : '#f1e5cb'; c.lineWidth = .5 + random() * 1.4;
      c.beginPath(); c.moveTo(-10, y); c.bezierCurveTo(130, y + 5, 250, y - 34, 530, y + 12); c.stroke();
    }
    // Sparse fractured veins. They do not repeat as a regular brick grid.
    c.strokeStyle = '#777f78'; c.lineWidth = .7; c.globalAlpha = .29;
    for (let i = 0; i < 5; i++) {
      let x = random() * 512, y = random() * 512; c.beginPath(); c.moveTo(x, y);
      for (let j = 0; j < 5; j++) { x += 6 + random() * 22; y += -7 + random() * 18; c.lineTo(x, y); } c.stroke();
    }
    c.globalAlpha = 1;
  });
  const pottery = (azure: boolean) => paint(c => {
    c.fillStyle = azure ? '#286d7a' : '#ae5d3b'; c.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 100; i++) {
      c.strokeStyle = azure ? '#8db4af' : '#dd9b67'; c.globalAlpha = .05 + random() * .07; c.lineWidth = 2 + random() * 8;
      c.beginPath(); c.moveTo(0, random() * 512); c.bezierCurveTo(100, random() * 512, 350, random() * 512, 512, random() * 512); c.stroke();
    }
    c.globalAlpha = 1;
    for (const y of [40, 58, 142, 156, 336, 350, 444, 462]) {
      c.fillStyle = azure ? '#d2b76b' : '#382f2a'; c.fillRect(0, y, 512, y % 3 ? 5 : 10);
      c.fillStyle = '#d9b67b'; c.globalAlpha = .45; c.fillRect(0, y + 2, 512, 1); c.globalAlpha = 1;
    }
    // A continuous running wave and a shoulder band of olive leaves.
    c.strokeStyle = azure ? '#ddc790' : '#302c28'; c.lineWidth = 6;
    c.beginPath(); c.moveTo(0, 390);
    for (let x = 0; x <= 512; x += 32) c.bezierCurveTo(x + 5, 362, x + 29, 362, x + 32, 390); c.stroke();
    c.lineWidth = 2.5; c.beginPath(); c.moveTo(0, 238); c.lineTo(512, 238); c.stroke();
    c.fillStyle = azure ? '#d0bb80' : '#302c28';
    for (let x = 0; x < 512; x += 32) for (const side of [-1, 1]) {
      c.save(); c.translate(x + 12, 238 + side * 13); c.rotate(side * .65); c.beginPath(); c.ellipse(0, 0, 15, 5, 0, 0, Math.PI * 2); c.fill(); c.restore();
    }
    for (let i = 0; i < 35; i++) {
      c.globalAlpha = .12; c.fillStyle = '#dfbe8c'; c.fillRect(random() * 512, random() * 512, 2 + random() * 13, .8 + random() * 2);
    }
    c.globalAlpha = 1;
  });
  const redPottery = pottery(false), bluePottery = pottery(true);
  return { stone, redPottery, bluePottery, dispose };
}
