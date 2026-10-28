import { StackTable } from './ToolsPanel.tsx';
import { defaultSettings } from '../domain/project.ts';
import { getState, setView } from './store.ts';
import { unitToMm } from '../domain/units.ts';
import { selectionScope } from './selection.ts';
import { resizeArtwork } from '../editor/resizeArtwork.ts';
// Right-hand panel: the structure tree, then properties for whatever is selected —
// the backing board, a whole group, one letter, or several letters.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { computeLayout, type ElementLayout } from '../domain/layout.ts';
import { kelvinToHex, LED_TEMPS } from '../domain/lighting.ts';
import { checkParams, frontLit, recipes, resolveParams, panelIntegrated } from '../domain/recipes.ts';
import {
  checkSettings,
  DAY_NIGHT_COLOUR,
  defaultRooftop,
  isRooftop,
  numericSettings,
  rooftopLimits,
  rooftopStructures,
  ROOFTOP_TYPES,
  type Mounting,
  type RooftopStructure,
  type Artwork,
  type ArtworkElement,
  type ArtworkGroup,
  type ConstructionType,
  type LightMode,
} from '../domain/project.ts';
import { formatAllUnits, formatDimsAllUnits, formatInUnit } from '../domain/units.ts';
import {
  artworkPalette,
  createGroup,
  moveElements,
  renameElement,
  renameGroup,
  setElements,
  setGroup,
} from '../editor/artworkOps.ts';
import { applySceneChanges, viewer } from './actions.ts';
import { ConstructionPicker, CrossSectionDiagram } from './ConstructionDiagram.tsx';
import { ScrubInput, UnitSelector } from './ScrubInput.tsx';
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
  const design = useDesign(), a = design.artwork, view = useView();
  const propsRoot = useRef<HTMLElement>(null);
  const scope = selectionScope(a, view), group = a?.groups.find(g => g.id === view.selectedGroup);
  useEffect(() => { propsRoot.current?.closest('.studio-properties')?.scrollTo({ top: 0 }); }, [scope.kind, scope.label, scope.ids.join(',')]);
  return <section className="inspector" ref={propsRoot}><div className="properties-heading"><span className="eyebrow">{scope.kind === 'empty' ? 'PROPERTIES' : scope.kind.toUpperCase() + (scope.ids.length ? ' · ' + scope.ids.length + ' SHAPES' : '')}</span></div>
    {!a ? <div className="empty-state"><h2>Make it yours.</h2><p>Import artwork to configure your sign.</p></div> :
      scope.kind === 'group' && group ? <GroupProps key={group.id} a={a} g={group} /> :
      scope.kind === 'multiple' ? <MultiProps key={scope.ids.join(',')} a={a} ids={scope.ids} /> :
      scope.kind === 'shape' ? <ElementProps key={scope.ids[0]} a={a} e={a.elements.find(e => e.id===scope.ids[0])!} /> : <BoardProps a={a} />}
    {view.isolate && <button className="full" onClick={() => showAll()}>Exit isolate · Show all</button>}
    <p className="inspector-disclaimer">Concept geometry. Lighting, fixings and tolerances need fabrication validation.</p>
  </section>;
}

