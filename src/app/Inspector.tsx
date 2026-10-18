// Right-hand panel: the structure tree, then properties for whatever is selected —
// the backing board, a whole group, one letter, or several letters.
import { useRef, type KeyboardEvent } from 'react';
import { computeLayout, type ElementLayout } from '../domain/layout.ts';
import { kelvinToHex, LED_TEMPS } from '../domain/lighting.ts';
import { checkParams, recipes, resolveParams } from '../domain/recipes.ts';
import {
  checkSettings,
  numericSettings,
  type Artwork,
  type ArtworkElement,
  type ArtworkGroup,
  type ConstructionType,
  type LightMode,
} from '../domain/project.ts';
import {
  artworkPalette,
  createGroup,
  moveElements,
  renameElement,
  renameGroup,
  setElements,
  setGroup,
} from '../editor/artworkOps.ts';
import { viewer } from './actions.ts';
import { ConstructionPicker, CrossSectionDiagram } from './ConstructionDiagram.tsx';
import { ScrubInput } from './ScrubInput.tsx';
import {
  editDesign,
  isolate,
  say,
  selectGroup,
  selectionIds,
  showAll,
  toggleHidden,
  useDesign,
  useView,
} from './store.ts';
import {
  BARE_METAL_SWATCH,
  editArtwork,
  elementFaceColour,
  groupColours,
  shortType,
  StructureTree,
  Swatch,
} from './Structure.tsx';

const SIGN_PRESETS: { hex: string; name: string }[] = [
  { hex: '#ffffff', name: 'Opal White' },
  { hex: '#111111', name: 'Jet Black' },
  { hex: '#243843', name: 'Deep Navy' },
  { hex: '#d32f2f', name: 'Signal Red' },
  { hex: '#ff9e35', name: 'Warm Orange' },
  { hex: '#f9a825', name: 'Amber Gold' },
  { hex: '#2e7d32', name: 'Emerald Green' },
  { hex: '#1e88e5', name: 'Cobalt Blue' },
  { hex: '#6a1b9a', name: 'Royal Purple' },
  { hex: '#c5ccd0', name: 'Brushed Silver' },
];

function isLightHex(hex: string): boolean {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return true;
  const r = parseInt(hex.slice(1, 3), 16),
    g = parseInt(hex.slice(3, 5), 16),
    b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
}

