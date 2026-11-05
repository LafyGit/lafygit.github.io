// Scroll drives everything: where the camera is, which pearl is open, how far the roots have grown, how the chant reads.
import { createWorld, buildRoots } from './world.js';
import { initAuction, initTiles, initHex, initRoots, initScanner, initCrumbs } from './play.js';
import { createSound } from './sound.js';
import { toArabicDigits, daysBetween, depthAt, zoneAt, formatDepth, makeShoal, stepShoal } from './logic.js';
import { buildWhale, buildJelly, buildManta } from './creatures.js';
import { paintLand, riyadh } from './earth.js';

const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = matchMedia('(hover: none), (max-width: 760px)').matches;

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const mixColor = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));

/* ── language ─────────────────────────────────────────────── */
// The name is written in the language of the page.
const nameFace = () => (root.lang === 'ar' ? { text: 'لافي', font: 'Rakkas', dir: 'rtl' } : { text: 'Lafy', font: 'Gloock', dir: 'ltr' });
const langHooks = [];
function applyLang() {
  const ar = root.lang === 'ar';
  document.querySelectorAll('[data-num]').forEach((el) => {
    el.textContent = ar ? toArabicDigits(el.dataset.num).replace(',', '٬').replace(/^(.*)\+$/, '+$1').replace('.', '٫') : el.dataset.num;
  });
  buildCore();
  langHooks.forEach((fn) => fn());
}
document.getElementById('lang').addEventListener('click', () => {
  const next = root.lang === 'ar' ? 'en' : 'ar';
  root.lang = next;
  root.dir = next === 'ar' ? 'rtl' : 'ltr';
  try { localStorage.setItem('lang', next); } catch {}
  applyLang();
  queueLayout();
  document.fonts.load(`400 200px ${nameFace().font}`, nameFace().text).then(queueLayout, () => {});
});

/* ── worlds and depths ────────────────────────────────────── */
const WORLDS = {
  k: { rim0: '#063f27', rim1: '#35e090', tone: 'light', rootC: '#eafff2', dust: '#d8ffe8', maqam: 'rast', seed: 1.7, c: '#25c97e' },
  b: { rim0: '#ff2e9a', rim1: '#39ff6a', tone: 'light', rootC: '#f3f1ec', dust: '#ffffff', maqam: 'hijaz', seed: 4.2, c: '#ff2e9a' },
  l: { rim0: '#162655', rim1: '#f5b83d', tone: 'light', rootC: '#ffe29a', dust: '#ffe29a', maqam: 'nahawand', seed: 7.1, c: '#f5b83d' },
  f: { rim0: '#8f1d21', rim1: '#f4c542', tone: 'light', rootC: '#fff8e7', dust: '#fff8e7', maqam: 'rast', seed: 2.9, c: '#e5383b' },
  j: { rim0: '#a79f8d', rim1: '#f4f2ec', tone: 'dark', rootC: '#23201c', dust: '#23201c', maqam: 'bayati', seed: 5.5, ink: 1, c: '#f4f2ec' },
};
const NAV = [
  ['surface', 'السطح', 'Surface', '#ffb870', 1],
  ['kooratna', 'كورتنا', 'Kooratna', '#25c97e', 1.4],
  ['bidwars', 'Bid Wars', 'Bid Wars', '#ff2e9a', 1],
  ['lumiku', 'Lumiku', 'Lumiku', '#f5b83d', 1],
  ['footies', 'Footies', 'Footies', '#e5383b', 1],
  ['jadhr', 'جذر', 'Jadhr', '#f4f2ec', 1.2],
  ['seeds', 'بذور', 'Seeds', '#8fe3c8', 1],
  ['wrecks', 'حطام', 'Wrecks', '#7fa8c9', .6],
  ['crew', 'الطاقم', 'Crew', '#ffd28c', .6],
  ['water', 'الأرض', 'Earth', '#6fc8ff', .8],
];
// Colour by how far down you are, on a log scale of metres, the way light really dies in water:
// teal under the waves, then blue, indigo, violet, and black with the stars showing through.
const SEA_STOPS = [
  { at: 0, pal: ['#03222e', '#064058', '#0a6f86', '#18aab0'].map(rgb), root: rgb('#bff6ff'), dust: rgb('#d6fbff') },
  { at: .42, pal: ['#02162a', '#052f50', '#0a5780', '#1a8fb0'].map(rgb), root: rgb('#a8ecff'), dust: rgb('#ccf4ff') },
  { at: .6, pal: ['#030a22', '#08173e', '#122c66', '#244f8c'].map(rgb), root: rgb('#b8d4ff'), dust: rgb('#e0ecff') },
  { at: .78, pal: ['#020313', '#070722', '#120f3a', '#2b2058'].map(rgb), root: rgb('#d9c4ff'), dust: rgb('#f2ecff') },
  { at: .9, pal: ['#01020c', '#04071b', '#0a1433', '#172e58'].map(rgb), root: rgb('#b8d4ff'), dust: rgb('#e6f0ff') },
  { at: 1, pal: ['#00010a', '#030514', '#080b26', '#131a40'].map(rgb), root: rgb('#d8e8ff'), dust: rgb('#f0f6ff') },
];
const ZONES = [
  ['السطح', 'Surface'], ['منطقة الشمس', 'Sunlight zone'], ['منطقة الشفق', 'Twilight zone'],
  ['منطقة منتصف الليل', 'Midnight zone'], ['الهاوية', 'The abyss'], ['الأخاديد', 'The trenches'],
];

const sections = [...document.querySelectorAll('main > section')];
const worlds = sections.filter((s) => s.dataset.world).map((el) => ({
  el, id: el.dataset.world, cfg: WORLDS[el.dataset.world], stage: document.querySelector(`[data-stage="${el.dataset.world}"]`),
  open: el.querySelector('.open'), top: 0, bottom: 0, openH: 0, beats: [], caps: [...el.querySelectorAll('.cap')], shown: -2,
}));

/* ── the side gauge ───────────────────────────────────────── */
const core = document.getElementById('core');
const gaugeEl = document.getElementById('gauge');
let depthEl = null;
function buildCore() {
  core.textContent = '';
  NAV.forEach(([id, ar, en, c, h]) => {
    const a = document.createElement('a');
    a.href = `#${id}`;
    a.dataset.id = id;
    a.style.setProperty('--c', c);
    a.style.setProperty('--h', h);
    const s = document.createElement('span');
    s.textContent = root.lang === 'ar' ? ar : en;
    a.append(s);
    a.setAttribute('aria-label', s.textContent);
    a.addEventListener('click', (e) => {
      e.preventDefault();
      travelTo(document.getElementById(id));
    });
    core.append(a);
  });
  depthEl = document.createElement('div');
  depthEl.className = 'depth';
  core.append(depthEl);
}

/* ── travel ───────────────────────────────────────────────── */
let travel = null;
function travelTo(el, opts = {}) {
  scrollToY(el.offsetTop, opts.ms);
}
function scrollToY(y, ms) {
  if (reduced || plain) { scrollTo(0, y); return; }
  const from = scrollY;
  const dist = Math.abs(y - from);
  travel = { from, to: y, t0: performance.now(), ms: ms || clamp(dist * 0.28, 700, 3200) };
}
['wheel', 'touchstart', 'keydown'].forEach((ev) => addEventListener(ev, () => { travel = null; }, { passive: true }));
document.querySelectorAll('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
  const t = document.getElementById(a.getAttribute('href').slice(1));
  if (t) { e.preventDefault(); travelTo(t); }
}));

/* ── sound ────────────────────────────────────────────────── */
let pulse = 0;
const sound = createSound((v) => { pulse = Math.max(pulse, v * 0.8); });
const soundBtn = document.getElementById('sound');
const MAQAM_NAMES = { rast: ['مقام راست', 'Maqam Rast'], hijaz: ['مقام حجاز', 'Maqam Hijaz'], nahawand: ['مقام نهاوند', 'Maqam Nahawand'], bayati: ['مقام بياتي', 'Maqam Bayati'], saba: ['مقام صبا', 'Maqam Saba'] };
let maqamNow = 'rast';
const soundLabel = document.getElementById('soundLabel');
function paintSound() {
  const [ar, en] = sound.on ? MAQAM_NAMES[maqamNow] : ['اسمع', 'Listen'];
  soundLabel.querySelector('[data-l="ar"]').textContent = ar;
  soundLabel.querySelector('[data-l="en"]').textContent = en;
}
function setMaqam(name) {
  if (name === maqamNow) return;
  maqamNow = name;
  sound.setMaqam(name);
  paintSound();
}
soundBtn.addEventListener('click', () => {
  soundBtn.setAttribute('aria-pressed', String(sound.toggle()));
  sound.setMaqam(maqamNow);
  paintSound();
});

