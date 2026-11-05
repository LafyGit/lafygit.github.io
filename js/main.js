// Scroll drives everything: which world is open, how far the roots have grown, how the chant reads.
import { createWorld, buildRoots } from './world.js';
import { initAuction, initTiles, initHex, initRoots, initScanner, initCrumbs } from './play.js';
import { createSound } from './sound.js';
import { toArabicDigits, arabicDaysAgo, daysBetween } from './logic.js';

const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = matchMedia('(hover: none), (max-width: 760px)').matches;
const params = new URLSearchParams(location.search);

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const mixColor = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));

/* ── language ─────────────────────────────────────────────── */
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
});

/* ── worlds and layers ────────────────────────────────────── */
const WORLDS = {
  k: { rim0: '#063f27', rim1: '#35e090', tone: 'light', rootC: '#eafff2', dust: '#d8ffe8', maqam: 'rast', seed: 1.7, c: '#25c97e' },
  b: { rim0: '#ff2e9a', rim1: '#39ff6a', tone: 'light', rootC: '#f3f1ec', dust: '#ffffff', maqam: 'hijaz', seed: 4.2, c: '#ff2e9a' },
  l: { rim0: '#162655', rim1: '#f5b83d', tone: 'light', rootC: '#ffe29a', dust: '#ffe29a', maqam: 'nahawand', seed: 7.1, c: '#f5b83d' },
  f: { rim0: '#8f1d21', rim1: '#f4c542', tone: 'light', rootC: '#fff8e7', dust: '#fff8e7', maqam: 'rast', seed: 2.9, c: '#e5383b' },
  j: { rim0: '#a79f8d', rim1: '#f4f2ec', tone: 'dark', rootC: '#23201c', dust: '#23201c', maqam: 'bayati', seed: 5.5, ink: 1, c: '#f4f2ec' },
};
const NAV = [
  ['surface', 'السطح', 'Surface', '#f2a64e', 1],
  ['kooratna', 'كورتنا', 'Kooratna', '#25c97e', 1.4],
  ['bidwars', 'Bid Wars', 'Bid Wars', '#ff2e9a', 1],
  ['lumiku', 'Lumiku', 'Lumiku', '#f5b83d', 1],
  ['footies', 'Footies', 'Footies', '#e5383b', 1],
  ['jadhr', 'جذر', 'Jadhr', '#f4f2ec', 1.2],
  ['seeds', 'بذور', 'Seeds', '#a9c48a', 1],
  ['fossils', 'حفريات', 'Fossils', '#a4815c', .6],
  ['crew', 'الطاقم', 'Crew', '#ffd28c', .6],
  ['water', 'الماء', 'Water', '#3fd0c9', .8],
];
// Rock colour by how far down the page you are. Warm sandstone near the top, cold water-stained stone at the bottom.
const ROCK_STOPS = [
  { at: 0, pal: ['#0f0805', '#1d1009', '#2f1b0d', '#4a2d15'].map(rgb), root: rgb('#ffc36f'), dust: rgb('#ffc98a') },
  { at: .3, pal: ['#0e0708', '#1b0e10', '#2e1718', '#472a24'].map(rgb), root: rgb('#ffb27a'), dust: rgb('#ffc0a0') },
  { at: .6, pal: ['#09070c', '#141019', '#221b27', '#372c38'].map(rgb), root: rgb('#ffcf9c'), dust: rgb('#d9c2d8') },
  { at: .86, pal: ['#060a0e', '#0c151b', '#15232a', '#24383c'].map(rgb), root: rgb('#ffe2b0'), dust: rgb('#b9e2e0') },
  { at: 1, pal: ['#040d11', '#08191f', '#0d282e', '#173f45'].map(rgb), root: rgb('#d8fff4'), dust: rgb('#bdf5ee') },
];

const sections = [...document.querySelectorAll('main > section')];
const worlds = sections.filter((s) => s.dataset.world).map((el) => ({
  el, id: el.dataset.world, cfg: WORLDS[el.dataset.world], stage: document.querySelector(`[data-stage="${el.dataset.world}"]`),
  open: el.querySelector('.open'), top: 0, bottom: 0, openH: 0,
}));

