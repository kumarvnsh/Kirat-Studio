import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { prepareFinalCoatings } from '../src/scene/signMaterials.ts';
test('final finish uses stable base PBR without the unstable clear-coat lobe', () => {
  const root = new T.Group();
  const material = new T.MeshPhysicalMaterial({
    color: '#e8ece9',
    roughness: 0.42,
    metalness: 0.05,
    clearcoat: 0.55,
    clearcoatRoughness: 0.28,
  });
  material.emissive.set('#112233');
  const before = {
    color: material.color.getHexString(),
    roughness: material.roughness,
    metalness: material.metalness,
    emissive: material.emissive.getHexString(),
  };
  const plain = new T.MeshStandardMaterial({ color: '#123456' });
  root.add(new T.Mesh(new T.BoxGeometry(), [material, plain]));
  prepareFinalCoatings(root);
  assert.equal(material.clearcoat, 0);
  assert.deepEqual(
    {
      color: material.color.getHexString(),
      roughness: material.roughness,
      metalness: material.metalness,
      emissive: material.emissive.getHexString(),
    },
    before,
  );
  assert.equal(plain.color.getHexString(), '123456');
});
