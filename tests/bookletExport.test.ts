import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bookletFont } from '../src/presentation/bookletFont.ts';
import { exportIssues, fileName } from '../src/presentation/exportPackage.ts';
import { layoutBooklet } from '../src/presentation/pageLayout.ts';
import { defaultPresentation } from '../src/presentation/model.ts';
import { presentationFixture } from './fixtures/presentation.ts';
test('real font shapes Hindi and Latin without missing glyphs', async () => {
  const f = bookletFont(new Uint8Array(await readFile('public/fonts/NotoSansDevanagari.ttf')));
  for (const s of ['Fenesta · Better by Design', 'किरात ग्राहक']) {
    assert.ok(f.measure(s, 4) > 0);
    assert.ok(f.shape(s).every((g) => g.path));
  }
});
test('final preflight rejects preview and stale images; drafts require available images', () => {
  const c = defaultPresentation();
  c.pages = c.pages.slice(0, 1);
  const p = layoutBooklet(c, presentationFixture('front'), (s, n) => s.length * n * 0.5, 'mm');
  assert.equal(exportIssues(p, {}, false).length, 1);
  const assets = {
      'installed-day': {
        key: 'old',
        url: 'blob:test',
        quality: 'preview' as const,
      },
    },
    keys = { 'installed-day': 'new' };
  assert.equal(exportIssues(p, assets, false, keys).length, 1);
  assert.equal(exportIssues(p, assets, true, keys).length, 0);
  assets['installed-day'].key = 'new';
  assert.equal(exportIssues(p, assets, false, keys).length, 1);
  const finalAsset = { ...assets['installed-day'], quality: 'final' as const };
  assert.equal(exportIssues(p, { 'installed-day': finalAsset }, false, {}).length, 1);
  assert.equal(fileName(1, '../Fenesta / night', 'png'), '01-Fenesta-night.png');
});
