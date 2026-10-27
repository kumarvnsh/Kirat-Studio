import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {
  disposeOwnedScene,
  addHaloEmitters,
  resetRenderScene,
} from '../src/scene/signMaterials.ts';
import { createPresentationSnapshot } from '../src/presentation/snapshot.ts';
import { defaultPresentation } from '../src/presentation/model.ts';
import { presentationFixture } from './fixtures/presentation.ts';
import { buildScenery, disposeScenery } from '../src/scene/scenery.ts';
test('scenery disposal releases a shared diffuse and bump texture once', () => {
  const scene = buildScenery('shopfront', 3.6, 1.2, -0.13),
    texture = new T.Texture();
  let disposed = 0;
  texture.addEventListener('dispose', () => disposed++);
  scene.wall.material.map = texture;
  scene.wall.material.bumpMap = texture;
  disposeScenery(scene);
  assert.equal(disposed, 1);
});
test('physical halo emitters follow contours at actual rear depth', () => {
  const s = createPresentationSnapshot(presentationFixture('halo'), defaultPresentation().shots[0]),
    g = new T.Group();
  addHaloEmitters(g, s.input);
  const m = g.children[0] as T.Mesh;
  assert.equal(g.children.length, 1);
  assert.ok(m.position.z > s.input.layout.letterBase * 0.001);
  assert.equal((m.material as T.MeshStandardMaterial).side, T.BackSide);
});
test('owned shared resources are disposed once', () => {
  const group = new T.Group(),
    geometry = new T.BoxGeometry(),
    material = new T.MeshStandardMaterial();
  let count = 0;
  geometry.addEventListener('dispose', () => count++);
  material.addEventListener('dispose', () => count++);
  group.add(new T.Mesh(geometry, material), new T.Mesh(geometry, material));
  disposeOwnedScene(group);
  assert.equal(count, 2);
  assert.equal(group.children.length, 0);
});
test('reset between queued shots reattaches the sign root and releases previous resources', () => {
  const scene = new T.Scene(),
    group = new T.Group();
  scene.add(group);
  group.add(new T.Mesh(new T.BoxGeometry(), new T.MeshStandardMaterial()));
  const owner = {
    scene,
    group,
    texture: null,
    scenery: null,
    sceneryKey: 'old',
  };
  resetRenderScene(owner);
  assert.equal(group.parent, scene);
  assert.equal(group.children.length, 0);
  assert.equal(owner.sceneryKey, '');
});
