// The playable bits: a blind auction, a tile table, the hex cascade, the root puzzle, a scanner.
import { tapLetter, hexCells, cascade, comboPoints, isValidSet, rowSegments, auctionStart, raise, pass, canRaise, rivalDecides } from './logic.js';

const $ = (id) => document.getElementById(id);
const isAr = () => document.documentElement.lang === 'ar';
const t = (ar, en) => (isAr() ? ar : en);

const shuffled = (list) => list.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);

/* ── Bid Wars ─────────────────────────────────────────────────────── */
// Item names are from the real Comfort Food topic in the app.
const COMFORT_FOOD = ['Pizza', 'Cheeseburger', 'Tacos', 'Sushi', 'Fried Chicken', 'Steak', 'Ramen', 'Escargot', 'Biryani', 'Lasagna', 'Butter Chicken', 'Pad Thai', 'Shawarma', 'Dumplings', 'Mac and Cheese', 'Falafel'];

export function initAuction(onEvent) {
  const el = { you: $('bwYou'), rival: $('bwRival'), count: $('bwCount'), item: $('bwItem'), name: $('bwItemName'), bid: $('bwBid'), raiseBtn: $('bwRaise'), passBtn: $('bwPass'), log: $('bwLog') };
  let s, values, busy, roundDone;

  function value() { return values[s.index]; }

  function draw() {
    el.you.textContent = `$${s.budgets[0]}`;
    el.rival.textContent = `$${s.budgets[1]}`;
    el.count.textContent = `${Math.min(s.index + 1, s.items.length)} / ${s.items.length}`;
    if (!s.over) el.name.textContent = s.items[s.index];
    el.bid.textContent = `$${s.bid}`;
    const myTurn = s.turn === 0 && !s.over && !busy;
    el.raiseBtn.disabled = !myTurn || !canRaise(s, 0);
    el.passBtn.disabled = !myTurn;
    el.raiseBtn.textContent = roundDone ? t('جولة جديدة', 'New round') : t(`زايد إلى $${s.bid + 1}`, `Raise to $${s.bid + 1}`);
    if (roundDone) el.raiseBtn.disabled = false;
  }

  function freshItem() {
    el.item.classList.remove('is-new');
    void el.item.offsetWidth;
    el.item.classList.add('is-new');
    el.item.querySelector('.sold')?.remove();
    el.item.style.background = ['#ff7a2f', '#ffd23f', '#39ff6a', '#ff2e9a', '#7cc5ff'][s.index % 5];
  }

  function finishItem() {
    const won = s.lastWinner;
    const lastPaid = s.shelves[won][s.shelves[won].length - 1];
    const stamp = document.createElement('span');
    stamp.className = 'sold';
    stamp.textContent = 'SOLD';
    el.name.textContent = lastPaid.item;
    el.item.append(stamp);
    onEvent?.('sold');
    el.log.textContent = won === 0
      ? t(`صارت لك بـ $${lastPaid.paid}.`, `Yours for $${lastPaid.paid}.`)
      : t(`راحت للخصم بـ $${lastPaid.paid}.`, `The rival took it for $${lastPaid.paid}.`);
    busy = true;
    draw();
    setTimeout(() => {
      busy = false;
      if (s.over) return endRound();
      freshItem();
      draw();
      if (s.turn === 1) rivalTurn();
      else el.log.textContent = t('دورك. افتح المزاد أو اتركها.', 'Your turn. Open the bidding or let it go.');
    }, 1250);
  }

  function endRound() {
    roundDone = true;
    const [a, b] = s.shelves;
    const mine = a.map((x) => x.item).join(', ') || t('ولا شيء', 'nothing');
    const verdict = a.length > b.length
      ? t('رفّك أكبر. الحكم يقول: تناقشوا.', 'Bigger shelf. The judge says: argue about it.')
      : a.length < b.length
        ? t('الخصم جمع أكثر. لكن وش جمع؟ هذا النقاش.', 'The rival collected more. Whether it was better is the argument.')
        : t('تعادل في العدد. الحين النقاش الحقيقي.', 'Level on items. Now comes the real argument.');
    el.log.textContent = `${t('رفّك', 'Your shelf')}: ${mine}. ${verdict}`;
    draw();
  }

  function rivalTurn() {
    busy = true;
    draw();
    setTimeout(() => {
      busy = false;
      const move = rivalDecides(s, value());
      if (move === 'raise') {
        s = raise(s, 1, s.bid >= 2 && Math.random() < 0.25 && s.bid + 2 <= Math.min(value(), s.budgets[1]) ? 2 : 1);
        el.log.textContent = t(`الخصم زايد إلى $${s.bid}.`, `The rival raises to $${s.bid}.`);
        onEvent?.('bid');
        draw();
      } else if (move === 'pass') {
        s = pass(s, 1);
        finishItem();
      }
    }, 720 + Math.random() * 520);
  }

  function start() {
    const items = shuffled(COMFORT_FOOD).slice(0, 5);
    s = auctionStart(items, 20);
    values = items.map(() => 2 + Math.floor(Math.random() * 7));
    busy = false;
    roundDone = false;
    el.log.textContent = t('دورك. افتح المزاد أو اتركها.', 'Your turn. Open the bidding or let it go.');
    freshItem();
    draw();
  }

  el.raiseBtn.addEventListener('click', () => {
    if (roundDone) return start();
    if (!canRaise(s, 0) || busy) return;
    s = raise(s, 0);
    onEvent?.('bid');
    el.log.textContent = t(`عرضك $${s.bid}. ننتظر الخصم.`, `You bid $${s.bid}. Waiting on the rival.`);
    draw();
    rivalTurn();
  });
  el.passBtn.addEventListener('click', () => {
    if (busy || s.turn !== 0 || s.over) return;
    s = pass(s, 0);
    finishItem();
  });
  start();
  return { redraw: draw };
}

