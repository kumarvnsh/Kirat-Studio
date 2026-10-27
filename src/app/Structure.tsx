// Structure tree: board → groups → letters. Select (click, Ctrl/Cmd-click, Shift-click), rename
// (double-click), show/hide, drag letters onto a group to move them, drag groups to reorder,
// and a per-group menu (isolate, merge, delete, reorder).
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react';
import type { Artwork, ArtworkElement, ArtworkGroup, ConstructionType, DesignSettings } from '../domain/project.ts';
import { formatDimsAllUnits, formatDimsInUnit } from '../domain/units.ts';
import {
  createGroup,
  deleteGroup,
  mergeGroups,
  moveElements,
  moveGroup,
  renameElement,
  renameGroup,
  setElements,
} from '../editor/artworkOps.ts';
import { applySceneChanges } from './actions.ts';
import {
  editDesign,
  isolate,
  say,
  select,
  selectBoard,
  selectGroup,
  selectionIds,
  selectMany,
  toggleHidden,
  toggleSelect,
  useDesign,
  useView,
} from './store.ts';

export const shortType: Record<ConstructionType, string> = {
  acpbacklit: 'ACP backlit',
  acpflush: 'Flush inlay',
  pushthrough: 'Push-through',
  front: 'Front-lit',
  halo: 'Halo',
  fronthalo: 'Front+halo',
  fullacrylic: 'Full acrylic',
  acrylic: 'Acrylic',
  metal: 'Metal',
  acplogo: 'ACP',
  vinyl: 'Vinyl',
  omit: 'Excluded',
};

export const BARE_METAL_SWATCH = 'linear-gradient(135deg, #f0f4f6 0%, #b8c2c7 48%, #e2e8eb 75%, #8f9ba1 100%)';

// One undoable edit of the artwork; errors from the operation are shown, not thrown.
export function editArtwork(fn: (a: Artwork) => Artwork, message?: string, coalesceKey?: string) {
  try {
    editDesign((d) => (d.artwork ? { ...d, artwork: fn(d.artwork) } : d), message, coalesceKey);
  } catch (e) {
    say((e as Error).message);
  }
}

export function elementFaceColour(
  e: ArtworkElement,
  g: ArtworkGroup | undefined,
  settings?: DesignSettings,
): string {
  const explicit = e.faceColor ?? g?.faceColor;
  if (explicit) return explicit;
  const effType = e.override ? e.type : (g?.type ?? e.type);
  if (effType === 'halo' || effType === 'metal') return 'metal';
  if (settings && !settings.keepart) return settings.facecolor;
  return e.color;
}

export const groupColours = (a: Artwork, g: ArtworkGroup, settings?: DesignSettings): string[] => {
  if (g.faceColor) return [g.faceColor];
  const els = a.elements.filter((e) => e.group === g.id);
  if (!els.length) {
    if (g.type === 'halo' || g.type === 'metal') return ['metal'];
    return [settings && !settings.keepart ? settings.facecolor : '#cccccc'];
  }
  return [...new Set(els.map((e) => elementFaceColour(e, g, settings)))].slice(0, 4);
};

export function Swatch({ colors, title }: { colors: string[]; title?: string }) {
  const norm = colors.length ? colors : ['#cccccc'];
  const toCss = (c: string) => (c === 'metal' ? '#c8d1d5' : c);
  const bg =
    norm.length === 1 && norm[0] === 'metal'
      ? BARE_METAL_SWATCH
      : norm.length > 1
        ? `conic-gradient(${norm.map((c, i) => `${toCss(c)} ${(i * 100) / norm.length}% ${((i + 1) * 100) / norm.length}%`).join(',')})`
        : toCss(norm[0]);
  const label =
    title ??
    norm.map((c) => (c === 'metal' ? 'Bare brushed metal' : c.toUpperCase())).join(' · ');
  return <i className="swatch" style={{ background: bg }} title={label} />;
}

type Rename = { kind: 'group' | 'element'; id: string } | null;

