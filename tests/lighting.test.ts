import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BLOOM_THRESHOLD,
  cameraExposure,
  emission,
  environments,
  kelvinToHex,
} from '../src/domain/lighting.ts';

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

test('LED colour temperature: warm is red-heavy, 6500 K is near white', () => {
  const [r27, , b27] = rgb(kelvinToHex(2700));
  assert.equal(r27, 255);
  assert.ok(b27 < 180, 'warm white has much less blue');
  const [r65, g65, b65] = rgb(kelvinToHex(6500));
  assert.ok(Math.min(r65, g65, b65) > 235, 'daylight white is close to neutral');
});

test('emission depends only on power and dimming, and full power blooms', () => {
  assert.equal(emission(false, 1), 0);
  assert.ok(emission(true, 1) > BLOOM_THRESHOLD);
  assert.equal(emission(true, 0.5), emission(true, 1) / 2);
});

test('night exposes brighter than day; EV is a power of two', () => {
  assert.ok(environments.night.exposure > environments.day.exposure);
  assert.equal(cameraExposure('day', 1), 2 * cameraExposure('day', 0));
  assert.equal(environments.night.sun, 0);
});

test('after exposure, a lit face blooms at night but not in daylight', () => {
  const exposed = (env: 'day' | 'night') => emission(true, 1) * cameraExposure(env, 0);
  assert.ok(exposed('night') > BLOOM_THRESHOLD);
  assert.ok(exposed('day') < BLOOM_THRESHOLD);
});
