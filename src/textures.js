// Procedural canvas textures: the finishing. A watch movement is 90% surface
// treatment — perlage on the mainplate, Côtes de Genève on the bridges, a
// circular brush on the wheels — and none of it needs an image file.
import * as THREE from 'three';

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function tex(c, repeat = 1, srgb = false) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Perlage / circular graining: overlapping spirals stamped in a grid. */
export function perlage(size = 512, cell = 64) {
  const c = canvas(size);
  const g = c.getContext('2d');
  g.fillStyle = '#808080';
  g.fillRect(0, 0, size, size);
  const r = cell * 0.78;
  for (let y = -1; y * cell < size + cell; y++) {
    for (let x = -1; x * cell < size + cell; x++) {
      const cx = x * cell + (y % 2 ? cell * 0.5 : 0);
      const cy = y * cell;
      const grad = g.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.05, cx, cy, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.55)');
      grad.addColorStop(0.55, 'rgba(150,150,150,0.25)');
      grad.addColorStop(1, 'rgba(40,40,40,0.35)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fill();
      // fine spiral scratches inside each spot
      g.strokeStyle = 'rgba(255,255,255,0.10)';
      g.lineWidth = 0.7;
      for (let k = 3; k < 14; k++) {
        g.beginPath();
        g.arc(cx, cy, (r * k) / 14, 0, Math.PI * 2);
        g.stroke();
      }
    }
  }
  return tex(c, 1);
}

/** Côtes de Genève: soft parallel waves with a fine grain riding on top. */
export function cotesDeGeneve(size = 512, bands = 9) {
  const c = canvas(size);
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const period = size / bands;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x % period) / period;
      let v = 128 + Math.sin(u * Math.PI * 2) * 46 + Math.sin(u * Math.PI * 6) * 8;
      v -= u > 0.94 || u < 0.06 ? 40 : 0;            // the cut line between bands
      v += (Math.random() - 0.5) * 14;                // brushing grain
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return tex(c, 1);
}

/** Circular graining for wheels and dials: concentric brushed rings. */
export function circularBrush(size = 512, rings = 260) {
  const c = canvas(size);
  const g = c.getContext('2d');
  g.fillStyle = '#7d7d7d';
  g.fillRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2;
  for (let i = 0; i < rings; i++) {
    const r = (i / rings) * size * 0.72;
    const v = 118 + Math.random() * 34;
    g.strokeStyle = `rgba(${v},${v},${v},0.5)`;
    g.lineWidth = 0.6 + Math.random() * 1.4;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
  }
  const t = tex(c, 1);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Linear brushing, for the case band. */
export function brushed(size = 512) {
  const c = canvas(size);
  const g = c.getContext('2d');
  g.fillStyle = '#808080';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    const y = Math.random() * size;
    const v = 90 + Math.random() * 90;
    g.strokeStyle = `rgba(${v},${v},${v},0.25)`;
    g.lineWidth = Math.random() * 1.6;
    g.beginPath();
    g.moveTo(Math.random() * size - size * 0.3, y);
    g.lineTo(Math.random() * size + size * 0.3, y);
    g.stroke();
  }
  return tex(c, 1);
}

