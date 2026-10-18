import { useEffect } from 'react';
import { setMode } from './actions.ts';
import { getState, selectGroup } from './store.ts';
import type { ToolTab } from './ToolsPanel.tsx';

export type TourStep = {
  tab: ToolTab;
  focus: 'left' | 'right' | 'center';
  eyebrow: string;
  title: string;
  body: string;
  tips: string[];
};

export const TOUR_STEPS: TourStep[] = [
  {
    tab: 'art',
    focus: 'left',
    eyebrow: 'STEP 1 OF 4 · UPLOAD & TRACE',
    title: 'Start with your logo or sample artwork',
    body: 'In Design, choose Import / replace artwork. Use an SVG for original vectors, or a PNG/JPG to reconstruct contours. Review outlines in 2D before choosing constructions.',
    tips: [
      'The import dialog includes Kirat sample and Type text to experiment.',
      'Check "I reviewed the artwork outlines" in the import dialog after reviewing.',
    ],
  },
  {
    tab: 'board',
    focus: 'right',
    eyebrow: 'STEP 2 OF 4 · STRUCTURE & CONSTRUCTIONS',
    title: 'Organize groups & pick 3D constructions visually',
    body: 'Select Board, a group or a shape from Layers on the left. Its properties appear on the right. Choose Change under Construction to compare visual references; expand Anatomy for live project layers.',
    tips: [
      'Drag and drop letters between groups or double-click any name to rename it.',
      'Each lit group has its own LED circuit (White Kelvin, single RGB colour, or Match Artwork).',
    ],
  },
  {
    tab: 'build',
    focus: 'center',
    eyebrow: 'STEP 3 OF 4 · DAY/NIGHT & ASSEMBLY',
    title: 'Preview illumination & piece-by-piece assembly',
    body: 'Switch to Assembly for named steps, playback, layer visibility and an exploded view. Time of day and sign power remain independent controls above the canvas.',
    tips: [
      'Double-click any 3D part (or press F) to zoom the camera onto it.',
      'Press I to isolate the selected part, or Esc to restore the complete sign.',
    ],
  },
  {
    tab: 'make',
    focus: 'left',
    eyebrow: 'STEP 4 OF 4 · FABRICATION & PRESENTATION',
    title: 'Check CNC toolpaths, bend strips & export sheets',
    body: 'Open Fabrication to find a part, inspect its outline and tool paths, or review a return strip and bend schedule. Use Export for PNG, presentation sheet, DXF and CSV outputs.',
    tips: [
      'Select a return strip, then choose Forming study to animate its element contours.',
      'Choose Present for a clean client view, or Export → Day/night presentation sheet.',
    ],
  },
];

