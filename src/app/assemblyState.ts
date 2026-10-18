import { visibleLayers, type AssemblyStep } from '../domain/assembly.ts';
import { LAYERS } from '../domain/project.ts';

export function assemblyFrame(steps: AssemblyStep[], requested: number) {
  const step = Math.max(1, Math.min(steps.length, requested));
  const visible = visibleLayers(steps, step);
  return { step, layers: LAYERS.map(layer => visible.has(layer.id)) };
}
