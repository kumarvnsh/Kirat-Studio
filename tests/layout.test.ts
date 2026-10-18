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

test('character height, width, depth, letter spacing, and group spacing adjust 3D layout', () => {
  const d: DesignState = {
    settings: { ...defaultSettings(), groupSpacing: 150 },
    artwork: {
      elements: [
        { ...square('a', 0, 'front', 'g1'), charHeight: 300, charWidth: 240, charDepth: 95 },
        { ...square('b', 120, 'front', 'g1') },
        { ...square('c', 0, 'halo', 'g2') },
      ],
      groups: [
        { id: 'g1', name: 'Row 1', type: 'front', letterSpacing: 80, charHeight: 250, charWidth: 200 },
        { id: 'g2', name: 'Row 2', type: 'halo' },
      ],
      bounds: [0, 0, 220, 100],
      imageWidth: 220,
      imageHeight: 100,
      imageData: 'data:image/png;base64,',
      approved: false,
    },
  };
  const L = computeLayout(d);
  const LBase = computeLayout({
    ...d,
    artwork: {
      ...d.artwork!,
      groups: d.artwork!.groups.map((g) => (g.id === 'g1' ? { ...g, letterSpacing: 0 } : g)),
    },
  });
  const [ea, eb] = L.elements;
  const [ea0, eb0] = LBase.elements;
  assert.equal(Math.round(ea.bounds[2] - ea.bounds[0]), 240);
  assert.equal(Math.round(ea.bounds[3] - ea.bounds[1]), 300);
  assert.equal(Math.round(eb.bounds[2] - eb.bounds[0]), 200);
  assert.equal(Math.round(eb.bounds[3] - eb.bounds[1]), 250);
  const gapWith = eb.bounds[0] - ea.bounds[2];
  const gapWithout = eb0.bounds[0] - ea0.bounds[2];
  assert.equal(Math.round(gapWith - gapWithout), 80);
  const aReturns = ea.parts.find((p) => p.kind === 'returns')!;
  assert.equal(aReturns.z1 - aReturns.z0, 95);
  assert.equal(L.boardGroupGap, 150);
});

test('default view starts in Day mode with Lights Off and mm units; units convert between mm, inch, and foot', async () => {
  const { defaultView } = await import('../src/domain/project.ts');
  const { mmToUnit, unitToMm, formatAllUnits } = await import('../src/domain/units.ts');
  const v = defaultView();
  assert.equal(v.environment, 'day');
  assert.equal(v.lights, false);
  assert.equal(v.unit, 'mm');
  assert.equal(mmToUnit(25.4, 'in'), 1);
  assert.equal(mmToUnit(304.8, 'ft'), 1);
  assert.equal(unitToMm(10, 'in'), 254);
  assert.equal(unitToMm(2, 'ft'), 609.6);
  assert.match(formatAllUnits(304.8), /304\.8 mm · 12 in · 1 ft/);
});

test('letter O face extrudes without hole bridging and places LED modules cleanly inside both strokes', async () => {
  const T = await import('three');
  const { shapeFromRegion } = await import('../src/scene/scene.ts');
  const { inside } = await import('../src/artwork/contours.js');
  const { LED_SIZE } = await import('../src/domain/layout.ts');
  // Construct a 64-vertex 'O' starting at the exact top apex (y = maxY) with a 48-vertex inner hole.
  const outer = Array.from({ length: 64 }, (_, i) => {
    const a = Math.PI / 2 - (i / 64) * Math.PI * 2;
    return [100 + 95 * Math.cos(a), 110 + 110 * Math.sin(a)] as [number, number];
  });
  const hole = Array.from({ length: 48 }, (_, i) => {
    const a = Math.PI / 2 + (i / 48) * Math.PI * 2;
    return [100 + 35 * Math.cos(a), 110 + 85 * Math.sin(a)] as [number, number];
  });
  const d = design([
    {
      id: 'o',
      name: 'Element 12',
      type: 'front',
      group: 'g1',
      override: false,
      pixels: 12000,
      bounds: [5, 0, 195, 220],
      color: '#ffa030',
      regions: [{ outer, holes: [hole] }],
    },
  ]);
  d.artwork!.bounds = [0, 0, 200, 220];
  d.artwork!.imageWidth = 200;
  d.artwork!.imageHeight = 220;
  const L = computeLayout(d);
  const el = L.elements[0];
  const sh = shapeFromRegion({
    outer: el.regions[0].outer.map(([x, y]) => [x * 0.001, y * 0.001]),
    holes: el.regions[0].holes.map((h) => h.map(([x, y]) => [x * 0.001, y * 0.001] as [number, number])),
  });
  const g = new T.ExtrudeGeometry([sh], {
    depth: 0.003,
    bevelEnabled: true,
    bevelSize: 0.0003,
    bevelThickness: 0.0002,
    bevelSegments: 2,
    curveSegments: 8,
  });
  const pos = g.attributes.position;
  const h0 = el.regions[0].holes[0];
  const hcx = h0.reduce((s, p) => s + p[0], 0) / h0.length;
  const hcy = h0.reduce((s, p) => s + p[1], 0) / h0.length;
  const innerHole = h0.map(([x, y]) => [hcx + (x - hcx) * 0.8, hcy + (y - hcy) * 0.8]);
  for (let i = 0; i < pos.count; i += 3) {
    const z0 = pos.getZ(i),
      z1 = pos.getZ(i + 1),
      z2 = pos.getZ(i + 2);
    if (Math.abs(z0 - z1) > 1e-6 || Math.abs(z1 - z2) > 1e-6) continue;
    const cx = ((pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3) * 1000;
    const cy = ((pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3) * 1000;
    assert.equal(inside([cx, cy], innerHole), false, 'no face lid triangle may bridge across the hole of O');
  }
  assert.ok(el.leds.some(([x]) => x < hcx), 'left stroke of O has LEDs');
  assert.ok(el.leds.some(([x]) => x > hcx), 'right stroke of O has LEDs');
  for (const [x, y] of el.leds) {
    for (const corner of [
      [x - LED_SIZE.w / 2, y - LED_SIZE.h / 2],
      [x + LED_SIZE.w / 2, y - LED_SIZE.h / 2],
      [x - LED_SIZE.w / 2, y + LED_SIZE.h / 2],
      [x + LED_SIZE.w / 2, y + LED_SIZE.h / 2],
    ]) {
      assert.equal(inside(corner, el.regions[0].outer), true, 'LED corner stays inside outer wall');
      assert.equal(inside(corner, h0), false, 'LED corner stays outside inner hole');
    }
  }
});