/* ── the playable bits ────────────────────────────────────── */
const auction = initAuction((e) => { if (e === 'sold') sound.tick(0, 0.9); else sound.tick(7, 0.5); });
initTiles((e) => { if (e === 'set') { sound.tick(12, 1); sound.tick(19, 0.8); } else sound.tick(24, 0.3); });
initHex((e, ring) => sound.tick(7 + (ring || 0) * 2, 0.6));
initRoots((e, n) => { if (e === 'hit') sound.tick(5 + n * 3.5, 0.8); else if (e === 'family') sound.tick(17, 1); });
const scanner = initScanner();
initCrumbs(document.getElementById('crumbs'), document.getElementById('sheet'));
langHooks.push(() => { auction.redraw(); scanner.redraw(); });

/* ── stage dressing built once ────────────────────────────── */
const rackTiles = [];
{
  const box = document.getElementById('rackTitle');
  const COLS = ['#d9342b', '#1e6fd9', '#128a4a', '#23201c', '#d9342b', '#1e6fd9'];
  [...'LUMIKU'].forEach((ch, i) => {
    const t = document.createElement('span');
    t.className = 'rt';
    t.textContent = ch;
    t.style.color = COLS[i];
    box.append(t);
    rackTiles.push(t);
  });
  const garden = document.getElementById('garden');
  const letters = 'ج ذ ر ك ت ب ع ل م س ف د ن و ق ح'.split(' ');
  const R = (() => { let a = 7; return () => (a = (a * 16807) % 2147483647) / 2147483647; })();
  for (let i = 0; i < (mobile ? 16 : 30); i++) {
    const s = document.createElement('span');
    s.textContent = letters[i % letters.length];
    s.style.left = `${R() * 96}%`;
    s.style.top = `${R() * 96}%`;
    s.style.fontSize = `${18 + R() * 30}px`;
    s.style.setProperty('--d', `${30 + R() * 30}s`);
    s.style.setProperty('--dl', `${-R() * 40}s`);
    s.style.setProperty('--dx', `${(R() - 0.5) * 26}px`);
    s.style.setProperty('--dy', `${(R() - 0.5) * 26}px`);
    garden.append(s);
  }
}