export function StructureTree() {
  const design = useDesign(),
    a = design.artwork,
    view = useView(),
    unit = view.unit ?? 'mm';
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  useEffect(() => setExpanded(new Set()), [a?.imageData]);
  const [renaming, setRenaming] = useState<Rename>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const anchor = useRef<string | null>(null);

  if (!a) return <p className="muted">No artwork yet.</p>;
  const sel = new Set(selectionIds(view)),
    hidden = new Set(view.hidden),
    order = a.groups.flatMap((g) => a.elements.filter((e) => e.group === g.id).map((e) => e.id));
  const members = (gid: string) => a.elements.filter((e) => e.group === gid);

  const clickElement = (ev: MouseEvent, id: string) => {
    if (ev.shiftKey && anchor.current && order.includes(anchor.current)) {
      const [i, j] = [order.indexOf(anchor.current), order.indexOf(id)].sort((x, y) => x - y);
      selectMany(order.slice(i, j + 1), id);
    } else if (ev.metaKey || ev.ctrlKey) {
      toggleSelect(id);
      anchor.current = id;
    } else {
      select(id);
      anchor.current = id;
    }
  };

  const commitRename = (value: string) => {
    if (!renaming) return;
    const r = renaming;
    setRenaming(null);
    editArtwork((art) =>
      r.kind === 'group' ? renameGroup(art, r.id, value) : renameElement(art, r.id, value),
    );
  };
  const renameKeys = (ev: KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === 'Enter') ev.currentTarget.blur();
    if (ev.key === 'Escape') setRenaming(null);
  };
  const nameField = (kind: 'group' | 'element', id: string, name: string) =>
    renaming?.kind === kind && renaming.id === id ? (
      <input
        className="rename"
        autoFocus
        defaultValue={name}
        maxLength={60}
        onClick={(e) => e.stopPropagation()}
        onBlur={(e) => commitRename(e.target.value)}
        onKeyDown={renameKeys}
      />
    ) : (
      <button type="button"
        className="name"
        title="Double-click to rename"
        onDoubleClick={(e) => (e.stopPropagation(), setRenaming({ kind, id }))}
      >
        {name}
      </button>
    );

  // Drag letters onto a group to move them; drag a group onto another to reorder.
  const dragElements = (ev: DragEvent, id: string) => {
    const ids = sel.has(id) ? [...sel] : [id];
    ev.dataTransfer.setData('kirat/elements', JSON.stringify(ids));
    ev.dataTransfer.effectAllowed = 'move';
  };
  const drop = (ev: DragEvent, g: ArtworkGroup, index: number) => {
    ev.preventDefault();
    setDropOn(null);
    const els = ev.dataTransfer.getData('kirat/elements'),
      grp = ev.dataTransfer.getData('kirat/group');
    if (els) {
      const ids: string[] = JSON.parse(els);
      editArtwork(
        (art) => setElements(moveElements(art, ids, g.id), ids, { type: 'inherit' }),
        `Moved ${ids.length} element(s) to ${g.name} (${shortType[g.type]}).`,
      );
    } else if (grp && grp !== g.id) editArtwork((art) => moveGroup(art, grp, index), 'Group order changed.');
  };

  const newGroup = () => {
    const ids = [...sel];
    let created = '';
    editArtwork(
      (art) => {
        const r = createGroup(art, '', ids);
        created = r.id;
        return r.artwork;
      },
      ids.length ? `New group from ${ids.length} element(s).` : 'New empty group.',
    );
    if (created) {
      setRenaming({ kind: 'group', id: created });
      if (ids.length) selectGroup(created);
    }
  };

  const boardSelected = view.selectedGroup === '__board' || (!view.selectedGroup && !sel.size);

  return (
    <div className="tree" onDragEnd={() => setDropOn(null)}>
      <label className="layer-search"><span className="sr-only">Search layers</span><input placeholder="Find a layer…" value={search} onChange={e => setSearch(e.target.value)} /></label>
      <div className="tree-tools">
        <button onClick={newGroup} title="New group (from the selected letters, if any)">
          + Group{sel.size && !view.selectedGroup ? ' from selection' : ''}
        </button>
        <button
          onClick={() => setExpanded(expanded.size ? new Set() : new Set(a.groups.map((g) => g.id)))}
          title="Expand / collapse all"
        >
          {expanded.size ? 'Collapse' : 'Expand'}
        </button>
        {view.hidden.length > 0 && (
          <button onClick={() => toggleHidden(view.hidden)} title="Show every hidden element">
            Show all
          </button>
        )}

      </div>
      <div
        className={'tree-row board' + (boardSelected ? ' active' : '')}
        title={`Click to inspect and edit the backing board (${formatDimsAllUnits(design.settings.width, design.settings.height)})`}
        onClick={() => selectBoard()}
      >
        <i className="swatch" style={{ background: design.settings.boardcolor }} />
        <button className="name" onClick={() => selectBoard()}>Board</button>
        <small className="badge" title={formatDimsAllUnits(design.settings.width, design.settings.height)}>
          {formatDimsInUnit(design.settings.width, design.settings.height, unit)}
        </small>
      </div>
      {a.groups.map((g, gi) => {
        const query = search.trim().toLowerCase();
        const groupMatches = g.name.toLowerCase().includes(query) || g.id.toLowerCase().includes(query);
        const found = members(g.id).filter(e => (e.name + ' ' + e.id).toLowerCase().includes(query));
        if (query && !groupMatches && !found.length) return null;
        const els = query && !groupMatches ? found : members(g.id),
          ids = els.map((e) => e.id),
          allHidden = ids.length > 0 && ids.every((id) => hidden.has(id)),
          open = !!query || expanded.has(g.id);
        return (
          <div key={g.id}>
            <div
              className={
                'tree-row group' +
                (view.selectedGroup === g.id ? ' active' : '') +
                (dropOn === g.id ? ' drop' : '')
              }
              draggable
              onDragStart={(ev) => ev.dataTransfer.setData('kirat/group', g.id)}
              onDragOver={(ev) => (ev.preventDefault(), setDropOn(g.id))}
              onDragLeave={() => setDropOn((d) => (d === g.id ? null : d))}
              onDrop={(ev) => drop(ev, g, gi)}
              onClick={() => selectGroup(g.id)}
            >
              <button
                className="caret"
                aria-label={(open ? 'Collapse ' : 'Expand ') + g.name}
                aria-expanded={open}
                onClick={(ev) => {
                  ev.stopPropagation();
                  const next = new Set(expanded);
                  if (open) next.delete(g.id);
                  else next.add(g.id);
                  setExpanded(next);
                }}
              >
                {open ? '▾' : '▸'}
              </button>
              <Swatch colors={groupColours(a, g, design.settings)} />
              {nameField('group', g.id, g.name)}
              <small className="badge">{shortType[g.type]}</small>
              <small className="count">{els.length}</small>
              <button
                className={'eye' + (allHidden ? ' off' : '')}
                title={allHidden ? 'Show group' : 'Hide group'}
                onClick={(ev) => (ev.stopPropagation(), ids.length && toggleHidden(ids))}
              >
                {allHidden ? '◌' : '◉'}
              </button>
              <button
                className="more"
                title="Group actions"
                onClick={(ev) => (ev.stopPropagation(), setMenu(menu === g.id ? null : g.id))}
              >
                ⋯
              </button>
              {menu === g.id && (
                <GroupMenu
                  a={a}
                  g={g}
                  index={gi}
                  close={() => setMenu(null)}
                  rename={() => setRenaming({ kind: 'group', id: g.id })}
                />
              )}
            </div>
            {open &&
              els.map((e) => (
                <div
                  key={e.id}
                  className={
                    'tree-row el' + (sel.has(e.id) ? ' active' : '') + (hidden.has(e.id) ? ' hidden' : '')
                  }
                  draggable
                  onDragStart={(ev) => dragElements(ev, e.id)}
                  onClick={(ev) => clickElement(ev, e.id)}
                >
                  <ShapeThumbnail e={e} />
                  {nameField('element', e.id, e.name)}
                  {(e.override || e.faceColor) && (
                    <small className="badge ovr" title="Differs from its group">
                      {e.override ? shortType[e.type] : 'own colour'}
                    </small>
                  )}
                  <button
                    className={'eye' + (hidden.has(e.id) ? ' off' : '')}
                    title={hidden.has(e.id) ? 'Show' : 'Hide'}
                    onClick={(ev) => (ev.stopPropagation(), toggleHidden([e.id]))}
                  >
                    {hidden.has(e.id) ? '◌' : '◉'}
                  </button>
                </div>
              ))}
            {open && !els.length && <div className="tree-empty">Empty — drag letters here</div>}
          </div>
        );
      })}
      {search && !a.groups.some(g => (g.name+' '+g.id).toLowerCase().includes(search.trim().toLowerCase()) || members(g.id).some(e => (e.name+' '+e.id).toLowerCase().includes(search.trim().toLowerCase()))) && <p className="empty-state">No matching layers.</p>}
      <p className="tree-hint">
        Click to select · Ctrl/Cmd-click to add · Shift-click for a range · double-click to rename · drag
        letters onto a group
      </p>
    </div>
  );
}

