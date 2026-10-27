import { computeLayout } from '../domain/layout.ts';
import { constructionNames, type DesignState } from '../domain/project.ts';
import { formatInUnit, type LengthUnit } from '../domain/units.ts';
import type { PresentationConfig } from './model.ts';
export type Rect = { x: number; y: number; w: number; h: number };
export type PageItem = (
  | { kind: 'text'; text: string; size: number; color: string; opacity?: number }
  | { kind: 'image'; shotId: string }
  | { kind: 'logo'; data: string }
  | { kind: 'line'; x2: number; y2: number }
) & { x: number; y: number; w?: number; h?: number };
export type LayoutPage = {
  id: string;
  title: string;
  shotId?: string;
  items: PageItem[];
};
export type Measure = (text: string, size: number) => number;
export function pageItems(page: LayoutPage, draft: boolean): PageItem[] {
  return draft
    ? [
        ...page.items,
        { kind: 'text', text: 'DRAFT', x: 120, y: 100, size: 20, color: '#bc8064', opacity: 0.16 },
      ]
    : page.items;
}
export function fitRect(aspect: number, r: Rect): Rect {
  const w = Math.min(r.w, r.h * aspect),
    h = w / aspect;
  return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h };
}
export function wrapText(value: string, size: number, width: number, measure: Measure): string[] {
  const lines: string[] = [];
  for (const paragraph of value.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      if (!word) continue;
      if (measure((line ? line + ' ' : '') + word, size) <= width) {
        line += (line ? ' ' : '') + word;
        continue;
      }
      if (line) {
        lines.push(line);
        line = '';
      }
      if (measure(word, size) <= width) {
        line = word;
        continue;
      }
      for (const char of Array.from(word)) {
        if (measure(line + char, size) > width && line) {
          lines.push(line);
          line = '';
        }
        line += char;
      }
    }
    lines.push(line);
  }
  return lines;
}
export function materialSummary(design: DesignState): string[] {
  const l = computeLayout(design),
    groups = new Map<string, number>();
  for (const e of l.elements) {
    if (e.type === 'omit') continue;
    const face =
      e.faceColor ??
      (design.settings.keepart
        ? design.artwork?.elements.find((a) => a.id === e.id)?.color
        : design.settings.facecolor);
    const name = `${constructionNames[e.type]} · face ${face ?? 'artwork'}${e.returnColor ? ` · painted return ${e.returnColor}` : ''}`;
    groups.set(name, (groups.get(name) ?? 0) + 1);
  }
  return [
    `ACP fascia · ${design.settings.acp} mm · ${design.settings.boardcolor}`,
    ...[...groups].map(([k, n]) => `${n} × ${k}`),
  ];
}
export function layoutBooklet(
  config: PresentationConfig,
  design: DesignState,
  measure: Measure,
  unit: LengthUnit,
): LayoutPage[] {
  const pages: LayoutPage[] = [],
    materials = materialSummary(design),
    layout = computeLayout(design);
  const text = (
    items: PageItem[],
    value: string,
    x: number,
    y: number,
    size: number,
    width = 273,
    color = '#233c46',
  ) => {
    const lines = wrapText(value, size, width, measure);
    for (const line of lines) {
      items.push({ kind: 'text', text: line, x, y, size, color });
      y += size * 1.55;
    }
    return y;
  };
  const header = (id: string, title: string): { page: LayoutPage; y: number } => {
    const page: LayoutPage = { id, title, items: [] };
    pages.push(page);
    let y = 12;
    if (config.include.branding) {
      if (config.metadata.logoData)
        page.items.push({
          kind: 'logo',
          data: config.metadata.logoData,
          x: 248,
          y: 10,
          w: 37,
          h: 14,
        });
      else text(page.items, 'KIRAT STUDIO', 12, y, 2.6);
      y += 9;
    }
    if (config.include.projectInfo) {
      y = text(
        page.items,
        config.metadata.project || 'Sign proposal',
        12,
        y,
        5.8,
        config.metadata.logoData ? 230 : 273,
      );
      if (config.metadata.client) y = text(page.items, config.metadata.client, 12, y, 3);
      if (config.metadata.revision)
        y = text(page.items, `Revision ${config.metadata.revision}`, 12, y, 2.5);
    }
    y = text(page.items, title, 12, y + 2, 3.5);
    page.items.push({ kind: 'line', x: 12, y: y + 1, x2: 285, y2: y + 1 });
    return { page, y: y + 6 };
  };
  const appendTextPages = (
    id: string,
    title: string,
    content: string[],
    first?: { page: LayoutPage; y: number },
  ) => {
    let state = first ?? header(id, title),
      continued = 0;
    for (const block of content) {
      for (const line of wrapText(block, 3.1, 273, measure)) {
        if (state.y > 184) {
          state = header(`${id}-continued-${++continued}`, `${title} · continued`);
        }
        state.y = text(state.page.items, line, 12, state.y, 3.1);
      }
      state.y += 3;
    }
  };
  for (const source of config.pages.filter((p) => p.included)) {
    if (source.kind === 'cover') {
      const state = header(source.id, 'Sign concept');
      state.y += 15;
      appendTextPages(
        source.id,
        'Project notes',
        config.include.notes ? [config.metadata.notes] : [],
        state,
      );
      continue;
    }
    if (source.kind === 'summary') {
      appendTextPages(source.id, source.caption || 'Materials & notes', [
        ...materials,
        ...(config.include.notes && config.metadata.notes
          ? ['Project notes', config.metadata.notes]
          : []),
      ]);
      continue;
    }
    const shot = config.shots.find((s) => s.id === source.shotId);
    if (!shot) throw Error(`Choose a render for ${source.caption || 'this page'}.`);
    const state = header(source.id, source.caption || shot.name);
    state.page.shotId = shot.id;
    const bottom = source.dimensions ? 165 : 180;
    state.page.items.push({
      kind: 'image',
      shotId: shot.id,
      ...fitRect(shot.aspect, {
        x: 12,
        y: state.y,
        w: 273,
        h: Math.max(20, bottom - state.y),
      }),
    });
    if (source.dimensions) {
      const depth =
        Math.max(...layout.elements.flatMap((e) => e.parts.map((p) => p.z1)), layout.letterBase) -
        Math.min(...layout.board.map((b) => b.z0));
      const details =
        shot.camera.preset === 'front'
          ? `Width ${formatInUnit(design.settings.width, unit)} × Height ${formatInUnit(design.settings.height, unit)}`
          : `Board ${formatInUnit(design.settings.width, unit)} × ${formatInUnit(design.settings.height, unit)} · Assembly depth ${formatInUnit(depth, unit)}`;
      state.page.items.push({ kind: 'line', x: 30, y: 171, x2: 267, y2: 171 });
      text(state.page.items, details, 30, 174, 3, 245);
      const spacing = Math.max(0, ...layout.elements.map((e) => e.params.standoff ?? 0));
      if (spacing)
        text(
          state.page.items,
          `Letter standoff from fascia ${formatInUnit(spacing, unit)}`,
          30,
          180,
          2.7,
          245,
        );
    }
    if (source.materials)
      appendTextPages(
        `${source.id}-materials`,
        `${source.caption || shot.name} · materials`,
        materials,
      );
  }
  if (
    pages.length &&
    config.include.notes &&
    config.metadata.notes &&
    !config.pages.some((p) => p.included && (p.kind === 'summary' || p.kind === 'cover'))
  )
    appendTextPages('project-notes', 'Project notes', [config.metadata.notes]);
  pages.forEach((p, i) => {
    p.items.push({ kind: 'line', x: 12, y: 195, x2: 285, y2: 195 });
    text(
      p.items,
      'Concept visualisation · Lighting not calibrated · Not for fabrication',
      12,
      198,
      2.1,
    );
    text(p.items, `${i + 1} / ${pages.length}`, 270, 198, 2.1, 15);
  });
  return pages;
}
