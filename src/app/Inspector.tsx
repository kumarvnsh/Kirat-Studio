// Right-hand panel: the structure tree, then properties for whatever is selected —
// a whole group, one letter, or several letters.
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { computeLayout, type ElementLayout } from '../domain/layout.ts';
import { checkParams, recipes, resolveParams } from '../domain/recipes.ts';
import type { Artwork, ArtworkElement, ArtworkGroup, ConstructionType } from '../domain/project.ts';
import {
  artworkPalette,
  createGroup,
  moveElements,
  renameElement,
  renameGroup,
  setElements,
  setGroup,
} from '../editor/artworkOps.ts';
import {
  isolate,
  say,
  selectGroup,
  selectionIds,
  showAll,
  toggleHidden,
  useDesign,
  useView,
} from './store.ts';
import { editArtwork, groupColours, shortType, StructureTree, Swatch } from './Structure.tsx';

const TYPES = Object.keys(shortType) as ConstructionType[];
const SIGN_COLOURS = ['#ffffff', '#111111', '#d32f2f', '#f9a825', '#ff9e35', '#1e88e5', '#2e7d32', '#6a1b9a'];

export function Inspector() {
  const design = useDesign(),
    a = design.artwork,
    view = useView();
  const ids = selectionIds(view).filter((id) => a?.elements.some((e) => e.id === id)),
    group = view.selectedGroup ? a?.groups.find((g) => g.id === view.selectedGroup) : undefined;
  return (
    <aside className="inspector">
      <div className="eyebrow">STRUCTURE</div>
      <StructureTree />
      <div className="eyebrow props-head">PROPERTIES</div>
      {!a ? null : group ? (
        <GroupProps a={a} g={group} />
      ) : ids.length > 1 ? (
        <MultiProps a={a} ids={ids} />
      ) : ids.length === 1 ? (
        <ElementProps a={a} e={a.elements.find((e) => e.id === ids[0])!} />
      ) : (
        <p className="muted">Select a group or letter in the tree, the 3D view or the 2D trace.</p>
      )}
      {view.isolate && (
        <button className="full" onClick={() => showAll()}>
          Exit isolate · show all
        </button>
      )}
      <div className="callout small">
        Lighting placement is symbolic and uncalculated. Returns have a nominal wall gauge; selected profiles,
        fixings and tolerances still need fabrication validation.
      </div>
    </aside>
  );
}

