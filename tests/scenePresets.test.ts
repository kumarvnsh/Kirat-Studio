import test from 'node:test';
import * as T from 'three';
import { SignScene } from '../src/scene/scene.ts';
import { buildScenery, disposeScenery, contextFrame } from '../src/scene/scenery.ts';
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

test('scene scenery is cached independently of preview state and replaced for preset or dimensions', () => {
  const viewer = Object.create(SignScene.prototype) as SignScene;
  Object.assign(viewer, {
    scene: new T.Scene(), scenery: null, sceneryKey: '', dirty: false,
    onSceneError: () => {}, state: null,
  });
  const input = sceneInput({ settings: defaultSettings(), artwork: null }, { ...defaultView(), scenePreset: 'shopfront' });
  try {
    viewer.setScene(input);
    const first = viewer.scenery!;
    assert.equal(viewer.wall, first.wall);
    assert.equal(viewer.dirty, true);
    viewer.setScene({ ...input, exposure: 1, selected: 'example' });
    assert.equal(viewer.scenery, first);
    viewer.setScene({ ...input, scenePreset: 'interior' });
    const interior = viewer.scenery!;
    assert.notEqual(interior, first);
    assert.equal(first.group.parent, null);
    assert.equal(viewer.scene.children.filter(child => child.name === 'installation-scenery').length, 1);
    viewer.setScene({ ...input, scenePreset: 'interior', mode: 'bend' });
    assert.equal(viewer.scenery, interior);
    assert.equal(interior.group.visible, false);
    viewer.setScene({ ...input, scenePreset: 'interior', mode: '3d' });
    assert.equal(viewer.scenery, interior);
    assert.equal(interior.group.visible, true);
    viewer.setScene({ ...input, scenePreset: 'interior', settings: { ...input.settings, width: input.settings.width + 100 } });
    assert.notEqual(viewer.scenery, interior);
    assert.equal(interior.group.parent, null);
    assert.equal(viewer.scene.children.length, 1);
  } finally {
    if (viewer.scenery) disposeScenery(viewer.scenery);
  }
});

for (const aspect of [0.6, 1, 2.4]) {
  for (const direction of [new T.Vector3(.17, .115, 1), new T.Vector3(1, .08, .38)]) {
    test(`context framing contains every corner at aspect ${aspect} and direction ${direction.toArray()}`, () => {
      const bounds = new T.Box3(new T.Vector3(-4, -4, -.2), new T.Vector3(4, 1, 1.2));
      const original = bounds.clone();
      const frame = contextFrame(bounds, aspect, 35, direction);
      const camera = new T.PerspectiveCamera(35, aspect, frame.near, frame.far);
      camera.position.copy(frame.position);
      camera.lookAt(frame.center);
      camera.updateMatrixWorld(true);
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        const projected = new T.Vector3(x, y, z).project(camera);
        assert.ok(Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1 && projected.z >= -1 && projected.z <= 1);
      }
      assert.ok(bounds.equals(original));
    });
  }
}

for (const persistentFailure of [false, true]) {
test(`still capture restores camera and renderer when render failure persists: ${persistentFailure}`, () => {
  const viewer = Object.create(SignScene.prototype) as SignScene;
  const camera = new T.PerspectiveCamera(35, 1.7, .2, 99);
  camera.position.set(3, 2, 8);
  const target = new T.Vector3(0, -1, .3), position = camera.position.clone();
  const state = sceneInput({ settings: defaultSettings(), artwork: null }, { ...defaultView(), scenePreset: 'interior' });
  const composerSize = new T.Vector2(700, 400);
  let size = new T.Vector2(700, 400), ratio = 2, renders = 0, environment = state;
  Object.assign(viewer, {
    camera, state, scenery: buildScenery('interior', 3.6, 1.2, -.13),
    controls: { target: target.clone(), maxDistance: 47, update() {} },
    renderer: { getSize: (out: T.Vector2) => out.copy(size), getPixelRatio: () => ratio,
      setPixelRatio: (value: number) => { ratio = value; }, setSize: (w: number, h: number) => { size.set(w, h); } },
    composer: { setSize(w: number, h: number) { composerSize.set(w, h); } }, highlight() {}, draw() {},
    setEnvironment: (value: typeof state) => { environment = value; },
    renderNow() { if (++renders === 1 || persistentFailure) throw new Error(renders === 1 ? 'capture failed' : 'preview failed'); },
  });
  try {
    assert.throws(() => viewer.renderStill(1400, 700, 'night'), /capture failed/);
    assert.ok(camera.position.equals(position));
    assert.ok(viewer.controls.target.equals(target));
    assert.equal(camera.aspect, 1.7);
    assert.equal(camera.near, .2);
    assert.equal(camera.far, 99);
    assert.equal(viewer.controls.maxDistance, 47);
    assert.deepEqual(size.toArray(), [700, 400]);
    assert.deepEqual(composerSize.toArray(), [700, 400]);
    assert.equal(ratio, 2);
    assert.equal(environment, state);
    assert.equal(viewer.state, state);
    assert.equal(renders, 2);
  } finally { disposeScenery(viewer.scenery!); }
});
}
