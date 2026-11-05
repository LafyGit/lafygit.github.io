// Pure rules behind the playable pieces. No DOM here, so tests/logic.test.mjs can run it in Node.

export const toArabicDigits = (v) => String(v).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);

export function daysBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
}

// ── Jadhr: tap the root letters, in order ────────────────────────────────
export function tapLetter(root, found, letter) {
  if (found >= root.length) return { ok: false, found, done: true };
  const ok = root[found] === letter;
  const next = ok ? found + 1 : found;
  return { ok, found: next, done: next === root.length };
}

// ── Footies: the heatmap's cascade ───────────────────────────────────────
// Axial hex cells of a board with the given radius. Radius 3 is the real 37-cell board.
export function hexCells(radius) {
  const cells = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
      cells.push({ q, r, key: `${q},${r}` });
    }
  }
  return cells;
}

const HEX_DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

// Flood outward from `start` through connected cells that pass `match`. A non-matching cell is
// a wall. Returns rings so the board can light up one ring at a time.
export function cascade(cellsByKey, start, match) {
  if (!cellsByKey.has(start) || !match(cellsByKey.get(start))) return [];
  const seen = new Set([start]);
  const rings = [[start]];
  while (true) {
    const ring = [];
    for (const key of rings[rings.length - 1]) {
      const { q, r } = cellsByKey.get(key);
      for (const [dq, dr] of HEX_DIRS) {
        const next = `${q + dq},${r + dr}`;
        if (seen.has(next) || !cellsByKey.has(next) || !match(cellsByKey.get(next))) continue;
        seen.add(next);
        ring.push(next);
      }
    }
    if (!ring.length) return rings;
    rings.push(ring);
  }
}

// Footies pays a triangular number per cascade: 5 hexes = 15 points, 8 hexes = 36.
export const comboPoints = (n) => (n * (n + 1)) / 2;

// ── Lumiku: runs and groups ──────────────────────────────────────────────
// A tile is { n, c } or { joker: true }. Run: one colour, consecutive. Group: one number,
// all different colours, at most four.
export function isValidSet(tiles) {
  if (tiles.length < 3) return false;
  const plain = tiles.filter((t) => !t.joker);
  if (!plain.length) return false;

  const colours = new Set(plain.map((t) => t.c));
  const numbers = new Set(plain.map((t) => t.n));

  const isGroup =
    tiles.length <= 4 && numbers.size === 1 && colours.size === plain.length;
  if (isGroup) return true;

  if (colours.size !== 1) return false;
  // A run reads in table order, in either direction, and a joker holds its slot.
  const fits = (step) => {
    const first = tiles.findIndex((t) => !t.joker);
    const startN = tiles[first].n - first * step;
    return tiles.every((t, i) => {
      const want = startN + i * step;
      return want >= 1 && want <= 13 && (t.joker || t.n === want);
    });
  };
  return fits(1) || fits(-1);
}

// Contiguous occupied stretches of a row, as arrays of column indexes.
export function rowSegments(cols) {
  const segments = [];
  let current = [];
  const sorted = [...new Set(cols)].sort((a, b) => a - b);
  for (const c of sorted) {
    if (current.length && c !== current[current.length - 1] + 1) {
      segments.push(current);
      current = [];
    }
    current.push(c);
  }
  if (current.length) segments.push(current);
  return segments;
}

// ── Bid Wars: one blind auction ──────────────────────────────────────────
export function auctionStart(items, budget = 20) {
  return { items, index: 0, budgets: [budget, budget], bid: 0, leader: null, turn: 0, shelves: [[], []], over: false };
}

// The most a player may bid right now.
export const canRaise = (s, who, by = 1) => !s.over && s.turn === who && s.bid + by <= s.budgets[who];

export function raise(s, who, by = 1) {
  if (!canRaise(s, who, by)) return s;
  return { ...s, bid: s.bid + by, leader: who, turn: 1 - who };
}

// A pass hands the item to the other player at the current bid, even at $0.
export function pass(s, who) {
  if (s.over || s.turn !== who) return s;
  const winner = 1 - who;
  const budgets = [...s.budgets];
  budgets[winner] -= s.bid;
  const shelves = s.shelves.map((shelf) => [...shelf]);
  shelves[winner].push({ item: s.items[s.index], paid: s.bid });
  const index = s.index + 1;
  const over = index >= s.items.length;
  return { ...s, budgets, shelves, index, bid: 0, leader: null, over, turn: over ? s.turn : index % 2, lastWinner: winner };
}