/* ── Lumiku ───────────────────────────────────────────────────────── */
const JOKER_SVG = '<svg viewBox="0 0 32 30" aria-hidden="true"><path d="M6 24 2 8l8 7 6-13 6 13 8-7-4 16Z" fill="#d9342b" stroke="#23201c" stroke-width="2" stroke-linejoin="round"/><circle cx="2.8" cy="7" r="2.4" fill="#f4c542" stroke="#23201c" stroke-width="1.4"/><circle cx="16" cy="2.6" r="2.4" fill="#1e6fd9" stroke="#23201c" stroke-width="1.4"/><circle cx="29.2" cy="7" r="2.4" fill="#128a4a" stroke="#23201c" stroke-width="1.4"/><path d="M6 24h20v4H6z" fill="#f4c542" stroke="#23201c" stroke-width="2"/></svg>';

export function initTiles(onEvent) {
  const felt = $('felt');
  const log = $('lkLog');
  const COLS = 7, ROWS = 4;
  const tiles = [
    { n: 5, c: 'r' }, { n: 7, c: 'b' }, { n: 6, c: 'r' }, { n: 7, c: 'g' },
    { n: 4, c: 'r' }, { n: 7, c: 'k' }, { joker: true },
  ].map((tile, i) => ({ ...tile, col: i, row: 3, el: null }));
  let size = 0, pad = 0, cellW = 0, cellH = 0;
  let sets = new Set();
  const fw = initFireworks($('fw'), felt);
  // A hint for the first run: three empty slots, and the three reds breathe until one is moved.
  const hints = [2, 3, 4].map(() => {
    const d = document.createElement('i');
    d.className = 'slot-hint';
    felt.append(d);
    return d;
  });
  const clearHints = () => {
    hints.forEach((d) => d.remove());
    tiles.forEach((x) => x.el.classList.remove('hint'));
  };

  const place = (tile) => {
    tile.el.style.transform = `translate(${pad + tile.col * cellW + (cellW - size) / 2}px, ${pad + tile.row * cellH + (cellH - size * 1.28) / 2}px)`;
  };

  function layout() {
    const inner = felt.clientWidth;
    pad = inner * 0.012;
    cellW = (inner - pad * 2) / COLS;
    cellH = (felt.clientHeight - pad * 2) / ROWS;
    size = Math.min(cellW * 0.9, (cellH * 0.94) / 1.28);
    tiles.forEach((tile) => {
      tile.el.style.width = `${size}px`;
      tile.el.style.height = `${size * 1.28}px`;
      place(tile);
    });
    hints.forEach((d, i) => {
      d.style.width = `${size}px`;
      d.style.height = `${size * 1.28}px`;
      d.style.transform = `translate(${pad + (i + 2) * cellW + (cellW - size) / 2}px, ${pad + 1 * cellH + (cellH - size * 1.28) / 2}px)`;
    });
    fw.resize();
  }

  function evaluate() {
    const nowInSet = new Set();
    let fresh = null;
    for (let row = 0; row < ROWS; row++) {
      const here = tiles.filter((x) => x.row === row);
      for (const seg of rowSegments(here.map((x) => x.col))) {
        const members = seg.map((c) => here.find((x) => x.col === c));
        if (isValidSet(members)) {
          const key = members.map((x) => (x.joker ? 'J' : x.c + x.n)).join('-');
          members.forEach((x) => nowInSet.add(x));
          if (!sets.has(key)) fresh = { key, members };
        }
      }
    }
    tiles.forEach((x) => x.el.classList.toggle('in-set', nowInSet.has(x)));
    if (fresh) {
      sets.add(fresh.key);
      const mid = fresh.members[Math.floor(fresh.members.length / 2)];
      fw.burst(pad + mid.col * cellW + cellW / 2, pad + mid.row * cellH + cellH / 2);
      onEvent?.('set');
      log.textContent = t('مجموعة صحيحة! هذي الألعاب النارية من اللعبة نفسها.', 'A valid set! Those fireworks are from the real game.');
    }
  }

  tiles.forEach((tile, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tile';
    if (tile.joker) { b.innerHTML = JOKER_SVG; b.setAttribute('aria-label', 'Joker'); } else {
      b.dataset.c = tile.c;
      b.textContent = tile.n;
      b.setAttribute('aria-label', `${{ r: 'red', b: 'blue', g: 'green', k: 'black' }[tile.c]} ${tile.n}`);
    }
    tile.el = b;
    if (tile.c === 'r') b.classList.add('hint');
    felt.append(b);

    let dragging = false, startX = 0, startY = 0, ox = 0, oy = 0;
    b.addEventListener('pointerdown', (e) => {
      dragging = true;
      b.setPointerCapture(e.pointerId);
      b.classList.add('drag');
      clearHints();
      startX = e.clientX; startY = e.clientY;
      ox = pad + tile.col * cellW + (cellW - size) / 2;
      oy = pad + tile.row * cellH + (cellH - size * 1.28) / 2;
      e.preventDefault();
    });
    b.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      b.style.transform = `translate(${ox + e.clientX - startX}px, ${oy + e.clientY - startY}px) rotate(${Math.max(-7, Math.min(7, (e.clientX - startX) * 0.05))}deg) scale(1.08)`;
    });
    const drop = (e) => {
      if (!dragging) return;
      dragging = false;
      b.classList.remove('drag');
      const dx = e.clientX - startX, dy = e.clientY - startY;
      const col = Math.max(0, Math.min(COLS - 1, Math.round((ox + dx - pad - (cellW - size) / 2) / cellW)));
      const row = Math.max(0, Math.min(ROWS - 1, Math.round((oy + dy - pad - (cellH - size * 1.28) / 2) / cellH)));
      const other = tiles.find((x) => x !== tile && x.col === col && x.row === row);
      if (other) { other.col = tile.col; other.row = tile.row; place(other); }
      tile.col = col; tile.row = row;
      place(tile);
      onEvent?.('tile');
      evaluate();
    };
    b.addEventListener('pointerup', drop);
    b.addEventListener('pointercancel', drop);
    // Keyboard: arrows move a tile, so the table does not require a pointer.
    b.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!d) return;
      e.preventDefault();
      const col = Math.max(0, Math.min(COLS - 1, tile.col + d[0]));
      const row = Math.max(0, Math.min(ROWS - 1, tile.row + d[1]));
      const other = tiles.find((x) => x !== tile && x.col === col && x.row === row);
      if (other) { other.col = tile.col; other.row = tile.row; place(other); }
      tile.col = col; tile.row = row;
      place(tile);
      evaluate();
    });
    b.dataset.i = i;
  });

  new ResizeObserver(layout).observe(felt);
  layout();
}