// ——— Board overview & quick settings ———
function BoardProps({ a }: { a: Artwork }) {
  const design = useDesign(),
    s = design.settings,
    layout = computeLayout(design);
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
  const rooftop = isRooftop(s);
  // Switching to rooftop moves unsuitable constructions to front-lit and shows the roof scene.
  const setMounting = (next: Mounting | undefined) => {
    const settings = { ...s, mounting: next };
    const bad = checkSettings(settings);
    if (bad) return say(bad);
    let moved = 0;
    editDesign((d) => {
      let art = d.artwork;
      if (next && art) {
        for (const g of art.groups)
          if (!ROOFTOP_TYPES.includes(g.type)) {
            art = setGroup(art, g.id, { type: 'front', charDepth: null });
            moved++;
          }
        const odd = art.elements.filter((e) => !ROOFTOP_TYPES.includes(e.type)).map((e) => e.id);
        if (odd.length) art = setElements(art, odd, { type: 'inherit' });
        moved += odd.length;
      }
      return { ...d, settings, artwork: art };
    }, next ? 'Rooftop letters: the board is replaced by a steel support structure.' : 'Letters back on an ACP fascia board.');
    if (moved) say(`Rooftop letters: ${moved} group(s) or letter(s) needed a fascia and are now front-lit channel letters.`);
    if (next && getState().view.scenePreset !== 'studio') setView({ scenePreset: 'rooftop' });
  };
  const setRooftop = (patch: Partial<Mounting>, msg: string, coalesce = true) =>
    setSetting('mounting', { ...s.mounting!, ...patch }, msg, coalesce);
  return (
    <div className="props">
      <div className="props-title">
        <Swatch colors={[s.boardcolor]} /> <b>{rooftop ? 'Rooftop letters' : 'Board structure'}</b>{' '}
        <small>{a.groups.length} groups</small>
      </div>
      <label>
        Mounting
        <select
          value={rooftop ? 'rooftop' : 'fascia'}
          onChange={(e) => setMounting(e.target.value === 'rooftop' ? (s.mounting ?? defaultRooftop()) : undefined)}
        >
          <option value="fascia">Letters on an ACP fascia board</option>
          <option value="rooftop">Rooftop letters on a steel structure</option>
        </select>
      </label>
      {rooftop && (
        <>
          <label>
            Support structure
            <select
              value={s.mounting!.structure}
              onChange={(e) =>
                setRooftop(
                  { structure: e.target.value as RooftopStructure },
                  `${rooftopStructures[e.target.value as RooftopStructure]} structure.`,
                  false,
                )
              }
            >
              {Object.entries(rooftopStructures).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                  {k === 'beam' ? ' · letters on a rail' : k === 'braced' ? ' · post and brace per letter' : ' · truss behind the letters'}
                </option>
              ))}
            </select>
          </label>
          <div className="pair">
            <ScrubInput
              label="Letters above roof"
              min={rooftopLimits.clearance[0]}
              max={rooftopLimits.clearance[1]}
              step={10}
              value={s.mounting!.clearance}
              onChange={(v, scrubbing) => setRooftop({ clearance: v }, 'Height above roof updated.', scrubbing)}
            />
            <ScrubInput
              label="Max post spacing"
              min={rooftopLimits.spacing[0]}
              max={rooftopLimits.spacing[1]}
              step={50}
              value={s.mounting!.spacing}
              onChange={(v, scrubbing) => setRooftop({ spacing: v }, 'Post spacing updated.', scrubbing)}
            />
          </div>
          <p className="muted">
            {layout.structure.length} members · {layout.feet.length} base plates. A layout guide only: wind
            load, roof fixing and the steel design need an engineer’s sign-off.
          </p>
        </>
      )}


      <div className="pair">
        <ScrubInput
          label={rooftop ? 'Sign width' : 'Board width'}
          min={numericSettings.width.min}
          max={numericSettings.width.max}
          step={numericSettings.width.step}
          value={s.width}
          onChange={(v, scrubbing) => setSetting('width', v, 'Board width updated.', scrubbing)}
          onInvalid={() => say(`Board width must be between ${numericSettings.width.min} and ${numericSettings.width.max} mm.`)}
        />
        <ScrubInput
          label={rooftop ? 'Sign height' : 'Board height'}
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
      {a.groups.length > 1 && (
        <ScrubInput
          label="Space between groups"
          min={0}
          max={2500}
          step={1}
          value={Math.max(0, layout.boardGroupGap)}
          onChange={(v, scrubbing) =>
            setSetting(
              'groupSpacing',
              +(v - layout.naturalBoardGroupGap).toFixed(1),
              `Space between groups set to ${formatSelectedUnit(v)}.`,
              scrubbing,
            )
          }
        />
      )}
      {!rooftop && <ColorField
        label="ACP fascia finish"
        value={s.boardcolor}
        fallback="#243843"
        previewColor={s.boardcolor}
        palette={artworkPalette(a)}
        onCommit={(c, live) => setSetting('boardcolor', c ?? '#243843', 'ACP fascia colour updated.', live)}
      />}


      <p className="muted">
        Select any <b>Group</b> or <b>Shape</b> from Layers (or directly in the 3D scene) to configure its
        character height, width, depth, spacing, and lighting circuit.
      </p>
      <details className="property-details"><summary>Group dimensions overview</summary>      <div className="recipe">
        <div className="sectionlabel">GROUP DIMENSIONS</div>
        <table className="stack">
          <tbody>
            {a.groups.map((grp) => {
              const gm = layout.groupMetrics[grp.id];
              if (!gm) return null;
              return (
                <tr
                  key={grp.id}
                  style={{ cursor: 'pointer' }}
                  title="Click to edit this group's character height, width, depth, and spacing"
                  onClick={() => selectGroup(grp.id)}
                >
                  <td>
                    <b>{grp.name}</b> · {shortType[grp.type]}
                    <small>
                      Char H: {formatSelectedUnit(gm.charHeight)}
                      <br />
                      Char W: {formatSelectedUnit(gm.charWidth)} · Depth: {formatSelectedUnit(gm.charDepth)}
                      <br />
                      Letter gap: {formatSelectedUnit(gm.letterGap)}
                      {a.groups.length > 1 ? ` · Group gap: ${formatSelectedUnit(gm.groupGap)}` : ''}
                    </small>
                  </td>
                  <td>Edit →</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
</details>
      <details className="property-details"><summary>Anatomy &amp; material thicknesses</summary><CrossSectionDiagram settings={s} /></details>
      <details className="property-details"><summary>Board structure &amp; materials</summary><StackTable settings={s} /><div className="pair">{(rooftop ? ['frame','framewall'] as const : ['acp','gi','frame','framewall','backing'] as const).map(key => {
        const r=numericSettings[key]; return <ScrubInput key={key} label={r.label} min={r.min} max={r.max} step={r.step} value={s[key]} onChange={(v,scrubbing)=>setSetting(key,v,r.label+' updated.',scrubbing)} />;
      })}</div><label className="check"><input type="checkbox" checked={s.keepart} onChange={e=>setSetting('keepart',e.target.checked)} />Preserve artwork colours</label><label>Uniform face colour<input type="color" value={s.facecolor} onChange={e=>{const facecolor=e.target.value;editDesign(d=>({...d,settings:{...d.settings,facecolor,keepart:false}}),'Uniform face colour updated.','uniform-face');}} /></label><button className="full" onClick={()=>editDesign(d=>({...d,settings:defaultSettings()}),'Board defaults restored.')}>Reset board defaults</button></details>
    </div>
  );
}

// ——— Group ———
function GroupProps({ a, g }: { a: Artwork; g: ArtworkGroup }) {
  const design = useDesign(),
    layout = computeLayout(design),
    gm = layout.groupMetrics[g.id],
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
      (x) =>
        setGroup(x, g.id, {
          params: { [key]: value },
          ...(key === 'depth' || key === 'thickness' ? { charDepth: null } : {}),
        }),
      `${g.name}: ${recipe.params[key].label} set to ${formatSelectedUnit(value)}.`,
      scrubbing ? `param-${g.id}-${key}` : undefined,
    );
  };
  const hasCustomSizing =
    g.charHeight !== undefined ||
    g.charWidth !== undefined ||
    g.charDepth !== undefined ||
    g.letterSpacing !== undefined ||
    g.groupGap !== undefined ||
    design.settings.groupSpacing !== undefined;
  const glowHex =
    g.light?.mode === 'rgb' && g.light.color
      ? g.light.color
      : kelvinToHex(g.light?.temp ?? design.settings.ledTemp);
  return (
    <div className="props">
      <div className="props-title">
        <Swatch colors={grpCols} /> <b>{g.name}</b> <small>group · {els.length} letters</small>
      </div>


      <details className="name-details"><summary>Rename group</summary><TextField
        label="Group name"
        value={g.name}
        onCommit={(v) => editArtwork((x) => renameGroup(x, g.id, v))}
      /></details>
      {gm && (
        <div className="recipe">
          <div className="sectionlabel">SIZE &amp; SPACING</div>
          <div className="pair">
            <SelectionSizing groupId={g.id} ids={ids} />

          </div>
          <div className="pair">
            {!panelIntegrated(g.type) && (<ScrubInput
              label="Character depth"
              min={0.15}
              max={200}
              step={0.5}
              value={gm.charDepth}
              onChange={(v, scrubbing) =>
                editArtwork(
                  (x) =>
                    setGroup(x, g.id, {
                      charDepth: v,
                      params: recipe.lit
                        ? { depth: Math.max(20, Math.min(200, Math.round(v))) }
                        : 'thickness' in recipe.params
                          ? {
                              thickness: Math.max(
                                recipe.params.thickness.min,
                                Math.min(recipe.params.thickness.max, v),
                              ),
                            }
                          : undefined,
                    }),
                  `${g.name} character depth set to ${formatSelectedUnit(v)}.`,
                  scrubbing ? `gcd-${g.id}` : undefined,
                )
              }
            />)}
            {els.length > 1 && (
              <ScrubInput
                label="Character spacing"
                min={0}
                max={1500}
                step={1}
                value={Math.max(0, gm.letterGap)}
                onChange={(v, scrubbing) =>
                  editArtwork(
                    (x) => setGroup(x, g.id, { letterSpacing: +(v - gm.naturalLetterGap).toFixed(1) }),
                    `${g.name} character spacing set to ${formatSelectedUnit(v)}.`,
                    scrubbing ? `gls-${g.id}` : undefined,
                  )
                }
              />
            )}
          </div>
          {a.groups.length > 1 && (
            <details className="property-details"><summary>Group positioning</summary><ScrubInput
              label="Space between groups"
              min={0}
              max={2500}
              step={1}
              value={Math.max(0, gm.groupGap)}
              onChange={(v, scrubbing) =>
                editArtwork(
                  (x) =>
                    setGroup(x, g.id, {
                      groupGap: +(v - gm.naturalGroupGap - (design.settings.groupSpacing ?? 0)).toFixed(1),
                    }),
                  `Space between ${g.name} and adjacent group set to ${formatSelectedUnit(v)}.`,
                  scrubbing ? `ggap-${g.id}` : undefined,
                )
              }
            /></details>
          )}
          {hasCustomSizing && (
            <button
              type="button"
              className="link"
              onClick={() =>
                editArtwork(
                  (x) =>
                    setGroup(x, g.id, {
                      charHeight: null,
                      charWidth: null,
                      charDepth: null,
                      letterSpacing: null,
                      groupGap: null,
                    }),
                  `${g.name} reset to natural artwork dimensions and spacing.`,
                )
              }
            >
              Reset character size &amp; spacing to artwork defaults
            </button>
          )}
        </div>
      )}
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
      {frontLit(g.type) && (
        <label className="check" title="Perforated day/night film over the opal face">
          <input
            type="checkbox"
            checked={!!g.dayNight}
            onChange={(e) =>
              editArtwork(
                (x) => setGroup(x, g.id, { dayNight: e.target.checked }),
                e.target.checked
                  ? `${g.name}: day/night face. It shows the face colour by day and lights white at night.`
                  : `${g.name}: plain lit face.`,
              )
            }
          />
          Day/night face · dark by day, white when lit at night
        </label>
      )}
      <ColorField
        label={
          g.dayNight && frontLit(g.type)
            ? 'Day colour (film)'
            : g.type === 'halo' || g.type === 'metal'
              ? 'Face colour (painted)'
              : 'Face colour'
        }
        value={g.faceColor}
        fallback={
          g.dayNight && frontLit(g.type)
            ? `Black ${DAY_NIGHT_COLOUR}`
            : g.type === 'halo' || g.type === 'metal'
              ? 'Bare metal'
              : 'Artwork colours'
        }
        previewColor={
          g.faceColor ??
          (g.dayNight && frontLit(g.type)
            ? DAY_NIGHT_COLOUR
            : g.type === 'halo' || g.type === 'metal'
              ? '#c8d1d5'
              : firstArtHex)
        }
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
          {!panelIntegrated(g.type) && (<ColorField
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
          />)}
          <details className="property-details"><summary>Group lighting</summary><GroupLightingField a={a} g={g} boardTemp={design.settings.ledTemp} /></details>
        </>
      )}
      {Object.keys(recipe.params).length > 0 && (
        <details className="property-details"><summary>Recipe dimensions</summary><div className="recipe">
          <div className="sectionlabel">{recipe.name.toUpperCase()} PARAMETERS (DRAG ↔ TO SCRUB)</div>
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
        </div></details>
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
      <details className="property-details"><summary>Anatomy &amp; material thicknesses</summary><CrossSectionDiagram
        settings={design.settings}
        type={g.type}
        params={resolved}
        faceColor={g.faceColor ?? (grpCols[0] === 'metal' ? undefined : grpCols[0])}
        returnColor={g.returnColor}
        glowColor={glowHex}
      /></details>
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
    layout = computeLayout(design),
    g = a.groups.find((x) => x.id === e.group)!,
    gm = layout.groupMetrics[g.id],
    placed = layout.elements.find((x) => x.id === e.id),
    resolved = resolveParams(e.type, g),
    effCol = elementFaceColour(e, g, design.settings),
    inheritedCol = g.faceColor ?? (e.type === 'halo' || e.type === 'metal' ? 'metal' : e.color);
  const placedW = placed ? +(placed.bounds[2] - placed.bounds[0]).toFixed(1) : 100,
    placedH = placed ? +(placed.bounds[3] - placed.bounds[1]).toFixed(1) : 100,
    recipe = recipes[e.type],
    placedDepth =
      e.charDepth ??
      (recipe.lit ? (placed?.params.depth ?? resolved.depth ?? 60) : (placed?.params.thickness ?? 0.15)),
    hasCharOverride =
      e.charHeight !== undefined ||
      e.charWidth !== undefined ||
      e.charDepth !== undefined ||
      e.letterSpacing !== undefined;
  return (
    <div className="props">
      <div className="props-title">
        <Swatch colors={[effCol]} /> <b>{e.name}</b> <small>in {g.name}</small>
      </div>


      <TextField
        label="Name"
        value={e.name}
        onCommit={(v) => editArtwork((x) => renameElement(x, e.id, v))}
      />
      <GroupSelect a={a} value={e.group} ids={[e.id]} />
      {placed && (
        <div className="recipe">
          <div className="sectionlabel">SIZE &amp; SPACING</div>
          <div className="pair">
            <SelectionSizing ids={[e.id]} />

          </div>
          <div className="pair">
            {!panelIntegrated(e.type) && (<ScrubInput
              label="Character depth"
              min={0.15}
              max={200}
              step={0.5}
              value={placedDepth}
              onChange={(v, scrubbing) =>
                editArtwork(
                  (x) => setElements(x, [e.id], { charDepth: v }),
                  `${e.name} depth set to ${formatSelectedUnit(v)}.`,
                  scrubbing ? `ecd-${e.id}` : undefined,
                )
              }
            />)}
            <ScrubInput
              label="Character X offset"
              min={-1000}
              max={1000}
              step={1}
              value={e.letterSpacing ?? 0}
              onChange={(v, scrubbing) =>
                editArtwork(
                  (x) => setElements(x, [e.id], { letterSpacing: v }),
                  `${e.name} spacing offset set to ${formatSelectedUnit(v)}.`,
                  scrubbing ? `els-${e.id}` : undefined,
                )
              }
            />
          </div>
          {hasCharOverride && (
            <button
              type="button"
              className="link"
              onClick={() =>
                editArtwork(
                  (x) =>
                    setElements(x, [e.id], {
                      charHeight: null,
                      charWidth: null,
                      charDepth: null,
                      letterSpacing: null,
                    }),
                  `${e.name} reset to group character dimensions and spacing.`,
                )
              }
            >
              Reset character size &amp; spacing to group defaults
            </button>
          )}
        </div>
      )}
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
      <details className="property-details"><summary>Anatomy &amp; material thicknesses</summary><CrossSectionDiagram
        settings={design.settings}
        type={e.type}
        params={{ ...resolved, ...(recipe.lit ? { depth: placedDepth } : { thickness: placedDepth }) }}
        faceColor={effCol === 'metal' ? undefined : effCol}
        returnColor={g.returnColor}
      /></details>
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
      <SelectionSizing ids={ids} />
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
            const g = a.groups.find((grp) => grp.id === v);
            editArtwork(
              (x) => setElements(moveElements(x, ids, v), ids, { type: 'inherit' }),
              `Moved to ${g?.name ?? v} (${g ? shortType[g.type] : ''}).`,
            );
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
    w = e.bounds[2] - e.bounds[0],
    h = e.bounds[3] - e.bounds[1],
    proj = Math.max(...e.parts.map((p) => p.z1)) - base,
    mm = (n: number) => +n.toFixed(2);
  return (
    <>
      <b>{e.name}</b>
      <br />
      <b>W × H:</b> {formatDimsAllUnits(w, h)}
      <br />
      {e.regions.length} region(s) / {holes} hole(s) · {(e.perimeter / 1000).toFixed(3)} m contour perimeter
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
                <td title={formatSelectedUnit(p.z1 - p.z0)}>{formatSelectedUnit(p.z1 - p.z0)}</td>
              </tr>
            ))}
          <tr>
            <td>
              <b>Projection (Depth)</b>
            </td>
            <td>
              <b>{formatSelectedUnit(proj)}</b>
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

function formatSelectedUnit(value: number) {
  return formatInUnit(value, getCurrentUnit());
}
function getCurrentUnit() { return getState().view.unit ?? 'mm'; }

function SelectionSizing({ ids, groupId }: { ids: string[]; groupId?: string }) {
  const design=useDesign(), view=useView(), layout=computeLayout(design);
  const [linked,setLinked]=useState(true), [error,setError]=useState('');
  const selected=ids.map(id=>layout.elements.find(e=>e.id===id)).filter(e=>!!e);
  if(!selected.length) return null;
  const gm=groupId?layout.groupMetrics[groupId]:null;
  const heights=selected.map(e=>e.bounds[3]-e.bounds[1]), widths=selected.map(e=>e.bounds[2]-e.bounds[0]);
  const height=gm?.charHeight??heights[0], width=gm?.charWidth??widths[0];
  const commit=(axis:'height'|'width',value:number,scrubbing=false)=>{
    try { const artwork=resizeArtwork(design,{ids,groupId},axis,value,linked);editArtwork(()=>artwork,'Selection resized.',scrubbing?'resize-'+(groupId??ids.join(','))+'-'+axis:undefined);setError(''); }
    catch(err){setError((err as Error).message);}
  };
  const mixed=(values:number[])=>!groupId&&values.some(v=>Math.abs(v-values[0])>.05);
  return <div className="selection-sizing"><div className="sizing-link"><span>Character size</span><button aria-pressed={linked} onClick={()=>setLinked(!linked)} title="Keep each shape’s current proportions">{linked?'↔ Linked':'↔ Unlinked'}</button></div>
    {ids.length>1&&!groupId&&<p className="muted">Scale from {selected[0].name}; each shape keeps its own dimensions.</p>}
    <div className="pair">{(['height','width'] as const).map(axis=>mixed(axis==='height'?heights:widths)?<MixedSize key={axis} label={axis==='height'?'Character height':'Character width'} onCommit={v=>commit(axis,v)} />:
      <ScrubInput key={axis} label={axis==='height'?'Character height':'Character width'} min={5} max={4000} step={.1} value={axis==='height'?height:width} onChange={(v,s)=>commit(axis,v,s)} />)}</div>
    {ids.length===1&&design.artwork&&<button className="text-button" onClick={()=>editArtwork(a=>setElements(a,ids,{charHeight:null,charWidth:null}),'Size reset to group.')}>Reset size to group</button>}
    {error&&<p className="field-error" role="alert">{error}</p>}
  </div>;
}
function MixedSize({label,onCommit}:{label:string;onCommit:(value:number)=>void}) {
  const unit=useView().unit??'mm';const [text,setText]=useState('');
  return <label>{label}<input type="number" placeholder="Mixed" value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){setText('');e.preventDefault();e.stopPropagation();}}} onBlur={()=>{if(text.trim()){onCommit(unitToMm(Number(text),unit));setText('');}}} /><small>{unit} · First shape is the scale anchor</small></label>;
}
