import * as T from 'three';
import { shapeFromRegion } from './scene.ts';
import { haloLit } from '../domain/recipes.ts';
import { kelvinToHex } from '../domain/lighting.ts';
import type { SceneInput } from '../domain/layout.ts';
import type { Scenery } from './scenery.ts';
export function prepareFinalCoatings(root: T.Object3D) {
  root.traverse((o) => {
    if (!(o instanceof T.Mesh)) return;
    for (const m of [o.material].flat()) {
      // The legacy WebGL tracer's clear-coat BRDF can produce NaNs on this GPU.
      // Keep the base PBR finish; do not change design colours or editor materials.
      if (m instanceof T.MeshPhysicalMaterial) m.clearcoat = 0;
    }
  });
}
export function resetRenderScene(owner: {
  scene: T.Scene;
  group: T.Group;
  texture: T.Texture | null;
  scenery: Scenery | null;
  sceneryKey: string;
}) {
  disposeOwnedScene(owner.group);
  owner.texture = null;
  owner.scene.add(owner.group);
  if (owner.scenery) disposeOwnedScene(owner.scenery.group);
  owner.scenery = null;
  owner.sceneryKey = '';
  owner.scene.children
    .filter((o) => o instanceof T.RectAreaLight)
    .forEach((o) => {
      o.removeFromParent();
      (o as T.Light).dispose();
    });
}
export function disposeOwnedScene(root: T.Object3D) {
  const resources = new Set<{ dispose: () => void }>();
  root.traverse((o) => {
    if (o instanceof T.Mesh) {
      resources.add(o.geometry);
      for (const mat of [o.material].flat()) {
        resources.add(mat);
        for (const value of Object.values(mat))
          if (value instanceof T.Texture) resources.add(value);
      }
    }
    if (o instanceof T.Light) resources.add(o);
  });
  resources.forEach((r) => r.dispose());
  root.removeFromParent();
  root.clear();
}
export function addHaloEmitters(root: T.Group, input: SceneInput) {
  if (!input.lights) return;
  for (const e of input.layout.elements) {
    if (!haloLit(e.type)) continue;
    const light = e.light ?? {
      on: true,
      color: kelvinToHex(input.settings.ledTemp),
      dimming: 1,
    };
    if (!light.on) continue;
    for (const r of e.regions) {
      const shape = shapeFromRegion({
        outer: r.outer.map(([x, y]) => [x * 0.001, y * 0.001]),
        holes: r.holes.map((h) => h.map(([x, y]) => [x * 0.001, y * 0.001])),
      });
      const m = new T.Mesh(
        new T.ShapeGeometry(shape),
        new T.MeshStandardMaterial({
          color: light.color,
          emissive: light.color,
          emissiveIntensity: 8 * input.dimming * light.dimming,
          side: T.BackSide,
        }),
      );
      m.position.z = (e.base + (e.params.standoff ?? 0)) * 0.001 - 0.001;
      m.name = 'rear-light-emitter';
      root.add(m);
    }
  }
}
