// Assembly sequence: dependency-ordered steps, each revealing assembly layers and listing its parts.
// Explanatory sequence for planning, not an approved workshop procedure.
import { panelIntegrated } from './recipes.ts';
import { isRooftop, type DesignState, type LayerId } from './project.ts';

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
      description:
        'Fix the GI sheet to the rear of the frame. Leave a service panel at the PSU bay.',
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
      description:
        'Fix letters to the fascia with studs and spacers; pass cables through the penetrations.',
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
  if (isRooftop(design.settings)) {
    // No board: the steel structure replaces frame, GI, backing and fascia.
    const rooftop = steps.filter((st) => !['gi', 'backing', 'acp'].includes(st.id));
    for (const st of rooftop) {
      if (st.id === 'frame') {
        st.title = 'Fabricate rooftop structure';
        st.description =
          'Cut, weld and galvanise the support members; fix base plates to the roof to the engineer’s design and seal every roof penetration.';
      }
      if (st.id === 'mount') {
        st.dependsOn = ['frame', 'faces'];
        st.description = 'Bolt each letter back to its uprights with studs; seal the cable glands at the letter backs.';
      }
      if (st.id === 'power') {
        st.dependsOn = ['mount'];
        st.description =
          'Fit PSUs in a weatherproof enclosure on the roof, run cables down the structure and across the roof. Electrical work by a qualified person.';
      }
    }
    return rooftop;
  }
  const integrated = design.artwork?.elements.some((e) => panelIntegrated(e.type));
  if (integrated)
    for (const step of steps) {
      if (step.id === 'acp')
        step.description =
          'Route the selected illuminated openings through the ACP. Retain counter islands on acrylic; check frame and backing obstructions before fixing the fascia.';
      if (step.id === 'backs')
        step.description =
          'Cut rear acrylic retainers/backers for integrated inserts and backs for any conventional channel letters.';
      if (
        step.id === 'returns' &&
        !design.artwork?.elements.some(
          (e) =>
            e.type !== 'omit' &&
            !panelIntegrated(e.type) &&
            ['front', 'halo', 'fronthalo', 'fullacrylic'].includes(e.type),
        )
      ) {
        step.title = 'Prepare acrylic retention';
        step.description =
          'Check rear shoulders, adhesive/bonding areas and retained counter islands. These panel types have no channel return strips.';
      }
      if (step.id === 'leds')
        step.description =
          'Install rear-facing-to-fascia tray LEDs behind integrated openings, and LEDs inside any conventional letters. Check diffuser clearance and frame shadows.';
      if (step.id === 'faces')
        step.description =
          'Fit acrylic-backed, flush or projecting inserts into the routed panel; fit any conventional faces and flat letters.';
      if (step.id === 'mount')
        step.description =
          'Secure integrated acrylic retainers and counter islands; mount any conventional letters with their specified fixings.';
    }
  return steps;
}

// Layers visible after completing steps 1..step (step clamped; ALL_STEPS = everything).
export function visibleLayers(steps: AssemblyStep[], step: number): Set<LayerId> {
  return new Set(steps.slice(0, Math.max(1, Math.min(step, steps.length))).flatMap((s) => s.adds));
}