/** Value-noise leather grain, returned as a normal map. */
export function leatherNormal(size = 512) {
  const h = canvas(size);
  const g = h.getContext('2d');
  const img = g.createImageData(size, size);
  const cells = [];
  const N = 26;
  for (let i = 0; i < N * N; i++) cells.push(Math.random());
  const at = (i, j) => cells[((j + N) % N) * N + ((i + N) % N)];
  const fade = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0, amp = 1, freq = N / size, norm = 0;
      for (let o = 0; o < 3; o++) {
        const fx = x * freq, fy = y * freq;
        const i = Math.floor(fx), j = Math.floor(fy);
        const tx = fade(fx - i), ty = fade(fy - j);
        const a = at(i, j) * (1 - tx) + at(i + 1, j) * tx;
        const b = at(i, j + 1) * (1 - tx) + at(i + 1, j + 1) * tx;
        v += (a * (1 - ty) + b * ty) * amp;
        norm += amp;
        amp *= 0.5; freq *= 2.3;
      }
      v = (v / norm) * 255;
      const k = (y * size + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = v;
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return heightToNormal(h, 2.2);
}

/** Sobel a greyscale height canvas into a tangent-space normal map. */
export function heightToNormal(src, strength = 2) {
  const size = src.width;
  const s = src.getContext('2d').getImageData(0, 0, size, size).data;
  const out = canvas(size);
  const g = out.getContext('2d');
  const img = g.createImageData(size, size);
  const H = (x, y) => s[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len) * 0.5 * 255 + 127;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return tex(out, 1);
}

/**
 * Chapter ring artwork, drawn in polar space and mapped onto a flat annulus.
 * Returns a texture whose UV (0,0)-(1,1) covers the ring's bounding square.
 */
export function chapterRing(size = 2048, opts = {}) {
  const { rOuter = 13.4, rInner = 10.7 } = opts;
  const c = canvas(size);
  const g = c.getContext('2d');
  const S = size / (2 * rOuter);                   // px per mm
  g.fillStyle = '#efece3';                          // opaque silvered base
  g.fillRect(0, 0, size, size);
  g.translate(size / 2, size / 2);
  g.scale(S, -S);                                   // flip Y so it matches XY space

  const line = (a, r0, r1, w, col) => {
    g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'butt';
    g.beginPath();
    g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    g.stroke();
  };

  // The ring is only ~3 mm wide, so the two bands have to be laid out against
  // each other explicitly: minute track hard against the outer edge, numerals
  // and applied batons in the band inside it, nothing overlapping.
  const rTrackOut = rOuter - 0.20;
  const rTrackIn = rTrackOut - 0.32;
  const rFive = rTrackOut - 0.52;
  const rNum = rInner + (rTrackIn - rInner) * 0.46;

  for (let i = 0; i < 300; i++) {
    const a = Math.PI / 2 - (i / 300) * Math.PI * 2;
    const isFive = i % 25 === 0;
    line(a, isFive ? rFive : rTrackIn, rTrackOut, isFive ? 0.16 : 0.075,
      isFive ? '#12161c' : '#333b45');
  }
  // hairline under the track
  g.strokeStyle = '#161b22'; g.lineWidth = 0.055;
  g.beginPath(); g.arc(0, 0, rFive - 0.14, 0, Math.PI * 2); g.stroke();

  // numerals at 12, 3 and 9 — 6 belongs to the seconds register
  g.save();
  g.scale(1, -1);
  g.fillStyle = '#0e1218';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `600 ${(rTrackIn - rInner) * 0.72}px "Times New Roman", Georgia, serif`;
  for (const h of ['12', '3', '9']) {
    const a = Math.PI / 2 - (Number(h) / 12) * Math.PI * 2;
    g.fillText(h, Math.cos(a) * rNum, -Math.sin(a) * rNum);
  }
  g.restore();

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return t;
}

/** Small-seconds subdial track. */
export function subdialRing(size = 1024, r = 3.0) {
  const c = canvas(size);
  const g = c.getContext('2d');
  const S = size / (2 * r);
  g.fillStyle = '#e9e6dc';
  g.fillRect(0, 0, size, size);
  g.translate(size / 2, size / 2);
  g.scale(S, -S);
  for (let i = 0; i < 60; i++) {
    const a = Math.PI / 2 - (i / 60) * Math.PI * 2;
    const big = i % 5 === 0;
    g.strokeStyle = big ? '#12161c' : '#39404a';
    g.lineWidth = big ? 0.10 : 0.045;
    g.beginPath();
    g.moveTo(Math.cos(a) * (r - (big ? 0.52 : 0.26)), Math.sin(a) * (r - (big ? 0.52 : 0.26)));
    g.lineTo(Math.cos(a) * (r - 0.06), Math.sin(a) * (r - 0.06));
    g.stroke();
  }
  g.save();
  g.scale(1, -1);
  g.fillStyle = '#12161c';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '600 0.78px "Times New Roman", Georgia, serif';
  for (const [n, a] of [[60, Math.PI / 2], [20, Math.PI / 2 - Math.PI * 2 / 3], [40, Math.PI / 2 + Math.PI * 2 / 3]]) {
    g.fillText(String(n), Math.cos(a) * (r - 1.05), -Math.sin(a) * (r - 1.05));
  }
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return t;
}

/** Engraving mask for a bridge: white text on black, used as an alpha map. */
export function engraving(size = 1024, lines = []) {
  const c = canvas(size);
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  lines.forEach((l, i) => {
    g.font = `${l.weight ?? 500} ${l.size * size}px ${l.font ?? '"Times New Roman", Georgia, serif'}`;
    g.fillText(l.text, size / 2, size * (l.y ?? 0.5));
  });
  const t = new THREE.CanvasTexture(c);
  return t;
}

/** Vertical gradient for the scene backdrop. */
export function backdrop(top = '#151a21', bottom = '#04060a') {
  const c = canvas(256);
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  grad.addColorStop(0.62, bottom);
  grad.addColorStop(1, '#020406');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
