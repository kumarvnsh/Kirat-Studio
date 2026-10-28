import { sceneInput } from '../domain/layout.ts';
import { defaultView, type DesignState } from '../domain/project.ts';
import type { Shot } from './model.ts';
import { applyOption, type ProposalOption } from './options.ts';
export function createPresentationSnapshot(
  design: DesignState,
  shot: Shot,
  option?: ProposalOption,
) {
  const copy = applyOption(design, option),
    s = structuredClone(shot);
  if (s.camera.preset === 'exploded') s.scene.kind = 'studio';
  // A site mockup builds the sign at that place's board size, on its own (the photo is the scene).
  if (s.site) {
    [copy.settings.width, copy.settings.height] = s.site.board;
    s.scene.kind = 'studio';
  }
  const input = sceneInput(copy, {
    ...defaultView(),
    mode: '3d',
    step: 99,
    explode: s.camera.preset === 'exploded' ? 85 : 0,
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