// ——— Group ———
function GroupProps({ a, g }: { a: Artwork; g: ArtworkGroup }) {
  const els = a.elements.filter((e) => e.group === g.id),
    ids = els.map((e) => e.id),
    overrides = els.filter((e) => e.override || e.faceColor).length,
    recipe = recipes[g.type];
  const setParam = (key: string, value: number) => {
    if (resolveParams(g.type, g)[key] === value) return;
    const bad = checkParams(g.type, { ...g.params, [key]: value });
    if (bad) return say(bad);
    editArtwork(
      (x) => setGroup(x, g.id, { params: { [key]: value } }),
      `${g.name}: ${recipe.params[key].label} set to ${value} mm.`,
    );
  };
  return (
    <div className="props">
      <div className="props-title">
        <Swatch colors={groupColours(a, g)} /> <b>{g.name}</b> <small>group · {els.length} letters</small>
      </div>
      <TextField
        label="Group name"
        value={g.name}
        onCommit={(v) => editArtwork((x) => renameGroup(x, g.id, v))}
      />
      <TypeSelect
        label="Construction"
        value={g.type}
        onChange={(t) =>
          editArtwork(
            (x) => setGroup(x, g.id, { type: t as ConstructionType }),
            `${g.name} set to ${recipes[t as ConstructionType].name}.`,
          )
        }
      />
      {Object.keys(recipe.params).length > 0 && (
        <div className="recipe">
          <div className="sectionlabel">{recipe.name.toUpperCase()} / mm</div>
          <div className="pair">
            {Object.entries(recipe.params).map(([key, p]) => (
              <label key={key + g.id + g.type + JSON.stringify(g.params)}>
                {p.label}
                <input
                  type="number"
                  min={p.min}
                  max={p.max}
                  step={p.step}
                  defaultValue={resolveParams(g.type, g)[key]}
                  onBlur={(e) => setParam(key, +e.target.value)}
                  onKeyDown={blurOnEnter}
                />
              </label>
            ))}
          </div>
        </div>
      )}
      <ColorField
        label={g.type === 'halo' || g.type === 'metal' ? 'Face colour (painted)' : 'Face colour'}
        value={g.faceColor}
        fallback={g.type === 'halo' || g.type === 'metal' ? 'Bare metal' : 'Artwork colours'}
        palette={artworkPalette(a)}
        onCommit={(c) =>
          editArtwork(
            (x) => setGroup(x, g.id, { faceColor: c }),
            c ? `${g.name} face colour ${c}.` : `${g.name} uses artwork colours.`,
          )
        }
      />
      {recipe.lit && (
        <ColorField
          label="Return colour"
          value={g.returnColor}
          fallback="Natural metal"
          palette={artworkPalette(a)}
          onCommit={(c) =>
            editArtwork(
              (x) => setGroup(x, g.id, { returnColor: c }),
              c ? `${g.name} returns painted ${c}.` : `${g.name} returns natural metal.`,
            )
          }
        />
      )}
      {overrides > 0 && (
        <button
          className="full"
          onClick={() =>
            editArtwork(
              (x) => setElements(x, ids, { type: 'inherit', faceColor: null }),
              `${g.name}: letter overrides cleared.`,
            )
          }
        >
          Clear {overrides} letter override{overrides > 1 ? 's' : ''}
        </button>
      )}
      <div className="row">
        <button onClick={() => (selectGroup(g.id), isolate(null))}>Isolate</button>
        <button onClick={() => toggleHidden(ids)}>Hide / show</button>
      </div>
    </div>
  );
}

// ——— One letter ———
function ElementProps({ a, e }: { a: Artwork; e: ArtworkElement }) {
  const design = useDesign(),
    g = a.groups.find((x) => x.id === e.group)!,
    placed = computeLayout(design).elements.find((x) => x.id === e.id);
  return (
    <div className="props">
      <div className="props-title">
        <Swatch colors={[e.faceColor ?? g.faceColor ?? e.color]} /> <b>{e.name}</b> <small>in {g.name}</small>
      </div>
      <TextField
        label="Name"
        value={e.name}
        onCommit={(v) => editArtwork((x) => renameElement(x, e.id, v))}
      />
      <GroupSelect a={a} value={e.group} ids={[e.id]} />
      <TypeSelect
        label="Construction"
        value={e.override ? e.type : 'inherit'}
        inherit={`Same as group (${shortType[g.type]})`}
        onChange={(t) =>
          editArtwork((x) => setElements(x, [e.id], { type: t as ConstructionType | 'inherit' }))
        }
      />
      <ColorField
        label="Face colour"
        value={e.faceColor}
        fallback={g.faceColor ? `Group colour` : 'Artwork colour'}
        palette={artworkPalette(a)}
        onCommit={(c) => editArtwork((x) => setElements(x, [e.id], { faceColor: c }))}
      />
      <div className="row">
        <button onClick={() => isolate(e.id)}>Isolate</button>
        <button onClick={() => toggleHidden([e.id])}>Hide / show</button>
      </div>
      <div className="callout">
        {placed ? (
          <ElementDetails e={placed} holes={e.regions.reduce((n, r) => n + r.holes.length, 0)} />
        ) : (
          <>
            <b>{e.name}</b> is excluded from the sign.
          </>
        )}
      </div>
    </div>
  );
}