/* ── the chant: كـ و و و … رتنا ────────────────────────────── */
const chantEl = document.getElementById('chant');
const CHANT_N = mobile ? 15 : 21;
const chant = { w: [], k: null, r: null, advK: 0, advW: 0, advR: 0, h: 0 };
function buildChant() {
  chantEl.textContent = '';
  chant.w = [];
  const make = (text) => {
    const s = document.createElement('span');
    s.textContent = text;
    s.setAttribute('dir', 'rtl');
    chantEl.append(s);
    return s;
  };
  chant.k = make('كو');
  for (let i = 0; i < CHANT_N; i++) chant.w.push(make('و'));
  chant.r = make('رتنا');
  // Measure with the stage on, or everything is zero.
  const st = chantEl.closest('.stage');
  const was = st.style.visibility;
  st.style.visibility = 'hidden';
  st.style.display = 'block';
  chant.advK = chant.k.offsetWidth;
  chant.advW = chant.w[0].offsetWidth;
  chant.advR = chant.r.offsetWidth;
  chant.h = chant.k.offsetHeight;
  st.style.visibility = was;
}
function drawChant(P, vel, t) {
  const vw = innerWidth;
  const margin = vw * 0.05;
  const stretchP = clamp(P / 0.76);
  const zoomP = smooth(clamp((P - 0.74) / 0.26));
  const n = smooth(stretchP) * CHANT_N;
  const total = chant.advK + n * chant.advW + chant.advR;
  // Reads right to left: the head of the word runs off to the left, the camera follows it.
  const cx = vw / 2;
  const centredRight = cx + total / 2;
  const followRight = margin + total;
  const right = Math.max(centredRight, followRight);
  const fit = Math.min(1, (vw - margin * 2) / (chant.advK + CHANT_N * chant.advW + chant.advR));
  const scale = lerp(1, fit, zoomP);
  const finalRight = cx + (total * scale) / 2;
  const R = lerp(right, finalRight, zoomP);
  chantEl.style.transform = `translate3d(${R.toFixed(1)}px, ${(-chant.h * 0.5 * scale).toFixed(1)}px, 0) scale(${scale.toFixed(4)})`;
  chantEl.style.transformOrigin = '0 0';
  chant.k.style.transform = `translate3d(${-chant.advK}px,0,0)`;
  const amp = chant.h * (0.012 + Math.min(Math.abs(vel) * 0.0016, 0.1));
  for (let j = 0; j < CHANT_N; j++) {
    const el = chant.w[j];
    const pop = clamp(n - j);
    if (pop <= 0) { el.style.visibility = 'hidden'; continue; }
    el.style.visibility = 'visible';
    const x = -chant.advK - (j + 1) * chant.advW + (1 - pop) * chant.advW;
    const y = Math.sin(j * 0.72 - t * 6) * amp;
    const s = pop < 1 ? 0.35 + pop * 0.65 + Math.sin(pop * Math.PI) * 0.34 : 1;
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${s.toFixed(3)})`;
  }
  chant.r.style.transform = `translate3d(${(-chant.advK - n * chant.advW - chant.advR).toFixed(1)}px,0,0)`;
}

/* ── the palm on its islet ────────────────────────────────── */
const palmSvg = document.getElementById('palm');
let palmGrowth = 0, palmTarget = 0, fronds = [];
function buildPalm() {
  const NS = 'http://www.w3.org/2000/svg';
  const col = '#0e0a12';
  // Frond outline: a tapering arc with pinnae cut into its underside.
  const frond = (len, droop) => {
    let d = 'M0 0';
    const under = [];
    const N = 15;
    for (let i = 1; i <= N; i++) {
      const u = i / N;
      const x = len * u;
      const y = -len * 0.34 * Math.sin(u * 1.7) + droop * u * u * len;
      const w = 5.4 * Math.sin(Math.PI * Math.min(u + 0.1, 1)) * (1 - u * 0.4);
      d += ` L${x.toFixed(1)} ${(y - w * 0.4).toFixed(1)}`;
      under.push([x, y, w, u]);
    }
    for (let i = under.length - 1; i >= 0; i--) {
      const [x, y, w, u] = under[i];
      d += ` L${(x - 3).toFixed(1)} ${(y + w * (1.4 + (1 - u) * 1.9)).toFixed(1)} L${(x - 6.5).toFixed(1)} ${(y + w * 0.3).toFixed(1)}`;
    }
    return `${d} Z`;
  };
  const trunk = document.createElementNS(NS, 'path');
  trunk.setAttribute('fill', col);
  const crown = document.createElementNS(NS, 'g');
  const defs = [[-168, 58, .55], [-146, 72, .5], [-122, 76, .42], [-96, 70, .34], [-72, 72, .42], [-44, 76, .5], [-18, 62, .56], [-190, 46, .68], [8, 46, .68]];
  fronds = defs.map(([rot, len, droop], i) => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', frond(len, droop));
    p.setAttribute('fill', col);
    crown.append(p);
    return { el: p, rot, delay: i * 0.03, d: frond(len, droop) };
  });
  palmSvg.append(trunk, crown);
  palmSvg._trunk = trunk;
  palmSvg._crown = crown;
}
const palmShape = { scale: 1, topX: 150, topY: 256 };
function drawPalm(t) {
  const g = palmGrowth;
  // A grown palm still has to fit between the water and the top of the screen.
  const unit = 300 / (palmSvg.clientWidth || 240);
  const room = (surfaceY - 6) * unit;
  const scale = lerp(0.62, Math.min(1.42, Math.max(0.8, room / 190)), g);
  const H = lerp(44, Math.max(60, Math.min(196, room - 80 * scale)), g);
  const bend = lerp(0, 16, g);
  const base = 300;
  const topX = 150 + bend;
  const topY = base - H;
  const wb = lerp(4.2, 10, g), wt = lerp(2.2, 5, g);
  palmSvg._trunk.setAttribute('d', `M${150 - wb} ${base} C${150 - wb} ${base - H * .5} ${topX - wt - 2} ${topY + H * .4} ${topX - wt} ${topY} L${topX + wt} ${topY} C${topX + wt + 2} ${topY + H * .4} ${150 + wb} ${base - H * .5} ${150 + wb} ${base} Z`);
  palmSvg._crown.setAttribute('transform', `translate(${topX} ${topY}) scale(${scale.toFixed(3)})`);
  palmShape.scale = scale; palmShape.topX = topX; palmShape.topY = topY;
  fronds.forEach((f) => {
    const sway = reduced ? 0 : Math.sin(t * 0.7 + f.rot) * 2.1;
    f.el.setAttribute('transform', `rotate(${(f.rot + sway).toFixed(2)})`);
  });
}

/* ── layout-dependent state ───────────────────────────────── */
// A slow connection can miss the fallback's deadline. If the code still arrives, the sea still comes up.
if (window.__plainByTimeout) root.classList.remove('plain');
let plain = root.classList.contains('plain');
const canvas = document.getElementById('gl');
let world = null;
if (!plain) {
  try { world = createWorld(canvas, { mobile }); } catch (e) { console.error(e); }
  if (!world) plain = true;
}
if (plain) root.classList.add('plain');
else window.__earthUp = true;

const nameEl = document.getElementById('name');
const horizonEl = document.getElementById('horizon');
const waterIn = document.getElementById('waterIn');
const globeEl = document.getElementById('globe');
const pinTag = document.getElementById('pinTag');
const pulseSvg = document.querySelector('.pulse-line');
let pulseOn = false;
new IntersectionObserver(([e]) => { pulseOn = e.isIntersecting; }).observe(pulseSvg);
const box = { x: 0, y: 0, w: 1, h: 1 };
let sunX = 0, planetAt = [0, 0, 1], chartKey = '', focal = 1000;
let heroBottom = 800, surfaceY = 0, waterY = 1e9, pageH = 1, vh = innerHeight, drainX = 0, drainY = 0;
let diveStart = 400, diveEnd = 900, nameBase = 0;
let earthAt = [0, 0, 0], pinAt = { x: 0, y: 0 }, signY = 0, orbitY = 1e9;
let gaugeStops = [], zoneStops = [0];
let introStart = performance.now();
let front = 0;
let namePoints = 0;

let nameKey = '';
function sampleName() {
  const r = nameEl.getBoundingClientRect();
  const style = getComputedStyle(nameEl);
  const fs = parseFloat(style.fontSize);
  // Re-sampling swaps every grain, so only do it when the word really changed.
  const face = nameFace();
  const key = [face.text, r.width, r.height, fs, document.fonts.check(`400 20px ${face.font}`, face.text)].join();
  box.y = r.top + scrollY - Math.ceil(fs * 0.45);
  box.x = r.left;
  // Find the DOM baseline so the grains land exactly on the real glyphs.
  const probe = document.createElement('span');
  probe.style.cssText = 'display:inline-block;width:0;height:0';
  nameEl.append(probe);
  const baseline = probe.getBoundingClientRect().bottom;
  probe.remove();
  nameBase = baseline + scrollY;
  if (key === nameKey) return;
  nameKey = key;
  // The letters overhang the line box, so sample a taller area than the element.
  const pad = Math.ceil(fs * 0.45);
  const cw = Math.ceil(r.width), ch = Math.ceil(r.height + pad * 2);
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.font = `400 ${fs}px ${face.font}`;
  g.direction = face.dir;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#fff';
  g.fillText(face.text, cw / 2, baseline - r.top + pad);
  const img = g.getImageData(0, 0, cw, ch).data;
  const pts = [];
  const target = mobile ? 12000 : 26000;
  let ink = 0;
  for (let i = 3; i < img.length; i += 4) if (img[i] > 110) ink++;
  const keep = Math.min(1, target / Math.max(ink, 1));
  for (let py = 0; py < ch; py++) {
    for (let px = 0; px < cw; px++) {
      if (img[(py * cw + px) * 4 + 3] > 110 && Math.random() < keep) pts.push((px + Math.random()) / cw, (py + Math.random()) / ch);
    }
  }
  box.x = r.left; box.y = r.top + scrollY - pad; box.w = cw; box.h = ch;
  namePoints = pts.length / 2;
  world.setName(new Float32Array(pts));
}

// What the sea has to reflect that the shader cannot draw by itself: the palm (red) and the name (green).
const maskCanvas = document.createElement('canvas');
let maskRect = [0, 0, 1, 1], maskPalm = -1;
function paintMask() {
  const W = innerWidth;
  const top = Math.max(0, surfaceY - 560);
  const H = Math.max(2, surfaceY - top);
  const k = 0.5;
  maskRect = [0, top, W, H];
  maskCanvas.width = Math.ceil(W * k);
  maskCanvas.height = Math.ceil(H * k);
  const g = maskCanvas.getContext('2d');
  g.setTransform(k, 0, 0, k, 0, -top * k);
  g.fillStyle = '#000';
  g.fillRect(0, top, W, H);
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = '#0f0';
  const face = nameFace();
  g.font = `400 ${parseFloat(getComputedStyle(nameEl).fontSize)}px ${face.font}`;
  g.direction = face.dir;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillText(face.text, box.x + box.w / 2, nameBase);
  if (palmSvg._trunk.getAttribute('d')) {
    const pb = palmSvg.getBoundingClientRect();
    const u = pb.width / 300;
    g.fillStyle = '#f00';
    g.translate(pb.left, pb.top + scrollY);
    g.scale(u, u);
    g.fill(new Path2D(palmSvg._trunk.getAttribute('d')));
    g.translate(palmShape.topX, palmShape.topY);
    g.scale(palmShape.scale, palmShape.scale);
    fronds.forEach((f) => {
      g.save();
      g.rotate((f.rot * Math.PI) / 180);
      g.fill(new Path2D(f.d));
      g.restore();
    });
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  world.setMask(maskCanvas);
  maskPalm = palmGrowth;
}

// The glyphs sunk in the water belong to whichever app you are heading for. One 3×2 atlas, one tile per stretch of sea.
const GLYPHS = [
  { face: '400 %px Lalezar', set: 'ك و ر ت ن ا هدف صافرة حكم مجلس كورة'.split(' ') },
  { face: '900 %px Archivo', set: '$ ? $20 SOLD $5 PASS RAISE $1'.split(' ') },
  { face: '800 %px "Baloo 2"', set: '1 2 3 4 5 6 7 8 9 10 11 12 13'.split(' ') },
  { face: 'italic 900 %px "Barlow Condensed"', set: 'GOL VAR FT 11 XI OFF 90+ 7'.split(' ') },
  { face: '700 %px Cairo', set: 'ا ب ت ث ج ح خ د ذ ر ز س ش ص ض ط ظ ع غ ف ق ك ل م ن ه و ي'.split(' ') },
  { face: '500 %px "IBM Plex Mono"', set: '{ } </> ; => if fn 404 ( )'.split(' ') },
];
function fossils() {
  const T = 682, cells = 5, step = T / cells;
  const c = document.createElement('canvas');
  c.width = T * 3;
  c.height = T * 2;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const R = (() => { let a = 11; return () => (a = (a * 16807) % 2147483647) / 2147483647; })();
  GLYPHS.forEach(({ face, set }, z) => {
    const ox = (z % 3) * T, oy = Math.floor(z / 3) * T;
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        const word = set[Math.floor(R() * set.length)];
        let fs = 34 + R() * 52;
        g.font = face.replace('%', fs);
        fs *= Math.min(1, (step * 0.92) / g.measureText(word).width); // long words stay inside their cell, so none is cut at a tile's edge
        g.font = face.replace('%', fs);
        g.save();
        g.translate(ox + (x + 0.5 + (R() - 0.5) * 0.2) * step, oy + (y + 0.5 + (R() - 0.5) * 0.2) * step);
        g.rotate((R() - 0.5) * 0.9);
        g.fillText(word, 0, 0);
        g.restore();
      }
    }
  });
  world.setFossils(c);
}

// Real constellations, with the Arabic names most of these stars still go by in every language.
// Names checked against Wikipedia's list of Arabic star names on 2026-11-05.
// Red channel: the stars, always visible. Green channel: lines and names, which the lamp brings out.
const CONSTELLATIONS = [
  // Orion
  { at: [.8, .1], w: .2, phone: [.58, .2, .34], lines: [[0, 1], [0, 2], [1, 4], [2, 3], [3, 4], [2, 5], [4, 6], [5, 6]], stars: [
    [.2, .08, 1.5, 'يد الجوزاء', 'Betelgeuse'], [.72, .14, 1], [.38, .5, 1, 'النطاق', 'Alnitak', -1], [.5, .46, 1], [.62, .42, 1, 'المنطقة', 'Mintaka', 1], [.28, .95, 1, 'السيف', 'Saiph'], [.8, .9, 1.4, 'رجل الجبّار', 'Rigel'],
  ] },
  // The Big Dipper
  { at: [.4, .05], w: .24, flat: .44, lines: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]], stars: [
    [.06, .14, 1.2, 'كاهل الدّب', 'Dubhe'], [.04, .62, 1, 'المراقّ', 'Merak'], [.28, .84, 1], [.3, .42, .9], [.5, .46, 1], [.68, .62, 1.1, 'المئزر', 'Mizar'], [.95, .94, 1.1, 'القائد', 'Alkaid'],
  ] },
  // Cetus, the whale: it comes back much further down the page.
  { at: [.03, .56], w: .23, flat: .56, lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [2, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 7]], stars: [
    [.98, .82, 1.4, 'ذنب قيطوس', 'Deneb Kaitos'], [.8, .5, .9], [.64, .46, .9], [.58, .84, 1.1, 'بطن قيطوس', 'Baten Kaitos'], [.8, 1, .8], [.42, .42, 1], [.28, .28, .8], [.17, .1, .9], [.02, .2, 1.3, 'المنخر', 'Menkar'], [.07, 0, .8],
  ] },
  { at: [.685, .2], w: .01, lines: [], stars: [[0, 0, 1.4, 'الدبران', 'Aldebaran']] },
  { at: [.3, .42], w: .01, phone: [.12, .46, .01], lines: [], stars: [[0, 0, 1.2, 'فم الحوت', 'Fomalhaut']] },
  // Low over the water, the way it sits from Arabia.
  { at: [.735, .62], w: .01, phone: [.1, .84, .01], lines: [], stars: [[0, 0, 1.6, 'سهيل', 'Canopus']] },
];

function drawChart(W, H) {
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  const c = document.createElement('canvas');
  c.width = Math.round(W * dpr);
  c.height = Math.round(H * dpr);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'lighter';
  const narrow = W < 760;
  CONSTELLATIONS.forEach((k) => {
    if (narrow && !k.phone) return;
    const [ax, ay, aw] = narrow ? k.phone : [...k.at, k.w];
    const bw = aw * W;
    const bh = bw * (k.flat || 1.25);
    const pts = k.stars.map(([x, y, m, ar, en, side]) => ({ x: ax * W + x * bw, y: ay * H + y * bh, m, ar, en, side }));
    g.strokeStyle = '#00ff00';
    g.lineWidth = 1;
    g.globalAlpha = .6;
    k.lines.forEach(([a, b]) => {
      const dx = pts[b].x - pts[a].x, dy = pts[b].y - pts[a].y, len = Math.hypot(dx, dy) || 1;
      // Lines stop short of the stars, the way a star chart draws them.
      g.beginPath();
      g.moveTo(pts[a].x + (dx / len) * 7, pts[a].y + (dy / len) * 7);
      g.lineTo(pts[b].x - (dx / len) * 7, pts[b].y - (dy / len) * 7);
      g.stroke();
    });
    g.globalAlpha = 1;
    pts.forEach((p) => {
      g.fillStyle = '#ff0000';
      g.beginPath();
      g.arc(p.x, p.y, 1.1 * p.m, 0, 6.283);
      g.fill();
      g.globalAlpha = .16;
      g.beginPath();
      g.arc(p.x, p.y, 4.4 * p.m, 0, 6.283);
      g.fill();
      g.globalAlpha = 1;
      if (!p.ar) return;
      g.fillStyle = '#00ff00';
      g.textAlign = p.side ? (p.side < 0 ? 'right' : 'left') : 'center';
      g.textBaseline = 'top';
      const lx = p.x + (p.side || 0) * 10;
      const ly = p.side ? p.y - 9 : p.y + 8;
      g.direction = 'rtl';
      g.textAlign = p.side ? (p.side < 0 ? 'left' : 'right') : 'center'; // start and end swap in RTL
      g.font = `500 ${narrow ? 11.5 : 13}px "IBM Plex Sans Arabic", sans-serif`;
      g.fillText(p.ar, lx, ly);
      g.direction = 'ltr';
      g.textAlign = p.side ? (p.side < 0 ? 'right' : 'left') : 'center';
      g.globalAlpha = .72;
      g.font = `400 ${narrow ? 9.5 : 10.5}px "IBM Plex Mono", monospace`;
      g.fillText(p.en, lx, ly + (narrow ? 15 : 17));
      g.globalAlpha = 1;
    });
  });
  world.setChart(c);
}

/* ── life in the water ────────────────────────────────────── */
const cetusEl = document.getElementById('cetus');
const starTags = [...document.querySelectorAll('.star-tag')].map((el) => ({ el, star: el.dataset.star }));
const places = { far: 0, manta: 0, jelly: [], cetusTop: 0, cetusH: 1, shoal: 0 };
let whaleNamed = null, lifeReady = false, shoal = null, shoalOn = false;
const JELLIES = [
  { c0: [.95, .35, .8], c1: [.55, .85, 1] },
  { c0: [.35, .85, 1], c1: [.9, 1, 1] },
  { c0: [1, .6, .35], c1: [1, .4, .75] },
];
function initLife() {
  if (lifeReady || !world) return;
  lifeReady = true;
  const whale = buildWhale(mobile ? 11000 : 26000);
  whaleNamed = whale.named;
  world.setBeast(0, whale.data);
  world.setBeast(1, buildJelly(mobile ? 1600 : 3000));
  world.setBeast(2, buildManta(mobile ? 4000 : 9000));
  world.setLand(paintLand(mobile ? 1536 : 2048));
  shoal = makeShoal(mobile ? 170 : 360, innerWidth / 2, places.shoal, 220);
  world.setShoal(shoal);
}

// Where everything is in the water right now. Whales swim the way the page reads.
function lifeNow(sy, t) {
  const out = [];
  const W = innerWidth;
  const dirSign = root.dir === 'rtl' ? -1 : 1;
  const span = (y) => clamp((sy + vh * 1.15 - y) / (vh * 2.3));
  const fade = (p) => smooth(clamp(p / 0.12)) * smooth(clamp((1 - p) / 0.12));
  const along = (p) => (dirSign > 0 ? lerp(-0.2, 1.2, p) : lerp(1.2, -0.2, p)) * W;

  // First sight of it: small and far off, so the big one later is a return.
  const pFar = span(places.far);
  if (pFar > 0 && pFar < 1) {
    out.push({ kind: 0, x: along(0.12 + pFar * 0.76), y: places.far - vh * 0.34 - sy + Math.sin(t * 0.2) * 14, scale: Math.min(W * 0.13, 170), rot: 0.05 * dirSign, flip: dirSign, alpha: 0.42 * fade(pFar), c0: [.5, .85, 1], c1: [.86, 1, 1] });
  }
  const pM = span(places.manta);
  if (pM > 0 && pM < 1) {
    // It climbs past you with its wings spread, on the side the text is not on.
    const mx = dirSign > 0 ? lerp(0.82, 0.68, pM) : lerp(0.18, 0.32, pM);
    out.push({ kind: 2, x: mx * W, y: places.manta - sy + (0.5 - pM) * vh * 0.7, scale: mobile ? W * 0.3 : Math.min(W * 0.17, 240), rot: -0.22 * dirSign, alpha: 0.9 * fade(pM), c0: [.62, .9, 1], c1: [1, 1, 1] });
  }
  places.jelly.forEach((j, i) => {
    const y = j.y + Math.sin(t * 0.17 + i * 2.1) * 26 - sy;
    if (y < -vh * 0.5 || y > vh * 1.5) return;
    const c = JELLIES[i % JELLIES.length];
    out.push({ kind: 1, x: j.x * W + Math.sin(t * 0.13 + i) * 20, y, scale: j.s, rot: Math.sin(t * 0.21 + i * 1.7) * 0.14, phase: i * 1.9, alpha: 0.95, c0: c.c0, c1: c.c1 });
  });
  // The big pass, held on screen while the section scrolls.
  const pW = clamp((sy + vh * 0.75 - places.cetusTop) / (places.cetusH + vh * 0.2));
  let whale = null;
  if (pW > 0 && pW < 1) {
    const scale = mobile ? W * 0.72 : Math.min(W * 0.4, vh * 0.64);
    const x = dirSign > 0 ? lerp(-scale * 1.15, W + scale * 1.15, pW) : lerp(W + scale * 1.15, -scale * 1.15, pW);
    const rot = Math.sin(t * 0.25) * 0.025 - 0.05 * dirSign;
    whale = { kind: 0, x, y: vh * 0.66 + Math.sin(t * 0.3) * 10, scale, rot, flip: dirSign, alpha: fade(pW), c0: [.6, .85, 1], c1: [1, .97, .88] };
    out.push(whale);
  }
  placeStarTags(whale, t);
  return out;
}

// The labels ride on the whale: same undulation as the shader, so they stay on their stars.
function placeStarTags(whale, t) {
  if (!cetusEl) return;
  const on = !!(whale && whaleNamed && whale.alpha > 0.6);
  starTags.forEach(({ el, star }) => {
    if (!on) { if (el.style.opacity !== '0') el.style.opacity = '0'; return; }
    const [lx, ly] = whaleNamed[star];
    const tail = smooth(clamp((0.3 - lx) / 1.35));
    const yy = ly + Math.sin(lx * 2.4 + t * 1.05) * tail * tail * 0.17 + Math.sin(t * 0.5) * 0.012;
    const px = lx * whale.flip;
    const c = Math.cos(whale.rot), s = Math.sin(whale.rot);
    const sx = whale.x + (px * c - yy * s) * whale.scale;
    const sy = whale.y - (px * s + yy * c) * whale.scale;
    el.style.opacity = sx > 40 && sx < innerWidth - 40 ? '1' : '0';
    el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`;
  });
}

