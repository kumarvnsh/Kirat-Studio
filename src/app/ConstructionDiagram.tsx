import { Dialog } from './Dialog.tsx';
import { useId, useState } from 'react';
import { ConstructionReference } from './ConstructionReference.tsx';
import { boardStack } from '../domain/layout.ts';
import type { ConstructionType, DesignSettings } from '../domain/project.ts';
import { frontLit, haloLit, recipes, VINYL_THICKNESS } from '../domain/recipes.ts';

export type ConstructionMeta = {
  type: ConstructionType;
  title: string;
  subtitle: string;
  badge: string;
  howItWorks: string;
  category: 'lit' | 'unlit' | 'utility';
};

export const CONSTRUCTION_META: ConstructionMeta[] = [
  {
    type: 'front',
    title: 'Front-lit',
    subtitle: 'Opaque metal sides + glowing acrylic front face',
    badge: 'Front glow',
    howItWorks: 'LEDs inside shine forward through the coloured acrylic face; metal sides stay dark.',
    category: 'lit',
  },
  {
    type: 'halo',
    title: 'Halo-lit (Back-lit)',
    subtitle: 'Solid metal face on standoffs + rear wall-wash glow',
    badge: 'Rear halo',
    howItWorks: 'Face is solid metal; LEDs shine backward onto the sign board to create a soft halo.',
    category: 'lit',
  },
  {
    type: 'fronthalo',
    title: 'Front + Halo',
    subtitle: 'Glowing front face + rear halo glow on standoffs',
    badge: 'Front + Rear',
    howItWorks: 'Combines an opal acrylic front face with a clear back on standoffs for dual glow.',
    category: 'lit',
  },
  {
    type: 'fullacrylic',
    title: 'Full Acrylic',
    subtitle: 'All-acrylic body — front face & side walls both glow',
    badge: '360° glow',
    howItWorks: 'Both the front face and the 3D side walls are cast acrylic so the whole letter glows.',
    category: 'lit',
  },
  {
    type: 'acrylic',
    title: 'Flat Acrylic',
    subtitle: 'Solid laser-cut cast acrylic letter (2–30 mm thick)',
    badge: 'Solid 3D',
    howItWorks: 'Unlit solid acrylic sheet cut to shape — clean glossy face and polished edges.',
    category: 'unlit',
  },
  {
    type: 'metal',
    title: 'Flat Metal',
    subtitle: 'Laser-cut brushed stainless or painted metal plate',
    badge: 'Metallic',
    howItWorks: 'Unlit solid metal plate (1–10 mm) mounted flush or raised on pin standoffs.',
    category: 'unlit',
  },
  {
    type: 'acplogo',
    title: 'ACP Cutout',
    subtitle: 'CNC-routed 3–6 mm aluminium composite shape',
    badge: 'Composite',
    howItWorks: 'Unlit aluminium skin over a dark core — economical flat dimensional lettering.',
    category: 'unlit',
  },
  {
    type: 'vinyl',
    title: 'Vinyl Film',
    subtitle: 'Flush 0.15 mm plotter-cut decal applied on board',
    badge: 'Flush decal',
    howItWorks: 'Thin adhesive film stuck directly onto the ACP board — best for small taglines.',
    category: 'unlit',
  },
  {
    type: 'omit',
    title: 'Excluded',
    subtitle: 'Hide this shape from 3D assembly and parts list',
    badge: 'Skip',
    howItWorks: 'Use this to ignore stray background marks or shapes you do not want fabricated.',
    category: 'utility',
  },
];

