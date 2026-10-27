import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutBooklet, fitRect } from '../src/presentation/pageLayout.ts';
import { defaultPresentation } from '../src/presentation/model.ts';
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
