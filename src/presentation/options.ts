import type { ConstructionType, DesignState } from '../domain/project.ts';
import { setGroup, setElements } from '../editor/artworkOps.ts';
import type { PresentationConfig } from './model.ts';
export type ConstructionOverride = {
  type?: ConstructionType;
  faceColor?: string | null;
  returnColor?: string | null;
};
export type ProposalOption = {
  id: string;
  name: string;
  description: string;
  boardColor?: string;
  groupOverrides: Record<string, ConstructionOverride>;
  elementOverrides: Record<string, ConstructionOverride>;
};
export function originalOption(): ProposalOption {
  return {
    id: 'current',
    name: 'Option A · Original design',
    description: '',
    groupOverrides: {},
    elementOverrides: {},
  };
}
export function applyOption(design: DesignState, option?: ProposalOption): DesignState {
  let result = structuredClone(design);
  if (!option) return result;
  if (option.boardColor) result.settings.boardcolor = option.boardColor;
  let artwork = result.artwork;
  if (!artwork) return result;
  for (const [id, patch] of Object.entries(option.groupOverrides)) {
    const group = artwork.groups.find((g) => g.id === id);
    if (!group) continue;
    const changing = patch.type !== undefined && patch.type !== group.type;
    artwork = setGroup(artwork, id, { ...patch, ...(changing ? { charDepth: null } : {}) });
    if (changing)
      artwork = {
        ...artwork,
        elements: artwork.elements.map((e) =>
          e.group === id && !e.override ? { ...e, charDepth: undefined } : e,
        ),
      };
  }
  for (const [id, patch] of Object.entries(option.elementOverrides)) {
    const e = artwork.elements.find((e) => e.id === id);
    if (!e) continue;
    artwork = setElements(artwork, [id], {
      ...patch,
      ...(patch.type && patch.type !== e.type ? { charDepth: null } : {}),
    });
  }
  return { ...result, artwork };
}
export function duplicateOption(
  config: PresentationConfig,
  sourceId: string,
  id: string,
): PresentationConfig {
  const source = config.options.find((o) => o.id === sourceId);
  if (!source || config.options.length >= 12) return config;
  const shots = config.shots.filter((s) => s.optionId === sourceId),
    shotIds = new Map(shots.map((s, i) => [s.id, `${id}-shot-${i}`])),
    pairIds = [...new Set(shots.flatMap((s) => (s.pairId ? [s.pairId] : [])))];
  const pages = config.pages.filter((p) => p.shotId && shotIds.has(p.shotId));
  if (config.shots.length + shots.length > 100 || config.pages.length + pages.length > 100)
    throw Error(
      'This proposal has reached its page or render limit. Remove unused views before duplicating.',
    );
  return {
    ...config,
    options: [
      ...config.options,
      {
        ...structuredClone(source),
        id,
        name: `Option ${String.fromCharCode(65 + config.options.length)} · Alternative`,
      },
    ],
    shots: [
      ...config.shots,
      ...shots.map((s) => ({
        ...structuredClone(s),
        id: shotIds.get(s.id)!,
        optionId: id,
        ...(s.pairId ? { pairId: `${id}-pair-${pairIds.indexOf(s.pairId)}` } : {}),
      })),
    ],
    pages: [
      ...config.pages,
      ...pages.map((p, i) => ({ ...p, id: `${id}-page-${i}`, shotId: shotIds.get(p.shotId!) })),
    ],
  };
}
export function removeOption(config: PresentationConfig, id: string): PresentationConfig {
  if (config.options.length <= 1) return config;
  const shots = config.shots.filter((s) => s.optionId !== id),
    ids = new Set(shots.map((s) => s.id));
  return {
    ...config,
    options: config.options.filter((o) => o.id !== id),
    shots,
    pages: config.pages
      .filter((p) => !p.shotId || ids.has(p.shotId))
      .map((p) => (p.optionIds ? { ...p, optionIds: p.optionIds.filter((o) => o !== id) } : p)),
  };
}
