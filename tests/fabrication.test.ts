import test from 'node:test';
import assert from 'node:assert/strict';
import { bendScheduleCSV, defaultFabrication, fabricationPlan } from '../src/fabrication/plan.ts';
import { planToDXF } from '../src/fabrication/dxf.ts';
import { defaultSettings, type ArtworkElement, type DesignState } from '../src/domain/project.ts';

// One 100 px square letter "O" (with counter) and one vinyl square; artwork 100 px → 900 mm.
const el = (id: string, type: ArtworkElement['type'], group: string, hole: boolean): ArtworkElement => ({
  id,
  name: id,
  type,
  group,
  override: false,
  pixels: 1,
  bounds: [0, 0, 100, 100],
  color: '#ffffff',
  regions: [
    {
      outer: [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ],
      holes: hole
        ? [
            [
              [30, 30],
              [30, 70],
              [70, 70],
              [70, 30],
            ],
          ]
        : [],
    },
  ],
});
const design: DesignState = {
  settings: defaultSettings(),
  artwork: {
    elements: [el('O', 'front', 'g1', true), el('tag', 'vinyl', 'g2', false)],
    groups: [
      { id: 'g1', name: 'Wordmark', type: 'front' },
      { id: 'g2', name: 'Tagline', type: 'vinyl' },
    ],
    bounds: [0, 0, 100, 100],
    imageWidth: 100,
    imageHeight: 100,
    imageData: 'data:image/png;base64,',
    approved: true,
  },
};
const fab = defaultFabrication();

test('plan: lit letter gives back + face cuts and outer + inner strips; vinyl is uncompensated', () => {
  const p = fabricationPlan(design, fab);
  assert.deepEqual(
    p.cuts.map((c) => `${c.element}:${c.part}`),
    ['O:back', 'O:face', 'tag:vinyl'],
  );
  assert.equal(p.strips.length, 1);
  assert.deepEqual(
    p.strips[0].schedules.map((s) => [s.contour, Math.round(s.length)]),
    [
      ['outer', 3600],
      ['inner', 1440],
    ],
  );
  const vinyl = p.cuts.find((c) => c.part === 'vinyl')!;
  assert.equal(vinyl.toolpath, vinyl.outline);
  assert.equal(fabricationPlan(design, fab), p, 'cached per design + fabrication settings');
});

test('CSV lists every segment with distances from the seam', () => {
  const csv = bendScheduleCSV(fabricationPlan(design, fab)).split('\n');
  assert.match(csv[0], /^element,group,contour/);
  assert.ok(csv.some((l) => l.startsWith('O,Wordmark,outer,1,3610.0,60.0,corner,450.0')));
  assert.ok(csv.some((l) => /,inner,2,.*,corner,.*,concave$/.test(l)));
});

test('DXF has outline, cut, strip and bend layers in millimetres', () => {
  const dxf = planToDXF(fabricationPlan(design, fab), design.settings);
  for (const layer of [
    'BACK-OUTLINE',
    'BACK-CUT',
    'FACE-CUT',
    'VINYL-CUT',
    'STRIP',
    'BEND-CONVEX',
    'BEND-CONCAVE',
  ])
    assert.ok(dxf.includes(layer), layer);
  assert.match(dxf, /\$INSUNITS\s+70\s+4/); // 4 = millimetres
});