function ShapeThumbnail({ e }: { e: ArtworkElement }) {
  const [x0,y0,x1,y1]=e.bounds;
  const path=e.regions.map(r=>[r.outer,...r.holes].map(loop=>loop.map((p,i)=>(i?'L':'M')+p.join(',')).join(' ')+' Z').join(' ')).join(' ');
  return <svg className="shape-thumbnail" viewBox={[x0,y0,Math.max(1,x1-x0),Math.max(1,y1-y0)].join(' ')} aria-hidden="true"><path d={path} fill={e.faceColor??e.color} fillRule="evenodd" /></svg>;
}

function GroupMenu({
  a,
  g,
  index,
  close,
  rename,
}: {
  a: Artwork;
  g: ArtworkGroup;
  index: number;
  close: () => void;
  rename: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (ev: globalThis.MouseEvent) => !ref.current?.contains(ev.target as Node) && close();
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [close]);
  const others = a.groups.filter((x) => x.id !== g.id),
    empty = !a.elements.some((e) => e.group === g.id);
  const act = (fn: () => void) => (ev: MouseEvent) => {
    ev.stopPropagation();
    fn();
    close();
  };
  return (
    <div className="menu" ref={ref} onClick={(ev) => ev.stopPropagation()}>
      <button onClick={act(() => selectGroup(g.id))}>Select letters</button>
      <button onClick={act(() => (selectGroup(g.id), isolate(null)))}>Isolate group</button>
      <button onClick={act(rename)}>Rename</button>
      <button disabled={index === 0} onClick={act(() => editArtwork((x) => moveGroup(x, g.id, index - 1)))}>
        Move up
      </button>
      <button
        disabled={index === a.groups.length - 1}
        onClick={act(() => editArtwork((x) => moveGroup(x, g.id, index + 1)))}
      >
        Move down
      </button>
      {others.length > 0 && <div className="menu-label">Merge into</div>}
      {others.map((o) => (
        <button
          key={o.id}
          onClick={act(() => {
            const movedIds = a.elements.filter((e) => e.group === g.id).map((e) => e.id);
            editArtwork(
              (x) => setElements(mergeGroups(x, g.id, o.id), movedIds, { type: 'inherit' }),
              `${g.name} merged into ${o.name} (${shortType[o.type]}).`,
            );
          })}
        >
          ↳ {o.name}
        </button>
      ))}
      {empty && (
        <button
          className="danger"
          onClick={act(() => editArtwork((x) => deleteGroup(x, g.id), `${g.name} deleted.`))}
        >
          Delete empty group
        </button>
      )}
    </div>
  );
}