// The rival raises while the price is under what the item is worth to it.
export function rivalDecides(s, value) {
  if (s.turn !== 1) return 'wait';
  return s.bid + 1 <= Math.min(value, s.budgets[1]) ? 'raise' : 'pass';
}

// ── The dive ─────────────────────────────────────────────────────────────
// Ten metres for every day: the page is a depth gauge as well as a calendar. stops: [{ y, m }] by page y.
export function depthAt(y, stops) {
  if (!stops.length) return 0;
  if (y <= stops[0].y) return stops[0].m;
  for (let i = 1; i < stops.length; i++) {
    if (y <= stops[i].y) {
      const a = stops[i - 1], b = stops[i];
      return a.m + ((b.m - a.m) * (y - a.y)) / Math.max(1, b.y - a.y);
    }
  }
  return stops[stops.length - 1].m;
}

// NOAA's light zones. 0 surface, 1 sunlight, 2 twilight, 3 midnight, 4 abyss, 5 trenches.
export const zoneAt = (m) => (m < 1 ? 0 : m < 200 ? 1 : m < 1000 ? 2 : m < 4000 ? 3 : m < 6000 ? 4 : 5);

// Real minus sign, grouped thousands, digits in the page's language.
export function formatDepth(m, ar) {
  const n = String(Math.round(m)).replace(/\B(?=(\d{3})+$)/g, ',');
  return m < 1 ? (ar ? '٠ م' : '0 m') : ar ? `−${toArabicDigits(n).replace(/,/g, '٬')} م` : `−${n} m`;
}

// ── The shoal ────────────────────────────────────────────────────────────
// x, y, vx, vy per fish, flat, so the array can go straight to the GPU.
export function makeShoal(n, cx, cy, spread, R = Math.random) {
  const s = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const a = R() * 6.283, d = R() * spread;
    s.set([cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.5, Math.cos(a) * 90, Math.sin(a) * 50], i * 4);
  }
  return s;
}

// Each fish steers by a few fixed neighbours in the list instead of searching space: cheap, and it is what
// makes a shoal stream in ribbons rather than swarm like gnats. scare: { x, y } or null, usually the hand.
export function stepShoal(s, dt, tx, ty, scare, maxSpeed = 250) {
  const n = s.length / 4;
  const h = Math.min(dt, 0.05);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const x = s[o], y = s[o + 1], vx = s[o + 2], vy = s[o + 3];
    let ax = 0, ay = 0, cx = 0, cy = 0, mx = 0, my = 0;
    for (let k = 1; k <= 5; k++) {
      const j = ((i + k * k) % n) * 4;
      const dx = s[j] - x, dy = s[j + 1] - y, d2 = dx * dx + dy * dy + 1;
      if (d2 < 700) { ax -= (dx / d2) * 2600; ay -= (dy / d2) * 2600; }
      cx += dx; cy += dy; mx += s[j + 2]; my += s[j + 3];
    }
    ax += (cx / 5) * 0.55 + (mx / 5 - vx) * 1.3 + (tx - x) * 0.34;
    ay += (cy / 5) * 0.55 + (my / 5 - vy) * 1.3 + (ty - y) * 0.42;
    if (scare) {
      const dx = x - scare.x, dy = y - scare.y, d = Math.hypot(dx, dy) + 1;
      if (d < 170) { const f = ((170 - d) / d) * 62; ax += dx * f; ay += dy * f; }
    }
    let nvx = vx + ax * h, nvy = vy + ay * h;
    const sp = Math.hypot(nvx, nvy) + 0.001;
    const k = sp > maxSpeed ? maxSpeed / sp : sp < 70 ? 70 / sp : 1;
    nvx *= k; nvy *= k;
    s[o] = x + nvx * h; s[o + 1] = y + nvy * h; s[o + 2] = nvx; s[o + 3] = nvy;
  }
  return s;
}

// ── The globe ────────────────────────────────────────────────────────────
// Must match the shader: the view looks down at 12°N 62°E. Returns page coordinates.
export function projectEarth(lonDeg, latDeg, cx, cy, R) {
  const rad = Math.PI / 180;
  const lat = latDeg * rad, dl = (lonDeg - 62) * rad;
  const ca = Math.cos(12 * rad), sa = Math.sin(12 * rad);
  const wx = Math.cos(lat) * Math.sin(dl), wy = Math.sin(lat), wz = Math.cos(lat) * Math.cos(dl);
  return { x: cx + R * wx, y: cy - R * (wy * ca - wz * sa), facing: wy * sa + wz * ca > 0 };
}
