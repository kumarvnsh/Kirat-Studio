import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { exportPresentation, exportView, openProject, saveProject, viewer } from './actions.ts';
import {
  clearSelection,
  getState,
  isolate,
  redo,
  say,
  selectionIds,
  setView,
  showAll,
  toggleHidden,
  undo,
  useApp,
  useView,
} from './store.ts';
import { ToolsPanel, type ToolTab } from './ToolsPanel.tsx';
import { Viewport } from './Viewport.tsx';
import { Inspector } from './Inspector.tsx';
import { HelpModal, TourOverlay } from './OnboardingTour.tsx';

export function App() {
  const view = useView();
  const canUndo = useApp((s) => s.design.past.length > 0),
    canRedo = useApp((s) => s.design.future.length > 0);
  const traceCanvas = useRef<HTMLCanvasElement>(null);
  const [activeTab, setActiveTab] = useState<ToolTab>('art');
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  // Spline / Figma-style collapsible & resizable sidebars (desktop) + docked drawer (tablet/mobile)
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [leftW, setLeftW] = useState(280);
  const [rightW, setRightW] = useState(320);
  const [mobilePane, setMobilePane] = useState<'tools' | 'inspector' | 'canvas'>('tools');

  // CSS themes hang off body classes.
  useEffect(() => {
    document.body.classList.toggle('nightmode', view.environment !== 'day');
    document.body.classList.toggle('presentation', view.presentation);
  }, [view.environment, view.presentation]);

  // Trigger 3D canvas resize when panels open/close or resize.
  useEffect(() => {
    const id = requestAnimationFrame(() => viewer.current?.resize());
    return () => cancelAnimationFrame(id);
  }, [leftOpen, rightOpen, leftW, rightW, mobilePane]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const v = getState().view;
      const typing = (e.target as Element | null)?.matches?.(
        'input:not([type=checkbox]):not([type=range]), select, textarea',
      );
      if (e.key === 'Escape') {
        if (showHelp) {
          e.preventDefault();
          setShowHelp(false);
          return;
        }
        if (tourStep !== null) {
          e.preventDefault();
          setTourStep(null);
          return;
        }
        if (v.isolate || v.mode === 'bend') {
          e.preventDefault();
          showAll();
          return;
        }
        if (!typing && (v.selectionActive || v.selectedGroup)) {
          e.preventDefault();
          clearSelection();
          return;
        }
      }
      if (typing) return;
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && (k === 'z' || k === 'y')) {
        e.preventDefault();
        if (k === 'y' || e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        const bothClosed = !leftOpen && !rightOpen;
        setLeftOpen(bothClosed);
        setRightOpen(bothClosed);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '?') {
        e.preventDefault();
        setShowHelp((h) => !h);
      } else if (e.key === '[') {
        e.preventDefault();
        setLeftOpen((o) => !o);
      } else if (e.key === ']') {
        e.preventDefault();
        setRightOpen((o) => !o);
      } else if (k === 'f') {
        e.preventDefault();
        viewer.current?.focusSelection();
      } else if (k === 'i' || e.key === '/') {
        e.preventDefault();
        if (v.isolate) showAll();
        else isolate(v.selected);
      } else if (k === 'h') {
        const ids = selectionIds(v);
        if (ids.length) {
          e.preventDefault();
          toggleHidden(ids);
        }
      } else if (k === 'l') {
        e.preventDefault();
        setView({ lights: !v.lights });
      } else if (e.key === '1') {
        viewer.current?.fit('front');
      } else if (e.key === '2') {
        viewer.current?.fit('perspective');
      } else if (e.key === '3') {
        viewer.current?.fit('rear');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showHelp, tourStep, leftOpen, rightOpen]);

  const togglePresentation = () => {
    if (!view.presentation && (view.isolate || view.mode === 'bend')) showAll();
    setView((v) => ({ presentation: !v.presentation }));
  };

  const startResize = (side: 'left' | 'right') => (ev: PointerEvent<HTMLDivElement>) => {
    ev.preventDefault();
    const el = ev.currentTarget;
    el.setPointerCapture(ev.pointerId);
    const startX = ev.clientX;
    const startW = side === 'left' ? leftW : rightW;
    el.classList.add('dragging');
    const onMove = (m: globalThis.PointerEvent) => {
      const dx = m.clientX - startX;
      if (side === 'left') setLeftW(Math.max(230, Math.min(440, startW + dx)));
      else setRightW(Math.max(250, Math.min(480, startW - dx)));
    };
    const onUp = () => {
      el.classList.remove('dragging');
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  };

  const gridCols = view.presentation
    ? '1fr'
    : `${leftOpen ? `${leftW}px 5px ` : ''}minmax(0, 1fr)${rightOpen ? ` 5px ${rightW}px` : ''}`;

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
          <button
            className={tourStep !== null ? 'accent' : ''}
            onClick={() => {
              setLeftOpen(true);
              setRightOpen(true);
              setTourStep(tourStep === null ? 0 : null);
            }}
            title="Interactive 4-step walkthrough of Kirat Studio"
          >
            ✦ Quick tour
          </button>
          <button onClick={() => setShowHelp(true)} title="Keyboard shortcuts & signage glossary (?)">
            ? Shortcuts
          </button>
          <div className="btn-group">
            <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl/Cmd+Z)">
              ↶ Undo
            </button>
            <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl/Cmd+Shift+Z)">
              ↷ Redo
            </button>
          </div>
          <button id="save" onClick={saveProject}>
            Save ↓
          </button>
          <label className="button">
            Open
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
          <button onClick={exportPresentation} title="Day and night views with construction summary">
            Sheet ↓
          </button>
          <button className="accent" onClick={() => exportView(traceCanvas.current)}>
            Export ↗
          </button>
        </div>
      </header>
      <div
        className={'workspace mobile-pane-' + mobilePane + (!leftOpen ? ' left-closed' : '') + (!rightOpen ? ' right-closed' : '')}
        style={{ '--workspace-cols': gridCols } as React.CSSProperties}
      >
        {leftOpen && !view.presentation && (
          <>
            <ToolsPanel activeTab={activeTab} onTabChange={setActiveTab} />
            <div
              className="resizer"
              title="Drag to resize tools panel (double-click to reset)"
              onPointerDown={startResize('left')}
              onDoubleClick={() => setLeftW(280)}
            />
          </>
        )}
        <Viewport
          traceCanvas={traceCanvas}
          leftOpen={leftOpen}
          rightOpen={rightOpen}
          onToggleLeft={() => setLeftOpen((o) => !o)}
          onToggleRight={() => setRightOpen((o) => !o)}
        />
        {!view.presentation && (
          <div className="mobile-dock-bar">
            <button
              className={mobilePane === 'tools' ? 'active' : ''}
              onClick={() => setMobilePane('tools')}
            >
              🛠 Workflow (01–04)
            </button>
            <button
              className={mobilePane === 'inspector' ? 'active' : ''}
              onClick={() => setMobilePane('inspector')}
            >
              📐 Structure &amp; Inspector
            </button>
            <button
              className={mobilePane === 'canvas' ? 'active' : ''}
              onClick={() => setMobilePane('canvas')}
            >
              ⛶ Full 3D View
            </button>
          </div>
        )}
        {rightOpen && !view.presentation && (
          <>
            <div
              className="resizer"
              title="Drag to resize inspector panel (double-click to reset)"
              onPointerDown={startResize('right')}
              onDoubleClick={() => setRightW(320)}
            />
            <Inspector />
          </>
        )}
      </div>
      {tourStep !== null && (
        <TourOverlay
          stepIndex={tourStep}
          onStep={setTourStep}
          onClose={() => setTourStep(null)}
          onTabChange={(t) => {
            setActiveTab(t);
            setMobilePane(tourStep === 1 ? 'inspector' : 'tools');
          }}
        />
      )}
      {showHelp && (
        <HelpModal
          onClose={() => setShowHelp(false)}
          onStartTour={() => {
            setLeftOpen(true);
            setRightOpen(true);
            setTourStep(0);
          }}
        />
      )}
    </>
  );
}