function layout() {
  vh = canvas.clientHeight || innerHeight;
  pageH = document.documentElement.scrollHeight;
  worlds.forEach((w) => {
    w.top = w.el.offsetTop;
    w.bottom = w.top + w.el.offsetHeight;
    w.openH = w.open ? w.open.offsetHeight : 0;
    w.beats = [...w.el.querySelectorAll('.beat')].map((b) => b.offsetTop);
  });
  surfaceY = horizonEl.getBoundingClientRect().top + scrollY;
  heroBottom = document.getElementById('surface').offsetHeight;
  diveStart = surfaceY * 0.52;
  diveEnd = heroBottom * 1.02;
  waterY = waterIn.getBoundingClientRect().top + scrollY;
  const secTop = (id) => document.getElementById(id).offsetTop;
  const today = new Date().toISOString().slice(0, 10);
  const m = (date) => daysBetween(date, today) * 10;
  gaugeStops = [
    { y: diveEnd * 0.8, m: 0 },
    ...DATES.map(([id, date]) => ({ y: secTop(id), m: m(date) })),
    { y: secTop('seeds'), m: 4000 },
    { y: secTop('wrecks'), m: 6000 },
    { y: secTop('crew'), m: 8500 },
    { y: secTop('water'), m: 10935 },
  ];
  // A new set of glyphs starts as you leave each app, so they foreshadow the next one.
  zoneStops = [0, ...['bidwars', 'lumiku', 'footies', 'jadhr'].map((d) => document.querySelector(`.gap[data-to="${d}"]`).offsetTop), document.getElementById('seeds').previousElementSibling.offsetTop];
  const gb = globeEl.getBoundingClientRect();
  orbitY = gb.top + scrollY - vh * 0.4;
  if (!world) return;
  world.resize();
  sampleName();
  drainX = box.x + box.w / 2;
  drainY = box.y + box.h * 0.8;
  const width = canvas.clientWidth;
  focal = Math.max(width, vh) * 0.9;
  const palmBox = palmSvg.getBoundingClientRect();
  sunX = palmBox.left + palmBox.width / 2;
  const pr = clamp(width * 0.052, 38, 92);
  planetAt = [width * (width < 760 ? 0.27 : 0.17), Math.max(pr * 1.5 + 74, surfaceY * 0.3), pr];
  const key = [width, surfaceY, document.fonts.check('500 13px "IBM Plex Sans Arabic"', 'الدبران')].join();
  if (key !== chartKey) { chartKey = key; drawChart(width, surfaceY); }

  // The globe: the root ends on it, at home.
  const R = Math.min(width * 0.47, gb.height * 0.47, 620);
  earthAt = [width / 2, gb.top + scrollY + gb.height / 2, R];
  pinAt = riyadh(earthAt[0], earthAt[1], R);
  if (pinTag) pinTag.style.transform = `translate3d(${pinAt.x.toFixed(1)}px, ${(pinAt.y - (gb.top + scrollY)).toFixed(1)}px, 0)`;
  signY = gb.top + scrollY - Math.min(box.h * 0.62, vh * 0.3);

  const anchors = [{ y: surfaceY, x: sunX / width, rich: 0.5 }];
  sections.forEach((s) => {
    const y = s.offsetTop;
    // data-root is measured along the reading direction, so the root stays clear of the text in both languages.
    const inline = parseFloat(s.dataset.root ?? 0.5);
    const x = root.dir === 'rtl' ? 1 - inline : inline;
    const rich = parseFloat(s.dataset.rich ?? (s.dataset.world ? 0.25 : 1));
    if (s.classList.contains('gap')) {
      anchors.push({ y: y + s.offsetHeight * 0.5, x, rich });
    } else if (s.id === 'water') {
      anchors.push({ y: y + s.offsetHeight * 0.06, x, rich });
    } else {
      anchors.push({ y: y + s.offsetHeight * 0.12, x, rich });
      anchors.push({ y: y + s.offsetHeight * 0.88, x, rich });
    }
  });
  anchors.push({ y: pinAt.y, x: pinAt.x / width, rich: 0.2 });
  anchors.sort((a, b) => a.y - b.y);
  const mesh = buildRoots({ width, height: pinAt.y + 2, anchors, startX: sunX, startY: surfaceY, density: mobile ? 0.48 : 1 });
  world.setRoots(mesh);
  drainX = mesh.tapAt(drainY);
  buildChant();
  paintMask();

  // Where the creatures live, and how many fit.
  const gapOf = (sel) => { const g = document.querySelector(sel); return g ? g.offsetTop + g.offsetHeight / 2 : 0; };
  places.far = gapOf('.gap-first');
  places.shoal = gapOf('.gap-first') + vh * 0.44;
  places.manta = gapOf('.gap[data-to="bidwars"]');
  const s = Math.min(width * 0.13, 128);
  const jy = [gapOf('.gap[data-to="lumiku"]'), gapOf('.gap[data-to="footies"]')];
  places.jelly = [
    { x: .14, y: jy[0] - vh * .2, s: s * 1.2 }, { x: .84, y: jy[0] + vh * .12, s: s * .8 }, { x: .62, y: jy[0] - vh * .42, s: s * .5 },
    { x: .85, y: jy[1] - vh * .24, s: s * 1.1 }, { x: .16, y: jy[1] + vh * .16, s: s * .75 }, { x: .4, y: jy[1] + vh * .42, s: s * .5 },
  ];
  places.cetusTop = cetusEl.offsetTop;
  places.cetusH = cetusEl.offsetHeight;
}
let layoutTimer = 0, lastW = innerWidth;
function queueLayout() {
  clearTimeout(layoutTimer);
  layoutTimer = setTimeout(layout, 180);
}
addEventListener('resize', () => {
  // A collapsing mobile URL bar must not rebuild the whole sea.
  if (Math.abs(innerWidth - lastW) < 2 && mobile) return;
  lastW = innerWidth;
  queueLayout();
});
new ResizeObserver(() => {
  const h = document.documentElement.scrollHeight;
  if (Math.abs(h - pageH) > 40) queueLayout();
}).observe(document.body);

