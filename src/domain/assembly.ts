// Assembly sequence: dependency-ordered steps, each revealing assembly layers and listing its parts.
// Explanatory sequence for planning, not an approved workshop procedure.
import type { DesignState, LayerId } from './project.ts';

export type AssemblyStep = {
  id: string;
  title: string;
  description: string;
  dependsOn: string[];
  adds: LayerId[]; // layers that appear at this step
};

export const ALL_STEPS = 99; // view.step value meaning "complete assembly"

export function assemblySteps(design: DesignState): AssemblyStep[] {
  const backing = design.settings.backing > 0;
  const steps: AssemblyStep[] = [
    {
      id: 'frame',
      title: 'Prepare frame',
      description:
        'Cut and weld the MS perimeter and verticals; drill cable holes in the intermediate verticals.',
      dependsOn: [],
      adds: ['frame'],
    },
    {
      id: 'gi',
      title: 'Attach rear GI cover',
      description: 'Fix the GI sheet to the rear of the frame. Leave a service panel at the PSU bay.',
      dependsOn: ['frame'],
      adds: ['gi'],
    },
    ...(backing
      ? [
          {
            id: 'backing',
            title: 'Fit front backing sheet',
            description: 'Fix the backing sheet to the front of the frame.',
            dependsOn: ['frame'],
            adds: ['backing' as LayerId],
          },
        ]
      : []),
    {
      id: 'acp',
      title: 'Fit ACP fascia',
      description: 'Fix the ACP panel; drill stud and cable holes from the letter template.',
      dependsOn: [backing ? 'backing' : 'frame'],
      adds: ['acp'],
    },
    {
      id: 'backs',
      title: 'Cut letter backs',
      description:
        'Rout the letter backs from the compensated outlines (Make tab). Runs in parallel with the board.',
      dependsOn: [],
      adds: ['backs'],
    },
    {
      id: 'returns',
      title: 'Form and fix returns',
      description:
        'Bend the return strips from the schedules, starting at the seam, and fix them to the backs.',
      dependsOn: ['backs'],
      adds: ['returns'],
    },
    {
      id: 'leds',
      title: 'Install LED modules',
      description: 'Fix modules to the letter backs and wire each letter to its exit point.',
      dependsOn: ['returns'],
      adds: ['leds'],
    },
    {
      id: 'faces',
      title: 'Fit faces and flat letters',
      description: 'Fit acrylic faces and trim caps; cut flat letters and vinyl.',
      dependsOn: ['leds'],
      adds: ['faces'],
    },
    {
      id: 'mount',
      title: 'Mount letters',
      description: 'Fix letters to the fascia with studs and spacers; pass cables through the penetrations.',
      dependsOn: ['acp', 'faces'],
      adds: ['mounting'],
    },
    {
      id: 'power',
      title: 'Connect power',
      description:
        'Fit PSUs in the frame bay and connect the cable runs. Electrical work by a qualified person.',
      dependsOn: ['mount', 'gi'],
      adds: ['power'],
    },
    {
      id: 'test',
      title: 'Test and finish',
      description:
        'Power up, check every letter and the face uniformity, clean faces, remove protective film.',
      dependsOn: ['power'],
      adds: [],
    },
  ];
  return steps;
}

// Layers visible after completing steps 1..step (step clamped; ALL_STEPS = everything).
export function visibleLayers(steps: AssemblyStep[], step: number): Set<LayerId> {
  return new Set(steps.slice(0, Math.max(1, Math.min(step, steps.length))).flatMap((s) => s.adds));
}