// The win-screen fireworks: a star, a ring or a heart of sparks, then gravity.
function initFireworks(canvas, host) {
  const ctx = canvas.getContext('2d');
  let parts = [], raf = 0, w = 1, h = 1;
  const COLOURS = ['#ffd34d', '#ff5a5a', '#6ec6ff', '#7dffa8', '#ffffff'];
  const resize = () => {
    w = host.clientWidth; h = host.clientHeight;
    const d = Math.min(devicePixelRatio || 1, 2);
    canvas.width = w * d; canvas.height = h * d;
    ctx.setTransform(d, 0, 0, d, 0, 0);
  };
  const shape = (kind, a) => {
    if (kind === 0) return 1; // ring
    if (kind === 1) return 0.62 + 0.38 * Math.abs(Math.cos(a * 2.5)); // star
    const s = Math.sin(a), c = Math.cos(a); // heart
    return (s * Math.sqrt(Math.abs(c))) / (s + 1.4) - 2 * s + 2 > 0 ? ((s * Math.sqrt(Math.abs(c))) / (s + 1.4) - 2 * s + 2) / 3.4 : 0;
  };
  function step() {
    ctx.clearRect(0, 0, w, h);
    parts = parts.filter((p) => p.life > 0);
    for (const p of parts) {
      p.vy += 0.045; p.vx *= 0.985; p.vy *= 0.985;
      p.x += p.vx; p.y += p.vy; p.life -= 0.0135;
      ctx.globalAlpha = Math.min(1, p.life * 1.7);
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.5 + p.life * 0.6), 0, 6.283);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    raf = parts.length ? requestAnimationFrame(step) : 0;
    if (!raf) ctx.clearRect(0, 0, w, h);
  }
  function burst(x, y) {
    for (let k = 0; k < 3; k++) {
      const kind = Math.floor(Math.random() * 3);
      const cx = x + (k ? (Math.random() - 0.5) * w * 0.5 : 0);
      const cy = y - h * 0.18 - Math.random() * h * 0.25;
      const power = 2.1 + Math.random();
      const c = COLOURS[Math.floor(Math.random() * COLOURS.length)];
      for (let i = 0; i < 46; i++) {
        const a = (i / 46) * 6.283;
        const v = power * shape(kind, a);
        parts.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: -Math.sin(a) * v, life: 1 + k * 0.1, r: 2 + Math.random(), c });
      }
    }
    if (!raf) raf = requestAnimationFrame(step);
  }
  return { burst, resize };
}

