import { lazy, Suspense, useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { exportView, openProject, saveProject, viewer } from './actions.ts';
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
import { LightingControls, type ToolTab } from './ToolsPanel.tsx';
import { ArtworkPanel } from './ArtworkPanel.tsx';
import { StructureTree } from './Structure.tsx';
import { WorkspaceHeader } from './WorkspaceHeader.tsx';
import { Dialog } from './Dialog.tsx';
import { UnitSelector } from './ScrubInput.tsx';
import { AssemblyProvider, AssemblySteps, AssemblyDetails, AssemblyControls } from './AssemblyWorkspace.tsx';
import { FabricationProvider, FabricationParts, FabricationPreview, FabricationSettings } from './FabricationWorkspace.tsx';
import { useDesign } from './store.ts';
import { formatDimsInUnit } from '../domain/units.ts';
import type { ViewState } from '../domain/project.ts';
import { Viewport } from './Viewport.tsx';
import { Inspector } from './Inspector.tsx';
import { HelpModal, TourOverlay } from './OnboardingTour.tsx';
const PresentationWorkspace = lazy(() => import('./presentation/PresentationWorkspace.tsx').then(m => ({ default: m.PresentationWorkspace })));

export function App() {
  const view = useView();
  const canUndo = useApp((s) => s.design.past.length > 0),
    canRedo = useApp((s) => s.design.future.length > 0);
  const traceCanvas = useRef<HTMLCanvasElement>(null);
  const [taskMode, setTaskMode] = useState<'design' | 'assembly' | 'fabrication'>('design');
  const [showImport, setShowImport] = useState(false);
  const [showPreviewSettings, setShowPreviewSettings] = useState(false);
  const [previewHeight, setPreviewHeight] = useState(45);
  const design = useDesign(), saveStatus = useApp(s => s.saveStatus), message = useApp(s => s.message);
  const savedEditor = useRef<{ view: ViewState; position: number[]; target: number[] } | null>(null);
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  // Spline / Figma-style collapsible & resizable sidebars (desktop) + docked drawer (tablet/mobile)
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [leftW, setLeftW] = useState(230);
  const [rightW, setRightW] = useState(310);
  const [mobilePane, setMobilePane] = useState<'tools' | 'inspector' | 'canvas'>('tools');

  // CSS themes hang off body classes.
  useEffect(() => {
    document.body.classList.remove('nightmode');
    document.body.classList.toggle('presentation', view.presentation);
  }, [view.environment, view.presentation]);

  // Trigger 3D canvas resize when panels open/close or resize.
  useEffect(() => {
    const id = requestAnimationFrame(() => viewer.current?.resize());
    return () => cancelAnimationFrame(id);
  }, [leftOpen, rightOpen, leftW, rightW, mobilePane, taskMode, previewHeight]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const v = getState().view;
      if (document.querySelector('dialog[open]')) return;
      const typing = (e.target as Element | null)?.matches?.(
        'input:not([type=checkbox]):not([type=range]), select, textarea',
      );
      if (e.key === 'Escape') {
        if (v.presentation) { e.preventDefault(); togglePresentation(); return; }
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
      if (v.presentation && e.key !== 'Escape' && e.key !== 'l') return;
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
  }, [showHelp, tourStep, leftOpen, rightOpen, view.presentation]);

  const togglePresentation = () => {
    const scene = viewer.current;
    if (!view.presentation) {
      savedEditor.current = { view: { ...view, layers: [...view.layers], selection: [...view.selection], hidden: [...view.hidden] }, position: scene?.camera.position.toArray() ?? [], target: scene?.controls.target.toArray() ?? [] };
      setView({ presentation: true, mode: '3d', isolate: false, step: 99, layers: view.layers.map(() => true), explode: 0 });
    } else {
      const snapshot = savedEditor.current;
      setView(snapshot ? { ...snapshot.view, presentation: false } : { presentation: false });
      if (snapshot && scene) setTimeout(() => {
        scene.resize();
        if (snapshot.position.length) scene.camera.position.fromArray(snapshot.position);
        if (snapshot.target.length) scene.controls.target.fromArray(snapshot.target);
        scene.controls.update();
      }, 100);
      savedEditor.current = null;
    }
  };
  const taskViews = useRef<Partial<Record<'design' | 'assembly' | 'fabrication', Partial<ViewState>>>>({});
  const changeTask = (mode: 'design' | 'assembly' | 'fabrication') => {
    if (mode === taskMode) return;
    const current = getState().view;
    taskViews.current[taskMode] = { mode: current.mode, step: current.step, layers: [...current.layers], explode: current.explode, isolate: current.isolate, hidden: [...current.hidden] };
    setTaskMode(mode);
    const saved = taskViews.current[mode];
    if (saved) setView(saved);
    else if (mode === 'assembly') setView({ mode: '3d', step: 99, layers: current.layers.map(()=>true), explode: 0, isolate: false, hidden: [] });
    else setView({ mode: '3d', isolate: false, step: 99, layers: current.layers.map(()=>true), explode: 0 });

  };
  const startVerticalResize = (event: PointerEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    el.setPointerCapture(event.pointerId);
    const startY = event.clientY, initial = previewHeight;
    const move = (e: globalThis.PointerEvent) => setPreviewHeight(Math.max(25, Math.min(65, initial + (e.clientY - startY) / window.innerHeight * 100)));
    const end = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', end); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end, { once: true });
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
      if (side === 'left') setLeftW(Math.max(200, Math.min(Math.min(360, window.innerWidth - rightW - 340), startW + dx)));
      else setRightW(Math.max(280, Math.min(Math.min(440, window.innerWidth - leftW - 340), startW - dx)));
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

  const tourNavigate = useCallback((tab: ToolTab) => {
    setTaskMode(tab==='make'?'fabrication':tab==='build'?'assembly':'design');
    setMobilePane(tab==='board'?'inspector':'tools');
  }, []);
  const gridCols = view.presentation
    ? '1fr'
    : `${leftOpen ? `${leftW}px 5px ` : ''}minmax(0, 1fr)${rightOpen ? ` 5px ${rightW}px` : ''}`;

  return <div className={'studio-shell' + (view.presentation ? ' is-presenting' : '')}>
    <WorkspaceHeader onPresent={togglePresentation} onHelp={() => setShowHelp(true)} onTour={() => { setTaskMode('design'); setTourStep(0); setLeftOpen(true); setRightOpen(true); }} traceCanvas={traceCanvas.current} taskMode={taskMode} onPreviewSettings={()=>setShowPreviewSettings(true)} />
    {!view.presentation && <nav className="studio-task-nav" aria-label="Workspace"><div className="task-tabs">{(['design','assembly','fabrication'] as const).map((mode,i)=><button key={mode} aria-current={taskMode===mode?'page':undefined} className={taskMode===mode?'active':''} onClick={()=>changeTask(mode)}><small>0{i+1}</small>{mode[0].toUpperCase()+mode.slice(1)}</button>)}</div><span className="task-description">{taskMode==='design'?'Shape your sign.':taskMode==='assembly'?'Understand every layer.':'Prepare the details.'}</span></nav>}
    <AssemblyProvider active={taskMode==='assembly' && !view.presentation}><FabricationProvider>
    <div className={'workspace studio-workspace mode-'+taskMode+' mobile-pane-'+mobilePane+(!leftOpen?' left-closed':'')+(!rightOpen?' right-closed':'')}
      style={{ '--workspace-cols':gridCols, '--preview-height':previewHeight+'%' } as React.CSSProperties}>
      {!view.presentation && leftOpen && <><aside className="studio-rail">
        <div hidden={taskMode!=='design'}><div className="panel-heading"><span className="eyebrow">ARTWORK & LAYERS</span><h2>A sign of your own.</h2></div><button className="import-artwork full" onClick={()=>setShowImport(true)}>＋ {design.artwork?'Import / replace artwork':'Import artwork'}</button><StructureTree />
          <div className="artwork-source"><span className="source-icon">◇</span><b>{design.artwork?.origin==='vector'?'SVG · Original vectors':'Traced artwork'}</b><p>{design.artwork?.elements.length??0} shapes · {design.artwork?.groups.length??0} groups</p><span className={design.artwork?.approved?'status-good':'status-pending'}>{design.artwork?.approved?'✓ Artwork reviewed':'Artwork review pending'}</span><button className="text-button" onClick={()=>{setView({mode:'2d'});}}>Review outlines →</button></div>
        </div><div hidden={taskMode!=='assembly'}><AssemblySteps /></div><div hidden={taskMode!=='fabrication'}><FabricationParts /></div>
      </aside><div className="resizer" role="separator" aria-label="Resize left panel" onPointerDown={startResize('left')} onDoubleClick={()=>setLeftW(230)} /></>}
      <Viewport traceCanvas={traceCanvas} leftOpen={leftOpen} rightOpen={rightOpen} taskMode={taskMode}
        onToggleLeft={()=>setLeftOpen(!leftOpen)} onToggleRight={()=>setRightOpen(!rightOpen)}
        onPreviewSettings={()=>setShowPreviewSettings(true)} onBackToFabrication={()=>{setView({mode:'3d',isolate:false});setTaskMode('fabrication');}}
        overlay={taskMode==='fabrication' && view.mode!=='bend' && !view.presentation?<FabricationPreview />:undefined}
        footer={taskMode==='assembly' && !view.presentation?<AssemblyControls />:undefined} />
      {!view.presentation && <><div className="vertical-resizer" onPointerDown={startVerticalResize} role="separator" aria-label="Resize preview" />
        <div className="mobile-dock-bar"><button className={mobilePane==='tools'?'active':''} onClick={()=>{setLeftOpen(true);setMobilePane('tools');}}>{taskMode==='design'?'Layers':taskMode==='assembly'?'Steps':'Parts'}</button><button className={mobilePane==='inspector'?'active':''} onClick={()=>{setRightOpen(true);setMobilePane('inspector');}}>Properties</button><button className={mobilePane==='canvas'?'active':''} onClick={()=>setMobilePane('canvas')}>Preview ⛶</button></div></>}
      {!view.presentation && rightOpen && <><div className="resizer" role="separator" aria-label="Resize properties panel" onPointerDown={startResize('right')} onDoubleClick={()=>setRightW(310)} /><aside className="studio-properties">
        <div hidden={taskMode!=='design'}><Inspector /></div><div hidden={taskMode!=='assembly'}><AssemblyDetails /></div><div hidden={taskMode!=='fabrication'}><FabricationSettings /></div>
      </aside></>}
      {view.presentation && <Suspense fallback={<div role="status">Loading client presentation…</div>}><PresentationWorkspace /></Suspense>}
    </div></FabricationProvider></AssemblyProvider>
    {!view.presentation && <footer className="studio-status"><div className={'save-state '+saveStatus}><i />{saveStatus==='saving'?'Saving…':saveStatus==='error'?<button onClick={saveProject}>Save failed · Download a copy</button>:saveStatus==='saved'?'Saved in this browser':'Local project'}</div><span className="status-message" role="status">{message}</span><span className="board-size">{formatDimsInUnit(design.settings.width,design.settings.height,view.unit??'mm')}</span><UnitSelector compact /></footer>}
    {showImport && <Dialog title="Artwork & outline review" onClose={()=>setShowImport(false)}><ArtworkPanel onReview={()=>setShowImport(false)} /></Dialog>}
    {showPreviewSettings && <Dialog title="Preview lighting" onClose={()=>setShowPreviewSettings(false)}><LightingControls /></Dialog>}
    {tourStep!==null && <TourOverlay stepIndex={tourStep} onStep={setTourStep} onClose={()=>setTourStep(null)} onTabChange={tourNavigate} />}
    {showHelp && <Dialog title="Shortcuts & signage guide" onClose={()=>setShowHelp(false)} wide><HelpModal onClose={()=>setShowHelp(false)} onStartTour={()=>{setShowHelp(false);setTourStep(0);}} /></Dialog>}
  </div>;
}
