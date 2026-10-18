import test from 'node:test';
import assert from 'node:assert/strict';
import { attachDetails, autoGroup, applyGroupType } from '../src/artwork/grouping.js';

// Box-shaped component helper: bounds [x0,y0,x1,y1] in image pixels (y down).
const box = (id, x0, y0, x1, y1) => ({
  id,
  name: id,
  type: 'front',
  pixels: (x1 - x0) * (y1 - y0),
  bounds: [x0, y0, x1, y1],
  color: '#ffffff',
  regions: [
    {
      outer: [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ],
      holes: [],
    },
  ],
});

test('attachDetails merges an i-dot into the stem below it', () => {
  const stem = box('stem', 10, 30, 16, 80);
  const dot = box('dot', 10, 18, 16, 24);
  const next = box('k', 25, 10, 55, 80);
  const out = attachDetails([stem, dot, next]);
  assert.deepEqual(
    out.map((c) => c.id),
    ['stem', 'k'],
  );
  assert.equal(out[0].regions.length, 2);
  assert.deepEqual(out[0].bounds, [10, 18, 16, 80]);
});

test('attachDetails leaves a full stop beside a letter alone', () => {
  const letter = box('a', 0, 0, 30, 40);
  const stop = box('stop', 34, 34, 40, 40);
  assert.equal(attachDetails([letter, stop]).length, 2);
});

test('autoGroup splits rows and gives the small tagline one construction', () => {
  // Wordmark: two tall letters. Tagline: three small letters on a lower row.
  const comps = [
    box('W1', 0, 0, 60, 100),
    box('W2', 70, 0, 130, 100),
    box('t1', 0, 130, 15, 155),
    box('t2', 20, 130, 35, 155),
    box('t3', 40, 130, 55, 155),
  ];
  const { components, groups } = autoGroup(comps);
  assert.equal(groups.length, 2);
  const g = Object.fromEntries(components.map((c) => [c.id, c.group]));
  assert.equal(g.W1, g.W2);
  assert.equal(g.t1, g.t2);
  assert.equal(g.t2, g.t3);
  assert.notEqual(g.W1, g.t1);
  const tagline = groups.find((x) => x.id === g.t1);
  assert.equal(tagline.type, 'vinyl');
  for (const c of components.filter((c) => c.group === tagline.id)) assert.equal(c.type, 'vinyl');
  assert.equal(groups.find((x) => x.id === g.W1).type, 'front');
});

test('autoGroup separates a symbol from the wordmark by a wide gap', () => {
  const comps = [box('S', 0, 0, 100, 100), box('W1', 300, 10, 360, 100), box('W2', 370, 10, 430, 100)];
  const { components } = autoGroup(comps);
  const g = Object.fromEntries(components.map((c) => [c.id, c.group]));
  assert.notEqual(g.S, g.W1);
  assert.equal(g.W1, g.W2);
});

test('autoGroup keeps the wordmark front-lit next to a taller symbol', () => {
  const comps = [
    box('S', 0, 0, 220, 220),
    box('W1', 400, 60, 470, 170),
    box('W2', 480, 60, 550, 170),
    box('t1', 400, 300, 430, 335),
    box('t2', 440, 300, 470, 335),
  ];
  const { components, groups } = autoGroup(comps);
  const type = Object.fromEntries(components.map((c) => [c.id, c.type]));
  assert.equal(groups.length, 3);
  assert.equal(type.S, 'front');
  assert.equal(type.W1, 'front');
  assert.equal(type.t1, 'vinyl');
});

test('applyGroupType keeps per-element overrides', () => {
  const groups = [{ id: 'g1', name: 'Tagline', type: 'vinyl' }];
  const components = [
    { id: 'a', group: 'g1', type: 'vinyl' },
    { id: 'b', group: 'g1', type: 'metal', override: true },
  ];
  applyGroupType(groups, components, 'g1', 'acrylic');
  assert.equal(groups[0].type, 'acrylic');
  assert.equal(components[0].type, 'acrylic');
  assert.equal(components[1].type, 'metal');
});

test('applyGroupType resets recipe params when the construction changes', () => {
  const groups = [{ id: 'g1', name: 'Wordmark', type: 'front', params: { depth: 90 } }];
  applyGroupType(groups, [], 'g1', 'front');
  assert.deepEqual(groups[0].params, { depth: 90 });
  applyGroupType(groups, [], 'g1', 'halo');
  assert.equal(groups[0].params, undefined);
});

