import { defaultSettings, type ConstructionType, type DesignState } from '../../src/domain/project.ts';
export const presentationTypes = ['front', 'halo', 'fronthalo', 'fullacrylic', 'metal'] as const;
export function presentationFixture(type: ConstructionType): DesignState {
  return { settings: { ...defaultSettings(), keepart: false, boardcolor: '#243b46' }, artwork: {
    bounds: [0, 0, 300, 100], imageWidth: 300, imageHeight: 100, imageData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', approved: true, origin: 'vector',
    groups: [{ id: 'g', name: 'Channel letter', type, faceColor: '#c74c36', returnColor: '#283d46' }],
    elements: [{ id: 'letter', name: 'O', type, group: 'g', override: false, pixels: 6400,
      color: '#c74c36', bounds: [0, 0, 100, 100], regions: [{
        outer: [[0,0],[100,0],[100,100],[0,100]],
        holes: [[[25,25],[25,75],[75,75],[75,25]]],
      }] }],
  } };
}
