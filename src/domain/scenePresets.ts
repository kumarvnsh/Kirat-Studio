export const scenePresets = {
  studio: 'Studio',
  shopfront: 'Shopfront',
  interior: 'Interior',
} as const;

export type ScenePreset = keyof typeof scenePresets;

export function normalizeScenePreset(value: unknown): ScenePreset {
  return value === 'shopfront' || value === 'interior' ? value : 'studio';
}

export function sceneryDimensions(widthMm: number, heightMm: number) {
  const width = widthMm / 1000,
    height = heightMm / 1000,
    clearance = Math.max(2.6, height * 0.75);
  return {
    width,
    height,
    clearance,
    facadeWidth: Math.max(4.2, width * 1.2),
    wallTop: height / 2 + Math.max(0.35, height * 0.12),
    floorY: -height / 2 - clearance,
    entranceHeight: Math.min(2.2, clearance - 0.3),
    counterHeight: Math.min(1.05, clearance - 0.5),
  };
}