/* ── Footies ──────────────────────────────────────────────────────── */
// Careers below are public record. Cells carry nation, confederation or club, like the real board.
const LABELS = {
  UEFA: 'UEFA', CAF: 'CAF', SUD: 'CONMEBOL',
  POR: 'Portugal', ARG: 'Argentina', BRA: 'Brazil', FRA: 'France', EGY: 'Egypt', SEN: 'Senegal', URU: 'Uruguay',
  RMA: 'Real Madrid', BAR: 'Barcelona', LIV: 'Liverpool', JUV: 'Juventus', PSG: 'PSG', MUN: 'Man United', NAS: 'Al Nassr', HIL: 'Al Hilal',
};
const PLAYERS = [
  { name: 'RONALDO', fits: ['POR', 'UEFA', 'MUN', 'RMA', 'JUV', 'NAS'] },
  { name: 'MESSI', fits: ['ARG', 'SUD', 'BAR', 'PSG'] },
  { name: 'NEYMAR', fits: ['BRA', 'SUD', 'BAR', 'PSG', 'HIL'] },
  { name: 'SALAH', fits: ['EGY', 'CAF', 'LIV'] },
  { name: 'MANÉ', fits: ['SEN', 'CAF', 'LIV', 'NAS'] },
  { name: 'ZIDANE', fits: ['FRA', 'UEFA', 'JUV', 'RMA'] },
  { name: 'SUÁREZ', fits: ['URU', 'SUD', 'LIV', 'BAR'] },
];
const BOARD = ['RMA', 'UEFA', 'POR', 'JUV', 'FRA', 'UEFA', 'MUN', 'NAS', 'SEN', 'CAF', 'LIV', 'EGY', 'UEFA', 'RMA', 'BAR', 'SUD', 'URU', 'CAF', 'NAS', 'POR', 'JUV', 'PSG', 'BRA', 'SUD', 'LIV', 'SEN', 'RMA', 'FRA', 'HIL', 'BAR', 'ARG', 'SUD', 'EGY', 'PSG', 'MUN', 'BRA', 'ARG'];
const HEAT = ['#ffd23f', '#ffb02e', '#ff8c2a', '#f8672e', '#ee4b2b', '#e03232'];
const CASCADE_WORD = { 1: 'CLAIMED', 2: 'TWO-WAY', 3: 'THREE-WAY', 4: 'FOUR-WAY', 5: 'FIVE-WAY' };

