import { panelIntegrated } from '../domain/recipes.ts';
import { computeLayout } from '../domain/layout.ts';
import { constructionNames, type DesignState } from '../domain/project.ts';
import { formatInUnit, type LengthUnit } from '../domain/units.ts';
import type { PresentationConfig } from './model.ts';
import { applyOption } from './options.ts';
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
    const name = `${constructionNames[e.type]} · face ${face ?? 'artwork'}${e.returnColor && !panelIntegrated(e.type) ? ` · painted return ${e.returnColor}` : ''}${panelIntegrated(e.type) ? ` · rear LEDs${e.type === 'pushthrough' ? ` · ${e.params.projection} mm projection` : e.type === 'acpflush' ? ' · flush face' : ' · rear diffuser'}` : ''}`;
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
    if (pages.length >= 200)
      throw Error('This booklet is too long. Reduce included details or design options.');
    const page: LayoutPage = { id, title, items: [] };
    pages.push(page);
    let y = 12;
    if (config.include.branding) {
      page.items.push({
        kind: 'logo',
        data: config.metadata.logoData ?? '/brand/kirat-creations.png',
        x: 12,
        y: 10,
        w: 72,
        h: 24,
      });
      y = 38;
    }
    if (config.include.projectInfo) {
      y = text(page.items, config.metadata.project || 'Sign proposal', 12, y, 5.8, 273);
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
    if (source.kind === 'comparison') {
      const options = config.options.filter(
        (o) => !source.optionIds || source.optionIds.includes(o.id),
      );
      for (let start = 0; start < options.length; start += 2) {
        const state = header(
            `${source.id}-${start}`,
            source.caption || 'Construction & colour options',
          ),
          overflow: { name: string; lines: string[] }[] = [];
        options.slice(start, start + 2).forEach((o, column) => {
          const x = 12 + column * 141,
            w = 132;
          let y = text(state.page.items, o.name, x, state.y, 3.6, w);
          const representative =
            config.shots.find(
              (s) => s.optionId === o.id && s.camera.preset === 'front' && s.environment === 'day',
            ) ?? config.shots.find((s) => s.optionId === o.id);
          if (representative) {
            state.page.items.push({
              kind: 'image',
              shotId: representative.id,
              ...fitRect(representative.aspect, { x, y: y + 3, w, h: 49 }),
            });
            y += 56;
          }
          const lines = [
            ...(o.description ? wrapText(o.description, 2.7, w, measure) : []),
            ...materialSummary(applyOption(design, o)).flatMap((s) => wrapText(s, 2.7, w, measure)),
          ];
          let used = 0;
          for (const line of lines) {
            if (y > 184) break;
            y = text(state.page.items, line, x, y, 2.7, w);
            used++;
          }
          if (used < lines.length) overflow.push({ name: o.name, lines: lines.slice(used) });
        });
        for (const detail of overflow)
          appendTextPages(
            `${source.id}-${start}-${detail.name}`,
            `${detail.name} · details`,
            detail.lines,
          );
      }
      continue;
    }
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
        ...config.options.flatMap((o) => [o.name, ...materialSummary(applyOption(design, o))]),
        ...(config.include.notes && config.metadata.notes
          ? ['Project notes', config.metadata.notes]
          : []),
      ]);
      continue;
    }
    const shot = config.shots.find((s) => s.id === source.shotId);
    if (!shot) throw Error(`Choose a render for ${source.caption || 'this page'}.`);
    const option = config.options.find((o) => o.id === shot.optionId),
      resolved = applyOption(design, option),
      resolvedLayout = computeLayout(resolved);
    const state = header(
      source.id,
      `${option?.name ?? 'Design option'} · ${source.caption || shot.name}`,
    );
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
        Math.max(
          ...resolvedLayout.elements.flatMap((e) => e.parts.map((p) => p.z1)),
          resolvedLayout.letterBase,
        ) -
        Math.min(
          ...resolvedLayout.board.map((b) => b.z0),
          ...resolvedLayout.structure.flatMap((m) => [m.a[2], m.b[2]]),
        );
      const details = shot.site
        ? `Board ${formatInUnit(shot.site.board[0], unit)} × ${formatInUnit(shot.site.board[1], unit)} on a ${formatInUnit(shot.site.wall[0], unit)} × ${formatInUnit(shot.site.wall[1], unit)} wall`
        : shot.camera.preset === 'front'
          ? `Width ${formatInUnit(design.settings.width, unit)} × Height ${formatInUnit(design.settings.height, unit)}`
          : `Board ${formatInUnit(design.settings.width, unit)} × ${formatInUnit(design.settings.height, unit)} · Assembly depth ${formatInUnit(depth, unit)}`;
      state.page.items.push({ kind: 'line', x: 30, y: 171, x2: 267, y2: 171 });
      text(state.page.items, details, 30, 174, 3, 245);
      const spacing = Math.max(0, ...resolvedLayout.elements.map((e) => e.params.standoff ?? 0));
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
        materialSummary(resolved),
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