/* ── pointer ──────────────────────────────────────────────── */
const pointer = { x: innerWidth / 2, y: innerHeight * 0.4, sx: innerWidth / 2, sy: innerHeight * 0.4, at: -1e9, seen: false, amt: 0, lx: 0, ly: 0 };
const onPoint = (x, y) => { pointer.x = x; pointer.y = y; pointer.at = performance.now(); pointer.seen = true; };
let waterlineNow = 1e9, camHNow = 2;
let fall = { x: 0, at: Infinity, done: false };
const stirs = [];
addEventListener('pointermove', (e) => onPoint(e.clientX, e.clientY), { passive: true });
addEventListener('pointerdown', (e) => {
  onPoint(e.clientX, e.clientY);
  if (!world || e.target.closest('a, button, .bw, .felt, .hx, .jp, .scan')) return;
  const row = surfaceY - scrollY;
  if (e.clientY < row) {
    // Tap the sky and a star falls into the sea below where you tapped.
    if (performance.now() - fall.at > 900) fall = { x: e.clientX, at: performance.now() + 700, done: false };
  } else if (e.clientY < waterlineNow) {
    world.addSeaRipple(e.clientX, e.clientY, row, camHNow, focal, 1.5);
  } else if (e.clientY >= waterlineNow) {
    world.addRipple(e.clientX, scrollY + e.clientY, 1.2);
    sound.ping();
  }
  stirs.push({ x: e.clientX, y: e.clientY, dx: 0, dy: -260, r: 70, c: [.08, .55, .7] });
}, { passive: true });
addEventListener('touchmove', (e) => { const t = e.touches[0]; if (t) onPoint(t.clientX, t.clientY); }, { passive: true });

