import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

// ---------- Parameters (tunable from the URL and the ?debug overlay) ----------

const DEFAULT_PARAMS = {
  range: 0.5,          // walk reaches the end when silhouette = baseline × (1 + range). Same as the 2D piece (×1.5)
  smoothing: 0.1,      // per-frame easing toward the target position
  threshold: 0.5,      // black/white cut for the silhouette
  baselineFrames: 30,  // frames before the baseline is taken
  fov: 60,
  bloom: 0.45,
  ao: 1,               // soft contact shading in corners and under arches (0 = off)
  shadows: 1,          // 1 = lights cast shadows, 0 = off (faster)
};
const LIMITS = {
  range: [0.1, 2, 0.05],
  smoothing: [0.01, 0.5, 0.01],
  threshold: [0.1, 0.9, 0.05],
  baselineFrames: [5, 120, 5],
  fov: [30, 100, 5],
  bloom: [0, 2, 0.05],
  ao: [0, 1, 0.1],
  shadows: [0, 1, 1],
};

const query = new URLSearchParams(location.search);
const DEBUG = query.has('debug');
const ROUTE = query.get('route') || 'main';
const params = { ...DEFAULT_PARAMS };
for (const k in params) {
  const v = parseFloat(query.get(k));
  if (!isNaN(v)) params[k] = clampParam(k, v);
}

function clampParam(k, v) {
  const [lo, hi] = LIMITS[k];
  return Math.min(hi, Math.max(lo, v));
}

// ---------- Renderer, scene, camera ----------

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (err) {
  // The browser couldn't give us 3D graphics (e.g. too many 3D tabs open, or its graphics process crashed)
  document.body.innerHTML = '<p style="font:16px/1.5 system-ui;color:#7a4b3a;text-align:center;margin-top:40vh">' +
    'This browser couldn\'t start 3D graphics (WebGL).<br>Close other 3D tabs or restart the browser, then reload.</p>';
  throw err;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 0.85;
renderer.shadowMap.enabled = params.shadows > 0;   // read once at load
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;   // the building never moves, so shadows are drawn once
renderer.shadowMap.needsUpdate = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#f3d9c8');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;

const camera = new THREE.PerspectiveCamera(params.fov, innerWidth / innerHeight, 0.05, 100);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const aoPass = new GTAOPass(scene, camera, innerWidth, innerHeight);
aoPass.blendIntensity = params.ao;
aoPass.enabled = params.ao > 0;
composer.addPass(aoPass);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), params.bloom, 0.6, 0.9);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// ---------- Building blocks ----------

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
const ledMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff3d6', emissiveIntensity: 4 });

function box(w, h, d, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
  return m;
}

// Wall W×H with an arched opening w×h (round top), standing on y=0, centred on x=0
function wallShape(W, H, w, h) {
  const r = w / 2, s = new THREE.Shape();
  s.moveTo(-W / 2, 0);
  s.lineTo(-r, 0);
  s.lineTo(-r, h - r);
  s.absarc(0, h - r, r, Math.PI, 0, true);
  s.lineTo(r, 0);
  s.lineTo(W / 2, 0);
  s.lineTo(W / 2, H);
  s.lineTo(-W / 2, H);
  s.closePath();
  return s;
}

function archShape(w, h) {
  const r = w / 2, s = new THREE.Shape();
  s.moveTo(-r, 0);
  s.lineTo(-r, h - r);
  s.absarc(0, h - r, r, Math.PI, 0, true);
  s.lineTo(r, 0);
  s.closePath();
  return s;
}

// Extruded arch wall. Front face at local z = depth, back at z = 0.
// Material 0 = front/back faces, material 1 = the reveal (inside of the opening)
function archWall({ W, H, w, h, depth, color, reveal = color }) {
  const geo = new THREE.ExtrudeGeometry(wallShape(W, H, w, h), { depth, bevelEnabled: false, curveSegments: 48 });
  const m = new THREE.Mesh(geo, [mat(color), mat(reveal)]);
  m.castShadow = m.receiveShadow = true;
  return m;
}

// Arch wall across the corridor with its front face at z
function addWall(z, opts) {
  const m = archWall(opts);
  m.position.z = z - opts.depth;
  scene.add(m);
  return m;
}

// Side walls + ceiling for a stretch of corridor between zFront (near) and zBack (far)
function segment({ halfW, zFront, zBack, H, color, open = {} }) {
  const len = zFront - zBack, zc = (zFront + zBack) / 2, t = 0.2, m = mat(color);
  if (!open.left) box(t, H, len, m, -halfW - t / 2, H / 2, zc);
  if (!open.right) box(t, H, len, m, halfW + t / 2, H / 2, zc);
  box(halfW * 2 + 2 * t, t, len, m, 0, H + t / 2, zc);
}