// ——— Several letters ———
function MultiProps({ a, ids }: { a: Artwork; ids: string[] }) {
  const els = a.elements.filter((e) => ids.includes(e.id)),
    groups = [...new Set(els.map((e) => e.group))].map((id) => a.groups.find((g) => g.id === id)!);
  return (
    <div className="props">
      <div className="props-title">
        <Swatch colors={[...new Set(els.map((e) => e.faceColor ?? e.color))].slice(0, 4)} />{' '}
        <b>{ids.length} letters</b> <small>from {groups.map((g) => g.name).join(', ')}</small>
      </div>
      <GroupSelect a={a} value={groups.length === 1 ? groups[0].id : ''} ids={ids} />
      <TypeSelect
        label="Construction"
        value=""
        inherit="Same as their group"
        placeholder="— change construction —"
        onChange={(t) =>
          editArtwork(
            (x) => setElements(x, ids, { type: t as ConstructionType | 'inherit' }),
            `${ids.length} letters updated.`,
          )
        }
      />
      <ColorField
        label="Face colour"
        value={undefined}
        fallback="Their own / group colours"
        palette={artworkPalette(a)}
        onCommit={(c) =>
          editArtwork((x) => setElements(x, ids, { faceColor: c }), `${ids.length} letters recoloured.`)
        }
      />
      <div className="row">
        <button onClick={() => isolate(null)}>Isolate</button>
        <button onClick={() => toggleHidden(ids)}>Hide / show</button>
      </div>
    </div>
  );
}

// ——— Fields ———
function GroupSelect({ a, value, ids }: { a: Artwork; value: string; ids: string[] }) {
  return (
    <label>
      Group
      <select
        value={value}
        onChange={(ev) => {
          const v = ev.target.value;
          if (v === '__new')
            editArtwork((x) => createGroup(x, '', ids).artwork, `New group from ${ids.length} letter(s).`);
          else if (v) {
            const name = a.groups.find((g) => g.id === v)?.name;
            editArtwork((x) => moveElements(x, ids, v), `Moved to ${name}.`);
          }
        }}
      >
        {!value && <option value="">— move to group —</option>}
        {a.groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name} · {shortType[g.type]}
          </option>
        ))}
        <option value="__new">+ New group</option>
      </select>
    </label>
  );
}

function TypeSelect({
  label,
  value,
  inherit,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  inherit?: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => e.target.value && onChange(e.target.value)}>
        {placeholder && <option value="">{placeholder}</option>}
        {inherit && <option value="inherit">{inherit}</option>}
        {TYPES.map((t) => (
          <option key={t} value={t}>
            {recipes[t].name}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
}) {
  return (
    <label>
      {label}
      <input
        key={value}
        defaultValue={value}
        maxLength={60}
        onBlur={(e) => e.target.value.trim() !== value && onCommit(e.target.value)}
        onKeyDown={blurOnEnter}
      />
    </label>
  );
}

// Colour picker that commits once when the picker closes (one undo step), plus quick swatches:
// the artwork's own colours and common sign colours. `null` = back to the fallback.
function ColorField({
  label,
  value,
  fallback,
  palette,
  onCommit,
}: {
  label: string;
  value: string | undefined;
  fallback: string;
  palette: string[];
  onCommit: (c: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = input.current!,
      done = () => onCommit(el.value);
    el.addEventListener('change', done);
    return () => el.removeEventListener('change', done);
  }, [onCommit]);
  const swatches = [...new Set([...palette, ...SIGN_COLOURS])].slice(0, 14);
  return (
    <div className="colorfield">
      <div className="colorfield-head">
        <span>{label}</span>
        <small>{value ?? fallback}</small>
      </div>
      <div className="colorfield-row">
        <input
          ref={input}
          key={value ?? 'none'}
          type="color"
          defaultValue={value ?? '#ffffff'}
          aria-label={label}
        />
        <div className="chips">
          {swatches.map((c) => (
            <button
              key={c}
              className={'chip' + (c === value ? ' on' : '')}
              style={{ background: c }}
              title={c}
              onClick={() => onCommit(c)}
            />
          ))}
        </div>
      </div>
      {value && (
        <button className="link" onClick={() => onCommit(null)}>
          Reset to {fallback.toLowerCase()}
        </button>
      )}
    </div>
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
    </>
  );
}

const blurOnEnter = (e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && e.currentTarget.blur();
