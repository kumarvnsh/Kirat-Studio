import { maskFromRGBA, traceMask, inside, perimeter } from '../artwork/contours.js';
import { SignScene, layerNames } from '../scene/scene.js';
import { resetAssemblyView, isolateElement } from '../editor/view-state.js';
const $ = (s) => document.querySelector(s),
  esc = (s) =>
    String(s ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
const numeric = [
  'width',
  'height',
  'acp',
  'gi',
  'frame',
  'framewall',
  'depth',
  'gauge',
  'face',
  'back',
  'artscale',
];
let state = {
    version: 1,
    components: [],
    selected: null,
    step: 7,
    layers: Array(7).fill(true),
    explode: 0,
    bend: 100,
    night: true,
    lights: true,
    brightness: 1,
    presentation: false,
    selectionActive: false,
    isolate: false,
    mode: '3d',
    width: 3600,
    height: 1200,
    acp: 3,
    gi: 0.8,
    frame: 40,
    framewall: 2,
    depth: 60,
    gauge: 0.6,
    face: 3,
    back: 3,
    artscale: 84,
    keepart: true,
    boardcolor: '#243843',
    facecolor: '#ff9e35',
    approved: false,
  },
  sourceImage = null,
  sourceURL = '',
  artCanvas = null,
  viewer = null,
  busy = false,
  playTimer = null,
  bendTimer = null,
  traceTransform = null;
const typeNames = {
  front: 'Front-lit',
  halo: 'Halo-lit',
  acrylic: 'Flat acrylic',
  metal: 'Flat metal',
  acplogo: 'ACP logo',
  vinyl: 'Vinyl',
  omit: 'Excluded',
};
const descriptions = [
  'GI panels close the rear of the steel frame. The 0.8 mm starting thickness is an editable assumption.',
  'Hollow steel profiles form the support. Section and wall thickness need project engineering.',
  'The ACP fascia sits in front of the frame. Panel seams and fixings are not detailed in this prototype.',
  'Individual letter backs follow the reviewed outlines, including counters.',
  'Outer and inner return walls use nominal depth and gauge; no profile-lock or joining compensation.',
  'LED bodies are symbolic positions—not a manufacturer layout or electrical calculation.',
  'Faces and graphics complete the sign. Day/night illumination is a visual approximation.',
];
function message(t) {
  $('#message').textContent = t;
}
function download(data, name) {
  const a = document.createElement('a');
  a.href = data;
  a.download = name;
  a.click();
}
function updateInputs() {
  document
    .querySelectorAll('[data-layer]')
    .forEach((c) => (c.checked = state.layers[+c.dataset.layer] !== false));
  numeric.forEach((k) => ($('#' + k).value = state[k]));
  ['boardcolor', 'facecolor'].forEach((k) => ($('#' + k).value = state[k]));
  $('#brightness').value = state.brightness ?? 1;
  $('#brightnessout').value = Math.round((state.brightness ?? 1) * 100) + '%';
  $('#power').textContent = state.lights !== false ? '● Lights on' : '○ Lights off';
  $('#power').classList.toggle('poweron', state.lights !== false);
  $('#keepart').checked = state.keepart;
  $('#approved').checked = state.approved;
  $('#explode').value = state.explode;
  $('#step').value = state.step;
  $('#bend').value = state.bend;
  $('#night').textContent = state.night ? '☀ Day' : '☾ Night';
  document.body.classList.toggle('nightmode', state.night);
}
function readInputs() {
  for (const k of numeric) {
    const el = $('#' + k),
      v = Number(el.value);
    if (!Number.isFinite(v) || v < +el.min || v > +el.max)
      throw Error('Check ' + k + '; use a value between ' + el.min + ' and ' + el.max + '.');
    state[k] = v;
  }
  if (state.framewall * 2 >= state.frame)
    throw Error('Frame wall must be less than half the profile section.');
  state.brightness = Number($('#brightness').value) || 1;
  state.keepart = $('#keepart').checked;
  state.boardcolor = $('#boardcolor').value;
  state.facecolor = $('#facecolor').value;
}
try {
  viewer = new SignScene($('#threehost'), select);
} catch (e) {
  console.error(e);
  $('#fallback').hidden = false;
  state.mode = '2d';
  message('3D unavailable. Use 2D trace review on this device.');
}
function syncIsolationUI() {
  const active = !!state.isolate;
  $('#isolate').textContent = active ? 'Exit isolate · show all' : 'Isolate selected element';
  $('#isolate').setAttribute('aria-pressed', String(active));
  $('#isolationbar').hidden = !active;
  $('#isolationbar span').textContent = active
    ? 'Isolated: ' + (state.components.find((p) => p.id === state.selected)?.name || 'element')
    : '';
}
function stats() {
  syncIsolationUI();
  const n = state.components.filter((p) => p.type !== 'omit').length;
  $('#componentcount').textContent = n;
  $('#returnlength').textContent = viewer ? (viewer.returnLength || 0).toFixed(2) + ' m' : '—';
  $('#ledcount').textContent = viewer?.ledcount ?? '—';
  $('#sizebadge').textContent = state.width + ' × ' + state.height;
  $('#reviewbadge').textContent = state.approved
    ? 'ARTWORK REVIEWED / CONCEPT MODEL'
    : 'ARTWORK REVIEW PENDING';
  $('#stageout').textContent = state.step + ' / 7';
  $('#explodeout').textContent = state.explode + '%';
  $('#stepdescription').textContent = descriptions[state.step - 1];
  $('#modebadge').textContent =
    state.mode === '2d'
      ? 'ARTWORK / TRACED CONTOURS'
      : state.mode === 'bend'
        ? 'GEOMETRIC FORMING / NO PROCESS COMPENSATION'
        : state.night
          ? 'NIGHT STUDIO / ILLUMINATION PREVIEW'
          : 'DAY STUDIO / MATERIAL PREVIEW';
}
function rebuild(fit = false) {
  try {
    readInputs();
    if (viewer) {
      viewer.build(state, artCanvas);
      if (fit) viewer.fit();
    }
    stats();
    inspector();
    draw2d();
  } catch (e) {
    console.error(e);
    message(e.message);
  }
}
function setMode(mode) {
  if (mode === 'bend') {
    const p = state.components.find((p) => p.id === state.selected);
    if (!p || p.type === 'omit') {
      message('Select a visible artwork shape for the forming study.');
      return;
    }
  }
  if (mode === '3d' || mode === '2d') state.isolate = false;
  state.mode = mode;
  $('#threehost').hidden = mode === '2d';
  $('#tracecanvas').hidden = mode !== '2d';
  $('#bendcontrols').hidden = mode !== 'bend';
  ['3d', '2d', 'bend'].forEach((k) => $('#view' + k).classList.toggle('active', mode === k));
  $('.camera').hidden = mode === '2d';
  rebuild(true);
  if (mode === 'bend')
    message(
      'Geometric strip study for selected contours. Notches, springback, bend allowance and machine instructions are not simulated.',
    );
  else if (mode === '2d')
    message(
      'Click a traced shape to review its construction. Use Exclude to remove background marks or unwanted details.',
    );
}
$('#view3d').onclick = () => setMode('3d');
$('#view2d').onclick = () => setMode('2d');
$('#viewbend').onclick = () => setMode('bend');
document.querySelectorAll('[data-panel]').forEach(
  (b) =>
    (b.onclick = () => {
      document.querySelectorAll('[data-panel]').forEach((x) => x.classList.toggle('active', x === b));
      document
        .querySelectorAll('.panel')
        .forEach((p) => p.classList.toggle('active', p.id === 'panel-' + b.dataset.panel));
    }),
);
function renderElements() {
  const opts = state.components
    .map((p) => `<option value="${esc(p.id)}">${esc(p.name)} · ${typeNames[p.type]}</option>`)
    .join('');
  $('#selected').innerHTML = opts || '<option>No artwork yet</option>';
  $('#selected').value = state.selected;
  $('#elementlist').innerHTML = state.components
    .map(
      (p) =>
        `<button class="element ${p.id === state.selected ? 'active' : ''}" data-id="${esc(p.id)}"><i style="background:${p.color}"></i><span>${esc(p.name)}<small>${typeNames[p.type]}</small></span><em>${p.regions.reduce((s, r) => s + r.holes.length, 0)} holes</em></button>`,
    )
    .join('');
  document.querySelectorAll('[data-id]').forEach((b) => (b.onclick = () => select(b.dataset.id)));
  inspector();
}
function inspector() {
  const p = state.components.find((x) => x.id === state.selected);
  if (!p) return;
  $('#partname').value = p.name;
  $('#parttype').value = p.type;
  const b = p.bounds,
    s = viewer?.scale || 0;
  const w = (b[2] - b[0]) * s * 1000,
    h = (b[3] - b[1]) * s * 1000,
    L =
      p.regions.reduce((n, r) => n + perimeter(r.outer) + r.holes.reduce((m, h) => m + perimeter(h), 0), 0) *
      s;
  $('#partdetails').innerHTML =
    `<b>${esc(p.name)}</b><br>Approx. ${Math.round(w)} × ${Math.round(h)} mm<br>${p.regions.length} outer region(s) / ${p.regions.reduce((n, r) => n + r.holes.length, 0)} inner hole(s)<br>${L.toFixed(3)} m nominal contour perimeter<br><small>Perimeter is not a compensated strip cut length.</small>`;
  $('#selectionbadge').hidden = false;
  $('#selectionbadge').textContent = p.name + ' / ' + typeNames[p.type];
}
function select(id) {
  state.selectionActive = true;
  state.selected = id;
  $('#selected').value = id;
  renderElements();
  if (state.mode === 'bend') rebuild();
  else {
    viewer?.setVisibility(state);
    draw2d();
  }
  inspector();
}
$('#selected').onchange = () => select($('#selected').value);
$('#partname').onchange = () => {
  const p = state.components.find((p) => p.id === state.selected);
  if (p) {
    p.name = $('#partname').value.trim() || p.name;
    renderElements();
  }
};
$('#applytype').onclick = () => {
  const type = $('#parttype').value,
    bulk = $('#bulk').value;
  const max = Math.max(...state.components.map((p) => p.pixels), 1);
  state.components.forEach((p) => {
    if (
      bulk === 'all' ||
      (bulk === 'selected' && p.id === state.selected) ||
      (bulk === 'small' && p.pixels < max * 0.025)
    )
      p.type = type;
  });
  renderElements();
  rebuild();
  message('Construction updated. Check small strokes and isolated dots in the 2D trace.');
};
async function loadImage(url) {
  return new Promise((res, rej) => {
    const image = new Image();
    image.onload = () => res(image);
    image.onerror = () => rej(Error('Could not decode the image. Try a PNG, JPG or WebP file.'));
    image.src = url;
  });
}
async function useImage(url, sample = false) {
  sourceImage = await loadImage(url);
  if (sourceImage.naturalWidth * sourceImage.naturalHeight > 25000000)
    throw Error('Use an image smaller than 25 megapixels.');
  sourceURL = url;
  $('#cropx').value = sample ? 15 : 0;
  $('#cropy').value = sample ? 28 : 0;
  $('#cropw').value = sample ? 71 : 100;
  $('#croph').value = sample ? 43 : 100;
  $('#background').value = 'white';
  $('#threshold').value = 45;
  $('#thresholdout').value = 45;
  await trace();
}
async function trace() {
  if (busy || !sourceImage) return;
  busy = true;
  $('#trace').disabled = true;
  message('Tracing contours and rebuilding components…');
  await new Promise((r) => setTimeout(r, 20));
  try {
    const ix = sourceImage.naturalWidth,
      iy = sourceImage.naturalHeight,
      x = (+$('#cropx').value / 100) * ix,
      y = (+$('#cropy').value / 100) * iy,
      cw = Math.min((+$('#cropw').value / 100) * ix, ix - x),
      ch = Math.min((+$('#croph').value / 100) * iy, iy - y);
    if (cw < 8 || ch < 8 || x < 0 || y < 0) throw Error('Crop is too small or outside the image.');
    const ratio = Math.min(1, 1400 / cw, 960 / ch),
      w = Math.round(cw * ratio),
      h = Math.round(ch * ratio),
      c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(sourceImage, x, y, cw, ch, 0, 0, w, h);
    const image = ctx.getImageData(0, 0, w, h),
      mask = maskFromRGBA(image.data, w, h, $('#background').value, +$('#threshold').value);
    const result = traceMask(mask, w, h, {
      minPixels: Math.max(3, +$('#minpixels').value || 12),
      tolerance: 0.8,
      maxComponents: 100,
      rgba: image.data,
    });
    if (!result.components.length)
      throw Error('No shapes found. Lower tolerance, change background mode, or check the crop.');
    for (let i = 0; i < mask.length; i++) if (!mask[i]) image.data[i * 4 + 3] = 0;
    ctx.putImageData(image, 0, 0);
    artCanvas = c;
    const max = result.components[0].pixels;
    state.components = result.components.map((p, i) => ({
      ...p,
      name: 'Element ' + String(i + 1).padStart(2, '0'),
      type: p.pixels < max * 0.025 ? 'vinyl' : 'front',
    }));
    state.artBounds = [
      Math.min(...state.components.map((p) => p.bounds[0])),
      Math.min(...state.components.map((p) => p.bounds[1])),
      Math.max(...state.components.map((p) => p.bounds[2])),
      Math.max(...state.components.map((p) => p.bounds[3])),
    ];
    state.imageWidth = w;
    state.imageHeight = h;
    state.artData = c.toDataURL('image/png');
    state.selected = state.components[0].id;
    state.isolate = false;
    state.selectionActive = false;
    state.approved = false;
    $('#approved').checked = false;
    renderElements();
    rebuild(true);
    $('#traceinfo').textContent =
      `${state.components.length} shapes · ${state.components.reduce((n, p) => n + p.regions.reduce((m, r) => m + r.holes.length, 0), 0)} holes · ${w} × ${h} tracing grid${result.truncated ? ' · Smallest components capped at 100' : ''}`;
    message(
      'Draft contours generated. Review 2D outlines, exclude unwanted details, and assign constructions. Tiny shapes default to vinyl; check letter dots separately.',
    );
  } catch (e) {
    console.error(e);
    message(e.message);
  } finally {
    busy = false;
    $('#trace').disabled = false;
    $('#loading').hidden = true;
  }
}
$('#trace').onclick = trace;
$('#threshold').oninput = () => ($('#thresholdout').value = $('#threshold').value);
$('#sample').onclick = () => useImage('kirat-reference.png', true).catch((e) => message(e.message));
$('#upload').onchange = async () => {
  const file = $('#upload').files[0];
  if (!file) return;
  try {
    if (file.size > 8 * 1024 * 1024) throw Error('Choose artwork smaller than 8 MB.');
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type))
      throw Error('Use PNG, JPG, WebP or SVG.');
    let url;
    if (file.type === 'image/svg+xml') {
      const text = await file.text();
      if (/<script|foreignObject|<!ENTITY|(?:href|src)\s*=\s*["']\s*(?:https?:|\/\/)|url\s*\(/i.test(text))
        throw Error(
          'SVG must be self-contained without scripts, external resources or CSS URLs. Export a plain SVG or PNG.',
        );
      url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
    } else url = URL.createObjectURL(file);
    await useImage(url);
    URL.revokeObjectURL(url);
    message('Artwork traced locally. No file was sent to a cloud service. Review outlines before approving.');
  } catch (e) {
    message(e.message);
  }
};
$('#textsample').onclick = () => ($('#texttools').hidden = !$('#texttools').hidden);
$('#maketext').onclick = () => {
  const c = document.createElement('canvas');
  c.width = 1500;
  c.height = 300;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#ed982f';
  ctx.font = 'bold 120px Georgia';
  ctx.textBaseline = 'middle';
  const text = $('#textvalue').value || 'Kirat Creations',
    size = ctx.measureText(text).width;
  ctx.font = `bold ${Math.min(120, (1400 / size) * 120)}px Georgia`;
  ctx.fillText(text, 40, 150);
  useImage(c.toDataURL()).catch((e) => message(e.message));
};
$('#approved').onchange = () => {
  state.approved = $('#approved').checked;
  stats();
};
function draw2d() {
  if (!artCanvas) return;
  const canvas = $('#tracecanvas'),
    host = $('#viewport'),
    ratio = Math.min(devicePixelRatio, 2),
    W = host.clientWidth,
    H = host.clientHeight;
  if (!W || !H) return;
  canvas.width = W * ratio;
  canvas.height = H * ratio;
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  ctx.fillStyle = state.night ? '#12232c' : '#e4e9e0';
  ctx.fillRect(0, 0, W, H);
  const scale = Math.min((W - 60) / artCanvas.width, (H - 120) / artCanvas.height),
    tx = (W - artCanvas.width * scale) / 2,
    ty = (H - artCanvas.height * scale) / 2;
  traceTransform = { scale, tx, ty };
  ctx.globalAlpha = 0.45;
  ctx.drawImage(artCanvas, tx, ty, artCanvas.width * scale, artCanvas.height * scale);
  ctx.globalAlpha = 1;
  for (const p of state.components) {
    ctx.strokeStyle = p.id === state.selected ? '#e58c3b' : p.type === 'omit' ? '#aab3aa' : '#3d8d87';
    ctx.lineWidth = p.id === state.selected ? 2 : 1;
    for (const r of p.regions)
      for (const loop of [r.outer, ...r.holes]) {
        ctx.beginPath();
        loop.forEach((v, i) =>
          i
            ? ctx.lineTo(tx + v[0] * scale, ty + v[1] * scale)
            : ctx.moveTo(tx + v[0] * scale, ty + v[1] * scale),
        );
        ctx.closePath();
        ctx.stroke();
      }
  }
}
$('#tracecanvas').onclick = (e) => {
  if (!traceTransform) return;
  const rect = e.target.getBoundingClientRect(),
    { scale, tx, ty } = traceTransform,
    pt = [(e.clientX - rect.left - tx) / scale, (e.clientY - rect.top - ty) / scale];
  const p = [...state.components]
    .reverse()
    .find((p) => p.regions.some((r) => inside(pt, r.outer) && !r.holes.some((h) => inside(pt, h))));
  if (p) select(p.id);
};
new ResizeObserver(draw2d).observe($('#viewport'));
$('#power').onclick = () => {
  state.lights = state.lights === false;
  $('#power').textContent = state.lights ? '● Lights on' : '○ Lights off';
  $('#power').classList.toggle('poweron', state.lights);
  rebuild();
  message(
    state.lights
      ? 'Illumination on. Glow and spill are visual approximations.'
      : 'Illumination off. Day/night environment remains unchanged.',
  );
};
$('#brightness').oninput = () => {
  $('#brightnessout').value = Math.round(Number($('#brightness').value) * 100) + '%';
  rebuild();
};
$('#present').onclick = () => {
  if (!state.presentation && (state.isolate || state.mode === 'bend')) showCompleteAssembly();
  state.presentation = !state.presentation;
  document.body.classList.toggle('presentation', state.presentation);
  $('#present').textContent = state.presentation ? 'Exit presentation' : 'Presentation';
  viewer?.highlight(state.selected);
  setTimeout(() => {
    viewer?.resize();
    viewer?.fit();
  }, 60);
};
function stopViewAnimations() {
  if (playTimer) clearInterval(playTimer);
  if (bendTimer) clearInterval(bendTimer);
  playTimer = null;
  bendTimer = null;
  $('#play').textContent = 'Play assembly';
  $('#bendplay').textContent = 'Animate forming';
}
function showCompleteAssembly() {
  stopViewAnimations();
  resetAssemblyView(state);
  document.querySelectorAll('[data-layer]').forEach((c) => (c.checked = true));
  updateInputs();
  setMode('3d');
  syncIsolationUI();
  message('Complete assembly restored. Artwork and construction settings are unchanged.');
}
$('#isolate').onclick = () => {
  if (state.isolate) {
    showCompleteAssembly();
    return;
  }
  const id = state.selected;
  if (!state.components.some((p) => p.id === id && p.type !== 'omit')) {
    message('Select a visible artwork element first.');
    return;
  }
  stopViewAnimations();
  setMode('3d');
  isolateElement(state, id);
  updateInputs();
  rebuild(true);
  syncIsolationUI();
  message('Element isolated. Use Show all above the scene or press Esc to return.');
};
$('#showall').onclick = showCompleteAssembly;
$('#exit-isolate').onclick = showCompleteAssembly;
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && (state.isolate || state.mode === 'bend')) {
    e.preventDefault();
    showCompleteAssembly();
  }
});
$('#rebuild').onclick = () => {
  rebuild();
  inspector();
  message('Geometry updated using nominal dimensions. Review fit and construction before production.');
};
$('#night').onclick = () => {
  state.night = !state.night;
  $('#night').textContent = state.night ? '☀ Day' : '☾ Night';
  document.body.classList.toggle('nightmode', state.night);
  rebuild();
};
['front', 'rear', 'perspective', 'fit'].forEach(
  (k) => ($('#' + k).onclick = () => viewer?.fit(k === 'fit' ? 'perspective' : k)),
);
$('#layertoggles').innerHTML = layerNames
  .map((n, i) => `<label><input type="checkbox" data-layer="${i}" checked>${n}</label>`)
  .join('');