/* ── parallax targets ─────────────────────────────────────── */
const posters = [...document.querySelectorAll('[data-posters] img')].map((img) => ({ el: img, on: false, speed: 0.04 + Math.random() * 0.05 }));
{
  const io = new IntersectionObserver((es) => es.forEach((e) => { const p = posters.find((x) => x.el === e.target); if (p) p.on = e.isIntersecting; }), { rootMargin: '10% 0px' });
  posters.forEach((p) => io.observe(p.el));
}
function drawPosters() {
  for (const p of posters) {
    if (!p.on) continue;
    const r = p.el.getBoundingClientRect();
    const k = (r.top + r.height / 2 - vh / 2) / vh;
    const base = getRot(p.el);
    p.el.style.transform = `translate3d(0, ${clamp(k * -70 * (1 + p.speed * 8), -46, 46).toFixed(1)}px, 0) rotate(${(base + clamp(k, -1, 1) * 6).toFixed(2)}deg)`;
  }
}
const rotCache = new Map();
function getRot(el) {
  if (!rotCache.has(el)) rotCache.set(el, parseFloat(getComputedStyle(el).getPropertyValue('--r')) || 0);
  return rotCache.get(el);
}

/* ── stages ───────────────────────────────────────────────── */
const bwTitle = document.querySelector('.bw-title');
const bwCards = document.querySelector('.bw-cards');
const fTitle = document.querySelector('.f-title');
const fPow1 = document.querySelector('.f-pow1');
const fPow2 = document.querySelector('.f-pow2');
const jTitle = document.querySelector('.j-title');
const rackTitle = document.getElementById('rackTitle');
const purses = [...document.querySelectorAll('#purses b')];
const pursesBox = document.getElementById('purses');
const jFamily = document.getElementById('jFamily');
// The money runs out exactly as the story says it does.
const PURSES = [[20, 20], [17, 15], [1, 9], [0, 6]];
const POWS = ['STATHAM?!', 'VAR CHECK!', 'GOLAZO!'];
// Where each Lumiku tile starts, flung across the table: x and y in screen percent, then rotation.
const SCATTER = [[-22, -26, -24], [18, 22, 16], [-14, 20, -12], [24, -22, 20], [-24, 8, 30], [12, -14, -18]];

function drawStage(w, sy, t, vel) {
  const local = sy - w.top;                         // 0 when the section's top reaches the viewport top
  const entry = clamp((sy + vh - w.top) / vh);      // 0..1 as the section rises into view
  const after = Math.max(0, local - (w.openH - vh)); // pixels scrolled past the opening
  const pointerX = pointer.sx / innerWidth - 0.5;
  // Which subtitle is on screen. The stage plays along with it.
  const beat = w.beats.reduce((n, top, i) => (sy + vh * 0.75 >= w.top + top ? i : n), -1);
  // One line at a time, like subtitles: the rest wait out of sight even while they scroll past.
  const showing = after > vh * 0.2 ? -1 : beat;
  if (showing !== w.shown) {
    w.shown = showing;
    w.caps.forEach((c, i) => c.classList.toggle('on', i === showing));
  }

  if (w.id === 'k') {
    // The word sits still until the third subtitle says the room starts singing.
    const from = w.top + w.beats[2] - vh * 0.75, to = w.top + w.beats[3] - vh * 0.75;
    drawChant(clamp((sy - from) / (to - from)) * 0.76 + clamp((sy - to) / (vh * 0.5)) * 0.24, vel, t);
    chantEl.style.top = `calc(46% - ${after.toFixed(0)}px)`;
    w.stage.classList.toggle('past', after > 40);
  } else if (w.id === 'b') {
    const mx = clamp(0.5 + pointerX * 0.9 + Math.sin(t * 0.5) * 0.04, 0.08, 0.92);
    bwTitle.style.setProperty('--x', `${(mx * 100).toFixed(2)}%`);
    bwTitle.style.transform = `translate3d(0, ${(-after).toFixed(0)}px, 0) scale(${lerp(1.25, 1, smooth(entry)).toFixed(3)})`;
    const spread = smooth(entry);
    bwCards.style.transform = `translate3d(${(pointerX * -36).toFixed(1)}px, ${(lerp(120, -18, spread) - after * 1.4).toFixed(0)}px, 0) rotate(${lerp(-10, 0, spread).toFixed(2)}deg) scale(${lerp(.8, 1, spread).toFixed(3)})`;
    pursesBox.style.transform = `translate3d(0, ${(-after).toFixed(0)}px, 0)`;
    const money = PURSES[Math.max(beat, 0)];
    purses.forEach((el, i) => {
      const txt = `$${money[i]}`;
      if (el.textContent === txt) return;
      el.textContent = txt;
      el.classList.add('hit');
      setTimeout(() => el.classList.remove('hit'), 240);
    });
  } else if (w.id === 'l') {
    rackTitle.style.transform = `translate3d(-50%, calc(-50% + ${(-after).toFixed(0)}px), 0)`;
    const open = clamp((entry - 0.4) / 0.6);
    // The tiles start flung across the table and get worked into the word as the story goes.
    const worked = clamp((sy + vh * 0.75 - w.top - w.beats[0]) / (w.beats[w.beats.length - 1] - w.beats[0] + vh * 0.5));
    rackTiles.forEach((el, i) => {
      const p = clamp(open * 1.9 - i * 0.14);
      const e = 1 - Math.pow(1 - p, 3);
      const k = 1 - smooth(clamp(worked * 1.7 - i * 0.13));
      const [dx, dy, r] = SCATTER[i];
      el.style.transform = `translate(${(k * dx).toFixed(2)}vw, ${(k * dy).toFixed(2)}vh) rotate(${(k * r).toFixed(1)}deg) rotateX(${((1 - e) * -96).toFixed(1)}deg) translateY(${(Math.sin(t * 1.4 + i * 0.8) * 3).toFixed(1)}px)`;
    });
  } else if (w.id === 'f') {
    const e = smooth(entry);
    fTitle.style.transform = `translate3d(0, calc(-50% + ${(-after).toFixed(0)}px), 0) rotate(${lerp(-7, -2.4, e).toFixed(2)}deg) scale(${lerp(.72, 1, e).toFixed(3)})`;
    const bob = Math.sin(t * 1.5) * 7;
    fPow1.style.transform = `translate3d(${(pointerX * 34).toFixed(1)}px, ${(bob - after * 1.3).toFixed(1)}px, 0) scale(${e.toFixed(3)})`;
    const pow = POWS[clamp(beat, 0, 2)];
    if (fPow1.textContent !== pow) fPow1.textContent = pow;
    // Full time only comes at the end of the story.
    fPow2.style.transform = `translate3d(${(pointerX * -34).toFixed(1)}px, ${(-bob - after * 1.5).toFixed(1)}px, 0) scale(${(beat >= 2 ? e : 0).toFixed(3)})`;
  } else if (w.id === 'j') {
    jTitle.style.transform = `translate3d(0, calc(-50% + ${(-after).toFixed(0)}px), 0)`;
    jFamily.style.transform = `translate3d(0, ${(-after).toFixed(0)}px, 0)`;
    const family = beat === 1 || beat === 2;
    jFamily.style.opacity = family ? 1 : 0;
    jTitle.style.opacity = family ? 0.07 : 1;
    if (beat === 3) pulse = Math.max(pulse, 0.9); // the root itself lights up as the story names it
  }
}

/* ── main loop ────────────────────────────────────────────── */
let last = performance.now(), prevSy = scrollY, vel = 0, currentWorld = null, navCurrent = '', wasUnder = false, lastSong = 0, impactDone = false;
const navLinks = () => [...core.querySelectorAll('a')];
const DATES = [['kooratna', '2026-10-31'], ['bidwars', '2026-10-28'], ['lumiku', '2026-10-13'], ['footies', '2026-09-08'], ['jadhr', '2026-06-11']];

function seaAt(f) {
  let a = SEA_STOPS[0], b = SEA_STOPS[SEA_STOPS.length - 1];
  for (let i = 1; i < SEA_STOPS.length; i++) {
    if (f <= SEA_STOPS[i].at) { a = SEA_STOPS[i - 1]; b = SEA_STOPS[i]; break; }
  }
  const t = smooth(clamp((f - a.at) / Math.max(0.0001, b.at - a.at)));
  return { pal: a.pal.map((c, i) => mixColor(c, b.pal[i], t)), root: mixColor(a.root, b.root, t), dust: mixColor(a.dust, b.dust, t) };
}

