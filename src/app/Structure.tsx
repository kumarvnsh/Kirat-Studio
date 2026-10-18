// Structure tree: board → groups → letters. Select (click, Ctrl/Cmd-click, Shift-click), rename
// (double-click), show/hide, drag letters onto a group to move them, drag groups to reorder,
// and a per-group menu (isolate, merge, delete, reorder).
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react';
import type { Artwork, ArtworkGroup, ConstructionType } from '../domain/project.ts';
import {
  createGroup,
  deleteGroup,
  mergeGroups,
  moveElements,
  moveGroup,
  renameElement,
  renameGroup,
} from '../editor/artworkOps.ts';
import {
  editDesign,
  isolate,
  say,
  select,
  selectGroup,
  selectionIds,
  selectMany,
  toggleHidden,
  toggleSelect,
  useDesign,
  useView,
} from './store.ts';

export const shortType: Record<ConstructionType, string> = {
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

// One undoable edit of the artwork; errors from the operation are shown, not thrown.
export function editArtwork(fn: (a: Artwork) => Artwork, message?: string) {
  try {
    editDesign((d) => (d.artwork ? { ...d, artwork: fn(d.artwork) } : d), message);
  } catch (e) {
    say((e as Error).message);
  }
}

export const groupColours = (a: Artwork, g: ArtworkGroup) =>
  g.faceColor
    ? [g.faceColor]
    : [...new Set(a.elements.filter((e) => e.group === g.id).map((e) => e.faceColor ?? e.color))].slice(0, 4);

export function Swatch({ colors }: { colors: string[] }) {
  const bg =
    colors.length > 1
      ? `conic-gradient(${colors.map((c, i) => `${c} ${(i * 100) / colors.length}% ${((i + 1) * 100) / colors.length}%`).join(',')})`
      : (colors[0] ?? '#ccc');
  return <i className="swatch" style={{ background: bg }} />;
}

type Rename = { kind: 'group' | 'element'; id: string } | null;

export function StructureTree() {
  const design = useDesign(),
    a = design.artwork,
    view = useView();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
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
      <span
        className="name"
        title="Double-click to rename"
        onDoubleClick={(e) => (e.stopPropagation(), setRenaming({ kind, id }))}
      >
        {name}
      </span>
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
      editArtwork((art) => moveElements(art, ids, g.id), `Moved ${ids.length} element(s) to ${g.name}.`);
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

  return (
    <div className="tree" onDragEnd={() => setDropOn(null)}>
      <div className="tree-tools">
        <button onClick={newGroup} title="New group (from the selected letters, if any)">
          + Group{sel.size ? ' from selection' : ''}
        </button>
        <button
          onClick={() => setCollapsed(collapsed.size ? new Set() : new Set(a.groups.map((g) => g.id)))}
          title="Expand / collapse all"
        >
          {collapsed.size ? 'Expand' : 'Collapse'}
        </button>
        {view.hidden.length > 0 && (
          <button onClick={() => toggleHidden(view.hidden)} title="Show every hidden element">
            Show all
          </button>
        )}
      </div>
      <div className="tree-row board">
        <i className="swatch" style={{ background: design.settings.boardcolor }} />
        <span className="name">Board</span>
        <small className="badge">
          {design.settings.width} × {design.settings.height}
        </small>
      </div>
      {a.groups.map((g, gi) => {
        const els = members(g.id),
          ids = els.map((e) => e.id),
          allHidden = ids.length > 0 && ids.every((id) => hidden.has(id)),
          open = !collapsed.has(g.id);
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
                aria-label={open ? 'Collapse' : 'Expand'}
                onClick={(ev) => {
                  ev.stopPropagation();
                  const next = new Set(collapsed);
                  if (open) next.add(g.id);
                  else next.delete(g.id);
                  setCollapsed(next);
                }}
              >
                {open ? '▾' : '▸'}
              </button>
              <Swatch colors={groupColours(a, g)} />
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
                  <Swatch colors={[e.faceColor ?? g.faceColor ?? e.color]} />
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
      <p className="tree-hint">
        Click to select · Ctrl/Cmd-click to add · Shift-click for a range · double-click to rename · drag
        letters onto a group
      </p>
    </div>
  );
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
          onClick={act(() =>
            editArtwork((x) => mergeGroups(x, g.id, o.id), `${g.name} merged into ${o.name}.`),
          )}
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
