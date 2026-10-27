import { sceneInput } from '../domain/layout.ts';
import { defaultView, type DesignState } from '../domain/project.ts';
import type { Shot } from './model.ts';
export function createPresentationSnapshot(design: DesignState, shot: Shot) {
  const copy = structuredClone(design),
    s = structuredClone(shot);
  const input = sceneInput(copy, {
    ...defaultView(),
    mode: '3d',
    step: 99,
    explode: 0,
    hidden: [],
    isolate: false,
    selection: [],
    selected: null,
    selectedGroup: null,
    environment: s.environment,
    lights: s.power,
    dimming: s.dimming,
    exposure: s.exposureEV,
    scenePreset:
      s.scene.kind === 'studio' ? 'studio' : s.scene.kind === 'interior' ? 'interior' : 'shopfront',
  });
  return { design: copy, shot: s, input };
}
export type PresentationSnapshot = ReturnType<typeof createPresentationSnapshot>;
