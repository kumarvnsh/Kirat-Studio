import { ArtworkPanel } from './ArtworkPanel.tsx';
import { useEffect, useState } from 'react';
import {
  checkSettings,
  defaultSettings,
  LAYER_COUNT,
  LAYERS,
  numericSettings,
  type DesignSettings,
  type NumericKey,
} from '../domain/project.ts';
import { readUpload, textArtworkURL } from '../artwork/import.ts';
import { boardStack, computeLayout, MODULE_W, PSU_LOADING, PSU_W } from '../domain/layout.ts';
import { bom } from '../domain/bom.ts';
import { kelvinToHex, LED_TEMPS } from '../domain/lighting.ts';
import {
  applySceneChanges,
  hasBackup,
  importImage,
  importSvg,
  loadKiratSample,
  restoreBackup,
  retrace,
  setMode,
} from './actions.ts';
import {
  editDesign,
  getState,
  say,
  setTrace,
  setView,
  showAll,
  useApp,
  useDesign,
  useView,
} from './store.ts';
import { assemblySteps } from '../domain/assembly.ts';
import { MakePanel } from './MakePanel.tsx';
import { CrossSectionDiagram } from './ConstructionDiagram.tsx';
import { ScrubInput, UnitSelector } from './ScrubInput.tsx';
import { formatAllUnits, formatInUnit } from '../domain/units.ts';

export type ToolTab = 'art' | 'board' | 'build' | 'make';

export function StackTable({ settings }: { settings: DesignSettings }) {
  const unit = useView().unit ?? 'mm';
  const { layers, front } = boardStack(settings);
  const totalDepth = +(front - layers[0].z0).toFixed(2);
  return (
    <table className="stack">
      <tbody>
        {layers.map((l) => {
          const mm = +(l.z1 - l.z0).toFixed(2);
          return (
            <tr key={l.layer} title={formatAllUnits(mm)}>
              <td>{l.name}</td>
              <td>
                {formatInUnit(mm, unit)}
                <small>{formatAllUnits(mm)}</small>
              </td>
            </tr>
          );
        })}
        <tr title={formatAllUnits(totalDepth)}>
          <td>
            <b>Board depth</b>
          </td>
          <td>
            <b>{formatInUnit(totalDepth, unit)}</b>
            <small>{formatAllUnits(totalDepth)}</small>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

// Independent controls: LED colour is part of the design (undoable); dimming and exposure are view only.
export function LightingControls() {
  const view = useView(),
    ledTemp = useDesign().settings.ledTemp;
  return (
    <>
      <div className="sectionlabel">LIGHTING</div>
      <label>
        LED colour
        <select
          value={ledTemp}
          onChange={(e) =>
            editDesign(
              (d) => ({ ...d, settings: { ...d.settings, ledTemp: +e.target.value } }),
              `LED colour set to ${e.target.value} K.`,
            )
          }
        >
          {(LED_TEMPS as readonly number[]).includes(ledTemp) ? null : (
            <option value={ledTemp}>{ledTemp} K</option>
          )}
          {LED_TEMPS.map((k) => (
            <option key={k} value={k}>
              {k} K {k <= 3000 ? 'warm white' : k <= 4000 ? 'neutral white' : 'cool white'}
            </option>
          ))}
        </select>
        <i className="swatch" style={{ background: kelvinToHex(ledTemp) }} />
      </label>
      <label>
        Dimming <output>{Math.round(view.dimming * 100)}%</output>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={view.dimming}
          onChange={(e) => setView({ dimming: +e.target.value })}
        />
      </label>
      <label>
        Camera exposure{' '}
        <output>
          {view.exposure > 0 ? '+' : ''}
          {view.exposure} EV
        </output>
        <input
          type="range"
          min={-2}
          max={2}
          step={0.25}
          value={view.exposure}
          onChange={(e) => setView({ exposure: +e.target.value })}
        />
      </label>
      <p className="muted">
        Time of day and sign power are above the scene. Emission doesn't change with time of day; the camera
        exposes for the surroundings, as a photo would. Presentation preview, not calibrated against photos.
      </p>
    </>
  );
}

export function PowerSummary() {
  const p = computeLayout(useDesign()).power;
  if (!p.cables.length) return null;
  return (
    <>
      <div className="sectionlabel">POWER (PLACEHOLDER RATINGS)</div>
      <table className="stack">
        <tbody>
          <tr>
            <td>
              Connected load
              <small>{MODULE_W} W per module</small>
            </td>
            <td>≈ {p.loadW.toFixed(0)} W</td>
          </tr>
          <tr>
            <td>
              Power supplies
              <small>
                {PSU_W} W each, ≤ {PSU_LOADING * 100}% loading
              </small>
            </td>
            <td>{p.psus.length}</td>
          </tr>
          <tr>
            <td>Cable runs</td>
            <td>{p.cables.length}</td>
          </tr>
        </tbody>
      </table>
      {p.warnings.map((w) => (
        <div key={w} className="callout warn">
          {w}
        </div>
      ))}
    </>
  );
}

export function PartsList() {
  const design = useDesign();
  const rows = bom(design);
  const fmt = (q: number, unit: string) => (unit === 'pcs' ? q : q.toFixed(2)) + ' ' + unit;
  return (
    <>
      <div className="sectionlabel">PARTS (PRELIMINARY)</div>
      <table className="stack parts">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} title={r.material + ' · ' + r.note}>
              <td>
                {r.item}
                <small>{r.material}</small>
              </td>
              <td>
                {r.estimate ? '≈ ' : ''}
                {fmt(r.qty, r.unit)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">
        Nominal quantities: no waste, seams, joining allowances or nesting. ≈ marks placeholder rules (LED
        grid, fixings, returns without allowance).
      </p>
    </>
  );
}
