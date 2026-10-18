import { bendScheduleCSV, fabricationPlan } from '../fabrication/plan.ts';
import type { StripSchedule } from '../fabrication/bending.ts';
import { download, setMode } from './actions.ts';
import { getState, say, select, setFabrication, setView, useApp, useDesign, useView } from './store.ts';

const saveText = (text: string, name: string, type: string) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  download(url, name);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export async function exportCutFiles() {
  try {
    const state = getState();
    if (!state.design.present.artwork) return say('Import artwork before exporting cut files.');
    const { planToDXF } = await import('../fabrication/dxf.ts');
    const plan = fabricationPlan(state.design.present, state.fabrication);
    saveText(planToDXF(plan, state.design.present.settings), 'kirat-cut-files.dxf', 'application/dxf');
    say('DXF exported in mm. Parts are not nested; machine calibration is not modelled.');
  } catch (error) { say('DXF export failed: ' + (error as Error).message); }
}
export function exportBendSchedule() {
  const state = getState();
  if (!state.design.present.artwork) return say('Import artwork before exporting a bend schedule.');
  saveText(bendScheduleCSV(fabricationPlan(state.design.present, state.fabrication)), 'kirat-bend-schedule.csv', 'text/csv');
  say('CSV exported. Geometric schedule; no machine calibration.');
}

export function MakePanel() {
  const design = useDesign(),
    view = useView(),
    fab = useApp((s) => s.fabrication);
  const plan = fabricationPlan(design, fab),
    strips = plan.strips.find((s) => s.element === view.selected);
  const num = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    set: (v: number) => void,
  ) => (
    <label>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const v = +e.target.value;
          if (Number.isFinite(v) && v >= min && v <= max) set(v);
        }}
      />
    </label>
  );
  return (
    <section className="panel active">
      <div className="eyebrow">FABRICATION PREVIEW</div>
      <h2>From outline to parts.</h2>
      <p className="muted">
        Derived from the approved outlines, which are never changed. Geometric preview: no bend allowance,
        springback or machine calibration yet.
      </p>

      <div className="sectionlabel">CUTTING</div>
      <label>
        Method
        <select
          value={fab.cut.method}
          onChange={(e) =>
            setFabrication((f) => ({ ...f, cut: { ...f.cut, method: e.target.value as 'router' | 'laser' } }))
          }
        >
          <option value="router">CNC router (tool radius compensation)</option>
          <option value="laser">Laser (half-kerf compensation)</option>
        </select>
      </label>
      <div className="pair">
        {fab.cut.method === 'router'
          ? num('Tool Ø mm', fab.cut.toolDiameter, 0.5, 25, 0.5, (v) =>
              setFabrication((f) => ({ ...f, cut: { ...f.cut, toolDiameter: v } })),
            )
          : num('Kerf mm', fab.cut.kerf, 0, 2, 0.05, (v) =>
              setFabrication((f) => ({ ...f, cut: { ...f.cut, kerf: v } })),
            )}
        {num('Min. stroke mm', fab.cut.minStroke, 0, 20, 0.5, (v) =>
          setFabrication((f) => ({ ...f, cut: { ...f.cut, minStroke: v } })),
        )}
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={view.toolpaths}
          onChange={(e) => {
            setView({ toolpaths: e.target.checked });
            if (e.target.checked) setMode('2d');
          }}
        />{' '}
        Show tool paths in the 2D view
      </label>
      {plan.issues.length ? (
        plan.issues.map((x) => (
          <div key={x.element} className="callout warn" role="button" onClick={() => select(x.element)}>
            <b>{x.name}</b> ({x.group})
            {x.issues.map((i, k) => (
              <div key={k}>{i.message}</div>
            ))}
          </div>
        ))
      ) : (
        <p className="muted">No cutting issues at these settings.</p>
      )}

      <div className="sectionlabel">RETURN STRIPS</div>
      <div className="pair">
        {num('Ignore bends below °', fab.bend.minAngle, 0.5, 20, 0.5, (v) =>
          setFabrication((f) => ({ ...f, bend: { ...f.bend, minAngle: v } })),
        )}
        {num('Joint overlap mm', fab.bend.overlap, 0, 100, 1, (v) =>
          setFabrication((f) => ({ ...f, bend: { ...f.bend, overlap: v } })),
        )}
        {num('Group bends within mm', fab.bend.curveSpacing, 1, 100, 1, (v) =>
          setFabrication((f) => ({ ...f, bend: { ...f.bend, curveSpacing: v } })),
        )}
        {num('Corner from °', fab.bend.cornerAngle, 5, 90, 1, (v) =>
          setFabrication((f) => ({ ...f, bend: { ...f.bend, cornerAngle: v } })),
        )}
      </div>
      {strips ? (
        strips.schedules.map((sc, i) => <Strip key={i} sc={sc} index={i + 1} />)
      ) : (
        <p className="muted">Select a lit letter to see its strips.</p>
      )}
      <p className="muted">
        {plan.strips.reduce((n, s) => n + s.schedules.length, 0)} strips ·{' '}
        {(
          plan.strips.reduce((n, s) => n + s.schedules.reduce((m, x) => m + x.cutLength, 0), 0) / 1000
        ).toFixed(2)}{' '}
        m cut length in total.
      </p>

      <div className="sectionlabel">EXPORT</div>
      <button
        className="full accent"
        onClick={async () => {
          const { planToDXF } = await import('../fabrication/dxf.ts'); // maker.js loads only when needed
          saveText(
            planToDXF(plan, getState().design.present.settings),
            'kirat-cut-files.dxf',
            'application/dxf',
          );
          say('DXF exported: outlines, compensated cut paths, flat strips and bend lines, in mm.');
        }}
      >
        Cut files (DXF) ↓
      </button>
      <button
        className="full"
        onClick={() => {
          saveText(bendScheduleCSV(plan), 'kirat-bend-schedule.csv', 'text/csv');
          say('Bend schedule exported as CSV.');
        }}
      >
        Bend schedule (CSV) ↓
      </button>
      <p className="muted">
        DXF layers: *-OUTLINE (approved), *-CUT (compensated), STRIP, BEND-CONVEX, BEND-CONCAVE. Parts sit at
        their sign positions; nesting is not done yet.
      </p>
    </section>
  );
}