export function initHex(onEvent) {
  const host = $('hexBoard');
  const scoreEl = $('hexScore');
  const labelEl = $('hexLabel');
  const R = 44;
  const cells = hexCells(3).map((c, i) => ({ ...c, tag: BOARD[i], claimed: false }));
  const byKey = new Map(cells.map((c) => [c.key, c]));
  const W = 3 * 2 * R * Math.sqrt(3) + R * 2.6;
  const H = R * 11.6;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `${-W / 2} ${-H / 2} ${W} ${H}`);
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', 'Footies heatmap');
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    return `${(Math.cos(a) * (R - 2)).toFixed(2)},${(Math.sin(a) * (R - 2)).toFixed(2)}`;
  }).join(' ');
  let score = 0, timers = [];

  cells.forEach((c) => {
    const x = Math.sqrt(3) * R * (c.q + c.r / 2);
    const y = 1.5 * R * c.r;
    const g = document.createElementNS(svgNS, 'g');
    g.setAttribute('class', 'hex');
    g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', LABELS[c.tag]);
    const inner = document.createElementNS(svgNS, 'g');
    inner.setAttribute('class', 'hex-g');
    const poly = document.createElementNS(svgNS, 'polygon');
    poly.setAttribute('points', pts);
    const txt = document.createElementNS(svgNS, 'text');
    txt.textContent = c.tag;
    txt.setAttribute('font-size', c.tag.length > 3 ? '19' : '22');
    inner.append(poly, txt);
    g.append(inner);
    svg.append(g);
    c.g = g; c.poly = poly; c.px = x; c.py = y;
    const go = () => claim(c);
    g.addEventListener('click', go);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
  host.append(svg);

  function bubble(c, text) {
    const b = document.createElement('div');
    b.className = 'hx-bubble';
    b.textContent = text;
    const rect = svg.getBoundingClientRect();
    const scale = rect.width / W;
    const left = Math.max(70, Math.min(rect.width - 70, rect.width / 2 + c.px * scale));
    b.style.left = `${left}px`;
    b.style.top = `${rect.height / 2 + c.py * scale}px`;
    host.append(b);
    setTimeout(() => b.remove(), 1750);
  }

  function claim(c) {
    if (c.tag === undefined) return;
    timers.forEach(clearTimeout);
    timers = [];
    // The player who fits this cell and reaches the most unclaimed hexes.
    let best = null;
    for (const p of PLAYERS) {
      if (!p.fits.includes(c.tag)) continue;
      const rings = cascade(byKey, c.key, (x) => p.fits.includes(x.tag));
      const fresh = rings.flat().filter((k) => !byKey.get(k).claimed).length;
      if (!best || fresh > best.fresh) best = { p, rings, fresh };
    }
    if (!best) return;
    const total = best.rings.flat().length;
    best.rings.forEach((ring, i) => {
      timers.push(setTimeout(() => {
        ring.forEach((k) => {
          const cell = byKey.get(k);
          cell.claimed = true;
          cell.poly.style.fill = HEAT[Math.min(i, HEAT.length - 1)];
          cell.g.classList.remove('pop');
          void cell.g.getBBox();
          cell.g.classList.add('pop');
        });
        onEvent?.('hex', i);
      }, i * 115));
    });
    const pts2 = comboPoints(best.fresh);
    score += pts2;
    scoreEl.textContent = `${score} PTS`;
    const word = CASCADE_WORD[total] || `${total}-WAY`;
    labelEl.textContent = `${best.p.name} · ${word}`;
    bubble(c, best.fresh ? `${best.p.name}! +${pts2}` : `${best.p.name}!`);
    const covered = cells.filter((x) => x.claimed).length + best.rings.flat().filter((k) => !byKey.get(k).claimed).length;
    if (covered >= 24) {
      timers.push(setTimeout(() => {
        labelEl.textContent = 'GOLAZO! 24 OF 37 · NEW BOARD';
        const mid = byKey.get('0,0');
        bubble(mid, 'GOLAZO!');
        onEvent?.('win');
        timers.push(setTimeout(() => {
          cells.forEach((x) => { x.claimed = false; x.poly.style.fill = ''; });
          score = 0;
          scoreEl.textContent = '0 PTS';
        }, 1800));
      }, best.rings.length * 115 + 500));
    }
  }
}

/* ── Jadhr ────────────────────────────────────────────────────────── */
// Word families below come from Jadhr's own content file.
const WORDS = [
  { word: 'مَكْتَبة', letters: ['م', 'ك', 'ت', 'ب', 'ة'], root: ['ك', 'ت', 'ب'], gloss: 'library',
    family: [['كَتَبَ', 'he wrote'], ['كِتاب', 'book'], ['كاتِب', 'writer'], ['مَكتَب', 'office'], ['مَكتوب', 'letter']],
    shahid: { text: 'وخَيرُ جَليسٍ في الزَّمانِ كِتابُ', by: 'المتنبّي' } },
  { word: 'مَدرَسة', letters: ['م', 'د', 'ر', 'س', 'ة'], root: ['د', 'ر', 'س'], gloss: 'school',
    family: [['دَرَسَ', 'he studied'], ['دَرْس', 'lesson'], ['مُدَرِّس', 'teacher'], ['دِراسة', 'study']] },
  { word: 'مُعَلِّم', letters: ['م', 'ع', 'ل', 'م'], root: ['ع', 'ل', 'م'], gloss: 'teacher',
    family: [['عَلِمَ', 'he knew'], ['عِلم', 'knowledge'], ['تَعليم', 'education'], ['عالِم', 'scholar']],
    shahid: { text: 'قُمْ لِلمُعَلِّمِ وفِّهِ التَّبجيلا', by: 'أحمد شوقي' } },
  // The last one is a wink: the family of this word is the apps above.
  { word: 'لافي', letters: ['ل', 'ا', 'ف', 'ي'], root: ['ل', 'ف', 'ي'], gloss: 'my name', apps: true,
    family: [['جذر', 'Jadhr', 'jadhr'], ['كورتنا', 'Kooratna', 'kooratna'], ['Footies', 'Footies', 'footies'], ['Lumiku', 'Lumiku', 'lumiku'], ['Bid Wars', 'Bid Wars', 'bidwars']] },
];

export function initRoots(onEvent) {
  const wordEl = $('jpWord'), glossEl = $('jpGloss'), tilesEl = $('jpTiles'), slotsEl = $('jpSlots'), treeEl = $('jpTree'), msg = $('jpMsg'), next = $('jpNext');
  let level = 0, found = 0, current;

  function drawTree(w) {
    treeEl.textContent = '';
    treeEl.classList.add('open');
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    // Real pixels, so the pen stroke keeps one width and the draw-on dash stays whole.
    const W = treeEl.clientWidth;
    const H = Math.max(236, Math.min(320, W * 0.46));
    treeEl.style.height = `${H}px`;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    treeEl.append(svg);
    const n = w.family.length;
    w.family.forEach(([word, en, icon], i) => {
      // RTL fan: the first word sits on the right, the way the family reads.
      const a = n === 1 ? 0.5 : i / (n - 1);
      const x = 91 - a * 82;
      const y = 18 + Math.abs(a - 0.5) * 2 * 26 + (i % 2 ? 10 : 0);
      const px = (x / 100) * W, py = (y / 100) * H;
      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', `M${W / 2} ${H} C${W / 2} ${H * 0.72} ${px} ${py + H * 0.34} ${px} ${py + H * 0.15}`);
      path.setAttribute('pathLength', '1');
      path.style.setProperty('--dl', `${0.1 + i * 0.09}s`);
      svg.append(path);
      const leaf = document.createElement('div');
      leaf.className = `leaf${icon ? ' app' : ''}`;
      leaf.style.left = `${x}%`;
      leaf.style.top = `${y}%`;
      leaf.style.setProperty('--dl', `${0.45 + i * 0.09}s`);
      if (icon) {
        const img = document.createElement('img');
        img.src = `assets/icons/${icon}.webp`;
        img.alt = '';
        img.width = 46; img.height = 46;
        leaf.append(img);
      }
      const b = document.createElement('b');
      b.textContent = word;
      leaf.append(b);
      if (!icon) {
        const s = document.createElement('small');
        s.textContent = en;
        s.dataset.l = 'en';
        leaf.append(s);
      }
      treeEl.append(leaf);
    });
    onEvent?.('family');
  }

  function solved(w) {
    drawTree(w);
    if (w.apps) {
      msg.textContent = t('هذي عائلتي. كلها طلعت من جذر واحد.', 'That is my family. All of it grew from one root.');
      next.querySelector('[data-l="ar"]').textContent = 'من البداية';
      next.querySelector('[data-l="en"]').textContent = 'Start over';
    } else if (w.shahid) {
      msg.innerHTML = '';
      const q = document.createElement('q');
      q.textContent = w.shahid.text;
      msg.append(q, document.createTextNode(`  ${w.shahid.by}`));
      next.querySelector('[data-l="ar"]').textContent = 'كلمة ثانية';
      next.querySelector('[data-l="en"]').textContent = 'Another word';
    } else {
      msg.textContent = t('هذا هو الجذر، وهذي عائلته.', 'That is the root, and this is its family.');
      next.querySelector('[data-l="ar"]').textContent = 'كلمة ثانية';
      next.querySelector('[data-l="en"]').textContent = 'Another word';
    }
    next.hidden = false;
  }

  function load() {
    current = WORDS[level];
    found = 0;
    next.hidden = true;
    msg.textContent = '';
    treeEl.classList.remove('open');
    treeEl.style.height = '';
    treeEl.textContent = '';
    wordEl.textContent = current.word;
    glossEl.textContent = `“${current.gloss}”`;
    tilesEl.textContent = '';
    slotsEl.textContent = '';
    current.root.forEach(() => {
      const s = document.createElement('span');
      s.className = 'jp-slot';
      slotsEl.append(s);
    });
    current.letters.forEach((letter) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'jp-tile';
      b.textContent = letter;
      b.addEventListener('click', () => {
        const res = tapLetter(current.root, found, letter);
        if (!res.ok) {
          if (found < current.root.length) {
            b.classList.remove('shake');
            void b.offsetWidth;
            b.classList.add('shake');
            onEvent?.('miss');
            msg.textContent = letter === 'م' || letter === 'ة' || letter === 'ا'
              ? t('هذا حرف زائد، مو من الجذر. جرّب غيره.', 'That one is an added letter, not part of the root. Try another.')
              : t('من الجذر، بس مو الحين. الحروف بالترتيب.', 'Close: the letters go in order.');
          }
          return;
        }
        found = res.found;
        b.classList.add('used');
        b.disabled = true;
        const slot = slotsEl.children[found - 1];
        slot.textContent = letter;
        slot.classList.add('fill');
        msg.textContent = '';
        onEvent?.('hit', found);
        if (res.done) setTimeout(() => solved(current), 420);
      });
      tilesEl.append(b);
    });
  }

  next.addEventListener('click', () => {
    level = (level + 1) % WORDS.length;
    load();
  });
  load();
}