class PolyCurve extends THREE.Curve {
  constructor(pts) { super(); this.pts = pts; }
  getPoint(t, target = new THREE.Vector3()) {
    const n = this.pts.length - 1, f = t * n, i = Math.min(Math.floor(f), n - 1);
    return target.lerpVectors(this.pts[i], this.pts[i + 1], f - i);
  }
}

// Thin glowing strip following the inside edge of an arch of width w, height h
function archLED(w, h, inset = 0.03, radius = 0.012) {
  const r = w / 2 - inset, top = h - w / 2, pts = [], step = 0.05;
  for (let y = 0; y < top; y += step) pts.push(new THREE.Vector3(-r, y, 0));
  for (let i = 0; i <= 64; i++) {
    const a = Math.PI - (i / 64) * Math.PI;
    pts.push(new THREE.Vector3(Math.cos(a) * r, top + Math.sin(a) * r, 0));
  }
  for (let y = top; y >= 0; y -= step) pts.push(new THREE.Vector3(r, y, 0));
  return new THREE.Mesh(new THREE.TubeGeometry(new PolyCurve(pts), 400, radius, 8, false), ledMat);
}

// ---------- The building ----------
// Corridor runs along -Z. Viewer starts in the pink room at z = 7.

const EYE = 1.6;

const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 70), mat('#e49a78', { roughness: 0.35 }));
floor.rotation.x = -Math.PI / 2;
floor.position.z = -12;
floor.receiveShadow = true;
scene.add(floor);

// 1. Pink entrance room + pink wall with the big arch
segment({ halfW: 6, zFront: 10, zBack: 0, H: 10, color: '#ecc3bb' });
box(12.4, 10, 0.2, mat('#ecc3bb'), 0, 5, 10.1);
addWall(0, { W: 12, H: 10, w: 3.4, h: 4.2, depth: 0.5, color: '#e9b8ae', reveal: '#dfa79e' });

// 2. Lavender hall, with a doorway on the right into the yellow room
segment({ halfW: 2.2, zFront: -0.5, zBack: -4, H: 7.5, color: '#d2c6d9', open: { right: true } });
const sideWall = archWall({ W: 3.5, H: 7.5, w: 1.6, h: 2.7, depth: 0.2, color: '#d2c6d9', reveal: '#c2bdd6' });
sideWall.rotation.y = -Math.PI / 2;   // local x → world z, extrusion → world -x
sideWall.position.set(2.4, 0, -2.25);
scene.add(sideWall);
addWall(-4, { W: 4.4, H: 7.5, w: 2.6, h: 3.6, depth: 0.35, color: '#cdc1d6', reveal: '#bdbcd3' });

// 3. Yellow hall + thick yellow arch with a glowing edge
segment({ halfW: 2.0, zFront: -4.35, zBack: -7, H: 6.5, color: '#f3d56b' });
addWall(-7, { W: 4, H: 6.5, w: 2.2, h: 3.1, depth: 0.6, color: '#f3d56b', reveal: '#f1b52e' });
const ledC = archLED(2.2, 3.1);
ledC.position.z = -6.99;
scene.add(ledC);
box(2.2, 0.004, 0.04, ledMat, 0, 0.002, -7.62);

// 4. Rainbow corridor: same-size arch walls in a row; perspective makes the nested bands
const RING_COLORS = ['#e8361f', '#1d4a73', '#f4d9da', '#b8d4ec', '#f3c22e', '#e8361f', '#1d4a73', '#f4d9da', '#b8d4ec', '#f3c22e'];
const RING_START = -7.8, SPACING = 0.95, RING_D = 0.28;
RING_COLORS.forEach((c, i) => {
  const z = RING_START - i * SPACING;
  addWall(z, { W: 2.8, H: 5.5, w: 1.9, h: 2.75, depth: RING_D, color: c });
  box(1.9, 0.004, 0.03, ledMat, 0, 0.002, z + 0.06);
});
const END_Z = RING_START - (RING_COLORS.length - 1) * SPACING - RING_D;
segment({ halfW: 1.4, zFront: -7.6, zBack: END_Z, H: 5.5, color: '#f6e4de' });

// 5. Soft pink room at the end
addWall(END_Z, { W: 5.2, H: 7, w: 1.9, h: 2.75, depth: 0.1, color: '#f4d2cc' });
segment({ halfW: 2.6, zFront: END_Z - 0.1, zBack: END_Z - 5, H: 7, color: '#f4d2cc' });
box(5.6, 7, 0.2, mat('#f2cdc6'), 0, 3.5, END_Z - 5.1);
{
  // Glowing arch on the end wall, so the end of the walk has something to look at
  const glow = new THREE.Mesh(new THREE.ShapeGeometry(archShape(1.6, 2.8), 32),
    mat('#ffffff', { emissive: '#ffe9e4', emissiveIntensity: 1.6 }));
  glow.position.z = END_Z - 4.99;
  scene.add(glow);
  const led = archLED(1.6, 2.8);
  led.position.z = END_Z - 4.98;
  scene.add(led);
}