export function Inspector() {
  const design = useDesign(),
    a = design.artwork,
    view = useView();
  const ids = selectionIds(view).filter((id) => a?.elements.some((e) => e.id === id)),
    group =
      view.selectedGroup && view.selectedGroup !== '__board'
        ? a?.groups.find((g) => g.id === view.selectedGroup)
        : undefined;
  return (
    <aside className="inspector">
      <div className="eyebrow">STRUCTURE</div>
      <StructureTree />
      <div className="eyebrow props-head">PROPERTIES</div>
      {!a ? null : view.selectedGroup === '__board' ? (
        <BoardProps a={a} />
      ) : group ? (
        <GroupProps a={a} g={group} />
      ) : ids.length > 1 ? (
        <MultiProps a={a} ids={ids} />
      ) : ids.length === 1 ? (
        <ElementProps a={a} e={a.elements.find((e) => e.id === ids[0])!} />
      ) : (
        <BoardProps a={a} />
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

// ——— Board overview & quick settings ———
function BoardProps({ a }: { a: Artwork }) {
  const design = useDesign(),
    s = design.settings;
  const setSetting = <K extends keyof typeof s>(
    key: K,
    value: (typeof s)[K],
    msg?: string,
    coalesce = true,
  ) => {
    const next = { ...s, [key]: value };
    const bad = checkSettings(next);
    if (bad) return say(bad);
    editDesign((d) => ({ ...d, settings: next }), msg, coalesce ? `board-${String(key)}` : undefined);
  };
  return (
    <div className="props">
      <div className="props-title">
        <Swatch colors={[s.boardcolor]} /> <b>Board structure</b>{' '}
        <small>
          {s.width} × {s.height} mm · {a.groups.length} groups
        </small>
      </div>
      <CrossSectionDiagram settings={s} />
      <div className="pair">
        <ScrubInput
          label="Board width"
          min={numericSettings.width.min}
          max={numericSettings.width.max}
          step={numericSettings.width.step}
          value={s.width}
          onChange={(v, scrubbing) => setSetting('width', v, 'Board width updated.', scrubbing)}
          onInvalid={() => say(`Board width must be between ${numericSettings.width.min} and ${numericSettings.width.max} mm.`)}
        />
        <ScrubInput
          label="Board height"
          min={numericSettings.height.min}
          max={numericSettings.height.max}
          step={numericSettings.height.step}
          value={s.height}
          onChange={(v, scrubbing) => setSetting('height', v, 'Board height updated.', scrubbing)}
          onInvalid={() => say(`Board height must be between ${numericSettings.height.min} and ${numericSettings.height.max} mm.`)}
        />
      </div>
      <label>
        Artwork width (% of board) <output>{s.artscale}%</output>
        <input
          type="range"
          min={numericSettings.artscale.min}
          max={numericSettings.artscale.max}
          value={s.artscale}
          onChange={(e) => setSetting('artscale', +e.target.value, undefined, true)}
        />
      </label>
      <ColorField
        label="ACP fascia finish"
        value={s.boardcolor}
        fallback="#243843"
        previewColor={s.boardcolor}
        palette={artworkPalette(a)}
        onCommit={(c, live) => setSetting('boardcolor', c ?? '#243843', 'ACP fascia colour updated.', live)}
      />
      <label>
        Default white LED temperature
        <select
          value={s.ledTemp}
          onChange={(e) =>
            setSetting('ledTemp', +e.target.value, `Board LED temperature set to ${e.target.value} K.`, false)
          }
        >
          {LED_TEMPS.map((k) => (
            <option key={k} value={k}>
              {k} K {k <= 3000 ? '(Warm white)' : k <= 4000 ? '(Neutral white)' : '(Cool daylight)'}
            </option>
          ))}
        </select>
      </label>
      <p className="muted">
        Click any <b>Group</b> or <b>Letter</b> in the tree above (or directly in the 3D scene) to configure its
        3D construction, return depth, and lighting circuit.
      </p>
    </div>
  );
}

// ——— Group ———
function GroupProps({ a, g }: { a: Artwork; g: ArtworkGroup }) {
  const design = useDesign(),
    els = a.elements.filter((e) => e.group === g.id),
    ids = els.map((e) => e.id),
    overrides = els.filter((e) => e.override || e.faceColor).length,
    recipe = recipes[g.type],
    resolved = resolveParams(g.type, g),
    grpCols = groupColours(a, g, design.settings),
    firstArtHex = els[0]?.color ?? design.settings.facecolor;
  const setParam = (key: string, value: number, scrubbing = false) => {
    if (resolved[key] === value) return;
    const bad = checkParams(g.type, { ...g.params, [key]: value });
    if (bad) return say(bad);
    editArtwork(
      (x) => setGroup(x, g.id, { params: { [key]: value } }),
      `${g.name}: ${recipe.params[key].label} set to ${value} mm.`,
      scrubbing ? `param-${g.id}-${key}` : undefined,
    );
  };
  const glowHex =
    g.light?.mode === 'rgb' && g.light.color
      ? g.light.color
      : kelvinToHex(g.light?.temp ?? design.settings.ledTemp);
  return (
    <div className="props">
      <div className="props-title">
        <Swatch colors={grpCols} /> <b>{g.name}</b> <small>group · {els.length} letters</small>
      </div>
      <CrossSectionDiagram
        settings={design.settings}
        type={g.type}
        params={resolved}
        faceColor={g.faceColor ?? (grpCols[0] === 'metal' ? undefined : grpCols[0])}
        returnColor={g.returnColor}
        glowColor={glowHex}
      />
      <TextField
        label="Group name"
        value={g.name}
        onCommit={(v) => editArtwork((x) => renameGroup(x, g.id, v))}
      />
      <div className="sectionlabel">CONSTRUCTION TYPE</div>
      <ConstructionPicker
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
          <div className="sectionlabel">{recipe.name.toUpperCase()} / mm (DRAG ↔ TO SCRUB)</div>
          <div className="pair">
            {Object.entries(recipe.params).map(([key, p]) => (
              <ScrubInput
                key={key + g.id + g.type}
                label={p.label}
                min={p.min}
                max={p.max}
                step={p.step}
                value={resolved[key]}
                onChange={(v, scrubbing) => setParam(key, v, scrubbing)}
                onInvalid={() => say(`${p.label} must be between ${p.min} and ${p.max} mm.`)}
              />
            ))}
          </div>
        </div>
      )}
      <ColorField
        label={g.type === 'halo' || g.type === 'metal' ? 'Face colour (painted)' : 'Face colour'}
        value={g.faceColor}
        fallback={g.type === 'halo' || g.type === 'metal' ? 'Bare metal' : 'Artwork colours'}
        previewColor={g.faceColor ?? (g.type === 'halo' || g.type === 'metal' ? '#c8d1d5' : firstArtHex)}
        autoColors={grpCols}
        palette={artworkPalette(a)}
        onCommit={(c, live) =>
          editArtwork(
            (x) => setGroup(x, g.id, { faceColor: c }),
            c ? `${g.name} face colour ${c}.` : `${g.name} uses default face finish.`,
            live ? `gface-${g.id}` : undefined,
          )
        }
      />
      {recipe.lit && (
        <>
          <ColorField
            label="Return wall colour"
            value={g.returnColor}
            fallback="Natural metal"
            previewColor={g.returnColor ?? '#c5ccd0'}
            autoColors={['metal']}
            palette={artworkPalette(a)}
            onCommit={(c, live) =>
              editArtwork(
                (x) => setGroup(x, g.id, { returnColor: c }),
                c ? `${g.name} returns painted ${c}.` : `${g.name} returns natural metal.`,
                live ? `gret-${g.id}` : undefined,
              )
            }
          />
          <GroupLightingField a={a} g={g} boardTemp={design.settings.ledTemp} />
        </>
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
        <button onClick={() => (selectGroup(g.id), viewer.current?.focusSelection())}>Frame in 3D</button>
        <button onClick={() => (selectGroup(g.id), isolate(null))}>Isolate</button>
      </div>
      <button className="full" onClick={() => toggleHidden(ids)}>
        Hide / show group
      </button>
    </div>
  );
}

// ——— Per-group LED circuit & colour controls ———
function GroupLightingField({ a, g, boardTemp }: { a: Artwork; g: ArtworkGroup; boardTemp: number }) {
  const light = g.light ?? {},
    on = light.on !== false,
    mode: LightMode = light.mode ?? 'white',
    temp = light.temp ?? boardTemp,
    dimming = light.dimming ?? 1;

  const patchLight = (p: NonNullable<typeof g.light> | null, msg?: string, coalesceKey?: string) =>
    editArtwork((x) => setGroup(x, g.id, { light: p }), msg, coalesceKey);

  return (
    <div className="recipe lighting-box">
      <div className="lighting-head">
        <div className="sectionlabel" style={{ margin: 0, border: 0, padding: 0 }}>
          GROUP LIGHTING CIRCUIT
        </div>
        <button
          type="button"
          className={'circuit-btn' + (on ? ' on' : '')}
          onClick={() => patchLight({ on: !on }, `${g.name} circuit ${!on ? 'on' : 'off'}.`)}
        >
          {on ? '● Circuit ON' : '○ Circuit OFF'}
        </button>
      </div>
      <label>
        LED module type
        <select
          value={mode}
          onChange={(e) => {
            const nextMode = e.target.value as LightMode;
            patchLight(
              {
                mode: nextMode,
                color: nextMode === 'rgb' ? (light.color ?? '#ff9e35') : light.color,
              },
              `${g.name} lighting mode set to ${nextMode}.`,
            );
          }}
        >
          <option value="white">White LEDs (Kelvin temperature)</option>
          <option value="rgb">Single RGB LED colour</option>
          <option value="artwork">RGB LEDs matching artwork colours</option>
        </select>
      </label>
      {mode === 'white' && (
        <label>
          Colour temperature
          <select
            value={temp}
            onChange={(e) => patchLight({ mode: 'white', temp: +e.target.value }, `${g.name}: ${e.target.value} K.`)}
          >
            {LED_TEMPS.map((k) => (
              <option key={k} value={k}>
                {k} K {k === boardTemp ? '(Board default)' : k <= 3000 ? 'warm' : k <= 4000 ? 'neutral' : 'cool'}
              </option>
            ))}
          </select>
        </label>
      )}
      {mode === 'rgb' && (
        <ColorField
          label="RGB LED glow colour"
          value={light.color ?? '#ff9e35'}
          fallback="#ff9e35"
          previewColor={light.color ?? '#ff9e35'}
          palette={artworkPalette(a)}
          onCommit={(c, live) =>
            patchLight({ mode: 'rgb', color: c ?? '#ff9e35' }, `${g.name} LED colour updated.`, live ? `grgb-${g.id}` : undefined)
          }
        />
      )}
      <label>
        Circuit output <output>{Math.round(dimming * 100)}%</output>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={dimming}
          onChange={(e) => patchLight({ dimming: +e.target.value }, undefined, `dim-${g.id}`)}
        />
      </label>
      {g.light && (
        <button className="link" onClick={() => patchLight(null, `${g.name} reset to board lighting.`)}>
          Reset to board lighting defaults
        </button>
      )}
    </div>
  );
}

// ——— One letter ———
function ElementProps({ a, e }: { a: Artwork; e: ArtworkElement }) {
  const design = useDesign(),
    g = a.groups.find((x) => x.id === e.group)!,
    placed = computeLayout(design).elements.find((x) => x.id === e.id),
    resolved = resolveParams(e.type, g),
    effCol = elementFaceColour(e, g, design.settings),
    inheritedCol = g.faceColor ?? (e.type === 'halo' || e.type === 'metal' ? 'metal' : e.color);
  return (
    <div className="props">
      <div className="props-title">
        <Swatch colors={[effCol]} /> <b>{e.name}</b> <small>in {g.name}</small>
      </div>
      <CrossSectionDiagram
        settings={design.settings}
        type={e.type}
        params={resolved}
        faceColor={effCol === 'metal' ? undefined : effCol}
        returnColor={g.returnColor}
      />
      <TextField
        label="Name"
        value={e.name}
        onCommit={(v) => editArtwork((x) => renameElement(x, e.id, v))}
      />
      <GroupSelect a={a} value={e.group} ids={[e.id]} />
      <div className="sectionlabel">LETTER CONSTRUCTION</div>
      <ConstructionPicker
        value={e.override ? e.type : 'inherit'}
        inheritLabel={`Same as group (${shortType[g.type]})`}
        onChange={(t) =>
          editArtwork(
            (x) => setElements(x, [e.id], { type: t }),
            t === 'inherit'
              ? `${e.name} now follows ${g.name} (${shortType[g.type]}).`
              : `${e.name} overridden to ${recipes[t].name}.`,
          )
        }
      />
      <ColorField
        label="Face colour"
        value={e.faceColor}
        fallback={g.faceColor ? 'Group colour' : e.type === 'halo' || e.type === 'metal' ? 'Bare metal' : 'Artwork colour'}
        previewColor={effCol === 'metal' ? '#c8d1d5' : effCol}
        autoColors={[inheritedCol]}
        palette={artworkPalette(a)}
        onCommit={(c, live) =>
          editArtwork(
            (x) => setElements(x, [e.id], { faceColor: c }),
            c ? `${e.name} face colour ${c}.` : `${e.name} reset to ${g.faceColor ? 'group' : 'artwork'} colour.`,
            live ? `eface-${e.id}` : undefined,
          )
        }
      />
      <div className="row">
        <button onClick={() => viewer.current?.focusSelection()}>Frame in 3D</button>
        <button onClick={() => isolate(e.id)}>Isolate</button>
      </div>
      <button className="full" onClick={() => toggleHidden([e.id])}>
        Hide / show letter
      </button>
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
  const design = useDesign(),
    els = a.elements.filter((e) => ids.includes(e.id)),
    groups = [...new Set(els.map((e) => e.group))].map((id) => a.groups.find((g) => g.id === id)!),
    explicitSet = new Set(els.map((e) => e.faceColor)),
    sharedExplicit = explicitSet.size === 1 ? [...explicitSet][0] : undefined,
    multiCols = [...new Set(els.map((e) => elementFaceColour(e, a.groups.find((g) => g.id === e.group), design.settings)))].slice(0, 4);
  return (
    <div className="props">
      <div className="props-title">
        <Swatch colors={multiCols} />{' '}
        <b>{ids.length} letters</b> <small>from {groups.map((g) => g.name).join(', ')}</small>
      </div>
      <GroupSelect a={a} value={groups.length === 1 ? groups[0].id : ''} ids={ids} />
      <div className="sectionlabel">CONSTRUCTION FOR {ids.length} LETTERS</div>
      <ConstructionPicker
        value=""
        inheritLabel="Same as their group"
        onChange={(t) =>
          editArtwork(
            (x) => setElements(x, ids, { type: t }),
            `${ids.length} letters updated.`,
          )
        }
      />
      <ColorField
        label="Face colour"
        value={sharedExplicit}
        fallback="Group / artwork colours"
        previewColor={sharedExplicit ?? (multiCols[0] === 'metal' ? '#c8d1d5' : multiCols[0])}
        autoColors={multiCols}
        palette={artworkPalette(a)}
        onCommit={(c, live) =>
          editArtwork(
            (x) => setElements(x, ids, { faceColor: c }),
            c ? `${ids.length} letters recoloured to ${c}.` : `${ids.length} letters reset to group/artwork colours.`,
            live ? `mface-${ids.join(',')}` : undefined,
          )
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

// Colour picker with live 3D preview, an Auto/Default finish chip, extracted artwork swatches,
// and standard signage acrylic/paint swatches.
function ColorField({
  label,
  value,
  fallback,
  previewColor,
  autoColors,
  palette,
  onCommit,
}: {
  label: string;
  value: string | undefined;
  fallback: string;
  previewColor?: string;
  autoColors?: string[];
  palette: string[];
  onCommit: (c: string | null, live?: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const normVal = value?.toLowerCase();
  const isFixedFallback = /^#[0-9a-f]{6}$/i.test(fallback);
  const pickerHex = /^#[0-9a-f]{6}$/i.test(normVal ?? '')
    ? normVal!
    : /^#[0-9a-f]{6}$/i.test(previewColor ?? '')
      ? previewColor!.toLowerCase()
      : isFixedFallback
        ? fallback.toLowerCase()
        : '#ffffff';

  const artColours = [...new Set(palette.map((c) => c.toLowerCase()))];
  const presetMap = new Map(SIGN_PRESETS.map((p) => [p.hex.toLowerCase(), p.name]));
  const allSwatches: { hex: string; name: string; fromArt: boolean }[] = [];
  for (const hex of artColours) {
    allSwatches.push({
      hex,
      name: presetMap.get(hex) ? `${presetMap.get(hex)} (Artwork)` : `Artwork colour ${hex.toUpperCase()}`,
      fromArt: true,
    });
  }
  for (const p of SIGN_PRESETS) {
    const hex = p.hex.toLowerCase();
    if (!allSwatches.some((s) => s.hex === hex)) {
      allSwatches.push({ hex, name: p.name, fromArt: false });
    }
  }

  const activeName = normVal
    ? (presetMap.get(normVal) ? `${presetMap.get(normVal)} (${normVal.toUpperCase()})` : normVal.toUpperCase())
    : fallback;

  return (
    <div className="colorfield">
      <div className="colorfield-head">
        <span>{label}</span>
        <small className="colorfield-status">{activeName}</small>
      </div>
      <div className="colorfield-controls">
        {!isFixedFallback && (
          <button
            type="button"
            className={'auto-chip' + (!normVal ? ' on' : '')}
            title={`Use ${fallback.toLowerCase()}`}
            onClick={() => onCommit(null, false)}
          >
            <Swatch colors={autoColors && autoColors.length ? autoColors : ['metal']} />
            <span>{fallback}</span>
          </button>
        )}
        <label className="color-well" title="Open custom colour picker">
          <input
            ref={input}
            type="color"
            value={pickerHex}
            aria-label={label}
            onChange={(e) => onCommit(e.target.value.toLowerCase(), true)}
          />
          <span
            className="color-well-preview"
            style={{
              background:
                !normVal && autoColors?.[0] === 'metal'
                  ? BARE_METAL_SWATCH
                  : normVal ?? previewColor ?? fallback,
            }}
          />
          <span className="color-well-label">{normVal ? normVal.toUpperCase() : 'Custom…'}</span>
        </label>
      </div>
      <div className="chips" role="group" aria-label={`${label} swatches`}>
        {allSwatches.slice(0, 14).map(({ hex, name, fromArt }) => {
          const active = normVal === hex || (!normVal && isFixedFallback && fallback.toLowerCase() === hex);
          const light = isLightHex(hex);
          return (
            <button
              key={hex}
              type="button"
              className={
                'chip' +
                (active ? ' on' : '') +
                (light ? ' light' : ' dark') +
                (fromArt ? ' art-chip' : '')
              }
              style={{ background: hex }}
              title={`${name} · ${hex.toUpperCase()}`}
              aria-label={`${name} ${hex}`}
              aria-pressed={active}
              onClick={() => onCommit(hex, false)}
            >
              {active && <span className="chip-check">✓</span>}
            </button>
          );
        })}
      </div>
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
