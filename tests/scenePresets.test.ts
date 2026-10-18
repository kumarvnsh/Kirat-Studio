import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, defaultView } from '../src/domain/project.ts';
import { sceneInput } from '../src/domain/layout.ts';
import { normalizeScenePreset, sceneryDimensions } from '../src/domain/scenePresets.ts';

test('scene presets default to Studio and normalize unknown values', () => {
  assert.equal(defaultView().scenePreset, 'studio');
  for (const value of [undefined, null, '', 'unknown', 'studio']) {
    assert.equal(normalizeScenePreset(value), 'studio');
  }
  assert.equal(normalizeScenePreset('interior'), 'interior');
  assert.equal(normalizeScenePreset('shopfront'), 'shopfront');
});

test('scene input normalizes missing presets independently of time of day', () => {
  const design = { settings: defaultSettings(), artwork: null };
  const { scenePreset, ...legacyView } = defaultView();
  assert.equal(sceneInput(design, legacyView).scenePreset, 'studio');
  const input = sceneInput(design, { ...defaultView(), scenePreset: 'shopfront', environment: 'night' });
  assert.equal(input.scenePreset, 'shopfront');
  assert.equal(input.environment, 'night');
});

for (const [width, height] of [[150, 150], [3600, 1200], [24000, 500], [600, 6000]]) {
  test(`scenery clears a ${width} by ${height} mm sign`, () => {
    const dimensions = sceneryDimensions(width, height);
    assert.ok(Object.values(dimensions).every(Number.isFinite));
    assert.equal(dimensions.width, width / 1000);
    assert.equal(dimensions.height, height / 1000);
    assert.ok(dimensions.facadeWidth > width / 1000);
    assert.ok(dimensions.wallTop > height / 2000);
    assert.ok(dimensions.floorY + dimensions.entranceHeight < -height / 2000);
    assert.ok(dimensions.floorY + dimensions.counterHeight < -height / 2000);
  });
}
