import test from 'node:test';
import assert from 'node:assert/strict';
import { RenderAssets, type AssetBackend } from '../src/storage/renderAssets.ts';
test('corrupt cached images are treated as missing instead of final-ready', async () => {
  const backend: AssetBackend = {
    read: async () => new Blob(['broken'], { type: 'image/png' }),
    write: async () => {},
    prune: async () => {},
  };
  const cache = new RenderAssets(backend);
  assert.equal(await cache.get('bad'), undefined);
  assert.match(cache.warning, /cache/i);
});
test('blocked cache retains current image and reports persistence warning', async () => {
  const backend: AssetBackend = {
    read: async () => {
      throw Error('blocked');
    },
    write: async () => {
      throw Error('quota');
    },
    prune: async () => {},
  };
  const cache = new RenderAssets(backend),
    blob = new Blob(['image']);
  await cache.put('key', blob);
  assert.equal(await cache.get('key'), blob);
  assert.match(cache.warning, /cache/i);
});
test('quota is pruned and retried once', async () => {
  let writes = 0,
    prunes = 0;
  const backend: AssetBackend = {
    read: async () => undefined,
    write: async () => {
      if (++writes === 1) throw Error('quota');
    },
    prune: async () => {
      prunes++;
    },
  };
  const cache = new RenderAssets(backend);
  await cache.put('key', new Blob(['image']));
  assert.equal(writes, 2);
  assert.equal(prunes, 2);
  assert.equal(cache.warning, '');
});
