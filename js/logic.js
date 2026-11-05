// Pure rules behind the playable pieces. No DOM here, so tests/logic.test.mjs can run it in Node.

export const toArabicDigits = (v) => String(v).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);

// Arabic counts: the noun changes with the number.
export function arabicDaysAgo(n) {
  if (n <= 0) return 'اليوم';
  if (n === 1) return 'قبل يوم';
  if (n === 2) return 'قبل يومين';
  return `قبل ${toArabicDigits(n)} ${n <= 10 ? 'أيام' : 'يومًا'}`;
}

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