// Realistic logo layout (pixels, y down): tall symbol on the left spanning both text lines,
// mixed-case wordmark "Kirat Creations" with i-dots, tagline in small caps directly underneath
// with bullets and a full stop.
function kiratLike() {
  const comps = [box('symbol', 50, 60, 290, 460)];
  // Wordmark: caps 120 tall (y 170–290), x-height letters 85 tall (y 205–290), word gap 45.
  const word = ['K', 'i', 'r', 'a', 't', null, 'C', 'r', 'e', 'a', 't', 'i', 'o', 'n', 's'];
  let x = 320;
  word.forEach((ch, i) => {
    if (!ch) return void (x += 45);
    const cap = ch === 'K' || ch === 'C' || ch === 't';
    const w = ch === 'i' ? 22 : 70;
    comps.push(box('w' + i, x, cap ? 170 : 205, x + w, 290));
    if (ch === 'i') comps.push(box('dot' + i, x, 172, x + 22, 194)); // tittle above the stem
    x += w + 8;
  });
  // Tagline: caps 33 tall at y 342–375, starting under the wordmark; bullets mid-height; final full stop.
  x = 330;
  'SIGNAGE•BRANDING•INTERIORS.'.split('').forEach((ch, i) => {
    if (ch === '•') comps.push(box('bullet' + i, x + 8, 352, x + 20, 364)), (x += 34);
    else if (ch === '.') comps.push(box('stop' + i, x, 367, x + 8, 375)), (x += 14);
    else comps.push(box('t' + i, x, 342, x + 26, 375)), (x += 32);
  });
  return comps;
}

test('logo layout: symbol, wordmark and tagline are three separate groups', () => {
  const { components, groups } = autoGroup(attachDetails(kiratLike()));
  const groupOf = (id) => groups.find((g) => g.id === components.find((c) => c.id === id).group).name;
  assert.equal(groups.length, 3, groups.map((g) => g.name).join(', '));
  assert.equal(groupOf('symbol'), 'Symbol');
  assert.equal(groupOf('w0'), 'Main wordmark');
  assert.equal(groupOf('w14'), 'Main wordmark');
  assert.equal(groupOf('t0'), 'Tagline');
  assert.equal(groupOf('bullet7'), 'Tagline', 'bullets join the tagline');
  assert.equal(groupOf('stop26'), 'Tagline', 'the full stop joins the tagline');
  assert.equal(groups.find((g) => g.name === 'Tagline').type, 'vinyl');
  assert.equal(groups.find((g) => g.name === 'Main wordmark').type, 'front');
});

test('logo layout: i-dots attach to their stems, tagline letters under the wordmark do not', () => {
  const comps = attachDetails(kiratLike());
  assert.ok(!comps.some((c) => c.id.startsWith('dot')), 'tittles merged');
  assert.equal(comps.find((c) => c.id === 'w1').regions.length, 2, 'i = stem + dot');
  assert.equal(comps.filter((c) => c.id.startsWith('t')).length, 24, 'every tagline letter survives');
  assert.ok(
    comps.filter((c) => c.id.startsWith('w') && c.regions.length > 1).every((c) => /^w(1|11)$/.test(c.id)),
  );
});

test('two-line wordmark of the same size stays one group', () => {
  const line = (y, n, prefix) =>
    Array.from({ length: n }, (_, i) => box(prefix + i, 100 + i * 80, y, 170 + i * 80, y + 100));
  const { groups } = autoGroup([...line(0, 5, 'a'), ...line(130, 8, 'b')]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].name, 'Main wordmark');
});

test('an icon close to the text but much taller stays separate', () => {
  const { groups } = autoGroup([
    box('icon', 0, 0, 200, 260),
    ...Array.from({ length: 4 }, (_, i) => box('l' + i, 230 + i * 70, 80, 290 + i * 70, 180)),
  ]);
  assert.deepEqual(groups.map((g) => g.name).sort(), ['Main wordmark', 'Symbol']);
});

test('a differently coloured icon next to the lettering is its own group; multicolour letters still merge', () => {
  const c = (b, color) => ({ ...b, color });
  const { groups } = autoGroup([
    c(box('icon', 0, 60, 160, 230), '#11bb66'),
    ...Array.from({ length: 5 }, (_, i) => c(box('l' + i, 200 + i * 70, 120, 260 + i * 70, 230), '#222222')),
  ]);
  assert.deepEqual(groups.map((g) => g.name).sort(), ['Main wordmark', 'Symbol']);
  const rainbow = ['#ff0000', '#00aa00', '#0000ff', '#ffaa00'].map((col, i) =>
    c(box('r' + i, i * 70, 0, 60 + i * 70, 100), col),
  );
  assert.equal(autoGroup(rainbow).groups.length, 1);
});

