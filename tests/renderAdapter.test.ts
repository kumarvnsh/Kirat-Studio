import test from 'node:test';
import assert from 'node:assert/strict';
import { accumulateSamples, renderDimensions } from '../src/presentation/renderAdapter.ts';
test('output dimensions preserve aspect and reject excessive allocation', () => {
  assert.deepEqual(renderDimensions(3840, 2), { width: 3840, height: 1920 });
  assert.throws(() => renderDimensions(3840, 0.25), /too large/i);
});
test('accumulation waits for complete samples and stops on context loss', async () => {
  let samples = 0;
  await accumulateSamples(
    {
      get samples() {
        return samples;
      },
      renderSample() {
        samples += 0.5;
      },
      isContextLost: () => false,
    },
    2,
    new AbortController().signal,
    () => {},
  );
  assert.equal(samples, 2);
  await assert.rejects(
    accumulateSamples(
      { samples: 0, renderSample() {}, isContextLost: () => true },
      2,
      new AbortController().signal,
      () => {},
    ),
    /graphics context/i,
  );
});
test('cancel prevents another tile and rejects with AbortError', async () => {
  const c = new AbortController();
  let calls = 0;
  await assert.rejects(
    accumulateSamples(
      {
        samples: 0,
        renderSample() {
          calls++;
          c.abort();
        },
        isContextLost: () => false,
      },
      2,
      c.signal,
      () => {},
    ),
    { name: 'AbortError' },
  );
  assert.equal(calls, 1);
});