const pace = { sum: 0, n: 0, slow: 0 };
function frame(now) {
  requestAnimationFrame(frame);
  const raw = now - last;
  const dt = Math.min(0.05, raw / 1000);
  last = now;
  // Frame pacing, ignoring gaps from a hidden tab and the first seconds, when everything is still being built.
  // It takes two slow stretches in a row to step down: one hiccup should not cost a visitor resolution for the whole visit.
  if (world && raw < 250 && now - introStart > 5000) {
    pace.sum += raw;
    if (++pace.n === 60) {
      pace.slow = pace.sum / pace.n > 25 ? pace.slow + 1 : 0;
      if (pace.slow >= 2) { world.lowerQuality(); pace.slow = 0; }
      pace.sum = 0;
      pace.n = 0;
    }
  }
  const t = now / 1000;

  if (travel) {
    const k = clamp((now - travel.t0) / travel.ms);
    const e = k < 0.5 ? 16 * k ** 5 : 1 - Math.pow(-2 * k + 2, 5) / 2;
    scrollTo(0, lerp(travel.from, travel.to, e));
    if (k >= 1) { travel = null; if (arrivePalm) { arrivePalm = false; palmTarget = 1; } }
  }
  const sy = scrollY;
  const scrolled = sy - prevSy;
  const rawVel = scrolled / Math.max(dt, 0.001) / 60;
  prevSy = sy;
  vel += (rawVel - vel) * 0.14;

  // pointer smoothing; with no pointer the lamp wanders on its own
  const idle = now - pointer.at > 6000;
  const wanderX = innerWidth * (0.5 + 0.34 * Math.sin(t * 0.21));
  const wanderY = vh * (0.5 + 0.28 * Math.sin(t * 0.17 + 1.2));
  const tx = pointer.seen && !idle ? pointer.x : wanderX;
  const ty = pointer.seen && !idle ? pointer.y : wanderY;
  const k = 1 - Math.exp(-dt * (pointer.seen && !idle ? 11 : 1.4));
  pointer.sx += (tx - pointer.sx) * k;
  pointer.sy += (ty - pointer.sy) * k;
  pointer.amt += (((pointer.seen && now - pointer.at < 1400) ? 1 : 0) - pointer.amt) * (1 - Math.exp(-dt * 3));

  // Which pearl is open? Sections sit far enough apart that it is never two at once.
  let active = null;
  for (const w of worlds) {
    const entered = sy + vh > w.top - vh * 0.1;
    const left = sy > w.bottom + 40; // the exit's waves reach this far
    if (entered && !left) { active = w; break; }
  }
  if (active !== currentWorld) {
    currentWorld?.stage.classList.remove('on');
    active?.stage.classList.add('on');
    currentWorld = active;
  }

  // Sink: down the gauge, in metres, and the palette and everything else with it.
  const mid = sy + vh * 0.4;
  const metres = depthAt(mid, gaugeStops);
  const depthF = clamp(Math.log10(1 + metres) / Math.log10(10936));
  const inOrbit = mid > orbitY;
  let zone = 0;
  zoneStops.forEach((y, i) => { if (mid >= y) zone = i; });

  // The dive. Above: a camera over the water, sinking as you scroll. Then the sea climbs the lens from the
  // bottom of the screen. Under: the camera starts out looking back up at the surface and tips down into the deep.
  const dive = clamp((sy - diveStart) / Math.max(1, diveEnd - diveStart));
  const above = sy < diveEnd + 40;
  const e = smooth(dive);
  const waterline = dive <= 0 ? vh + 120 : !above ? -200 : lerp(vh + 70, -70, e);
  waterlineNow = waterline;
  const camH = lerp(2.5, 0.42, smooth(clamp(sy / diveEnd)));
  camHNow = camH;
  const looking = clamp((sy - lerp(diveStart, diveEnd, 0.4)) / (vh * 1.05));
  const pitch = lerp(1.02, -0.2, smooth(looking));
  const ceilD = lerp(0.42, 5, smooth(looking));
  const ceil = dive > 0 ? 1 - smooth(clamp((looking - 0.6) / 0.4)) : 0;
  const under = smooth(clamp((dive - 0.25) / 0.5));
  sound.setDive(under * (inOrbit ? 0.35 : 1));
  const isUnder = dive > 0.5;
  if (isUnder !== wasUnder) { wasUnder = isUnder; if (isUnder) sound.splash(); }
  setMaqam(active ? active.cfg.maqam : mid > orbitY - vh ? 'saba' : 'rast');

  // Scroll position → pearl size. A pearl first, small enough to be a thing in the water; then it swallows the screen.
  const hole = active && (() => {
    const entry = clamp((sy + vh - active.top + vh * 0.1) / (vh * 1.1));
    const diag = Math.hypot(innerWidth, vh);
    const pearl = mobile ? 74 : 108;
    const r = entry <= 0 ? 0 : pearl * smooth(clamp(entry / 0.34)) + diag * 1.08 * Math.pow(clamp((entry - 0.3) / 0.7), 2.5);
    return { r, x: innerWidth / 2, y: lerp(vh * 0.76, vh * 0.48, smooth(clamp(entry / 0.5))), bottom: active.bottom, seed: active.cfg.seed, rim0: rgb(active.cfg.rim0), rim1: rgb(active.cfg.rim1), entry };
  })();
  const fullyOpen = !!hole && hole.entry >= 1 && hole.bottom - sy > vh + 40;
  // Dark controls only once the paper is really under them.
  const tone = hole && active.cfg.tone === 'dark' && hole.entry > 0.82 && hole.bottom - sy > 90 ? 'dark' : 'light';
  if (root.dataset.tone !== tone) root.dataset.tone = tone;

  if (active && world) drawStage(active, sy, t, vel);
  drawPosters();

  // Colours by depth, with the root taking the world's colour inside one.
  const sea = seaAt(depthF);
  let rootColor = sea.root, dustColor = sea.dust, rootInk = 0;
  if (hole) {
    const inside = clamp((hole.entry - 0.55) / 0.45) * clamp((hole.bottom - sy - vh * 0.5) / (vh * 0.4));
    rootColor = mixColor(sea.root, rgb(active.cfg.rootC).map((v) => v * (active.cfg.ink ? 1 : 0.72)), inside);
    dustColor = mixColor(sea.dust, rgb(active.cfg.dust), inside);
    rootInk = (active.cfg.ink || 0) * inside;
  }

  front = Math.max(front, sy + vh * 0.95);
  const impactAt = introStart + 900;
  const impactAge = (now - impactAt) / 1000;
  const introT = clamp(impactAge / 2.6);
  const growFront = surfaceY + (front - surfaceY) * smooth(clamp((now - introStart - 1200) / 2200));
  pulse *= Math.exp(-dt * 5);

  // Palm grows slowly once it has been watered
  const pg = palmGrowth + (palmTarget - palmGrowth) * (1 - Math.exp(-dt * 0.62));
  if (Math.abs(pg - palmGrowth) > 0.0002 || !palmDrawn) { palmGrowth = pg; }
  if (sy < vh * 0.7) {
    drawPalm(t);
    palmDrawn = true;
    if (world && Math.abs(palmGrowth - maskPalm) > 0.02) paintMask();
  }

  const melt = clamp((sy - vh * 0.02) / (vh * 0.62));
  nameEl.style.setProperty('--ghost', (smooth(clamp((introT - 0.5) / 0.5)) * (1 - clamp(melt * 2.4))).toFixed(3));
  const reform = sy + vh > signY ? smooth(clamp((sy + vh * 0.72 - signY) / (vh * 0.5))) : 0;

  // The water: the hand stirs it, and when nobody is touching it, it stirs itself.
  const moved = Math.hypot(pointer.sx - pointer.lx, pointer.sy - pointer.ly);
  if (world && dt > 0 && moved > 0.4) {
    const speed = moved / Math.max(dt, 0.008);
    const active2 = pointer.seen && !idle;
    const glow = Math.min(speed / 2400, 1) * (active2 ? 0.2 : 0.05);
    const cool = 0.5 + 0.5 * Math.sin(t * 0.3);
    stirs.push({
      x: pointer.sx, y: pointer.sy,
      dx: ((pointer.sx - pointer.lx) / Math.max(dt, 0.008)) * 0.13, dy: ((pointer.sy - pointer.ly) / Math.max(dt, 0.008)) * 0.13,
      r: mobile ? 44 : 58,
      c: [glow * lerp(0.05, 0.3, cool * depthF), glow * lerp(0.75, 0.32, cool * depthF), glow * 1.05],
    });
  }
  pointer.lx = pointer.sx; pointer.ly = pointer.sy;

  // The opening: a star falls into the sea and the name comes up out of the splash. Later ones are the visitor's own.
  if (!impactDone && world) { impactDone = true; fall = { x: box.x + box.w / 2, at: impactAt, done: false }; }
  const fallAge = (now - fall.at) / 1000;
  if (!fall.done && fallAge >= 0 && world) {
    fall.done = true;
    const row = surfaceY - sy;
    world.addSeaRipple(fall.x, row + 9, row, camH, focal, 2.4);
    stirs.push({ x: fall.x, y: row + 6, dx: 0, dy: -900, r: 120, c: [.1, .5, .7] });
    if (fall.at !== impactAt) sound.ping();
  }
  if (lifeReady && dt > 0 && places.shoal) {
    shoalOn = Math.abs(places.shoal - sy - vh / 2) < vh * 1.3;
    if (shoalOn) {
      const tgtX = innerWidth * (0.5 + 0.34 * Math.sin(t * 0.23));
      const tgtY = places.shoal + Math.sin(t * 0.31) * vh * 0.12;
      stepShoal(shoal, dt, tgtX, tgtY, pointer.seen && !idle ? { x: pointer.x, y: pointer.y + sy } : null);
    }
  }

  let beasts = [];
  if (lifeReady && !fullyOpen) {
    beasts = lifeNow(sy, t);
    if (hole) beasts = beasts.filter(() => hole.entry < 0.85);
    const whale = beasts.find((b) => b.kind === 0 && b.scale > 300);
    if (whale) {
      // The big whale's tail turns the water over behind it.
      const tailX = whale.x - whale.flip * whale.scale * 0.95;
      stirs.push({ x: tailX, y: whale.y, dx: 0, dy: Math.cos(t * 1.05) * 60, r: whale.scale * 0.09, c: [.0006, .0035, .006] });
      if (now - lastSong > 16000 && whale.alpha > 0.6) { lastSong = now; sound.whale(); }
    }
  } else if (!lifeReady) placeStarTags(null, t);

  if (world) {
    const rays = (1 - smooth(clamp(depthF / 0.7))) * (dive > 0 ? 1 : 0);
    const burstNow = Math.exp(-Math.pow((dive - 0.55) / 0.26, 2));
    world.render({
      t, dt, scroll: sy, scrolled, vel, front: growFront, surface: surfaceY, pal: sea.pal,
      lampX: pointer.sx, lampY: pointer.sy, lampAmt: mobile ? 0.9 : 1.15,
      mouseX: pointer.sx, mouseY: pointer.sy, mouseAmt: pointer.amt,
      hole, fullyOpen, rootColor, rootInk, dustColor, pulse, dimTo: heroBottom,
      bloom: smooth(clamp(palmGrowth * 1.1)),
      cosmic: smooth(clamp((depthF - 0.42) / 0.42)) * 0.95, sunX, planet: planetAt,
      above, waterline, camH, focal, ceil, ceilD, pitch, rays,
      nameGlow: smooth(clamp(introT * 1.25)) * (1 - clamp(melt * 2.6)),
      dhow: [innerWidth * (0.3 + 0.13 * Math.sin(t * 0.011)), mobile ? 0.72 : 1],
      impact: [fall.x, fallAge, fallAge < 3.5 ? 1 : 0],
      rootEnd: pinAt.y,
      zone: [Math.max(zone - 1, 0), zone, clamp((mid - zoneStops[zone]) / vh)],
      rtl: root.lang === 'ar' ? 1 : 0,
      earth: sy + vh > earthAt[1] - earthAt[2] * 1.5 && sy < earthAt[1] + earthAt[2] * 1.5 ? earthAt : [0, 0, 0],
      maskRect,
      stirs: stirs.splice(0, 4),
      beasts,
      shoal: shoalOn && shoal ? { state: shoal, alpha: clamp((sy - diveStart) / (vh * 0.5)) * clamp(1 - (sy - places.shoal) / vh) } : null,
      bubbleAmt: 0.75 * rays,
      burst: Math.max(burstNow, Math.min(Math.abs(vel) * 0.012, 0.75) * rays),
      nameVisible: namePoints > 0 && (sy < vh * 1.4 || reform > 0),
      box, intro: Math.max(0, introT) * 1.3, melt, reform, signY, drainX, drainY,
      from: [box.x + box.w / 2, surfaceY],
    });
    if (!root.classList.contains('gl-ready') && namePoints) root.classList.add('gl-ready');
  }

  // Pulse line in the seeds section
  if (pulseOn) {
    const r = pulseSvg.getBoundingClientRect();
    pulseSvg.style.setProperty('--o', (1 - smooth(clamp((vh * 0.92 - r.top) / (vh * 0.7)))).toFixed(3));
  }

  // Side gauge: nearest section, and the real depth you would be at.
  if (now - (frame.navAt || 0) > 120) {
    frame.navAt = now;
    let id = 'surface';
    for (const [sid] of NAV) { const el = document.getElementById(sid); if (el.offsetTop <= mid) id = sid; }
    if (id !== navCurrent) {
      navCurrent = id;
      navLinks().forEach((a) => a.classList.toggle('on', a.dataset.id === id));
    }
    const ar = root.lang === 'ar';
    if (depthEl) {
      const txt = NAV.find((n) => n[0] === id)[ar ? 1 : 2];
      if (depthEl.textContent !== txt) depthEl.textContent = txt;
      const link = core.querySelector('a.on');
      if (link) depthEl.style.setProperty('--y', link.offsetTop + link.offsetHeight / 2);
    }
    if (gaugeEl) {
      // Past the deepest point on Earth there is only one way to read it: you came out the other side.
      const reading = inOrbit
        ? (ar ? '+٤٠٠ كم · المدار' : '+400 km · Orbit')
        : `${formatDepth(metres, ar)} · ${ZONES[zoneAt(metres)][ar ? 0 : 1]}`;
      if (gaugeEl.textContent !== reading) gaugeEl.textContent = reading;
    }
  }
}
let palmDrawn = false, arrivePalm = false;

