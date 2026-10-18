import type { Artwork, ViewState } from '../domain/project.ts';
export type SelectionScope = { kind: 'empty' | 'board' | 'group' | 'shape' | 'multiple'; label: string; ids: string[] };
export function selectionScope(artwork: Artwork | null, view: Pick<ViewState, 'selected' | 'selection' | 'selectedGroup'>): SelectionScope {
  if (view.selectedGroup === '__board') return { kind: 'board', label: 'Sign board', ids: [] };
  const group = artwork?.groups.find(g => g.id === view.selectedGroup);
  if (group) return { kind: 'group', label: group.name, ids: artwork!.elements.filter(e => e.group === group.id).map(e => e.id) };
  const ids = [...new Set([view.selected, ...view.selection].filter((id): id is string => !!id && !!artwork?.elements.some(e => e.id === id)))];
  return { kind: ids.length > 1 ? 'multiple' : ids.length ? 'shape' : 'empty', label: ids.length > 1 ? `${ids.length} shapes` : ids.length ? artwork!.elements.find(e => e.id === ids[0])!.name : 'Nothing selected', ids };
}