/* ── Crumbless ────────────────────────────────────────────────────── */
export function initScanner() {
  const box = $('scanNeeds');
  const out = $('scanVerdict');
  // A sesame loaf with wheat flour: one product, three different answers depending on who you are.
  const NEEDS = [
    { id: 'gluten', ar: 'جلوتين', en: 'Gluten', v: 'contains', ar2: 'يحتوي عليه: دقيق القمح.', en2: 'Contains it: wheat flour.' },
    { id: 'sesame', ar: 'سمسم', en: 'Sesame', v: 'contains', ar2: 'يحتوي عليه: مذكور في المكونات.', en2: 'Contains it: on the ingredient list.' },
    { id: 'milk', ar: 'حليب', en: 'Milk', v: 'may', ar2: 'قد يحتوي عليه: تحذير آثار على الملصق.', en2: 'May contain it: a traces warning on the label.' },
    { id: 'nuts', ar: 'مكسرات', en: 'Tree nuts', v: 'clear', ar2: 'غير مذكورة في هذا الملصق.', en2: 'Not listed on this label.' },
  ];
  let cur = NEEDS[0];
  const paint = () => {
    out.dataset.v = cur.v;
    out.textContent = t(cur.ar2, cur.en2);
    [...box.children].forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === cur.id)));
  };
  NEEDS.forEach((n) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.id = n.id;
    b.innerHTML = `<span data-l="ar">${n.ar}</span><span data-l="en">${n.en}</span>`;
    b.addEventListener('click', () => { cur = n; paint(); });
    box.append(b);
  });
  paint();
  return { redraw: paint };
}

