import test from 'node:test';
import * as T from 'three';
import { buildScenery, disposeScenery } from '../src/scene/scenery.ts';
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


for (const preset of ['studio', 'shopfront', 'interior'] as const) {
  test(`${preset} scenery owns its wall, lighting and framing without selectable parts`, () => {
    const scenery = buildScenery(preset, 3.6, 1.2, -0.13);
    assert.equal(scenery.group.name, 'installation-scenery');
    assert.equal(scenery.group.children.filter(child => child.name === 'mounting-wall').length, 1);
    assert.equal(scenery.wall.position.z, -0.13);
    scenery.group.traverse(child => assert.equal(child.userData.part, undefined));
    assert.equal(scenery.roomLight.intensity, preset === 'interior' ? 2.2 : 0);
    assert.equal(scenery.frameBounds.isEmpty(), preset === 'studio');
    if (preset !== 'studio') {
      const dimensions = sceneryDimensions(3600, 1200);
      assert.equal(scenery.frameBounds.min.y, dimensions.floorY);
      assert.equal(scenery.frameBounds.max.y, dimensions.wallTop);
      assert.equal(scenery.frameBounds.max.z, 1.2);
      assert.ok(scenery.group.getObjectByName('floor'));
    }
    disposeScenery(scenery);
    assert.equal(scenery.group.children.length, 0);
  });
}

test('disposing interior scenery releases every owned resource exactly once and detaches it', () => {
  const scenery = buildScenery('interior', 3.6, 1.2, -0.13);
  const parent = new T.Group();
  parent.add(scenery.group);
  const disposalCounts: number[] = [];
  const resources = new Set<T.BufferGeometry | T.Material>();
  scenery.group.traverse(child => {
    if (!(child instanceof T.Mesh)) return;
    for (const resource of [child.geometry, ...[child.material].flat()]) {
      assert.equal(resources.has(resource), false, 'meshes must own their resources');
      resources.add(resource);
      const index = disposalCounts.push(0) - 1;
      resource.addEventListener('dispose', () => disposalCounts[index]++);
    }
  });
  assert.ok(resources.size > 4);
  disposeScenery(scenery);
  assert.equal(scenery.group.parent, null);
  assert.equal(scenery.group.children.length, 0);
  assert.ok(disposalCounts.every(count => count === 1));
});


test('disposing scenery releases light shadow render targets', () => {
  const scenery = buildScenery('interior', 3.6, 1.2, -0.13);
  const target = new T.WebGLRenderTarget(1, 1);
  let disposed = 0;
  target.addEventListener('dispose', () => disposed++);
  scenery.roomLight.shadow.map = target;
  disposeScenery(scenery);
  assert.equal(disposed, 1);
});
