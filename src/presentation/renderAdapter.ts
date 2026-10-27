export type RenderProgress = { fraction?: number; label: string };
export function renderDimensions(width: number, aspect: number) {
  const height = Math.round(width / aspect);
  if (!Number.isFinite(height) || height < 1 || width * height > 20_000_000)
    throw Error(
      'The output is too large for final rendering. Choose a wider frame or a smaller resolution.',
    );
  return { width, height };
}
export type RenderOptions = {
  signal: AbortSignal;
  onProgress: (progress: RenderProgress) => void;
};
export async function accumulateSamples(
  backend: {
    readonly samples: number;
    renderSample: () => void;
    isContextLost: () => boolean;
  },
  target: number,
  signal: AbortSignal,
  progress: (p: RenderProgress) => void,
) {
  const start = performance.now();
  let last = -1;
  while (backend.samples < target) {
    signal.throwIfAborted();
    if (backend.isContextLost()) throw Error('The graphics context was lost. Retry the render.');
    if (performance.now() - start > 20 * 60 * 1000)
      throw Error('The render exceeded 20 minutes. Retry at 2400 px on a faster device.');
    backend.renderSample();
    const complete = Math.floor(backend.samples);
    if (complete !== last) {
      last = complete;
      progress({
        fraction: Math.min(1, backend.samples / target),
        label: `Rendering · ${complete} / ${target} samples`,
      });
    }
    await new Promise((r) => setTimeout(r, 0));
  }
  signal.throwIfAborted();
  if (backend.isContextLost()) throw Error('The graphics context was lost. Retry the render.');
}
