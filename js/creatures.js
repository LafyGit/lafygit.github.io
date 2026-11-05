// Sea creatures drawn in stars. Each shape is painted once on a hidden canvas and sampled into grains,
// the same way the name is. The whale's three named stars are real: Cetus has them in these places.
import { rng } from './gl.js';

function sampler(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  // One channel per kind of part, so a single paint can be sampled with different weights.
  return {
    g,
    pick(paint, count, R, emit) {
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#fff';
      g.strokeStyle = '#fff';
      paint(g);
      const a = g.getImageData(0, 0, w, h).data;
      for (let n = 0, tries = 0; n < count && tries < count * 200; tries++) {
        const x = R() * w, y = R() * h;
        if (a[((y | 0) * w + (x | 0)) * 4 + 3] > 90 && emit(x, y)) n++;
      }
    },
  };
}

// Slow devices draw only the first part of a cloud, so the order matters: shade first because it has to sit
// under the stars, named stars next because they must always be there, and everything else shuffled so
// that drawing less thins the whole creature evenly instead of cutting off its fin.
function finish(flat, R) {
  const rows = [];
  for (let i = 0; i < flat.length; i += 6) rows.push(flat.slice(i, i + 6));
  const shade = rows.filter((r) => r[2] < 0.05), stars = rows.filter((r) => r[2] > 0.95);
  const rest = rows.filter((r) => r[2] >= 0.05 && r[2] <= 0.95);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(R() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return new Float32Array([...shade, ...stars, ...rest].flat());
}

// A humpback in profile, swimming toward +x. Canvas units; local units are (px-500)/500, (250-py)/500.
const WHALE = {
  body: 'M975 238 C900 205 800 190 700 178 C600 165 500 160 420 170 C360 178 330 182 315 172 C300 165 290 190 270 196 C200 212 130 232 75 246 C55 240 35 205 8 172 C22 215 30 245 48 262 C32 285 20 320 4 352 C40 330 68 295 92 272 C180 290 280 318 380 338 C480 352 600 345 720 318 C820 298 900 270 975 245 Z',
  fin: 'M672 316 C636 384 560 440 440 478 C500 420 556 372 598 324 Z',
  lines: [
    'M975 241 C900 258 820 268 752 262 C742 258 738 252 730 250',
    'M930 268 C820 300 700 330 560 346',
    'M900 268 C800 292 690 316 560 332',
    'M860 266 C770 284 680 302 570 316',
    'M820 262 C740 276 670 288 590 300',
  ],
  // [x, y, name]: named stars get labels on the page.
  stars: [[975, 240], [800, 186, 'menkar'], [735, 250], [300, 178], [8, 172, 'deneb'], [4, 352], [450, 348, 'baten'], [440, 478], [640, 322], [80, 250]],
  links: [[0, 1], [1, 3], [3, 9], [9, 4], [9, 5], [0, 8], [8, 6], [6, 9], [8, 7]],
};
const whaleLocal = (x, y) => [(x - 500) / 500, (250 - y) / 500];

export function buildWhale(count) {
  const R = rng(214);
  const s = sampler(1000, 500);
  const out = [];
  const push = (x, y, bright, part) => { const [lx, ly] = whaleLocal(x, y); out.push(lx, ly, bright, part, R(), R()); };
  const body = new Path2D(WHALE.body), fin = new Path2D(WHALE.fin);
  // Body: lit from above, so grains thin out toward the belly.
  // Shade first, so the stars land on top of it: big soft dark grains that fill the whole body.
  s.pick((g) => { g.fill(body); g.fill(fin); }, 2400, R, (x, y) => { push(x, y, 0.02, 0); return true; });
  s.pick((g) => g.fill(body), count * 0.3, R, (x, y) => {
    const top = 1 - Math.min(1, Math.max(0, (y - 160) / 190));
    if (R() > 0.3 + 0.7 * top) return false;
    push(x, y, 0.2 + 0.36 * top * R(), 0);
    return true;
  });
  s.pick((g) => { g.lineWidth = 2.2; g.stroke(body); }, count * 0.36, R, (x, y) => { push(x, y, 0.6 + 0.34 * R() * R(), 0); return true; });
  s.pick((g) => { g.lineWidth = 1.4; WHALE.lines.forEach((d) => g.stroke(new Path2D(d))); }, count * 0.1, R, (x, y) => { push(x, y, 0.42 + 0.4 * R(), 0); return true; });
  s.pick((g) => g.fill(fin), count * 0.05, R, (x, y) => { push(x, y, 0.24 + 0.24 * R(), 1); return true; });
  s.pick((g) => { g.lineWidth = 1.8; g.stroke(fin); }, count * 0.07, R, (x, y) => { push(x, y, 0.6 + 0.34 * R() * R(), 1); return true; });
  // Constellation lines, dotted, the way a star chart draws them.
  WHALE.links.forEach(([a, b]) => {
    const [ax, ay] = WHALE.stars[a], [bx, by] = WHALE.stars[b];
    const finPart = b === 7 ? 1 : 0;
    const len = Math.hypot(bx - ax, by - ay);
    for (let d = 14; d < len - 14; d += 6) {
      const t = d / len;
      push(ax + (bx - ax) * t, ay + (by - ay) * t, 0.62, finPart);
    }
  });
  const named = {};
  WHALE.stars.forEach(([x, y, name], i) => {
    push(x, y, 1, i === 7 || i === 8 ? 1 : 0);
    if (name) named[name] = whaleLocal(x, y);
  });
  return { data: finish(out, R), named };
}

// Bell over y=0, tentacles below. Part 0 is the bell, part 1 trails.
export function buildJelly(count) {
  const R = rng(61);
  const out = [];
  const push = (x, y, bright, part) => out.push(x, y, bright, part, R(), R());
  // Soft glowing mass first, so the bell reads as translucent flesh.
  for (let i = 0; i < 170; i++) {
    const a = R() * Math.PI, r = Math.sqrt(R());
    push(Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.66, 0.02, 0);
  }
  const bell = Math.round(count * 0.42);
  for (let i = 0; i < bell; i++) {
    const a = R() * Math.PI;
    const r = Math.pow(R(), 0.42);
    const onRim = r > 0.93;
    push(Math.cos(a) * r, Math.sin(a) * r * 0.74, onRim ? 0.5 + 0.34 * R() : 0.26 + 0.36 * R(), 0);
  }
  for (let rib = 0; rib < 10; rib++) {
    const a = (rib + 0.5) / 10 * Math.PI;
    for (let k = 0; k < 16; k++) {
      const r = k / 16;
      push(Math.cos(a) * r, Math.sin(a) * r * 0.74, 0.5, 0);
    }
  }
  const scallops = 11;
  for (let i = 0; i < 90; i++) {
    const x = -1 + 2 * R();
    push(x, -0.035 * Math.abs(Math.sin(x * scallops)) , 0.86, 0);
  }
  // The glowing organs under the bell.
  for (let i = 0; i < 80; i++) {
    const a = R() * 6.283, r = R() * 0.2;
    push(Math.cos(a) * r + (i % 4 < 2 ? -0.22 : 0.22), 0.2 + Math.sin(a) * r * 0.7, 0.72, 0);
  }
  const tentacles = 9;
  const rest = Math.max(0, count - out.length / 6);
  for (let i = 0; i < rest; i++) {
    const k = i % tentacles;
    const x = (k / (tentacles - 1) - 0.5) * 1.7;
    const long = 1.5 + ((k * 7) % 5) * 0.32;
    const s = Math.pow(R(), 0.8) * long;
    push(x * (1 - s * 0.1), -s, 0.42 + 0.5 * (1 - s / long), 1);
  }
  return finish(out, R);
}

// A manta from below, gliding toward +y. Local units: x -1..1.
export function buildManta(count) {
  const R = rng(99);
  const s = sampler(1000, 760);
  const out = [];
  const local = (x, y) => [(x - 500) / 470, (300 - y) / 470];
  const push = (x, y, bright, part) => { const [lx, ly] = local(x, y); out.push(lx, ly, bright, part, R(), R()); };
  const half = 'M500 150 C520 132 548 108 562 86 C572 110 576 132 574 152 C690 164 830 222 965 305 C830 312 680 322 590 342 C566 362 544 390 508 412 L500 412';
  const mirror = 'M500 150 C480 132 452 108 438 86 C428 110 424 132 426 152 C310 164 170 222 35 305 C170 312 320 322 410 342 C434 362 456 390 492 412 L500 412';
  const right = new Path2D(`${half} Z`), left = new Path2D(`${mirror} Z`);
  s.pick((g) => { g.fill(right); g.fill(left); }, 700, R, (x, y) => { push(x, y, 0.02, 0); return true; });
  s.pick((g) => { g.fill(right); g.fill(left); }, count * 0.42, R, (x, y) => { const c = 1 - Math.abs(x - 500) / 470; push(x, y, 0.2 + 0.46 * c * R(), 0); return true; });
  s.pick((g) => { g.lineWidth = 3.2; g.stroke(right); g.stroke(left); g.fillStyle = '#000'; g.globalCompositeOperation = 'destination-out'; g.fillRect(494, 150, 12, 262); g.globalCompositeOperation = 'source-over'; g.fillStyle = '#fff'; }, count * 0.34, R, (x, y) => { push(x, y, 0.62 + 0.3 * R(), 0); return true; });
  // Gill slits, the detail that makes it a manta and not a kite.
  s.pick((g) => { g.lineWidth = 2; for (let i = 0; i < 5; i++) { const y = 240 + i * 20; g.beginPath(); g.moveTo(450, y); g.lineTo(476, y + 7); g.moveTo(550, y); g.lineTo(524, y + 7); g.stroke(); } }, count * 0.06, R, (x, y) => { push(x, y, 0.6, 0); return true; });
  const tail = Math.round(count * 0.08);
  for (let i = 0; i < tail; i++) {
    const t = R();
    push(500, 412 + t * 300, 0.46 * (1 - t) + 0.14, 1);
  }
  [[562, 86], [438, 86], [965, 305], [35, 305], [500, 700]].forEach(([x, y]) => push(x, y, 1, y > 412 ? 1 : 0));
  return finish(out, R);
}
