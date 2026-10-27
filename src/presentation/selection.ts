import type { PresentationConfig } from './model.ts';

export function selectedShots(config: PresentationConfig, ids: string[]) {
  const selected = new Set(ids);
  return config.shots.filter((s) => selected.has(s.id));
}

export function setPageInclusion(
  config: PresentationConfig,
  ids: string[],
  included: boolean,
  replace = false,
): PresentationConfig {
  const selected = new Set(ids);
  return {
    ...config,
    pages: config.pages.map((p) => ({
      ...p,
      included: selected.has(p.id) ? included : replace ? false : p.included,
    })),
  };
}
