import test from 'node:test';
import assert from 'node:assert/strict';
import { boardStack, computeLayout, LED_LIMIT } from '../src/domain/layout.ts';
import { defaultSettings, type ArtworkElement, type DesignState } from '../src/domain/project.ts';

// 100×100 px square letter, traced image 100×100 px.
const square = (id: string, x0: number, type: ArtworkElement['type'], group = 'g1'): ArtworkElement => ({
  id,
  name: id,
  type,
  group,
  override: false,
  pixels: 10000,
  bounds: [x0, 0, x0 + 100, 100],
  color: '#ffffff',
  regions: [
    {
      outer: [
        [x0, 0],
        [x0 + 100, 0],
        [x0 + 100, 100],
        [x0, 100],
      ],
      holes: [],
    },
  ],
});

function design(
  elements: ArtworkElement[],
  groupParams?: Record<string, number>,
  type = elements[0].type,
): DesignState {
  return {
    settings: defaultSettings(),
    artwork: {
      elements,
      groups: [{ id: 'g1', name: 'Group 1', type, params: groupParams }],
      bounds: [0, 0, 100, 100],
      imageWidth: 100,
      imageHeight: 100,
      imageData: 'data:image/png;base64,',
      approved: false,
    },
  };
}

test('board stack is contiguous rear to front, backing sheet optional', () => {
  const s = defaultSettings();
  const plain = boardStack(s);
  assert.deepEqual(
    plain.layers.map((l) => l.layer),
    ['gi', 'frame', 'acp'],
  );
  assert.equal(plain.front, s.frame / 2 + s.acp);
  const backed = boardStack({ ...s, backing: 1.5 });
  assert.deepEqual(
    backed.layers.map((l) => l.layer),
    ['gi', 'frame', 'backing', 'acp'],
  );
  assert.equal(backed.front, plain.front + 1.5);
  for (const st of [plain, backed])
    for (let i = 1; i < st.layers.length; i++) assert.equal(st.layers[i].z0, st.layers[i - 1].z1);
});

test('front-lit letter stacks back, returns, face from the ACP face', () => {
  const L = computeLayout(design([square('a', 0, 'front')]));
  const parts = L.elements[0].parts.filter((p) => p.kind !== 'leds' && p.kind !== 'stud');
  assert.deepEqual(
    parts.map((p) => p.kind),
    ['back', 'returns', 'face'],
  );
  assert.equal(parts[0].z0, L.letterBase);
  for (let i = 1; i < parts.length; i++) assert.equal(parts[i].z0, parts[i - 1].z1);
  assert.equal(parts[1].z1 - parts[1].z0, 60);
});

test('group params override recipe defaults; halo letters stand off the fascia', () => {
  const L = computeLayout(design([square('a', 0, 'halo')], { depth: 80, standoff: 25 }));
  const [standoff, back, returns] = L.elements[0].parts.filter((p) => p.kind !== 'leds' && p.kind !== 'stud');
  assert.equal(standoff.kind, 'standoff');
  assert.equal(standoff.z1 - standoff.z0, 25);
  assert.equal(back.z0, L.letterBase + 25);
  assert.equal(returns.z1 - returns.z0, 80);
  assert.ok(L.elements[0].fixings.length >= 1);
});

test('artwork scales to the board in mm and counts lit return length', () => {
  const d = design([square('a', 0, 'front')]);
  const L = computeLayout(d);
  // 100 px artwork fills min(3600*0.84, 1200*0.75) = 900 mm.
  assert.equal(L.scale, 9);
  const [x0, y0, x1, y1] = L.elements[0].bounds;
  assert.deepEqual([x1 - x0, y1 - y0], [900, 900]);
  assert.equal(L.returnLength, 3600);
  assert.ok(L.ledcount > 0 && L.ledcount <= LED_LIMIT);
  assert.equal(computeLayout(d), L, 'layout is cached per design');
});

test('vinyl is a surface film, excluded elements produce no parts', () => {
  const L = computeLayout(design([square('v', 0, 'vinyl'), square('x', 0, 'omit')], undefined, 'vinyl'));
  assert.equal(L.elements.length, 1);
  const [film] = L.elements[0].parts;
  assert.equal(film.kind, 'flat');
  assert.ok(film.z1 - film.z0 < 1);
  assert.equal(L.returnLength, 0);
});

