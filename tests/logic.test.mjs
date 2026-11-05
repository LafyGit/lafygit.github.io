// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toArabicDigits, arabicDaysAgo, daysBetween, tapLetter, hexCells, cascade, comboPoints,
  isValidSet, rowSegments, auctionStart, raise, pass, canRaise, rivalDecides,
} from '../js/logic.js';

test('the 142-day claim on the page matches the App Store dates', () => {
  assert.equal(daysBetween('2026-06-11', '2026-10-31'), 142);
  // The layer gaps must add up to the same number.
  const dates = ['2026-06-11', '2026-09-08', '2026-10-13', '2026-10-28', '2026-10-31'];
  const gaps = dates.slice(1).map((d, i) => daysBetween(dates[i], d));
  assert.deepEqual(gaps, [89, 35, 15, 3]);
  assert.equal(gaps.reduce((a, b) => a + b), 142);
});

test('Arabic digits', () => assert.equal(toArabicDigits('142 / 2026'), '١٤٢ / ٢٠٢٦'));

test('Arabic day counts agree with the number', () => {
  assert.equal(arabicDaysAgo(0), 'اليوم');
  assert.equal(arabicDaysAgo(2), 'قبل يومين');
  assert.equal(arabicDaysAgo(5), 'قبل ٥ أيام');
  assert.equal(arabicDaysAgo(147), 'قبل ١٤٧ يومًا');
});

test('root letters must come in order', () => {
  const root = ['ك', 'ت', 'ب'];
  assert.deepEqual(tapLetter(root, 0, 'م'), { ok: false, found: 0, done: false });
  assert.deepEqual(tapLetter(root, 0, 'ت'), { ok: false, found: 0, done: false });
  assert.deepEqual(tapLetter(root, 0, 'ك'), { ok: true, found: 1, done: false });
  assert.deepEqual(tapLetter(root, 2, 'ب'), { ok: true, found: 3, done: true });
});

test('hex board has the real 37 cells', () => assert.equal(hexCells(3).length, 37));

test('cascade floods connected matches and stops at walls', () => {
  const byKey = new Map(hexCells(3).map((c) => [c.key, c]));
  const onAxis = (c) => c.r === 0; // a line through the middle
  const rings = cascade(byKey, '0,0', onAxis);
  assert.equal(rings.flat().length, 7);
  assert.deepEqual(rings[0], ['0,0']);
  assert.equal(rings[1].length, 2);
  // A non-matching start claims nothing.
  assert.deepEqual(cascade(byKey, '0,1', onAxis), []);
  // An island beyond a wall stays dark.
  const split = (c) => c.key === '0,0' || c.key === '3,0';
  assert.deepEqual(cascade(byKey, '0,0', split), [['0,0']]);
});

test('combo points match the real game', () => {
  assert.equal(comboPoints(5), 15);
  assert.equal(comboPoints(8), 36);
});

test('Lumiku sets', () => {
  const t = (n, c) => ({ n, c });
  assert.ok(isValidSet([t(4, 'r'), t(5, 'r'), t(6, 'r')]), 'run');
  assert.ok(isValidSet([t(6, 'r'), t(5, 'r'), t(4, 'r')]), 'run read backwards, for RTL tables');
  assert.ok(isValidSet([t(7, 'r'), t(7, 'b'), t(7, 'g')]), 'group');
  assert.ok(isValidSet([t(4, 'r'), { joker: true }, t(6, 'r')]), 'joker holds its slot');
  assert.ok(isValidSet([t(9, 'r'), { joker: true }, t(9, 'b')]), 'joker in a group');
  assert.ok(!isValidSet([t(4, 'r'), t(5, 'r')]), 'too short');
  assert.ok(!isValidSet([t(4, 'r'), t(5, 'b'), t(6, 'r')]), 'mixed colours');
  assert.ok(!isValidSet([t(4, 'r'), t(6, 'r'), t(7, 'r')]), 'gap in a run');
  assert.ok(!isValidSet([t(7, 'r'), t(7, 'r'), t(7, 'b')]), 'repeated colour in a group');
  assert.ok(!isValidSet([t(12, 'r'), t(13, 'r'), { joker: true }]), 'no number past 13');
  assert.ok(!isValidSet([{ joker: true }, { joker: true }, { joker: true }]), 'jokers alone');
});

test('rowSegments splits on gaps', () => {
  assert.deepEqual(rowSegments([5, 1, 2, 3]), [[1, 2, 3], [5]]);
  assert.deepEqual(rowSegments([]), []);
});

test('an auction: raises, passes, budgets and shelves', () => {
  let s = auctionStart(['Pizza', 'Pho'], 3);
  assert.ok(canRaise(s, 0));
  assert.equal(raise(s, 1), s, 'out of turn does nothing');
  s = raise(s, 0);
  s = raise(s, 1, 2);
  assert.equal(s.bid, 3);
  assert.ok(!canRaise(s, 0), 'player 0 cannot beat a bid of their whole budget');
  s = pass(s, 0);
  assert.deepEqual(s.budgets, [3, 0]);
  assert.deepEqual(s.shelves[1], [{ item: 'Pizza', paid: 3 }]);
  // Next item: player 1 opens because turns alternate by item.
  assert.equal(s.turn, 1);
  s = pass(s, 1);
  assert.deepEqual(s.shelves[0], [{ item: 'Pho', paid: 0 }], 'a pass at $0 still hands it over');
  assert.ok(s.over);
});

test('the rival respects its value and budget', () => {
  const s = { turn: 1, bid: 4, budgets: [20, 20] };
  assert.equal(rivalDecides(s, 9), 'raise');
  assert.equal(rivalDecides(s, 4), 'pass');
  assert.equal(rivalDecides({ ...s, budgets: [20, 4] }, 9), 'pass');
  assert.equal(rivalDecides({ ...s, turn: 0 }, 9), 'wait');
});