test('a lowercase tagline with ascenders, descenders and separators stays one group', () => {
  // words: x-height 20 with some 28-tall ascender/descender letters, separated by 30 px gaps.
  const word = (x0, hs, p) =>
    hs.map((h, i) =>
      box(
        p + i,
        x0 + i * 16,
        h === 'd' ? 400 : h === 'a' ? 392 : 400,
        x0 + i * 16 + 13,
        h === 'd' ? 428 : 420,
      ),
    );
  const comps = [
    ...Array.from({ length: 6 }, (_, i) => box('W' + i, 100 + i * 90, 200, 180 + i * 90, 320)),
    ...word(100, ['x', 'x', 'd', 'x', 'x', 'd', 'x'], 's'),
    ...word(242, ['a', 'x', 'x', 'x', 'a', 'x', 'x', 'd'], 'b'),
    ...word(400, ['x', 'x', 'a', 'x', 'x', 'x', 'x', 'x', 'x'], 'i'),
  ];
  const { groups } = autoGroup(comps);
  assert.deepEqual(groups.map((g) => g.name).sort(), ['Main wordmark', 'Tagline']);
});

// Fixture modelled on the real Kirat Creations logo (1125 × 404 px JPEG): a four-colour symbol of
// 4 petals + 4 inner arcs in a ring, the orange wordmark, and a dark tagline with "|" separators.
function kiratReal() {
  const c = (b, color) => ({ ...b, color });
  const green = '#50ac55',
    blue = '#3092c8',
    yellow = '#f1c246',
    orange = '#f9b05a',
    grey = '#7b7e82';
  const comps = [
    c(box('petalTop', 125, 30, 300, 114), green),
    c(box('petalBottom', 125, 266, 300, 350), yellow),
    c(box('petalLeft', 50, 103, 134, 278), blue),
    c(box('petalRight', 291, 103, 375, 278), blue),
    c(box('arcTop', 153, 120, 271, 172), green),
    c(box('arcBottom', 153, 208, 271, 260), yellow),
    c(box('arcLeft', 140, 131, 192, 249), blue),
    c(box('arcRight', 233, 131, 285, 249), blue),
  ];
  let x = 420;
  'Kirat Creations'.split('').forEach((ch, i) => {
    if (ch === ' ') return void (x += 20);
    const tall = 'KtCi'.includes(ch),
      w = ch === 'i' ? 14 : 38;
    comps.push(c(box('w' + i, x, tall ? 150 : 166, x + w, 210), orange));
    if (ch === 'i') comps.push(c(box('wdot' + i, x, 140, x + 14, 152), orange));
    x += w + 5;
  });
  x = 415;
  'Signage | Graphics | Display Units | Turnkey Solutions'.split('').forEach((ch, i) => {
    if (ch === ' ') return void (x += 6);
    if (ch === '|') comps.push(c(box('bar' + i, x, 243, x + 2, 270), grey)), (x += 8);
    else comps.push(c(box('t' + i, x, 250, x + 12, 268), grey)), (x += 15);
  });
  return comps;
}

test('real Kirat layout: the multi-piece symbol is one group; wordmark and tagline are named right', () => {
  const { components, groups } = autoGroup(attachDetails(kiratReal()));
  const name = (id) => groups.find((g) => g.id === components.find((c) => c.id === id).group).name;
  assert.deepEqual(groups.map((g) => g.name).sort(), ['Main wordmark', 'Symbol', 'Tagline']);
  for (const p of [
    'petalTop',
    'petalBottom',
    'petalLeft',
    'petalRight',
    'arcTop',
    'arcBottom',
    'arcLeft',
    'arcRight',
  ])
    assert.equal(name(p), 'Symbol', p);
  assert.equal(name('w0'), 'Main wordmark');
  assert.equal(name('t0'), 'Tagline');
  assert.equal(name('bar8'), 'Tagline', 'separators belong to the tagline');
  assert.equal(groups.find((g) => g.name === 'Symbol').type, 'front');
  assert.equal(groups.find((g) => g.name === 'Main wordmark').type, 'front');
  assert.equal(groups.find((g) => g.name === 'Tagline').type, 'vinyl');
});