test('bom lists board layers and per-group letter parts with lit quantities', async () => {
  const { bom } = await import('../src/domain/bom.ts');
  const rows = bom(design([square('a', 0, 'front'), square('b', 0, 'front')]));
  const find = (item: string) => rows.find((r) => r.item === item)!;
  assert.equal(find('ACP fascia').qty, 3.6 * 1.2);
  assert.equal(find('MS frame').qty, (2 * 3600 + 4 * (1200 - 80)) / 1000);
  assert.equal(find('Group 1 · Return strip').qty, 7.2); // two 900 mm squares
  assert.equal(find('Group 1 · Faces').qty, 2 * 0.81);
  assert.ok(find('Group 1 · LED modules').estimate);
});

test('trim cap wraps the face edge and adds to the projection only by its top', () => {
  const L = computeLayout(design([square('a', 0, 'front')], { trimcap: 8 }));
  const e = L.elements[0],
    face = e.parts.find((p) => p.kind === 'face')!,
    trim = e.parts.find((p) => p.kind === 'trim')!;
  assert.ok(trim.z0 < face.z0 && trim.z1 > face.z1);
  assert.match(trim.material, /8 mm lip/);
  assert.equal(
    computeLayout(design([square('b', 0, 'front')])).elements[0].parts.some((p) => p.kind === 'trim'),
    false,
  );
});

test('flush letters still get fixing studs through the fascia; vinyl gets none', () => {
  const L = computeLayout(design([square('a', 0, 'front')]));
  const stud = L.elements[0].parts.find((p) => p.kind === 'stud')!;
  assert.ok(L.elements[0].fixings.length >= 1);
  assert.ok(stud.z0 < L.letterBase && stud.z1 > L.letterBase);
  const V = computeLayout(design([square('v', 0, 'vinyl')]));
  assert.equal(V.elements[0].fixings.length, 0);
});

test('front + halo and full acrylic are lit recipes with LEDs and returns', () => {
  for (const type of ['fronthalo', 'fullacrylic'] as const) {
    const e = computeLayout(design([square('a', 0, type)])).elements[0];
    assert.ok(e.leds.length > 0, type);
    assert.ok(
      e.parts.some((p) => p.kind === 'returns'),
      type,
    );
  }
  const fh = computeLayout(design([square('a', 0, 'fronthalo')])).elements[0];
  assert.equal(fh.parts.find((p) => p.kind === 'standoff')!.z1 - fh.base, 40);
});

test('power plan sizes PSUs from LED load and routes one cable per lit element', async () => {
  const { PSU_W, PSU_LOADING, MODULE_W } = await import('../src/domain/layout.ts');
  const L = computeLayout(design([square('a', 0, 'front'), square('b', 0, 'front')]));
  const p = L.power;
  assert.equal(p.loadW, L.ledcount * MODULE_W);
  assert.equal(p.psus.length, Math.ceil(p.loadW / (PSU_W * PSU_LOADING)));
  assert.equal(p.cables.length, 2);
  for (const c of p.cables) {
    assert.deepEqual(c.points.at(-1)!.slice(0, 2), p.psus[c.psu].slice(0, 2));
    assert.ok(c.length > 0);
  }
  // Default 40 mm frame is too shallow for the placeholder 38 mm PSU? No: 38 fits in 40.
  assert.equal(p.warnings.length, 0);
  const shallow = design([square('a', 0, 'front')]);
  shallow.settings.frame = 25;
  assert.match(computeLayout(shallow).power.warnings.join(), /does not fit inside the 25 mm frame/);
});

test('bom includes studs, trim cap and power rows', async () => {
  const { bom } = await import('../src/domain/bom.ts');
  const rows = bom(design([square('a', 0, 'front')], { trimcap: 6 }));
  const item = (s: string) => rows.find((r) => r.item.includes(s));
  assert.equal(item('Trim cap')!.qty, 3.6);
  assert.ok(item('Fixing studs')!.qty >= 1);
  assert.ok(item('LED power supply')!.qty >= 1);
  assert.equal(item('Cable penetrations')!.qty, 1);
});