/* ── the core sample ──────────────────────────────────────── */
const core = document.getElementById('core');
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

/* ── the palm on the surface ──────────────────────────────── */
const palmSvg = document.getElementById('palm');
let palmGrowth = 0, palmTarget = 0, fronds = [];
function buildPalm() {
  const NS = 'http://www.w3.org/2000/svg';
  const col = '#170d0e';
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
    return { el: p, rot, delay: i * 0.03 };
  });
  palmSvg.append(trunk, crown);
  palmSvg._trunk = trunk;
  palmSvg._crown = crown;
}
function drawPalm(t) {
  const g = palmGrowth;
  // A grown palm still has to fit between the ground and the top of the screen.
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
  fronds.forEach((f) => {
    const sway = reduced ? 0 : Math.sin(t * 0.7 + f.rot) * 2.1;
    f.el.setAttribute('transform', `rotate(${(f.rot + sway).toFixed(2)})`);
  });
}

/* ── layout-dependent state ───────────────────────────────── */
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
const pulseSvg = document.querySelector('.pulse-line');
let pulseOn = false;
new IntersectionObserver(([e]) => { pulseOn = e.isIntersecting; }).observe(pulseSvg);
const box = { x: 0, y: 0, w: 1, h: 1 };
let heroBottom = 800, surfaceY = 0, waterY = 1e9, pageH = 1, vh = innerHeight, drainX = 0, drainY = 0;
let introStart = performance.now();
let front = 0;
let namePoints = 0;

let nameKey = '';
function sampleName() {
  const r = nameEl.getBoundingClientRect();
  const style = getComputedStyle(nameEl);
  const fs = parseFloat(style.fontSize);
  // Re-sampling swaps every grain, so only do it when the word really changed.
  const key = [r.width, r.height, fs, document.fonts.check('400 20px Rakkas', 'لافي')].join();
  box.y = r.top + scrollY - Math.ceil(fs * 0.45);
  box.x = r.left;
  if (key === nameKey) return;
  nameKey = key;
  // Find the DOM baseline so the grains land exactly on the real glyphs.
  const probe = document.createElement('span');
  probe.style.cssText = 'display:inline-block;width:0;height:0';
  nameEl.append(probe);
  const baseline = probe.getBoundingClientRect().bottom;
  probe.remove();
  // The letters overhang the line box, so sample a taller area than the element.
  const pad = Math.ceil(fs * 0.45);
  const cw = Math.ceil(r.width), ch = Math.ceil(r.height + pad * 2);
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.font = `400 ${fs}px Rakkas`;
  g.direction = 'rtl';
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#fff';
  g.fillText('لافي', cw / 2, baseline - r.top + pad);
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
  root.style.setProperty('--reflect', `${r.height * 0.95 + 90}px`);
}

function fossils() {
  const size = 2048;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const letters = 'ا ب ت ث ج ح خ د ذ ر ز س ش ص ض ط ظ ع غ ف ق ك ل م ن ه و ي'.split(' ');
  const R = (() => { let a = 11; return () => (a = (a * 16807) % 2147483647) / 2147483647; })();
  const fonts = ['Rakkas', 'Aref Ruqaa', 'Cairo', 'Lalezar'];
  const cells = 7;
  const step = size / cells;
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const fs = 92 + R() * 170;
      const cxp = (x + 0.5) * step + (R() - 0.5) * step * 0.5;
      const cyp = (y + 0.5) * step + (R() - 0.5) * step * 0.5;
      g.save();
      g.translate(cxp, cyp);
      g.rotate((R() - 0.5) * 1.1);
      g.font = `400 ${fs}px ${fonts[Math.floor(R() * fonts.length)]}`;
      g.fillText(letters[Math.floor(R() * letters.length)], 0, 0);
      g.restore();
    }
  }
  world.setFossils(c);
}