// 6. Yellow side room (through the doorway on the right of the lavender hall)
{
  const m = mat('#f4d35e');
  box(6.2, 7.5, 0.2, m, 5.4, 3.75, -0.5);   // near wall
  box(6.2, 7.5, 0.2, m, 5.4, 3.75, -4.0);   // far wall
  box(0.2, 7.5, 3.7, m, 8.5, 3.75, -2.25);  // end wall
  box(6.2, 0.2, 3.7, m, 5.4, 7.6, -2.25);   // ceiling
  const glow = new THREE.Mesh(new THREE.ShapeGeometry(archShape(1.8, 3.0), 32),
    mat('#ffffff', { emissive: '#fff6dc', emissiveIntensity: 1.6 }));
  glow.rotation.y = -Math.PI / 2;
  glow.position.set(8.39, 0, -2.25);
  scene.add(glow);
  const doorLED = archLED(1.6, 2.7);
  doorLED.rotation.y = -Math.PI / 2;
  doorLED.position.set(2.41, 0, -2.25);
  scene.add(doorLED);
}

// Lights
scene.add(new THREE.HemisphereLight('#fff6ee', '#e6a585', 0.6));
const sun = new THREE.DirectionalLight('#fff1e0', 0.7);
sun.position.set(3, 8, 10);
scene.add(sun);
// One shadow-casting light per room, up near the ceiling
function roomLight(color, intensity, x, y, z, shadow = true) {
  const l = new THREE.PointLight(color, intensity, 0, 2);
  l.position.set(x, y, z);
  if (shadow) {
    l.castShadow = true;
    l.shadow.mapSize.set(1024, 1024);
    l.shadow.bias = -0.002;
    l.shadow.radius = 4;
    l.shadow.camera.near = 0.1;
    l.shadow.camera.far = 30;
  }
  scene.add(l);
  return l;
}
roomLight('#fff1e4', 60, 0, 8.5, 8);                          // entrance room, behind the viewer
roomLight('#f3eaff', 14, 0, 6.5, -2.2);                       // lavender hall
roomLight('#fff3d0', 14, 0, 5.6, -5.6);                       // yellow hall
roomLight('#fff4ea', 6, 0, 4.5, (RING_START + END_Z) / 2, false); // rainbow corridor fill
roomLight('#ffd9d2', 30, 0, 5.5, END_Z - 2.5);                // end room
roomLight('#fff0c0', 20, 5.4, 6.5, -2.25);                    // yellow room

// ---------- Camera paths ----------
// A route is a list of [x, z] points at eye height. Add a new route to walk into another room.

const ROUTES = {
  main: [[0, 7], [0, 0], [0, END_Z - 0.6]],
  yellow: [[0, 7], [0, 1], [0, -1.4], [1.0, -2.25], [2.8, -2.25], [5.0, -2.25]],
};
const path = new THREE.CatmullRomCurve3(
  (ROUTES[ROUTE] || ROUTES.main).map(([x, z]) => new THREE.Vector3(x, EYE, z)), false, 'centripetal');

const lookTarget = new THREE.Vector3();
function placeCamera(u) {
  const pos = path.getPointAt(u);
  const dir = path.getTangentAt(Math.min(u, 0.999));
  camera.position.copy(pos);
  camera.lookAt(lookTarget.copy(pos).add(dir));
}

// ---------- Webcam silhouette (same logic as the 2D piece) ----------

const video = document.createElement('video');
video.playsInline = true;
video.muted = true;
const sil = document.createElement('canvas');
sil.width = 160;
sil.height = 120;
const sctx = sil.getContext('2d', { willReadFrequently: true });

let camOn = false, camStart = 0, frames = 0, baseline = null, size = 0;
let target = 0, progress = 0, manual = 0;

navigator.mediaDevices?.getUserMedia({ video: { width: 640, height: 480 } })
  .then(stream => { video.srcObject = stream; return video.play(); })
  .then(() => { camOn = true; camStart = performance.now(); })
  .catch(err => console.warn('Camera unavailable, use scroll / arrow keys:', err));

function silhouetteSize() {
  sctx.drawImage(video, 0, 0, sil.width, sil.height);
  const img = sctx.getImageData(0, 0, sil.width, sil.height), d = img.data;
  const thr = params.threshold * 255;
  let black = 0;
  for (let i = 0; i < d.length; i += 4) {
    const v = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2] >= thr ? 255 : 0;
    if (!v) black++;
    if (DEBUG) d[i] = d[i + 1] = d[i + 2] = v;
  }
  if (DEBUG) sctx.putImageData(img, 0, 0);
  return black;
}

