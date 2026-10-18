import { useState, type KeyboardEvent } from 'react';
import { perimeter } from '../artwork/contours.js';
import { constructionNames, type Artwork, type ConstructionType } from '../domain/project.ts';
import { applyConstruction, type ApplyScope } from './actions.ts';
import { editDesign, isolate, select, showAll, useApp, useDesign, useView } from './store.ts';

const label = (e: { type: ConstructionType; override: boolean }) =>
  constructionNames[e.type] + (e.override ? ' (override)' : '');

// Edit one artwork as a single undoable step.
const editArtwork = (fn: (a: Artwork) => Artwork, message?: string) =>
  editDesign((d) => (d.artwork ? { ...d, artwork: fn(d.artwork) } : d), message);

export function Inspector() {
  const artwork = useDesign().artwork,
    view = useView(),
    scale = useApp((s) => s.stats?.scale ?? 0);
  const el = artwork?.elements.find((e) => e.id === view.selected);
  const group = el && artwork!.groups.find((g) => g.id === el.group);
  const [type, setType] = useState<ConstructionType | null>(null);
  const [scope, setScope] = useState<ApplyScope>('group');
  const shownType = type ?? el?.type ?? 'front';

  const rename = (value: string) => {
    if (el && value.trim() && value.trim() !== el.name)
      editArtwork((a) => ({
        ...a,
        elements: a.elements.map((e) => (e.id === el.id ? { ...e, name: value.trim() } : e)),
      }));
  };
  const renameGroup = (value: string) => {
    if (group && value.trim() && value.trim() !== group.name)
      editArtwork((a) => ({
        ...a,
        groups: a.groups.map((g) => (g.id === group.id ? { ...g, name: value.trim() } : g)),
      }));
  };
  const moveTo = (gid: string) => {
    if (!el || !artwork) return;
    let groups = artwork.groups,
      target = groups.find((g) => g.id === gid);
    if (!target) {
      const n = Math.max(0, ...groups.map((g) => +g.id.slice(1) || 0)) + 1;
      target = { id: 'g' + n, name: 'Group ' + n, type: el.type };
      groups = [...groups, target];
    }
    const t = target;
    const elements = artwork.elements.map((e) =>
      e.id === el.id ? { ...e, group: t.id, override: e.type !== t.type } : e,
    );
    editArtwork(
      (a) => ({ ...a, elements, groups: groups.filter((g) => elements.some((e) => e.group === g.id)) }),
      `Moved ${el.name} to ${t.name}.`,
    );
  };

  const holes = (e: NonNullable<typeof el>) => e.regions.reduce((n, r) => n + r.holes.length, 0);
  // Remount name inputs per element so defaultValue follows the selection.
  const k = (el?.id ?? '') + '|' + (el?.name ?? '') + '|' + (group?.name ?? '');

  return (
    <aside className="inspector">
      <div className="eyebrow">ELEMENT INSPECTOR</div>
      <h2>Make it your way.</h2>
      <p className="muted">Select a shape in the scene, trace or list.</p>
      <label>
        Artwork element
        <select value={el?.id ?? ''} onChange={(e) => (setType(null), select(e.target.value))}>
          {!artwork && <option>No artwork yet</option>}
          {artwork?.elements.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} · {label(e)}
            </option>
          ))}
        </select>
      </label>
      {el && (
        <>
          <label>
            Element name
            <input
              key={'n' + k}
              defaultValue={el.name}
              maxLength={50}
              onBlur={(e) => rename(e.target.value)}
              onKeyDown={blurOnEnter}
            />
          </label>
          <label>
            Artwork group
            <select value={el.group} onChange={(e) => moveTo(e.target.value)}>
              {artwork!.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} · {constructionNames[g.type]}
                </option>
              ))}
              <option value="__new">+ New group</option>
            </select>
          </label>
          <label>
            Group name
            <input
              key={'g' + k}
              defaultValue={group?.name}
              maxLength={50}
              onBlur={(e) => renameGroup(e.target.value)}
              onKeyDown={blurOnEnter}
            />
          </label>
        </>
      )}
      <label>
        Construction
        <select value={shownType} onChange={(e) => setType(e.target.value as ConstructionType)}>
          <option value="front">Front-lit channel letter</option>
          <option value="halo">Halo-lit metal letter</option>
          <option value="acrylic">Flat acrylic</option>
          <option value="metal">Flat metal</option>
          <option value="acplogo">Flat ACP logo</option>
          <option value="vinyl">Printed / cut vinyl</option>
          <option value="omit">Exclude from sign</option>
        </select>
      </label>
      <label>
        Apply to
        <select value={scope} onChange={(e) => setScope(e.target.value as ApplyScope)}>
          <option value="group">Whole group</option>
          <option value="selected">This element only (override)</option>
          <option value="all">All artwork elements</option>
        </select>
      </label>
      <button
        className="full accent"
        onClick={() => {
          applyConstruction(shownType, scope);
          setType(null);
        }}
      >
        Apply construction
      </button>
      <button
        className="full"
        aria-pressed={view.isolate}
        onClick={() => (view.isolate ? showAll() : isolate(view.selected))}
      >
        {view.isolate ? 'Exit isolate · show all' : 'Isolate selected element'}
      </button>
      <div className="callout">
        {el ? (
          <>
            <b>{el.name}</b>
            <br />
            Approx. {Math.round((el.bounds[2] - el.bounds[0]) * scale * 1000)} ×{' '}
            {Math.round((el.bounds[3] - el.bounds[1]) * scale * 1000)} mm
            <br />
            {el.regions.length} outer region(s) / {holes(el)} inner hole(s)
            <br />
            {(
              el.regions.reduce(
                (n, r) => n + perimeter(r.outer) + r.holes.reduce((m, h) => m + perimeter(h), 0),
                0,
              ) * scale
            ).toFixed(3)}{' '}
            m nominal contour perimeter
            <br />
            <small>Perimeter is not a compensated strip cut length.</small>
          </>
        ) : (
          'Each artwork group (symbol, wordmark, tagline) shares one construction. Override single elements if needed.'
        )}
      </div>
      <div className="sectionlabel">ARTWORK ELEMENTS</div>
      <div id="elementlist">
        {artwork?.elements.map((e) => (
          <button
            key={e.id}
            className={'element' + (e.id === view.selected ? ' active' : '')}
            onClick={() => (setType(null), select(e.id))}
          >
            <i style={{ background: e.color }} />
            <span>
              {e.name}
              <small>
                {artwork.groups.find((g) => g.id === e.group)?.name} · {label(e)}
              </small>
            </span>
            <em>{holes(e)} holes</em>
          </button>
        ))}
      </div>
      <div className="callout small">
        Lighting placement is symbolic and uncalculated. Returns have a nominal wall gauge; selected profiles,
        fixings and tolerances still need fabrication validation.
      </div>
    </aside>
  );
}

const blurOnEnter = (e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && e.currentTarget.blur();