function layout() {
  vh = canvas.clientHeight || innerHeight;
  pageH = document.documentElement.scrollHeight;
  worlds.forEach((w) => {
    w.top = w.el.offsetTop;
    w.bottom = w.top + w.el.offsetHeight;
    w.openH = w.open ? w.open.offsetHeight : 0;
  });
  surfaceY = horizonEl.getBoundingClientRect().top + scrollY;
  heroBottom = document.getElementById('surface').offsetHeight;
  const wr = waterIn.getBoundingClientRect();
  waterY = wr.top + scrollY;
  if (!world) return;
  world.resize();
  sampleName();
  drainX = box.x + box.w / 2;
  drainY = box.y + box.h * 0.8;
  const width = canvas.clientWidth;
  const anchors = [{ y: surfaceY, x: 0.7, rich: 0.5 }];
  sections.forEach((s) => {
    const y = s.offsetTop;
    // data-root is measured along the reading direction, so the root stays clear of the text in both languages.
    const inline = parseFloat(s.dataset.root ?? 0.5);
    const x = root.dir === 'rtl' ? 1 - inline : inline;
    const rich = parseFloat(s.dataset.rich ?? (s.dataset.world ? 0.25 : 1));
    if (s.classList.contains('gap')) {
      anchors.push({ y: y + s.offsetHeight * 0.5, x, rich });
    } else {
      anchors.push({ y: y + s.offsetHeight * 0.12, x, rich });
      anchors.push({ y: y + s.offsetHeight * 0.88, x, rich });
    }
  });
  anchors.push({ y: waterY - 20, x: 0.5, rich: 1.2 });
  anchors.sort((a, b) => a.y - b.y);
  const mesh = buildRoots({ width, height: waterY + 6, anchors, startX: width * 0.7, startY: surfaceY, density: mobile ? 0.48 : 1 });
  world.setRoots(mesh);
  drainX = mesh.tapAt(drainY);
  buildChant();
}
let layoutTimer = 0, lastW = innerWidth;
function queueLayout() {
  clearTimeout(layoutTimer);
  layoutTimer = setTimeout(layout, 180);
}
addEventListener('resize', () => {
  // A collapsing mobile URL bar must not rebuild the whole earth.
  if (Math.abs(innerWidth - lastW) < 2 && mobile) return;
  lastW = innerWidth;
  queueLayout();
});
new ResizeObserver(() => {
  const h = document.documentElement.scrollHeight;
  if (Math.abs(h - pageH) > 40) queueLayout();
}).observe(document.body);

