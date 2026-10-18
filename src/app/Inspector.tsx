import { useState, type KeyboardEvent } from 'react';
import { computeLayout, type ElementLayout } from '../domain/layout.ts';
import { checkParams, recipes, resolveParams } from '../domain/recipes.ts';
import { constructionNames, type Artwork, type ConstructionType } from '../domain/project.ts';
import { applyConstruction, type ApplyScope } from './actions.ts';
import { editDesign, isolate, say, select, showAll, useDesign, useView } from './store.ts';

const label = (e: { type: ConstructionType; override: boolean }) =>
  constructionNames[e.type] + (e.override ? ' (override)' : '');

// Edit one artwork as a single undoable step.
const editArtwork = (fn: (a: Artwork) => Artwork, message?: string) =>
  editDesign((d) => (d.artwork ? { ...d, artwork: fn(d.artwork) } : d), message);

export function Inspector() {
  const design = useDesign(),
    artwork = design.artwork,
    view = useView();
  const el = artwork?.elements.find((e) => e.id === view.selected);
  const group = el && artwork!.groups.find((g) => g.id === el.group);
  const placed = el && computeLayout(design).elements.find((e) => e.id === el.id);
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

  const setParam = (key: string, value: number) => {
    if (!group || resolveParams(group.type, group)[key] === value) return;
    const params = { ...group.params, [key]: value },
      bad = checkParams(group.type, params);
    if (bad) return say(bad);
    editArtwork(
      (a) => ({ ...a, groups: a.groups.map((g) => (g.id === group.id ? { ...g, params } : g)) }),
      `${group.name}: ${recipes[group.type].params[key].label} set to ${value} mm.`,
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
          <option value="fronthalo">Front + halo letter</option>
          <option value="fullacrylic">Full acrylic letter</option>
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
      {el && group && !el.override && Object.keys(recipes[el.type].params).length > 0 && (
        <div className="recipe">
          <div className="sectionlabel">
            {group.name.toUpperCase()} · {recipes[el.type].name.toUpperCase()} / mm
          </div>
          <div className="pair">
            {Object.entries(recipes[el.type].params).map(([key, p]) => (
              <label key={key + k + JSON.stringify(group.params)}>
                {p.label}
                <input
                  type="number"
                  min={p.min}
                  max={p.max}
                  step={p.step}
                  defaultValue={resolveParams(el.type, group)[key]}
                  onBlur={(e) => setParam(key, +e.target.value)}
                  onKeyDown={blurOnEnter}
                />
              </label>
            ))}
          </div>
        </div>
      )}
      {el?.override && (
        <p className="muted">This element overrides its group and uses {recipes[el.type].name} defaults.</p>
      )}
      <button
        className="full"
        aria-pressed={view.isolate}
        onClick={() => (view.isolate ? showAll() : isolate(view.selected))}
      >
        {view.isolate ? 'Exit isolate · show all' : 'Isolate selected element'}
      </button>
      <div className="callout">
        {placed ? (
          <ElementDetails e={placed} holes={holes(el!)} />
        ) : el ? (
          <>
            <b>{el.name}</b> is excluded from the sign.
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

// Size and the rear-to-front stack of one placed element, measured from the ACP face.
function ElementDetails({ e, holes }: { e: ElementLayout; holes: number }) {
  const base = e.base,
    mm = (n: number) => +n.toFixed(2);
  return (
    <>
      <b>{e.name}</b>
      <br />
      {Math.round(e.bounds[2] - e.bounds[0])} × {Math.round(e.bounds[3] - e.bounds[1])} mm ·{' '}
      {e.regions.length} region(s) / {holes} hole(s)
      <br />
      {(e.perimeter / 1000).toFixed(3)} m contour perimeter
      <table className="stack">
        <tbody>
          {e.parts
            .filter((p) => p.kind !== 'leds' && p.kind !== 'stud')
            .map((p) => (
              <tr key={p.kind}>
                <td>
                  {p.material || p.kind}
                  <small>
                    {mm(p.z0 - base)}–{mm(p.z1 - base)} mm from fascia
                  </small>
                </td>
                <td>{mm(p.z1 - p.z0)} mm</td>
              </tr>
            ))}
          <tr>
            <td>
              <b>Projection</b>
            </td>
            <td>
              <b>{mm(Math.max(...e.parts.map((p) => p.z1)) - base)} mm</b>
            </td>
          </tr>
        </tbody>
      </table>
      {e.leds.length > 0 && <small>{e.leds.length} symbolic LED positions. </small>}
      {e.fixings.length > 0 && <small>{e.fixings.length} fixing points. </small>}
      <small>Perimeter is not a compensated strip cut length.</small>
    </>
  );
}

const blurOnEnter = (e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && e.currentTarget.blur();