function update() {
  if (camOn && video.readyState >= 2) {
    size = silhouetteSize();
    // Count baseline frames only after the camera's first second, while its auto-exposure settles
    // (a wall-clock timer, not video.currentTime, which Firefox doesn't advance the same way for live cameras)
    if (frames < params.baselineFrames) { if (performance.now() - camStart > 1000) frames++; }
    else if (baseline === null) baseline = size;
    if (baseline) {
      target = size > baseline ? Math.min(1, (size - baseline) / (baseline * params.range)) : 0;
    }
  } else {
    target = manual;
  }
  progress += (target - progress) * params.smoothing;
}

function resetBaseline() {
  frames = 0;
  baseline = null;
  camStart = performance.now();
}

// Fallback without a camera: scroll or arrow keys walk the path
addEventListener('wheel', e => { manual = THREE.MathUtils.clamp(manual + e.deltaY * 0.0005, 0, 1); }, { passive: true });
addEventListener('keydown', e => {
  if (e.key === 'ArrowUp') manual = Math.min(1, manual + 0.05);
  if (e.key === 'ArrowDown') manual = Math.max(0, manual - 0.05);
  if (e.key === 'f' || e.key === 'F') toggleFullscreen();
  if (e.key === 'r' || e.key === 'R') resetBaseline();
});
renderer.domElement.addEventListener('click', toggleFullscreen);

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// ---------- Debug overlay (?debug) ----------

let statsEl = null, fps = 0, lastT = performance.now();
let lastError = '';
addEventListener('error', e => { lastError = e.message; });
addEventListener('unhandledrejection', e => { lastError = String(e.reason); });
const log = [];

if (DEBUG) {
  const el = document.createElement('div');
  el.id = 'debug';
  el.appendChild(sil);
  statsEl = document.createElement('div');
  el.appendChild(statsEl);
  for (const k in params) {
    const row = document.createElement('div');
    row.className = 'row';
    const label = document.createElement('span');
    const minus = document.createElement('button');
    const plus = document.createElement('button');
    minus.textContent = '−';
    plus.textContent = '+';
    const show = () => { label.textContent = `${k}: ${+params[k].toFixed(3)}`; };
    const step = dir => { setParam(k, params[k] + dir * LIMITS[k][2]); show(); };
    minus.onclick = () => step(-1);
    plus.onclick = () => step(1);
    show();
    row.append(label, minus, plus);
    el.appendChild(row);
  }
  const btns = document.createElement('div');
  btns.className = 'btns';
  const mk = (text, fn) => { const b = document.createElement('button'); b.textContent = text; b.onclick = fn; btns.appendChild(b); };
  mk('Reset baseline', resetBaseline);
  mk('Save log', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([logText()], { type: 'text/plain' }));
    a.download = `arches-3d-log-${Date.now()}.txt`;
    a.click();
  });
  mk('Copy log', () => navigator.clipboard.writeText(logText()));
  el.appendChild(btns);
  document.body.appendChild(el);

  setInterval(() => {
    log.push({ t: +(performance.now() / 1000).toFixed(2), size, baseline, target: +target.toFixed(3), progress: +progress.toFixed(3) });
    if (log.length > 2400) log.shift();
  }, 250);
}

function setParam(k, v) {
  params[k] = clampParam(k, +v.toFixed(3));
  if (k === 'fov') { camera.fov = params.fov; camera.updateProjectionMatrix(); }
  if (k === 'bloom') bloomPass.strength = params.bloom;
  if (k === 'ao') { aoPass.blendIntensity = params.ao; aoPass.enabled = params.ao > 0; }
  const q = new URLSearchParams(location.search);
  for (const p in params) {
    if (params[p] !== DEFAULT_PARAMS[p]) q.set(p, params[p]);
    else q.delete(p);
  }
  history.replaceState(null, '', '?' + q.toString());
}

function logText() {
  return `arches-3d log  params=${JSON.stringify(params)}  route=${ROUTE}\n` +
    log.map(s => `${s.t}s  size=${s.size}  base=${s.baseline}  target=${s.target}  progress=${s.progress}`).join('\n');
}

// ---------- Loop ----------

function frame(now) {
  fps = fps * 0.9 + (1000 / Math.max(1, now - lastT)) * 0.1;
  lastT = now;
  update();
  placeCamera(progress);
  composer.render();
  if (statsEl) {
    statsEl.innerHTML =
      `fps ${fps.toFixed(0)} · ${camOn ? 'camera' : 'scroll/arrows'}<br>` +
      `silhouette ${size}<br>baseline ${baseline ?? 'calculating…'}<br>` +
      `target ${target.toFixed(2)} · walk ${progress.toFixed(2)}<br>route ${ROUTE}` +
      (lastError ? `<br>error: ${lastError}` : '');
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
