import type { ConstructionType } from '../domain/project.ts';
export const constructionReferences: Partial<Record<ConstructionType, { src: string; alt: string }>> = {
  front: { src: '/images/construction-references/front-lit.png', alt: 'Front-lit channel letter with an illuminated acrylic face and opaque metal sides.' },
  halo: { src: '/images/construction-references/halo-lit.png', alt: 'Halo-lit metal letter with an opaque face and rear light washing onto the mounting board.' },
  fronthalo: { src: '/images/construction-references/front-and-halo.png', alt: 'Front and halo channel letter with a glowing acrylic face and rear halo on standoffs.' },
  fullacrylic: { src: '/images/construction-references/full-acrylic.png', alt: 'Full acrylic letter with illuminated front face and translucent glowing side walls.' },
};
