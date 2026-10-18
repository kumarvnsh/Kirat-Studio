import { useRef, type ReactNode } from 'react';
import { exportPresentation, exportView, hasBackup, openProject, restoreBackup, saveProject } from './actions.ts';
import { exportCutFiles, exportBendSchedule } from './MakePanel.tsx';
import { redo, say, undo, useApp, useDesign, useView } from './store.ts';

function Menu({ title, children }: { title: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  return <details className="studio-menu" ref={ref}
    onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) e.currentTarget.open = false; }}
    onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); e.currentTarget.open = false; e.currentTarget.querySelector('summary')?.focus(); } }}>
    <summary>{title} <span aria-hidden="true">⌄</span></summary>
    <div className="menu-content" onClick={e => { if ((e.target as Element).closest('button')) { if (ref.current) ref.current.open = false; } }}>{children}</div>
  </details>;
}
export function WorkspaceHeader({ onPresent, onHelp, onTour, traceCanvas }: {
  onPresent: () => void; onHelp: () => void; onTour: () => void; traceCanvas: HTMLCanvasElement | null;
}) {
  const view = useView(), design = useDesign(), status = useApp(s => s.saveStatus);
  const canUndo = useApp(s => s.design.past.length > 0), canRedo = useApp(s => s.design.future.length > 0);
  const file = useRef<HTMLInputElement>(null);
  return <header className="studio-header">
    <div className="studio-brand"><span className="brand-mark">K</span><span>KIRAT <b>STUDIO</b><small>THE SIGN MAKER'S WORKSPACE</small></span></div>
    <div className="studio-project"><b>Kirat Creations</b><span className={'save-state ' + status}><i />{status === 'saving' ? 'Saving…' : status === 'error' ? 'Save failed — keep a copy' : status === 'saved' ? 'Saved in this browser' : 'Local project'}</span></div>
    <div className="studio-header-actions">
      {!view.presentation && <><Menu title="Project"><button onClick={() => file.current?.click()}>Open project <small>Load a saved JSON file</small></button><button onClick={saveProject}>Save project copy <small>Download a backup</small></button>{hasBackup() && <button onClick={restoreBackup}>Restore previous session</button>}</Menu>
      <Menu title="Help"><button onClick={onTour}>Quick tour</button><button onClick={onHelp}>Shortcuts & glossary</button><a href="https://kirat-signage-atlas.kumarvnsh.chatgpt.site" target="_blank" rel="noreferrer">Research atlas ↗</a></Menu>
      <div className="undo-actions"><button onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (⌘Z)">↶</button><button onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (⌘⇧Z)">↷</button></div></>}
      <button className="present-button" onClick={onPresent}>{view.presentation ? 'Exit presentation' : 'Present'}</button>
      <Menu title="Export"><div className="export-state">{design.artwork?.approved ? 'Artwork reviewed' : 'Artwork review pending'}<small>Concept preview · Not production approval</small></div>
        <button disabled={!design.artwork} onClick={() => exportView(traceCanvas)}>Current view image <small>PNG · Current canvas</small></button>
        <button disabled={!design.artwork || view.mode !== '3d'} onClick={exportPresentation}>Day/night presentation sheet <small>PNG · Requires 3D view</small></button>
        <button disabled={!design.artwork} onClick={exportCutFiles}>Cut files <small>DXF · mm · Not nested</small></button>
        <button disabled={!design.artwork} onClick={exportBendSchedule}>Bend schedule <small>CSV · Geometric schedule</small></button>
      </Menu>
    </div>
    <input ref={file} type="file" accept=".json,application/json" hidden onChange={async e => {
      const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
      try { if (f.size > 16e6) throw Error('Project is too large.'); await openProject(await f.text()); }
      catch (error) { say('Could not open project: ' + (error as Error).message); }
    }} />
  </header>;
}