export function TourOverlay({
  stepIndex,
  onStep,
  onClose,
  onTabChange,
}: {
  stepIndex: number;
  onStep: (next: number) => void;
  onClose: () => void;
  onTabChange: (tab: ToolTab) => void;
}) {
  const step = TOUR_STEPS[stepIndex] ?? TOUR_STEPS[0];

  useEffect(() => {
    onTabChange(step.tab);
    document.body.setAttribute('data-tour-focus', step.focus);
    if (stepIndex === 1) {
      const firstGroup = getState().design.present.artwork?.groups[0];
      if (firstGroup) selectGroup(firstGroup.id);
    } else if (stepIndex === 2) {
      setMode('3d');
    }
    return () => {
      document.body.removeAttribute('data-tour-focus');
    };
  }, [stepIndex, step.tab, step.focus, onTabChange]);

  return (
    <div className="tour-card" role="dialog" aria-label="Quick interactive tour">
      <div className="tour-top">
        <span className="tour-eyebrow">{step.eyebrow}</span>
        <button className="tour-close" onClick={onClose} title="Close tour (Esc)">
          ✕
        </button>
      </div>
      <h3>{step.title}</h3>
      <p>{step.body}</p>
      <ul className="tour-tips">
        {step.tips.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
      <div className="tour-footer">
        <div className="tour-dots">
          {TOUR_STEPS.map((_, i) => (
            <button
              key={i}
              className={'tour-dot' + (i === stepIndex ? ' active' : '')}
              onClick={() => onStep(i)}
              aria-label={`Go to step ${i + 1}`}
            />
          ))}
        </div>
        <div className="tour-actions">
          {stepIndex > 0 && (
            <button onClick={() => onStep(stepIndex - 1)}>← Previous</button>
          )}
          {stepIndex < TOUR_STEPS.length - 1 ? (
            <button className="accent" onClick={() => onStep(stepIndex + 1)}>
              Next step →
            </button>
          ) : (
            <button className="accent" onClick={onClose}>
              Finish tour ✓
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function HelpModal({
  onClose,
  onStartTour,
}: {
  onClose: () => void;
  onStartTour: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Shortcuts and signage guide">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="eyebrow" style={{ marginBottom: 4 }}>
              QUICK REFERENCE &amp; SIGNAGE GLOSSARY
            </div>
            <h2>How to navigate &amp; build in Kirat Studio</h2>
          </div>
          <button onClick={onClose} title="Close (Esc)">
            ✕ Close
          </button>
        </div>

        <div className="modal-grid">
          <div className="modal-col">
            <div className="sectionlabel" style={{ marginTop: 0 }}>
              3D &amp; 2D MOUSE / TOUCH CONTROLS
            </div>
            <table className="stack shortcut-table">
              <tbody>
                <tr>
                  <td>
                    <b>Left-drag / 1-finger drag</b>
                  </td>
                  <td>Orbit 3D camera around sign</td>
                </tr>
                <tr>
                  <td>
                    <b>Right-drag / 2-finger drag</b>
                  </td>
                  <td>Pan camera across board</td>
                </tr>
                <tr>
                  <td>
                    <b>Scroll wheel / Pinch</b>
                  </td>
                  <td>Zoom in &amp; out smoothly</td>
                </tr>
                <tr>
                  <td>
                    <b>Click any letter / part</b>
                  </td>
                  <td>Select &amp; inspect properties</td>
                </tr>
                <tr>
                  <td>
                    <b>Ctrl/Cmd or Shift + Click</b>
                  </td>
                  <td>Multi-select letters</td>
                </tr>
                <tr>
                  <td>
                    <b>Double-click a 3D letter</b>
                  </td>
                  <td>Zoom camera to frame that letter</td>
                </tr>
                <tr>
                  <td>
                    <b>Click empty background</b>
                  </td>
                  <td>Clear selection &amp; inspect Board</td>
                </tr>
                <tr>
                  <td>
                    <b>Drag dimension label ↔</b>
                  </td>
                  <td>Scrub mm values live (Shift = 5×)</td>
                </tr>
              </tbody>
            </table>

            <div className="sectionlabel">KEYBOARD SHORTCUTS</div>
            <table className="stack shortcut-table">
              <tbody>
                <tr>
                  <td>
                    <kbd>F</kbd>
                  </td>
                  <td>Frame selected part(s) / Fit board</td>
                </tr>
                <tr>
                  <td>
                    <kbd>I</kbd> or <kbd>/</kbd>
                  </td>
                  <td>Isolate selected letter(s) or group</td>
                </tr>
                <tr>
                  <td>
                    <kbd>H</kbd>
                  </td>
                  <td>Hide / show selected element(s)</td>
                </tr>
                <tr>
                  <td>
                    <kbd>L</kbd>
                  </td>
                  <td>Toggle sign LED power On / Off</td>
                </tr>
                <tr>
                  <td>
                    <kbd>1</kbd> · <kbd>2</kbd> · <kbd>3</kbd>
                  </td>
                  <td>Front · 3D Perspective · Rear camera</td>
                </tr>
                <tr>
                  <td>
                    <kbd>[</kbd> · <kbd>]</kbd> · <kbd>⌘/Ctrl + \</kbd>
                  </td>
                  <td>Toggle Left Tools · Right Inspector · Both</td>
                </tr>
                <tr>
                  <td>
                    <kbd>Esc</kbd>
                  </td>
                  <td>Clear selection / Exit isolation / Show all</td>
                </tr>
                <tr>
                  <td>
                    <kbd>⌘/Ctrl + Z</kbd>
                  </td>
                  <td>Undo / Redo (+ Shift) design edit</td>
                </tr>
                <tr>
                  <td>
                    <kbd>?</kbd>
                  </td>
                  <td>Toggle this help &amp; glossary modal</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="modal-col">
            <div className="sectionlabel" style={{ marginTop: 0 }}>
              SIGNAGE CONSTRUCTION GLOSSARY
            </div>
            <div className="glossary-list">
              <div>
                <b>ACP Fascia &amp; MS Frame</b>
                <p>
                  The primary sign board: an Aluminium Composite Panel (ACP, typically 3–4 mm) clad over a welded
                  Mild Steel (MS) hollow-tube frame and closed at the rear with a Galvanized Iron (GI) sheet.
                </p>
              </div>
              <div>
                <b>Front-lit vs. Halo-lit Channel Letters</b>
                <p>
                  <b>Front-lit</b> letters have metal side walls (returns) and a translucent opal acrylic face that
                  glows forward. <b>Halo-lit</b> letters use an opaque metal face, a clear acrylic back, and standoff
                  spacers so LEDs wash a soft halo onto the ACP fascia behind the letter.
                </p>
              </div>
              <div>
                <b>Full Acrylic &amp; Front + Halo</b>
                <p>
                  <b>Full acrylic</b> letters have solvent-bonded acrylic sides and faces so both the front and edges
                  illuminate. <b>Front + Halo</b> combines a glowing opal face with a clear back on standoffs.
                </p>
              </div>
              <div>
                <b>Return Depth, Gauge &amp; Trim Cap</b>
                <p>
                  <b>Return depth</b> (e.g. 50–80 mm) is the 3D letter cavity height housing the LEDs. <b>Gauge</b> is
                  the return strip wall thickness. <b>Trim cap</b> is the lip securing the acrylic face to the return.
                </p>
              </div>
              <div>
                <b>Tool Radius &amp; Kerf Compensation (Fabrication)</b>
                <p>
                  CNC router bits (e.g. Ø 3 mm) and lasers remove material width. In Fabrication, Kirat Studio offsets
                  cutting paths outside outer contours and inside holes without altering your approved artwork.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button
            className="accent"
            onClick={() => {
              onClose();
              onStartTour();
            }}
          >
            ✦ Start 4-step interactive tour
          </button>
          <button onClick={onClose}>Got it</button>
        </div>
      </div>
    </div>
  );
}