document.querySelectorAll('[data-layer]').forEach(
  (c) =>
    (c.onchange = () => {
      state.layers[+c.dataset.layer] = c.checked;
      viewer?.setVisibility(state);
      stats();
    }),
);
$('#restore').onclick = showCompleteAssembly;
$('#step').oninput = () => {
  state.step = +$('#step').value;
  viewer?.setVisibility(state);
  stats();
};
$('#explode').oninput = () => {
  state.explode = +$('#explode').value;
  viewer?.setVisibility(state);
  stats();
};
const step = (n) => {
  state.step = Math.max(1, Math.min(7, n));
  $('#step').value = state.step;
  viewer?.setVisibility(state);
  stats();
};
$('#prev').onclick = () => step(state.step - 1);
$('#next').onclick = () => step(state.step + 1);
$('#play').onclick = () => {
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
    $('#play').textContent = 'Play assembly';
    return;
  }
  setMode('3d');
  step(1);
  $('#play').textContent = 'Pause assembly';
  playTimer = setInterval(() => {
    if (state.step >= 7) {
      clearInterval(playTimer);
      playTimer = null;
      $('#play').textContent = 'Play assembly';
    } else step(state.step + 1);
  }, 1100);
};
$('#bend').oninput = () => {
  state.bend = +$('#bend').value;
  rebuild();
};
$('#bendplay').onclick = () => {
  if (bendTimer) {
    clearInterval(bendTimer);
    bendTimer = null;
    $('#bendplay').textContent = 'Animate forming';
    return;
  }
  state.bend = 0;
  $('#bend').value = 0;
  $('#bendplay').textContent = 'Pause forming';
  bendTimer = setInterval(() => {
    state.bend = Math.min(100, state.bend + 4);
    $('#bend').value = state.bend;
    rebuild();
    if (state.bend >= 100) {
      clearInterval(bendTimer);
      bendTimer = null;
      $('#bendplay').textContent = 'Animate forming';
    }
  }, 120);
};
function serialise() {
  return JSON.stringify(
    {
      format: 'kirat-signage-studio',
      version: 1,
      state,
      traceSettings: {
        background: $('#background').value,
        threshold: +$('#threshold').value,
        minpixels: +$('#minpixels').value,
      },
      savedAt: new Date().toISOString(),
    },
    null,
    2,
  );
}
$('#save').onclick = () => {
  try {
    readInputs();
    const text = serialise(),
      blob = new Blob([text], { type: 'application/json' }),
      url = URL.createObjectURL(blob);
    download(url, 'kirat-signage-project.json');
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    try {
      localStorage.setItem('kirat-studio-project', text);
    } catch {}
    message(
      'Project downloaded with traced geometry, settings and face artwork. Keep it to reopen this design.',
    );
  } catch (e) {
    message(e.message);
  }
};
function validateProject(p) {
  if (
    p.format !== 'kirat-signage-studio' ||
    p.version !== 1 ||
    !p.state ||
    !Array.isArray(p.state.components)
  )
    throw Error('Not a supported Kirat Studio project.');
  const s = p.state;
  for (const k of numeric) {
    const el = $('#' + k);
    if (!Number.isFinite(s[k]) || s[k] < +el.min || s[k] > +el.max) throw Error('Invalid ' + k + ' setting.');
  }
  if (s.framewall * 2 >= s.frame) throw Error('Invalid frame wall.');
  if (
    !Array.isArray(s.artBounds) ||
    s.artBounds.length !== 4 ||
    s.artBounds.some((v) => !Number.isFinite(v) || v < 0 || v > 2000) ||
    s.artBounds[2] <= s.artBounds[0] ||
    s.artBounds[3] <= s.artBounds[1]
  )
    throw Error('Invalid artwork bounds.');
  if (s.components.length > 100) throw Error('Project exceeds the 100-shape limit.');
  let points = 0;
  for (const c of s.components) {
    if (
      !Array.isArray(c.bounds) ||
      c.bounds.length !== 4 ||
      c.bounds.some((n) => !Number.isFinite(n) || n < 0 || n > 2000)
    )
      throw Error('Invalid component bounds.');
    if (
      !/^[\w-]{1,60}$/.test(c.id) ||
      !Object.hasOwn(typeNames, c.type) ||
      !Array.isArray(c.regions) ||
      c.regions.length > 100 ||
      !/^#[0-9a-f]{6}$/i.test(c.color)
    )
      throw Error('Invalid component data.');
    for (const r of c.regions) {
      if (!Array.isArray(r.outer) || !Array.isArray(r.holes)) throw Error('Invalid contours.');
      for (const loop of [r.outer, ...r.holes]) {
        points += loop.length;
        if (
          loop.length < 3 ||
          loop.length > 10000 ||
          loop.some(
            (v) =>
              !Array.isArray(v) ||
              v.length !== 2 ||
              v.some((n) => !Number.isFinite(n) || Math.abs(n) > 10000),
          )
        )
          throw Error('Invalid contour points.');
      }
    }
  }
  if (points > 50000) throw Error('Project exceeds the contour complexity limit.');
  if (
    typeof s.artData !== 'string' ||
    !s.artData.startsWith('data:image/png;base64,') ||
    s.artData.length > 12e6
  )
    throw Error('Invalid face artwork.');
  if (
    !Number.isFinite(s.imageWidth) ||
    !Number.isFinite(s.imageHeight) ||
    s.imageWidth < 1 ||
    s.imageHeight < 1 ||
    s.imageWidth > 2000 ||
    s.imageHeight > 2000
  )
    throw Error('Invalid artwork dimensions.');
  return s;
}
async function restoreProject(text) {
  const parsed = JSON.parse(text),
    s = validateProject(parsed),
    img = await loadImage(s.artData);
  const canvas = document.createElement('canvas');
  canvas.width = s.imageWidth;
  canvas.height = s.imageHeight;
  canvas.getContext('2d').drawImage(img, 0, 0);
  state = {
    ...state,
    ...s,
    isolate: false,
    presentation: false,
    selectionActive: false,
    isolate: false,
    mode: '3d',
    step: 7,
    explode: 0,
    layers: Array(7).fill(true),
  };
  document.body.classList.remove('presentation');
  $('#present').textContent = 'Presentation';
  sourceImage = img;
  sourceURL = s.artData;
  artCanvas = canvas;
  ['cropx', 'cropy'].forEach((k) => ($('#' + k).value = 0));
  ['cropw', 'croph'].forEach((k) => ($('#' + k).value = 100));
  updateInputs();
  renderElements();
  setMode('3d');
  message('Saved project reopened. Retracing will replace its edited element assignments.');
  $('#loading').hidden = true;
}
$('#open').onchange = async () => {
  const f = $('#open').files[0];
  if (!f) return;
  try {
    if (f.size > 16e6) throw Error('Project is too large.');
    await restoreProject(await f.text());
  } catch (e) {
    message('Could not open project: ' + e.message);
  }
};
$('#export').onclick = () => {
  if (!viewer && state.mode !== '2d') {
    message('3D export is unavailable on this device.');
    return;
  }
  const canvas = $('#tracecanvas');
  let url = state.mode === '2d' ? canvas.toDataURL() : viewer.export();
  const image = new Image();
  image.onload = () => {
    const c = document.createElement('canvas');
    c.width = image.width;
    c.height = image.height + 70;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f3f3ea';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(image, 0, 0);
    ctx.fillStyle = '#284047';
    ctx.font = Math.max(12, c.width / 80) + 'px Arial';
    ctx.fillText('KIRAT SIGNAGE STUDIO · CONCEPT PREVIEW · NOT FOR FABRICATION', 20, c.height - 40);
    ctx.font = Math.max(10, c.width / 95) + 'px Arial';
    ctx.fillText(
      state.width + ' × ' + state.height + ' mm board · nominal geometry · lighting illustrative',
      20,
      c.height - 18,
    );
    download(c.toDataURL(), 'kirat-signage-preview.png');
  };
  image.src = url;
};
updateInputs();
useImage('kirat-reference.png', true)
  .then(() => setMode(viewer ? '3d' : '2d'))
  .catch((e) => {
    message(e.message);
    $('#loading').hidden = true;
  });
