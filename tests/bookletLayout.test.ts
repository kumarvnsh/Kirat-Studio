import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutBooklet, fitRect } from '../src/presentation/pageLayout.ts';
import { defaultPresentation } from '../src/presentation/model.ts';
import { duplicateOption } from '../src/presentation/options.ts';
test('comparison pages show one representative image and effective materials per option', () => {
  const c = duplicateOption(defaultPresentation(), 'current', 'b');
  c.options[1].groupOverrides.g = { type: 'halo', faceColor: '#aa5500' };
  c.pages = [
    {
      id: 'compare',
      kind: 'comparison',
      caption: 'Your options',
      included: true,
      dimensions: false,
      materials: false,
    },
  ];
  const p = layoutBooklet(c, presentationFixture('front'), measure, 'mm');
  assert.equal(p[0].items.filter((i) => i.kind === 'image').length, 2);
  assert.ok(p.flatMap((p) => p.items).some((i) => i.kind === 'text' && i.text.includes('Halo')));
  assert.ok(p[0].items.some((i) => i.kind === 'logo' && i.data === '/brand/kirat-creations.png'));
  c.pages[0].optionIds = ['b'];
  const selected = layoutBooklet(c, presentationFixture('front'), measure, 'mm');
  assert.deepEqual(
    selected[0].items.filter((i) => i.kind === 'image').map((i) => i.shotId),
    ['b-shot-2'],
  );
});
import { presentationFixture } from './fixtures/presentation.ts';
const measure = (s: string, size: number) => [...s].length * size * 0.55;
test('booklet follows inclusion/order and never clips text', () => {
  const c = defaultPresentation();
  c.pages.reverse();
  c.pages[1].included = false;
  c.metadata.project = 'किरात ग्राहक '.repeat(12);
  const pages = layoutBooklet(c, presentationFixture('halo'), measure, 'mm');
  assert.equal(pages.filter((p) => p.shotId).length, 6);
  assert.equal(pages[0].shotId, c.pages[0].shotId);
  for (const p of pages)
    for (const item of p.items) {
      assert.ok(item.x >= 0 && item.y >= 0);
      assert.ok(item.y < 210);
      if (item.kind === 'text') assert.ok(measure(item.text, item.size) <= 273.1);
    }
});
test('summary paginates notes instead of truncating and contains actual construction', () => {
  const c = defaultPresentation();
  c.pages = [
    {
      id: 'summary',
      kind: 'summary',
      included: true,
      caption: 'Materials',
      dimensions: false,
      materials: true,
    },
  ];
  c.metadata.notes = 'Long material note\n'.repeat(100);
  const pages = layoutBooklet(c, presentationFixture('halo'), measure, 'mm');
  assert.ok(pages.length > 1);
  assert.ok(
    pages.flatMap((p) => p.items).some((i) => i.kind === 'text' && i.text.includes('Halo')),
  );
});
test('fit preserves aspect; empty booklet returns no pages', () => {
  assert.deepEqual(fitRect(2, { x: 0, y: 0, w: 100, h: 100 }), {
    x: 0,
    y: 25,
    w: 100,
    h: 50,
  });
  const c = defaultPresentation();
  c.pages = [];
  assert.deepEqual(layoutBooklet(c, presentationFixture('front'), measure, 'mm'), []);
});
