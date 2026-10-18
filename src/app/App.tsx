import { useEffect, useRef } from 'react';
import { exportView, openProject, saveProject } from './actions.ts';
import { getState, redo, setView, showAll, undo, useApp, useView, say } from './store.ts';
import { ToolsPanel } from './ToolsPanel.tsx';
import { Viewport } from './Viewport.tsx';
import { Inspector } from './Inspector.tsx';

export function App() {
  const view = useView();
  const canUndo = useApp((s) => s.design.past.length > 0),
    canRedo = useApp((s) => s.design.future.length > 0);
  const traceCanvas = useRef<HTMLCanvasElement>(null);

  // CSS themes hang off body classes.
  useEffect(() => {
    document.body.classList.toggle('nightmode', view.night);
    document.body.classList.toggle('presentation', view.presentation);
  }, [view.night, view.presentation]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const v = getState().view;
      if (e.key === 'Escape' && (v.isolate || v.mode === 'bend')) {
        e.preventDefault();
        showAll();
      }
      const typing = (e.target as Element).matches?.(
        'input:not([type=checkbox]):not([type=range]), select, textarea',
      );
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && !typing && (k === 'z' || k === 'y')) {
        e.preventDefault();
        if (k === 'y' || e.shiftKey) redo();
        else undo();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const togglePresentation = () => {
    if (!view.presentation && (view.isolate || view.mode === 'bend')) showAll();
    setView((v) => ({ presentation: !v.presentation }));
  };

  return (
    <>
      <header>
        <a className="brand" href="./">
          <span>K</span>
          <div>
            KIRAT <b>STUDIO</b>
            <small>SIGNAGE CONFIGURATOR / DESIGN STUDIO / V03</small>
          </div>
        </a>
        <div className="projectname">
          Kirat Creations <span>• Local project</span>
        </div>
        <div className="headbuttons">
          <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl/Cmd+Z)">
            ↶ Undo
          </button>
          <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl/Cmd+Shift+Z)">
            ↷ Redo
          </button>
          <button id="save" onClick={saveProject}>
            Save project ↓
          </button>
          <label className="button">
            Open project
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                try {
                  if (f.size > 16e6) throw Error('Project is too large.');
                  await openProject(await f.text(), 'Project opened. Undo history starts here.');
                } catch (err) {
                  say('Could not open project: ' + (err as Error).message);
                }
              }}
            />
          </label>
          <button id="present" onClick={togglePresentation}>
            {view.presentation ? 'Exit presentation' : 'Presentation'}
          </button>
          <button className="accent" onClick={() => exportView(traceCanvas.current)}>
            Export view ↗
          </button>
        </div>
      </header>
      <div className="workspace">
        <ToolsPanel />
        <Viewport traceCanvas={traceCanvas} />
        <Inspector />
      </div>
    </>
  );
}