// 3D isometric letter "A" reference thumbnail on a dark sign fascia backdrop so the difference
// between Front-lit, Halo-lit, Front+Halo, Full Acrylic, Flat Cut, and Vinyl is unmistakable.
function Letter3DReferenceThumb({ type }: { type: ConstructionType }) {
  const uid = useId().replace(/:/g, '');
  const isFront = frontLit(type);
  const isHalo = haloLit(type);
  const isFullAcrylic = type === 'fullacrylic';
  const isFlat = type === 'acrylic' || type === 'metal' || type === 'acplogo';
  const isVinyl = type === 'vinyl';
  const isOmit = type === 'omit';
  const hasStandoff = type === 'halo' || type === 'fronthalo';

  // Extrusion offset (dx, dy) for 3D side returns: deeper for channel letters, thinner for flat cut
  const dx = isOmit || isVinyl ? 0 : isFlat ? (type === 'acrylic' ? -5 : -3.5) : -8.5;
  const dy = isOmit || isVinyl ? 0 : isFlat ? (type === 'acrylic' ? 3.5 : 2.5) : 5.5;

  // Front face position of the "A"
  const fx = isOmit || isVinyl ? 0 : hasStandoff ? 4 : 2;
  const fy = isOmit || isVinyl ? 0 : hasStandoff ? -3 : -1.5;

  // Outer "A" polygon points (centered around x=38, y=27)
  // Top apex: (34,9) -> (42,9), bottom-right: (50,41) -> (43,41), crossbar: (41,34)->(35,34), bottom-left: (33,41)->(26,41)
  const aOuter = (ox: number, oy: number) =>
    `${34 + ox},${9 + oy} ${42 + ox},${9 + oy} ${51 + ox},${41 + oy} ${43.5 + ox},${41 + oy} ${41.5 + ox},${33.5 + oy} ${34.5 + ox},${33.5 + oy} ${32.5 + ox},${41 + oy} ${25 + ox},${41 + oy}`;
  const aHole = (ox: number, oy: number) =>
    `M ${38 + ox} ${16.5 + oy} L ${40.6 + ox} ${27.5 + oy} L ${35.4 + ox} ${27.5 + oy} Z`;
  const aPath = (ox: number, oy: number) =>
    `M ${34 + ox} ${9 + oy} L ${42 + ox} ${9 + oy} L ${51 + ox} ${41 + oy} L ${43.5 + ox} ${41 + oy} L ${41.5 + ox} ${33.5 + oy} L ${34.5 + ox} ${33.5 + oy} L ${32.5 + ox} ${41 + oy} L ${25 + ox} ${41 + oy} Z ${aHole(ox, oy)}`;

  // 3D left & bottom return quads connecting back (fx+dx, fy+dy) to front (fx, fy)
  const leftSideQuad = `${25 + fx + dx},${41 + fy + dy} ${34 + fx + dx},${9 + fy + dy} ${34 + fx},${9 + fy} ${25 + fx},${41 + fy}`;
  const topRoofQuad = `${34 + fx + dx},${9 + fy + dy} ${42 + fx + dx},${9 + fy + dy} ${42 + fx},${9 + fy} ${34 + fx},${9 + fy}`;
  const leftFootBottom = `${25 + fx + dx},${41 + fy + dy} ${32.5 + fx + dx},${41 + fy + dy} ${32.5 + fx},${41 + fy} ${25 + fx},${41 + fy}`;
  const rightFootBottom = `${43.5 + fx + dx},${41 + fy + dy} ${51 + fx + dx},${41 + fy + dy} ${51 + fx},${41 + fy} ${43.5 + fx},${41 + fy}`;

  const sideFill = isFullAcrylic
    ? `url(#${uid}-sideGlow)`
    : type === 'metal'
      ? '#7c8b92'
      : type === 'acplogo'
        ? '#263238'
        : type === 'acrylic'
          ? '#b85d19'
          : '#45565e';

  const faceFill = isFront
    ? `url(#${uid}-frontGlow)`
    : type === 'halo'
      ? `url(#${uid}-darkMetal)`
      : type === 'metal'
        ? `url(#${uid}-brightMetal)`
        : type === 'acplogo'
          ? `url(#${uid}-acpFace)`
          : '#f28b30';

  return (
    <svg className="c-icon3d" viewBox="0 0 74 52" aria-hidden="true">
      <defs>
        {/* Halo rear wall-wash radial glow */}
        <radialGradient id={`${uid}-halo`} cx="50%" cy="52%" r="48%">
          <stop offset="0%" stopColor="#ffbe42" stopOpacity="1" />
          <stop offset="55%" stopColor="#ff931e" stopOpacity="0.65" />
          <stop offset="100%" stopColor="#ff931e" stopOpacity="0" />
        </radialGradient>
        {/* Glowing opal acrylic face */}
        <linearGradient id={`${uid}-frontGlow`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fffdf2" />
          <stop offset="45%" stopColor="#ffe094" />
          <stop offset="100%" stopColor="#ffaa33" />
        </linearGradient>
        {/* Glowing acrylic side return (for fullacrylic) */}
        <linearGradient id={`${uid}-sideGlow`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffd175" />
          <stop offset="100%" stopColor="#f0821d" />
        </linearGradient>
        {/* Opaque brushed dark metal face for Halo-lit contrast */}
        <linearGradient id={`${uid}-darkMetal`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4f6069" />
          <stop offset="50%" stopColor="#2c3940" />
          <stop offset="100%" stopColor="#1d272c" />
        </linearGradient>
        {/* Brushed stainless steel face for Flat Metal */}
        <linearGradient id={`${uid}-brightMetal`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f2f6f8" />
          <stop offset="45%" stopColor="#b8c4c9" />
          <stop offset="70%" stopColor="#e3eaed" />
          <stop offset="100%" stopColor="#8c9aa0" />
        </linearGradient>
        {/* ACP composite face */}
        <linearGradient id={`${uid}-acpFace`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#738b96" />
          <stop offset="100%" stopColor="#485e68" />
        </linearGradient>
      </defs>

      {/* Dark sign fascia background */}
      <rect x="1" y="1" width="72" height="50" rx="5" fill="#162630" />
      {/* Subtle fascia board grid line */}
      <line x1="1" y1="44" x2="73" y2="44" stroke="#233946" strokeWidth="1" />

      {isOmit ? (
        <g>
          <path
            d={aPath(0, 0)}
            fill="none"
            stroke="#7d9199"
            strokeWidth="1.5"
            strokeDasharray="2.5 2.5"
            fillRule="evenodd"
          />
          <circle cx="55" cy="14" r="7" fill="#b4442f" />
          <path d="M52.5 11.5 L57.5 16.5 M57.5 11.5 L52.5 16.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      ) : isVinyl ? (
        <g>
          {/* Flush 2D vinyl letter */}
          <path d={aPath(0, 0)} fill="#ff9e35" fillRule="evenodd" />
          {/* Little peeled decal corner cue */}
          <polygon points="46,9 51,14 45,14" fill="#ffe0b2" />
          <rect x="4" y="5" width="21" height="11" rx="2" fill="#253b47" />
          <text x="14.5" y="12.5" fontSize="6.2" fill="#b8cbd4" textAnchor="middle" fontWeight="700">
            2D FILM
          </text>
        </g>
      ) : (
        <g>
          {/* 1. Rear Halo Glow on the board (if Halo or Front+Halo) */}
          {isHalo && (
            <ellipse cx="36" cy="27" rx="27" ry="21" fill={`url(#${uid}-halo)`} />
          )}

          {/* Soft drop shadow on board for unlit letters */}
          {!isHalo && !isFront && (
            <path d={aPath(dx - 2, dy + 2)} fill="#091116" opacity="0.55" fillRule="evenodd" />
          )}

          {/* 2. Standoff pins between board and letter back (if Halo or Front+Halo) */}
          {hasStandoff && (
            <g stroke="#cbd5d8" strokeWidth="2" strokeLinecap="round">
              <line x1="21" y1="16" x2="29" y2="12" />
              <line x1="17" y1="39" x2="25" y2="35" />
            </g>
          )}

          {/* 3. Extruded 3D Side Return Walls */}
          <g fill={sideFill} stroke={isFullAcrylic ? '#ffbe42' : '#101c24'} strokeWidth="0.7" strokeLinejoin="round">
            <polygon points={aOuter(fx + dx, fy + dy)} />
            <polygon points={leftSideQuad} />
            <polygon points={topRoofQuad} />
            <polygon points={leftFootBottom} />
            <polygon points={rightFootBottom} />
          </g>

          {/* 4. Outer Front Glow Bloom (for Front-lit / Full Acrylic) */}
          {isFront && (
            <path
              d={aPath(fx, fy)}
              fill="none"
              stroke="#ffae33"
              strokeWidth="4.5"
              opacity="0.38"
              strokeLinejoin="round"
            />
          )}

          {/* 5. Front Face of the 3D Letter "A" */}
          <path
            d={aPath(fx, fy)}
            fill={faceFill}
            stroke={isFront ? '#ffffff' : type === 'halo' ? '#8ea0a8' : '#26353d'}
            strokeWidth={isFront ? '0.9' : '0.8'}
            fillRule="evenodd"
          />

          {/* Forward light sparkle rays if Front-lit */}
          {isFront && (
            <g stroke="#fff8d6" strokeWidth="1.3" strokeLinecap="round" opacity="0.9">
              <line x1="53" y1="14" x2="58" y2="11" />
              <line x1="55" y1="24" x2="61" y2="24" />
            </g>
          )}

          {/* Corner visual cue badge inside thumbnail */}
          <rect
            x="4"
            y="4"
            width={isFullAcrylic ? 25 : 22}
            height="10.5"
            rx="2"
            fill="#0e1a22cc"
          />
          <text
            x={isFullAcrylic ? 16.5 : 15}
            y="11.3"
            fontSize="6"
            fill={isFront || isHalo ? '#ffbe55' : '#b8cbd4'}
            textAnchor="middle"
            fontWeight="700"
          >
            {type === 'front'
              ? 'FACE LIT'
              : type === 'halo'
                ? 'BACK LIT'
                : type === 'fronthalo'
                  ? 'DUAL LIT'
                  : type === 'fullacrylic'
                    ? '360° LIT'
                    : type === 'metal'
                      ? 'METAL'
                      : type === 'acplogo'
                        ? 'ACP 3D'
                        : 'SOLID'}
          </text>
        </g>
      )}
    </svg>
  );
}

export function ConstructionPicker({ value, inheritLabel, onChange }: {
  value: ConstructionType | 'inherit' | ''; inheritLabel?: string;
  onChange: (next: ConstructionType | 'inherit') => void;
}) {
  const [open,setOpen]=useState(false);
  const selected=CONSTRUCTION_META.find(item=>item.type===value);
  return <div className="construction-choice"><button className="current-construction" onClick={()=>setOpen(true)} aria-haspopup="dialog">
    <span><b>{selected?.title ?? (value==='inherit'?'Same as group':'Mixed constructions')}</b><small>{selected?.badge ?? inheritLabel ?? 'Choose a construction'}</small></span><span className="change-label">Change ⌄</span></button>
    {selected&&<p className="construction-explanation">{selected.subtitle}</p>}
    {open&&<Dialog title="Choose a construction" wide onClose={()=>setOpen(false)}><p className="muted">Compare how the face, sides and rear light behave. Changing construction resets its recipe parameters; letter overrides remain unless explicitly changed.</p>
      <ConstructionOptions value={value} inheritLabel={inheritLabel} onChange={next=>{onChange(next);setOpen(false);}} />
      <p className="muted reference-note">AI-generated appearance references. Project dimensions and material layers are shown in the live anatomy diagram.</p>
    </Dialog>}
  </div>;
}

function ConstructionOptions({
  value,
  inheritLabel,
  onChange,
}: {
  value: ConstructionType | 'inherit' | '';
  inheritLabel?: string;
  onChange: (next: ConstructionType | 'inherit') => void;
}) {
  const renderGroup = (title: string, items: ConstructionMeta[]) => (
    <div className="c-group" key={title}>
      <div className="c-group-label">{title}</div>
      <div className="c-grid">
        {items.map((m) => {
          const active = value === m.type;
          return (
            <button
              key={m.type}
              type="button"
              className={'c-card' + (active ? ' active' : '')}
              onClick={() => onChange(m.type)}
              title={`${recipes[m.type].name}: ${m.howItWorks}`}
            >
              <ConstructionReference className="construction-reference" type={m.type} fallback={<Letter3DReferenceThumb type={m.type} />} />
              <div className="c-card-body">
                <div className="c-card-top">
                  <b>{m.title}</b>
                  <span className={'c-pill ' + m.category}>{m.badge}</span>
                </div>
                <small>{m.subtitle}</small>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="c-picker">
      {inheritLabel && (
        <button
          type="button"
          className={'c-inherit' + (value === 'inherit' ? ' active' : '')}
          onClick={() => onChange('inherit')}
        >
          <span>↩</span>
          <div>
            <b>{inheritLabel}</b>
            <small>Follow the parent group’s construction &amp; dimensions</small>
          </div>
        </button>
      )}
      {renderGroup(
        'Illuminated 3D Channel Letters',
        CONSTRUCTION_META.filter((m) => m.category === 'lit'),
      )}
      {renderGroup(
        'Non-Illuminated Flat / Cut Letters',
        CONSTRUCTION_META.filter((m) => m.category === 'unlit'),
      )}
      {renderGroup(
        'Other',
        CONSTRUCTION_META.filter((m) => m.category === 'utility'),
      )}
    </div>
  );
}

// Easy-to-understand 3D Letter Anatomy & Layer Reference Card:
// Left side shows an isometric 3D cutaway of the sign board + standoff + 3D letter + light direction;
// Right side lists the numbered Rear → Front layers with live millimetre dimensions.
export function CrossSectionDiagram({
  settings,
  type,
  params,
  faceColor,
  returnColor,
  glowColor = '#ffaa33',
}: {
  settings: DesignSettings;
  type?: ConstructionType;
  params?: Record<string, number>;
  faceColor?: string;
  returnColor?: string;
  glowColor?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const { layers: boardLayers, front: boardFront } = boardStack(settings);
  const boardDepth = +(boardFront - boardLayers[0].z0).toFixed(1);

  const p = type
    ? { ...Object.fromEntries(Object.entries(recipes[type].params).map(([k, v]) => [k, v.value])), ...params }
    : {};
  const standoff = p.standoff ?? 0;
  const depth = p.depth ?? 0;
  const face = p.face ?? 0;
  const trimcap = p.trimcap ?? 0;
  const gauge = p.gauge ?? 0.8;
  const flatThickness = type === 'vinyl' ? VINYL_THICKNESS : (p.thickness ?? 0);

  const isLit = type ? !!recipes[type].lit : false;
  const isFront = type ? frontLit(type) : false;
  const isHalo = type ? haloLit(type) : false;
  const isFullAcrylic = type === 'fullacrylic';

  const letterProjection =
    !type || type === 'omit'
      ? 0
      : isLit
        ? +(standoff + depth + face + (trimcap > 0 ? 1.2 : 0)).toFixed(1)
        : +(standoff + flatThickness).toFixed(1);

  const meta = type ? CONSTRUCTION_META.find((m) => m.type === type) : undefined;
  const resolvedFaceHex =
    type === 'halo' || type === 'metal'
      ? (faceColor ?? '#b8c4c9')
      : (faceColor ?? settings.facecolor);
  const resolvedSideHex = isFullAcrylic
    ? resolvedFaceHex
    : (returnColor ?? (type === 'acrylic' ? resolvedFaceHex : '#7c8d94'));

  // Build human-readable layer steps from Rear (Wall) -> Front (Viewer)
  const stackSteps: { num: string; title: string; detail: string; color: string }[] = [
    {
      num: '1',
      title: `ACP Sign Board (${boardDepth} mm)`,
      detail: `GI ${settings.gi} + MS frame ${settings.frame}${settings.backing > 0 ? ` + Backing ${settings.backing}` : ''} + ACP ${settings.acp} mm`,
      color: settings.boardcolor,
    },
  ];

  if (type && type !== 'omit') {
    if (type === 'vinyl') {
      stackSteps.push({
        num: '2',
        title: `Vinyl Decal (${VINYL_THICKNESS} mm)`,
        detail: 'Applied flush onto ACP fascia surface',
        color: resolvedFaceHex,
      });
    } else if (!isLit) {
      stackSteps.push({
        num: '2',
        title: standoff > 0 ? `Pin Standoffs (${standoff} mm gap)` : 'Flush Stud Mount (0 mm gap)',
        detail: standoff > 0 ? 'Raises letter off the ACP fascia' : 'Mounted directly against ACP face',
        color: '#90a0a6',
      });
      stackSteps.push({
        num: '3',
        title: `${recipes[type].name} (${flatThickness} mm)`,
        detail: `Solid cut sheet · ${letterProjection} mm total projection`,
        color: resolvedFaceHex,
      });
    } else {
      stackSteps.push({
        num: '2',
        title:
          standoff > 0
            ? `Standoff Gap (${standoff} mm)${isHalo ? ' + Halo Glow' : ''}`
            : 'Flush Mount on ACP (0 mm gap)',
        detail: isHalo
          ? `Clear ${p.back ?? 3} mm back washes LED halo onto board`
          : `Closed ${p.back ?? 5} mm back bolted to fascia`,
        color: isHalo ? glowColor : '#90a0a6',
      });
      stackSteps.push({
        num: '3',
        title: `3D Return Sides (${depth} mm deep)`,
        detail: isFullAcrylic
          ? `Glowing acrylic walls (${gauge} mm) + internal LEDs`
          : `${returnColor ? 'Painted' : 'Metal'} return strip (${gauge} mm wall) + LEDs`,
        color: resolvedSideHex,
      });
      stackSteps.push({
        num: '4',
        title:
          type === 'halo'
            ? `Solid Metal Face (${face} mm)`
            : `Glowing Acrylic Face (${face} mm)`,
        detail:
          type === 'halo'
            ? 'Opaque front blocks forward light for pure halo'
            : `${trimcap > 0 ? `${trimcap} mm trim cap · ` : ''}Shines forward`,
        color: isFront ? glowColor : resolvedFaceHex,
      });
    }
  }

  return (
    <div className="xsec-card">
      <div className="xsec-head">
        <span>3D LETTER ANATOMY (REAR → FRONT)</span>
        <b>
          {type && type !== 'omit'
            ? `Projection ${letterProjection} mm · Board ${boardDepth} mm`
            : `Board depth ${boardDepth} mm`}
        </b>
      </div>

      <div className="xsec-visual-row">
        {/* Left: Easy-to-read 3D Isometric Cutaway Illustration */}
        <svg className="xsec-svg" viewBox="0 0 156 122" role="img" aria-label="3D letter cutaway diagram">
          <defs>
            <radialGradient id={`${uid}-halo`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={glowColor} stopOpacity="0.95" />
              <stop offset="60%" stopColor={glowColor} stopOpacity="0.45" />
              <stop offset="100%" stopColor={glowColor} stopOpacity="0" />
            </radialGradient>
            <linearGradient id={`${uid}-frontBeam`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={glowColor} stopOpacity="0.7" />
              <stop offset="100%" stopColor={glowColor} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Dark studio backdrop */}
          <rect x="0" y="0" width="156" height="122" rx="6" fill="#15242d" />

          {/* Direction labels at bottom */}
          <text x="10" y="115" fontSize="6.5" fill="#89a0ab" fontWeight="600">
            ←① BOARD
          </text>
          <text x="148" y="115" fontSize="6.5" fill="#89a0ab" textAnchor="end" fontWeight="600">
            FRONT VIEWER →
          </text>

          {/* 1. Isometric Multi-layer Sign Board Slab on the left */}
          {/* MS Steel Frame rear layer */}
          <polygon points="10,24 24,14 24,88 10,98" fill="#46565e" stroke="#263339" strokeWidth="0.8" />
          {/* ACP Fascia front surface (angled isometric plane) */}
          <polygon
            points="24,14 58,24 58,98 24,88"
            fill={settings.boardcolor}
            stroke="#394d56"
            strokeWidth="0.9"
          />
          {/* ACP top thickness rim */}
          <polygon points="10,24 24,14 58,24 44,34" fill="#687b84" opacity="0.55" />

          {!type || type === 'omit' ? (
            <g>
              <text x="104" y="56" fontSize="7.5" fill="#9cb1ba" textAnchor="middle" fontWeight="600">
                {type === 'omit' ? 'Shape excluded' : 'Select a Group'}
              </text>
              <text x="104" y="68" fontSize="6.8" fill="#6f8792" textAnchor="middle">
                {type === 'omit' ? 'from 3D build' : 'or Letter above'}
              </text>
            </g>
          ) : (
            (() => {
              // Position of the 3D letter relative to the ACP fascia
              const gapX = standoff > 0 ? Math.min(20, Math.max(11, standoff * 0.4)) : 2;
              const bodyW =
                type === 'vinyl'
                  ? 3
                  : !isLit
                    ? Math.min(18, Math.max(7, flatThickness * 0.9))
                    : Math.min(34, Math.max(20, depth * 0.36));
              const lx = 44 + gapX;
              const fx = lx + bodyW;

              return (
                <g>
                  {/* Rear Halo Glow splashed on the ACP Fascia */}
                  {isHalo && (
                    <ellipse cx="46" cy="58" rx="22" ry="32" fill={`url(#${uid}-halo)`} />
                  )}

                  {/* Standoff pins if standoff > 0 */}
                  {standoff > 0 && (
                    <g stroke="#cbd5d8" strokeWidth="2.4" strokeLinecap="round">
                      <line x1="42" y1="36" x2={lx + 3} y2="36" />
                      <line x1="42" y1="78" x2={lx + 3} y2="78" />
                    </g>
                  )}

                  {/* Halo backward light arrows */}
                  {isHalo && (
                    <g stroke="#ffd166" strokeWidth="1.4" strokeLinecap="round">
                      <line x1={lx} y1="46" x2="36" y2="41" />
                      <line x1={lx} y1="58" x2="34" y2="58" />
                      <line x1={lx} y1="70" x2="36" y2="75" />
                    </g>
                  )}

                  {/* 3D Extruded Return Side Wall (isometric box/letter cutaway) */}
                  {type !== 'vinyl' && (
                    <>
                      {/* Top return wall */}
                      <polygon
                        points={`${lx},28 ${fx},28 ${fx + 10},20 ${lx + 10},20`}
                        fill={resolvedSideHex}
                        stroke="#111d24"
                        strokeWidth="0.9"
                      />
                      {/* Side return wall */}
                      <polygon
                        points={`${lx},28 ${fx},28 ${fx},86 ${lx},86`}
                        fill={resolvedSideHex}
                        stroke="#111d24"
                        strokeWidth="0.9"
                      />
                      {/* Cutaway window showing internal LEDs for illuminated letters */}
                      {isLit && (
                        <g>
                          <rect
                            x={lx + 3}
                            y="40"
                            width={Math.max(8, bodyW - 6)}
                            height="34"
                            rx="2"
                            fill="#101b22"
                            stroke="#384b54"
                            strokeWidth="0.7"
                          />
                          {/* 3 Glowing LED modules inside cavity */}
                          <circle cx={lx + 7} cy="47" r="2.5" fill={glowColor} />
                          <circle cx={lx + 7} cy="57" r="2.5" fill={glowColor} />
                          <circle cx={lx + 7} cy="67" r="2.5" fill={glowColor} />
                          <text
                            x={lx + bodyW / 2 + 1}
                            y="60"
                            fontSize="5.5"
                            fill="#9ab0b9"
                            textAnchor="middle"
                          >
                            LEDs
                          </text>
                        </g>
                      )}
                    </>
                  )}

                  {/* 3D Front Face Plate (angled isometric letter "A" face) */}
                  <polygon
                    points={`${fx},28 ${fx + 10},20 ${fx + 26},26 ${fx + 26},80 ${fx},86`}
                    fill={resolvedFaceHex}
                    stroke={isFront ? '#ffffff' : '#1b2a32'}
                    strokeWidth="1.1"
                  />
                  {/* Letter "A" emblem on the front face so it's unmistakably a letter */}
                  <text
                    x={fx + 13}
                    y="62"
                    fontSize="24"
                    fontWeight="800"
                    fill={isFront ? '#ffffff' : '#18262e'}
                    opacity={isFront ? '0.92' : '0.45'}
                    textAnchor="middle"
                  >
                    A
                  </text>

                  {/* Forward Light Beam & Rays (if Front-lit) */}
                  {isFront && (
                    <g>
                      <polygon
                        points={`${fx + 22},24 ${152},14 ${152},94 ${fx + 22},84`}
                        fill={`url(#${uid}-frontBeam)`}
                      />
                      <g stroke="#ffe396" strokeWidth="1.5" strokeLinecap="round">
                        <line x1={fx + 26} y1="40" x2="146" y2="34" />
                        <line x1={fx + 26} y1="55" x2="148" y2="55" />
                        <line x1={fx + 26} y1="70" x2="146" y2="76" />
                      </g>
                    </g>
                  )}
                </g>
              );
            })()
          )}
        </svg>

        {/* Right: Numbered, plain-English layer breakdown */}
        <div className="xsec-legend">
          {meta && (
            <div className="xsec-summary">
              <b>{meta.title}:</b> {meta.howItWorks}
            </div>
          )}
          <div className="xsec-steps">
            {stackSteps.map((s) => (
              <div className="xsec-step" key={s.num}>
                <span className="xsec-step-num" style={{ background: s.color }}>
                  {s.num}
                </span>
                <div className="xsec-step-text">
                  <b>{s.title}</b>
                  <small>{s.detail}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