/* ── back up ──────────────────────────────────────────────── */
document.getElementById('ascend').addEventListener('click', () => {
  arrivePalm = true;
  try { localStorage.setItem('palm', '1'); } catch {}
  scrollToY(0, 3400);
  if (reduced || plain) { palmTarget = 1; palmGrowth = 1; }
});
try { if (localStorage.getItem('palm') === '1') { palmTarget = 1; palmGrowth = 1; } } catch {}

/* ── copy email ───────────────────────────────────────────── */
document.getElementById('copyMail').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const ar = btn.querySelector('[data-l="ar"]'), en = btn.querySelector('[data-l="en"]');
  try {
    await navigator.clipboard.writeText('lafyalmutlaq@gmail.com');
    ar.textContent = 'تم النسخ'; en.textContent = 'Copied';
  } catch {
    getSelection().selectAllChildren(document.querySelector('.mail-addr'));
    ar.textContent = 'حدده وانسخه'; en.textContent = 'Selected';
  }
  setTimeout(() => { ar.textContent = 'انسخ'; en.textContent = 'Copy'; }, 1800);
});

/* ── start ────────────────────────────────────────────────── */
buildPalm();
applyLang();
drawPalm(0);

// The name only needs its own font. Everything else can arrive while it comes up out of the water.
const nameFont = document.fonts.load(`400 200px ${nameFace().font}`, nameFace().text).catch(() => {});
Promise.race([nameFont, new Promise((r) => setTimeout(r, 1800))]).then(() => {
  layout();
  introStart = performance.now();
  requestAnimationFrame(frame);
  // Grains and globe wait until the opening has played, or the first scroll, so they cost it nothing.
  setTimeout(initLife, 3800);
  addEventListener('scroll', initLife, { once: true, passive: true });
  // Letters and the chant wait for their fonts. Later swaps change heights, so re-measure after.
  Promise.all([
    document.fonts.load('400 200px Lalezar', 'كورتنا'),
    document.fonts.load('700 40px "Aref Ruqaa"', 'لافي'),
    document.fonts.load('700 40px Cairo', 'لافي'),
    document.fonts.load('900 40px Archivo', 'SOLD'),
    document.fonts.load('800 40px "Baloo 2"', '13'),
    document.fonts.load('italic 900 40px "Barlow Condensed"', 'VAR'),
    document.fonts.load('500 13px "IBM Plex Sans Arabic"', 'الدبران'),
    document.fonts.load('400 11px "IBM Plex Mono"', 'Vega'),
  ]).catch(() => {}).then(() => {
    if (world) fossils();
    queueLayout();
  });
  document.fonts.ready.then(queueLayout);
});
addEventListener('load', queueLayout);

if (location.hash) {
  const target = document.getElementById(location.hash.slice(1));
  if (target) setTimeout(() => travelTo(target, { ms: 1 }), 700);
}