/* ── pointer ──────────────────────────────────────────────── */
const pointer = { x: innerWidth / 2, y: innerHeight * 0.4, sx: innerWidth / 2, sy: innerHeight * 0.4, at: -1e9, seen: false, amt: 0 };
const onPoint = (x, y) => { pointer.x = x; pointer.y = y; pointer.at = performance.now(); pointer.seen = true; };
addEventListener('pointermove', (e) => onPoint(e.clientX, e.clientY), { passive: true });
addEventListener('pointerdown', (e) => {
  onPoint(e.clientX, e.clientY);
  if (world && scrollY + e.clientY > waterY && !e.target.closest('a, button')) world.addRipple(e.clientX, scrollY + e.clientY, 1.4);
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

/* ── time dials between the layers ────────────────────────── */
const dials = [...document.querySelectorAll('.deeper')].map((el) => ({ el, on: false, nums: [...el.querySelectorAll('[data-count]')], n: +el.querySelector('[data-count]').dataset.count }));
{
  const io = new IntersectionObserver((es) => es.forEach((e) => { const d = dials.find((x) => x.el === e.target); if (d) d.on = e.isIntersecting; }));
  dials.forEach((d) => io.observe(d.el));
}
function drawDials() {
  for (const d of dials) {
    if (!d.on) continue;
    const r = d.el.getBoundingClientRect();
    const v = Math.round(d.n * smooth(clamp((vh * 0.96 - r.top) / (vh * 0.42))));
    if (v === d.last) continue;
    d.last = v;
    d.nums.forEach((i) => { i.textContent = i.closest('[data-l="ar"]') ? toArabicDigits(v) : v; });
  }
}

/* ── stages ───────────────────────────────────────────────── */
const bwTitle = document.querySelector('.bw-title');
const bwCards = document.querySelector('.bw-cards');
const fTitle = document.querySelector('.f-title');
const fPow1 = document.querySelector('.f-pow1');
const fPow2 = document.querySelector('.f-pow2');
const jTitle = document.querySelector('.j-title');
const rackTitle = document.getElementById('rackTitle');
const kNote = document.querySelector('.chant-note');

function drawStage(w, sy, t, vel) {
  const local = sy - w.top;                         // 0 when the section's top reaches the viewport top
  const entry = clamp((sy + vh - w.top) / vh);      // 0..1 as the section rises into view
  const after = Math.max(0, local - (w.openH - vh)); // pixels scrolled past the opening
  const pointerX = pointer.sx / innerWidth - 0.5;

  if (w.id === 'k') {
    const P = clamp(local / (w.openH - vh * 0.95));
    drawChant(P, vel, t);
    chantEl.style.top = `calc(46% - ${after.toFixed(0)}px)`;
    kNote.style.transform = `translate3d(0, ${(-after * 1.2).toFixed(0)}px, 0)`;
    w.stage.classList.toggle('past', after > 40);
  } else if (w.id === 'b') {
    const mx = clamp(0.5 + pointerX * 0.9 + Math.sin(t * 0.5) * 0.04, 0.08, 0.92);
    bwTitle.style.setProperty('--x', `${(mx * 100).toFixed(2)}%`);
    bwTitle.style.transform = `translate3d(0, ${(-after).toFixed(0)}px, 0) scale(${lerp(1.25, 1, smooth(entry)).toFixed(3)})`;
    const spread = smooth(entry);
    bwCards.style.transform = `translate3d(${(pointerX * -36).toFixed(1)}px, ${(lerp(120, -18, spread) - after * 1.4).toFixed(0)}px, 0) rotate(${lerp(-10, 0, spread).toFixed(2)}deg) scale(${lerp(.8, 1, spread).toFixed(3)})`;
  } else if (w.id === 'l') {
    rackTitle.style.transform = `translate3d(-50%, calc(-50% + ${(-after).toFixed(0)}px), 0)`;
    const open = clamp((entry - 0.4) / 0.6);
    rackTiles.forEach((el, i) => {
      const p = clamp(open * 1.9 - i * 0.14);
      const e = 1 - Math.pow(1 - p, 3);
      el.style.transform = `rotateX(${((1 - e) * -96).toFixed(1)}deg) translateY(${(Math.sin(t * 1.4 + i * 0.8) * 3).toFixed(1)}px)`;
    });
  } else if (w.id === 'f') {
    const e = smooth(entry);
    fTitle.style.transform = `translate3d(0, calc(-50% + ${(-after).toFixed(0)}px), 0) rotate(${lerp(-7, -2.4, e).toFixed(2)}deg) scale(${lerp(.72, 1, e).toFixed(3)})`;
    const bob = Math.sin(t * 1.5) * 7;
    fPow1.style.transform = `translate3d(${(pointerX * 34).toFixed(1)}px, ${(bob - after * 1.3).toFixed(1)}px, 0) scale(${e.toFixed(3)})`;
    fPow2.style.transform = `translate3d(${(pointerX * -34).toFixed(1)}px, ${(-bob - after * 1.5).toFixed(1)}px, 0) scale(${e.toFixed(3)})`;
  } else if (w.id === 'j') {
    jTitle.style.transform = `translate3d(0, calc(-50% + ${(-after).toFixed(0)}px), 0)`;
  }
}

/* ── main loop ────────────────────────────────────────────── */
let last = performance.now(), prevSy = scrollY, vel = 0, currentWorld = null, navCurrent = '';
const navLinks = () => [...core.querySelectorAll('a')];
const DATES = [['kooratna', '2026-10-31'], ['bidwars', '2026-10-28'], ['lumiku', '2026-10-13'], ['footies', '2026-09-08'], ['jadhr', '2026-06-11']];
const today = new Date().toISOString().slice(0, 10);

function hexMix(hexA, hexB, t) { return mixColor(rgb(hexA), rgb(hexB), t); }

function rockAt(f) {
  let a = ROCK_STOPS[0], b = ROCK_STOPS[ROCK_STOPS.length - 1];
  for (let i = 1; i < ROCK_STOPS.length; i++) {
    if (f <= ROCK_STOPS[i].at) { a = ROCK_STOPS[i - 1]; b = ROCK_STOPS[i]; break; }
  }
  const t = smooth(clamp((f - a.at) / Math.max(0.0001, b.at - a.at)));
  return { pal: a.pal.map((c, i) => mixColor(c, b.pal[i], t)), root: mixColor(a.root, b.root, t), dust: mixColor(a.dust, b.dust, t) };
}

const pace = { sum: 0, n: 0 };
function frame(now) {
  requestAnimationFrame(frame);
  const raw = now - last;
  const dt = Math.min(0.05, raw / 1000);
  last = now;
  // Frame pacing, ignoring gaps from a hidden tab.
  if (world && raw < 250) {
    pace.sum += raw;
    if (++pace.n === 50) {
      if (pace.sum / pace.n > 25) world.lowerQuality();
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
  const rawVel = (sy - prevSy) / Math.max(dt, 0.001) / 60;
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

  // Which world is open? Sections sit far enough apart that it is never two at once.
  let active = null;
  for (const w of worlds) {
    const entered = sy + vh > w.top + vh * 0.3;
    const left = sy > w.bottom + 170; // edge's jagged reach
    if (entered && !left) { active = w; break; }
  }
  if (active !== currentWorld) {
    currentWorld?.stage.classList.remove('on');
    active?.stage.classList.add('on');
    currentWorld = active;
  }

  setMaqam(active ? active.cfg.maqam : sy > waterY - vh * 1.2 ? 'saba' : 'rast');

  // Scroll position → crack radius and fully-open test
  const hole = active && (() => {
    const entry = clamp((sy + vh - active.top - vh * 0.3) / (vh * 0.7));
    const diag = Math.hypot(innerWidth, vh);
    const r = entry <= 0 ? 0 : diag * 1.02 * Math.pow(entry, 2.15) + entry * 26;
    return { r, bottom: active.bottom, seed: active.cfg.seed, rim0: rgb(active.cfg.rim0), rim1: rgb(active.cfg.rim1), entry };
  })();
  const fullyOpen = !!hole && hole.entry >= 1 && hole.bottom - sy > vh + 170;
  // Dark controls only once the paper is really under them.
  const tone = hole && active.cfg.tone === 'dark' && hole.entry > 0.82 && hole.bottom - sy > 90 ? 'dark' : 'light';
  if (root.dataset.tone !== tone) root.dataset.tone = tone;

  if (active && world) drawStage(active, sy, t, vel);
  drawPosters();
  drawDials();

  // Rock colours and root colours by depth, with the root taking the world's colour inside one.
  const depthF = clamp(sy / Math.max(1, pageH - vh));
  const rk = rockAt(depthF);
  let rootColor = rk.root, dustColor = rk.dust, rootInk = 0;
  if (hole) {
    const inside = clamp((hole.entry - 0.55) / 0.45) * clamp((hole.bottom - sy - vh * 0.5) / (vh * 0.4));
    rootColor = mixColor(rk.root, rgb(active.cfg.rootC).map((v) => v * (active.cfg.ink ? 1 : 0.72)), inside);
    dustColor = mixColor(rk.dust, rgb(active.cfg.dust), inside);
    rootInk = (active.cfg.ink || 0) * inside;
  }

  front = Math.max(front, sy + vh * 0.95);
  const introT = clamp((now - introStart) / 2600);
  const growFront = surfaceY + (front - surfaceY) * smooth(clamp((now - introStart - 900) / 2200));
  pulse *= Math.exp(-dt * 5);

  // Palm grows slowly once it has been watered
  const pg = palmGrowth + (palmTarget - palmGrowth) * (1 - Math.exp(-dt * 0.62));
  if (Math.abs(pg - palmGrowth) > 0.0002 || !palmDrawn) { palmGrowth = pg; }
  if (sy < vh * 0.7) { drawPalm(t); palmDrawn = true; }

  const nearWater = sy + vh > waterY - 10;
  const melt = clamp((sy - vh * 0.02) / (vh * 0.62));
  nameEl.style.setProperty('--ghost', (smooth(clamp((introT - 0.5) / 0.5)) * (1 - clamp(melt * 2.4))).toFixed(3));
  const reform = nearWater ? smooth(clamp((sy + vh * 0.55 - waterY) / (vh * 0.5))) : 0;

  // Occasional small ripples as the pointer crosses the water
  if (nearWater && pointer.seen && now - rippleAt > 340 && now - pointer.at < 200 && sy + pointer.y > waterY) {
    rippleAt = now;
    world?.addRipple(pointer.x, sy + pointer.y, 0.55);
  }

  if (world) {
    world.render({
      t, dt, scroll: sy, vel, front: growFront, surface: surfaceY, pal: rk.pal,
      lampX: pointer.sx, lampY: pointer.sy, lampAmt: mobile ? 0.9 : 1.15,
      mouseX: pointer.sx, mouseY: pointer.sy, mouseAmt: pointer.amt,
      hole, fullyOpen, rootColor, rootInk, dustColor, pulse, dimTo: heroBottom,
      waterY, waterVisible: nearWater,
      dawn: smooth(clamp(palmGrowth * 1.1)),
      nameVisible: namePoints > 0 && (sy < vh * 1.4 || reform > 0),
      box, intro: introT * 1.3, melt, reform, drainX, drainY,
    });
    if (!root.classList.contains('gl-ready') && namePoints) root.classList.add('gl-ready');
  }

  // Pulse line in the seeds section
  if (pulseOn) {
    const r = pulseSvg.getBoundingClientRect();
    pulseSvg.style.setProperty('--o', (1 - smooth(clamp((vh * 0.92 - r.top) / (vh * 0.7)))).toFixed(3));
  }

  // Core sample: nearest section + time depth
  if (now - (frame.navAt || 0) > 120) {
    frame.navAt = now;
    const mid = sy + vh * 0.4;
    let id = 'surface';
    for (const [sid] of NAV) { const el = document.getElementById(sid); if (el.offsetTop <= mid) id = sid; }
    if (id !== navCurrent) {
      navCurrent = id;
      navLinks().forEach((a) => a.classList.toggle('on', a.dataset.id === id));
    }
    if (depthEl) {
      const dated = DATES.find(([d]) => d === id);
      let txt = root.lang === 'ar' ? 'اليوم' : 'today';
      if (dated) {
        const days = daysBetween(dated[1], today);
        txt = root.lang === 'ar' ? arabicDaysAgo(days) : `${days} days ago`;
      } else if (id !== 'surface') {
        txt = NAV.find((n) => n[0] === id)[root.lang === 'ar' ? 1 : 2];
      }
      if (depthEl.textContent !== txt) depthEl.textContent = txt;
      const link = core.querySelector('a.on');
      if (link) depthEl.style.setProperty('--y', link.offsetTop + link.offsetHeight / 2);
    }
  }
}
let palmDrawn = false, arrivePalm = false, rippleAt = 0;

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

// The name only needs its own font. Everything else can arrive while it rains in.
const nameFont = document.fonts.load('400 200px Rakkas', 'لافي').catch(() => {});
Promise.race([nameFont, new Promise((r) => setTimeout(r, 1800))]).then(() => {
  layout();
  introStart = performance.now();
  requestAnimationFrame(frame);
  // Fossils and the chant wait for their fonts. Later swaps change heights, so re-measure after.
  Promise.all([
    document.fonts.load('400 200px Lalezar', 'كورتنا'),
    document.fonts.load('700 40px "Aref Ruqaa"', 'لافي'),
    document.fonts.load('700 40px Cairo', 'لافي'),
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
