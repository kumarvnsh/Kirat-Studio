import test from 'node:test';
import assert from 'node:assert/strict';
import { selectedShots, setPageInclusion } from '../src/presentation/selection.ts';
import { defaultPresentation } from '../src/presentation/model.ts';
import { duplicateOption } from '../src/presentation/options.ts';
import { layoutBooklet } from '../src/presentation/pageLayout.ts';
import { presentationFixture } from './fixtures/presentation.ts';
test('batch follows proposal order across options and ignores duplicate or deleted IDs', () => {
  const c = duplicateOption(defaultPresentation(), 'current', 'b');
  assert.deepEqual(
    selectedShots(c, ['b-shot-2', 'front', 'front', 'deleted']).map((s) => s.id),
    ['front', 'b-shot-2'],
  );
  assert.deepEqual(selectedShots(c, []), []);
});
test('export inclusion updates the saved booklet without mutating input or render membership', () => {
  const c = defaultPresentation(),
    before = structuredClone(c);
  const next = setPageInclusion(c, ['page-front'], true, true);
  assert.deepEqual(c, before);
  assert.deepEqual(next.shots, c.shots);
  const pages = layoutBooklet(
    next,
    presentationFixture('front'),
    (s, n) => s.length * n * 0.5,
    'mm',
  );
  assert.deepEqual(
    pages.filter((p) => p.shotId).map((p) => p.shotId),
    ['front'],
  );
  assert.equal(
    layoutBooklet(
      setPageInclusion(next, [], false, true),
      presentationFixture('front'),
      (s, n) => s.length * n * 0.5,
      'mm',
    ).length,
    0,
  );
});