// Crumbs fall off the bitten corner and settle on the paper's bottom edge.
export function initCrumbs(canvas, host) {
  const ctx = canvas.getContext('2d');
  let w = 1, h = 1, d = 1, crumbs = [], raf = 0, visible = false, lastDrop = 0;
  const resize = () => {
    w = host.clientWidth; h = host.clientHeight;
    d = Math.min(devicePixelRatio || 1, 2);
    canvas.width = w * d; canvas.height = h * d;
    ctx.setTransform(d, 0, 0, d, 0, 0);
  };
  const poly = (r) => {
    const n = 6 + Math.floor(Math.random() * 3);
    return Array.from({ length: n }, (_, i) => {
      const an = (i / n) * 6.283;
      const rr = r * (0.65 + Math.random() * 0.45);
      return [Math.cos(an) * rr, Math.sin(an) * rr];
    });
  };
  function drop(x, y, count = 1) {
    for (let i = 0; i < count; i++) {
      const tier = Math.random();
      const r = tier < 0.55 ? 1.8 + Math.random() : tier < 0.9 ? 3.2 + Math.random() * 1.3 : 5.2 + Math.random() * 1.8;
      crumbs.push({ x: x + (Math.random() - 0.5) * 22, y, vx: (Math.random() - 0.5) * 1.5, vy: Math.random() * 0.8, r, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.22, p: poly(r), rest: false, bounced: 0 });
    }
    if (crumbs.length > 90) crumbs.splice(0, crumbs.length - 90);
    if (!raf) raf = requestAnimationFrame(step);
  }
  function step(now) {
    raf = 0;
    ctx.clearRect(0, 0, w, h);
    const floor = h - 12;
    let moving = false;
    if (visible && now - lastDrop > 760) {
      lastDrop = now;
      drop(w - 46, 62);
    }
    for (const c of crumbs) {
      if (!c.rest) {
        moving = true;
        c.vy += 0.17;
        c.x += c.vx; c.y += c.vy; c.a += c.va;
        if (c.y >= floor - c.r) {
          c.y = floor - c.r;
          if (c.bounced < 1 && c.r > 2.4) { c.vy *= -0.34; c.vx *= 0.6; c.va *= 0.5; c.bounced++; } else c.rest = true;
        }
      }
      ctx.save();
      ctx.translate(c.x, c.y);
      if (c.y > floor - 26) {
        ctx.fillStyle = `rgba(72,48,30,${0.16 * (1 - (floor - c.y - c.r) / 26)})`;
        ctx.beginPath();
        ctx.ellipse(0, floor - c.y, c.r * 1.3, c.r * 0.34, 0, 0, 6.283);
        ctx.fill();
      }
      ctx.rotate(c.a);
      ctx.fillStyle = '#7a5637';
      ctx.beginPath();
      c.p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    if (moving || visible) raf = requestAnimationFrame(step);
  }
  new ResizeObserver(resize).observe(host);
  resize();
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !raf) raf = requestAnimationFrame(step);
  }).observe(host);
  host.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const r = host.getBoundingClientRect();
    drop(e.clientX - r.left, e.clientY - r.top, 9);
  });
}