// Flat strip with bend stations: orange = convex (toward the outside), blue = concave; shaded = curve.
function Strip({ sc, index }: { sc: StripSchedule; index: number }) {
  const W = 230,
    H = 26,
    k = W / sc.cutLength;
  const rows = sc.segments.filter((g) => g.kind !== 'straight');
  return (
    <div className="strip">
      <div>
        <b>
          {sc.contour === 'outer' ? 'Outer' : 'Counter'} strip {index}
        </b>{' '}
        · {sc.cutLength.toFixed(0)} mm × {sc.height} mm ·{' '}
        {sc.segments.filter((g) => g.kind === 'corner').length} corners,{' '}
        {sc.segments.filter((g) => g.kind === 'curve').length} curves
      </div>
      <svg
        width={W}
        height={H + 4}
        viewBox={`0 0 ${W} ${H + 4}`}
        role="img"
        aria-label="Flat strip with bend lines"
      >
        <rect x={0.5} y={2} width={W - 1} height={H} fill="#eef1ec" stroke="#9aa9a2" />
        {sc.segments.map((g, i) =>
          g.kind === 'curve' ? (
            <rect
              key={i}
              x={g.from * k}
              y={2}
              width={Math.max(1, (g.to - g.from) * k)}
              height={H}
              fill="#e8d7c0"
            />
          ) : null,
        )}
        {sc.stations.map((st, i) => (
          <line
            key={i}
            x1={st.at * k}
            x2={st.at * k}
            y1={2}
            y2={H + 2}
            stroke={st.direction === 'convex' ? '#d7843e' : '#3d7fa8'}
            strokeWidth={st.angle >= 30 ? 1.4 : 0.6}
          />
        ))}
      </svg>
      <table className="stack">
        <tbody>
          {rows.slice(0, 8).map((g, i) => (
            <tr key={i}>
              <td>
                {g.kind === 'corner'
                  ? `Corner at ${g.at.toFixed(0)} mm`
                  : `Curve ${g.from.toFixed(0)}–${g.to.toFixed(0)} mm`}
                <small>{g.direction}</small>
              </td>
              <td>
                {g.angle.toFixed(0)}°{g.kind === 'curve' ? ` · R ${g.radius.toFixed(0)}` : ''}
              </td>
            </tr>
          ))}
          {rows.length > 8 && (
            <tr>
              <td colSpan={2}>
                <small>+ {rows.length - 8} more in the CSV / DXF</small>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
