// Low-poly procedural models. Each factory returns a THREE.Group roughly 0.9 units wide, origin at ground centre.
// group.userData.anim(t, active) animates moving parts; userData.smoke lists local emitter points.
import * as THREE from 'three';

const mats = new Map();
export function M(color, o = {}) {
  const k = color + JSON.stringify(o);
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.75, metalness: 0.1, ...o }));
  return mats.get(k);
}
const geos = new Map();
const G = (k, f) => { if (!geos.has(k)) geos.set(k, f()); return geos.get(k); };
function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m;
}
const box = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = mesh(G('box', () => new THREE.BoxGeometry(1, 1, 1)), mat, x, y + h / 2, z); m.scale.set(w, h, d); return m; };
const cyl = (r, h, mat, x = 0, y = 0, z = 0, seg = 10, rt = r) => { const m = mesh(G('cyl' + seg, () => new THREE.CylinderGeometry(1, 1, 1, seg)), mat, x, y + h / 2, z); m.scale.set(r, h, r); if (rt !== r) { m.geometry = G(`cone${seg}_${(rt / r).toFixed(2)}`, () => new THREE.CylinderGeometry(rt / r, 1, 1, seg)); } return m; };
const sph = (r, mat, x = 0, y = 0, z = 0) => { const m = mesh(G('sph', () => new THREE.SphereGeometry(1, 10, 8)), mat, x, y, z); m.scale.setScalar(r); return m; };
const lattice = (rb, rt, h, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(G(`lat${rb}_${rt}_${h}`, () => new THREE.CylinderGeometry(rt, rb, h, 4, 4, true)), M(0xd8dde3, { wireframe: true }));
  m.position.set(x, y + h / 2, z); m.rotation.y = Math.PI / 4; return m;
};
const C = { steel: 0x9aa4ae, dark: 0x3a4048, white: 0xeef1f4, red: 0xc8463c, amber: 0xf2a03d, teal: 0x2e9c93, blue: 0x3f7fbf, yellow: 0xf2c94c, conc: 0xb9b4a8, black: 0x1c1e22, glass: 0x7fb6d9 };
const FLAME = new THREE.MeshBasicMaterial({ color: 0xffa726 });
function flame(x, y, z, s = 1) {
  const f = new THREE.Mesh(G('flame', () => new THREE.ConeGeometry(0.05, 0.18, 6)), FLAME);
  f.position.set(x, y + 0.09 * s, z); f.scale.setScalar(s); f.userData.base = s; return f;
}
const flicker = (f, t) => { const k = f.userData.base * (0.8 + 0.35 * Math.sin(t * 17 + f.position.x * 9) * Math.sin(t * 11)); f.scale.set(k, k * (1 + 0.3 * Math.sin(t * 23)), k); };

export function pumpjack(level = 1) {
  const g = new THREE.Group();
  g.add(box(0.72, 0.04, 0.3, M(C.conc)));
  g.add(box(0.05, 0.4, 0.05, M(C.dark), 0, 0.04, 0.07), box(0.05, 0.4, 0.05, M(C.dark), 0, 0.04, -0.07));
  const beam = new THREE.Group(); beam.position.set(0, 0.46, 0);
  const col = [C.amber, C.teal, C.red][level - 1];
  beam.add(box(0.62, 0.05, 0.05, M(col), 0, -0.025, 0), box(0.09, 0.2, 0.07, M(col), 0.31, -0.14, 0));
  g.add(beam);
  const crank = new THREE.Group(); crank.position.set(-0.24, 0.16, 0);
  crank.add(box(0.07, 0.2, 0.05, M(C.black), 0, -0.04, 0.05), box(0.07, 0.2, 0.05, M(C.black), 0, -0.04, -0.05));
  g.add(crank);
  g.add(box(0.14, 0.12, 0.14, M(C.steel), -0.24, 0.04, 0), cyl(0.03, 0.14, M(C.red), 0.31, 0.04, 0, 8));
  if (level > 1) g.add(cyl(0.08, 0.16, M(C.white), 0.1, 0.04, -0.3, 10));
  if (level > 2) g.add(cyl(0.08, 0.16, M(C.white), -0.1, 0.04, -0.3, 10));
  const fl = flame(0.2, 0.3, 0.3); const stack = cyl(0.012, 0.3, M(C.dark), 0.2, 0, 0.3, 6); g.add(stack, fl);
  g.userData.anim = (t, on, flaring) => {
    if (on) { beam.rotation.z = Math.sin(t * 2.4) * 0.26; crank.rotation.z = t * 2.4; }
    fl.visible = stack.visible = !!flaring; if (flaring) flicker(fl, t);
  };
  return g;
}

export function derrick() {
  const g = new THREE.Group();
  g.add(box(0.6, 0.06, 0.6, M(C.conc)), lattice(0.3, 0.07, 1.05, 0, 0.06, 0), box(0.14, 0.06, 0.14, M(C.red), 0, 1.1, 0));
  const pipe = cyl(0.02, 0.9, M(C.amber), 0, 0.1, 0, 6); g.add(pipe);
  g.add(box(0.22, 0.14, 0.16, M(C.blue), 0.3, 0, 0.3), box(0.3, 0.05, 0.14, M(0x6b4f2a), -0.28, 0, -0.32), cyl(0.06, 0.16, M(C.steel), -0.32, 0, 0.3, 8));
  g.userData.anim = (t, on) => { if (on) { pipe.rotation.y = t * 6; pipe.position.y = 0.55 + Math.sin(t * 1.3) * 0.08; } };
  return g;
}

function platformBase(g, depth) {
  for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) g.add(cyl(0.045, 0.4 + depth, M(C.yellow), x, -depth, z, 8));
  g.add(box(0.84, 0.08, 0.84, M(C.dark), 0, 0.38, 0));
}
export function platform(level = 1, depth = 0.4) {
  const g = new THREE.Group(); platformBase(g, depth);
  g.add(box(0.3, 0.2, 0.34, M(C.white), -0.22, 0.46, -0.2), box(0.26, 0.12, 0.26, M([C.amber, C.teal, C.red][level - 1]), -0.22, 0.66, -0.2));
  g.add(lattice(0.14, 0.04, 0.5, 0.15, 0.46, 0.12), cyl(0.12, 0.02, M(C.teal), -0.22, 0.79, -0.2, 12));
  g.add(cyl(0.07, 0.14, M(C.steel), 0.25, 0.46, -0.25, 8), box(0.2, 0.1, 0.2, M(C.blue), -0.25, 0.46, 0.25));
  const boom = box(0.5, 0.025, 0.025, M(C.steel), 0.6, 0.6, 0.3); boom.rotation.z = 0.5; g.add(boom);
  const fl = flame(0.82, 0.72, 0.3, 1.3); g.add(fl);
  g.userData.anim = (t, on, flaring) => { fl.visible = !!flaring || on; fl.userData.base = flaring ? 1.8 : 0.6; flicker(fl, t); };
  return g;
}
export function jackup(depth = 0.4) {
  const g = new THREE.Group(); platformBase(g, depth);
  g.add(lattice(0.24, 0.06, 0.9, 0, 0.46, 0), box(0.12, 0.05, 0.12, M(C.red), 0, 1.36, 0), box(0.2, 0.14, 0.2, M(C.white), -0.28, 0.46, -0.28));
  const pipe = cyl(0.018, 0.8, M(C.amber), 0, 0.3, 0, 6); g.add(pipe);
  g.userData.anim = (t, on) => { if (on) { pipe.rotation.y = t * 6; pipe.position.y = 0.75 + Math.sin(t * 1.3) * 0.08; } };
  return g;
}

export function tankFarm() {
  const g = new THREE.Group(); g.add(box(0.9, 0.03, 0.9, M(C.conc)));
  const cols = [C.white, C.white, 0xdfe5ea, C.white];
  [[-0.21, -0.21], [0.21, -0.21], [-0.21, 0.21], [0.21, 0.21]].forEach(([x, z], i) => {
    g.add(cyl(0.18, 0.26 + (i % 2) * 0.06, M(cols[i]), x, 0.03, z, 14), cyl(0.185, 0.03, M(i === 2 ? C.teal : C.amber), x, 0.2, z, 14));
  });
  g.add(box(0.04, 0.04, 0.6, M(C.steel), 0, 0.05, 0), box(0.6, 0.04, 0.04, M(C.steel), 0, 0.05, 0));
  return g;
}

function chimney(g, x, z, h) {
  for (let i = 0; i < 4; i++) g.add(cyl(0.045 - i * 0.004, h / 4, M(i % 2 ? C.white : C.red), x, 0.03 + i * h / 4, z, 8));
}
export function refinery() {
  const g = new THREE.Group(); g.add(box(0.94, 0.03, 0.94, M(C.conc)));
  g.add(cyl(0.065, 0.85, M(C.steel), -0.25, 0.03, -0.2, 10), cyl(0.085, 0.62, M(0xb7c0c9), -0.05, 0.03, -0.28, 10), cyl(0.05, 1.0, M(C.steel), 0.14, 0.03, -0.2, 10));
  for (const y of [0.3, 0.55, 0.78]) g.add(cyl(0.1, 0.015, M(C.yellow), -0.25, y, -0.2, 10));
  g.add(box(0.26, 0.2, 0.2, M(0x8d6e63), 0.3, 0.03, 0.22), sph(0.13, M(C.white), -0.28, 0.2, 0.25), cyl(0.02, 0.1, M(C.dark), -0.28, 0.03, 0.25, 6));
  g.add(cyl(0.1, 0.18, M(C.white), 0.02, 0.03, 0.26, 12));
  g.add(box(0.7, 0.03, 0.05, M(C.dark), 0, 0.22, 0), box(0.03, 0.2, 0.03, M(C.dark), -0.33, 0.03, 0), box(0.03, 0.2, 0.03, M(C.dark), 0.33, 0.03, 0));
  chimney(g, 0.36, -0.3, 0.9);
  g.add(cyl(0.012, 0.75, M(C.dark), 0.4, 0.03, 0, 6));
  const fl = flame(0.4, 0.78, 0, 1.2); g.add(fl);
  g.userData.smoke = [[0.36, 0.95, -0.3]];
  g.userData.anim = (t, on) => { fl.visible = on; if (on) flicker(fl, t); };
  return g;
}

export function gasPlant() {
  const g = new THREE.Group(); g.add(box(0.9, 0.03, 0.9, M(C.conc)));
  for (const z of [-0.26, -0.04]) {
    const b = cyl(0.08, 0.5, M(C.white), -0.12, 0.1, z, 10); b.rotation.z = Math.PI / 2; b.position.y = 0.15; g.add(b);
    g.add(box(0.05, 0.08, 0.14, M(C.dark), -0.3, 0.03, z), box(0.05, 0.08, 0.14, M(C.dark), 0.06, 0.03, z));
  }
  g.add(sph(0.14, M(C.teal), 0.27, 0.22, -0.2), cyl(0.02, 0.1, M(C.dark), 0.27, 0.03, -0.2, 6));
  g.add(cyl(0.05, 0.6, M(C.steel), -0.3, 0.03, 0.28, 10), cyl(0.04, 0.45, M(C.steel), -0.14, 0.03, 0.3, 10));
  g.add(box(0.34, 0.16, 0.24, M(C.white), 0.22, 0.03, 0.24), box(0.36, 0.03, 0.26, M(C.blue), 0.22, 0.19, 0.24));
  return g;
}

function jetty(g, len, y) {
  g.add(box(len, 0.03, 0.12, M(0x8b7355), 0.45 + len / 2, y, 0));
  for (let x = 0.6; x < 0.45 + len; x += 0.3) g.add(cyl(0.015, 0.3, M(C.dark), x, y - 0.3, 0.05, 5), cyl(0.015, 0.3, M(C.dark), x, y - 0.3, -0.05, 5));
}
// elev: tile height above sea, so the jetty can sit just above the water. Local +x points out to sea.
export function terminal(elev = 0.2) {
  const g = new THREE.Group(); g.add(box(0.9, 0.03, 0.9, M(C.conc)));
  g.add(cyl(0.2, 0.24, M(C.white), -0.18, 0.03, -0.2, 14), cyl(0.205, 0.03, M(C.amber), -0.18, 0.2, -0.2, 14));
  g.add(box(0.36, 0.18, 0.26, M(0x8d6e63), -0.2, 0.03, 0.24), box(0.38, 0.03, 0.28, M(C.red), -0.2, 0.21, 0.24));
  g.add(lattice(0.06, 0.03, 0.45, 0.3, 0.03, 0.2));
  const arm = box(0.4, 0.03, 0.03, M(C.yellow), 0.42, 0.44, 0.2); g.add(arm);
  jetty(g, 1.0, 0.07 - elev);
  g.userData.anim = (t) => { arm.rotation.y = Math.sin(t * 0.4) * 0.5; };
  return g;
}

export function petchem() {
  const g = new THREE.Group(); g.add(box(0.94, 0.03, 0.94, M(C.conc)));
  const pts = []; for (let i = 0; i <= 8; i++) { const v = i / 8; pts.push(new THREE.Vector2(0.14 + 0.09 * (2 * v - 0.9) ** 2, v * 0.5)); }
  const tower = mesh(G('cool', () => new THREE.LatheGeometry(pts, 14)), M(0xd9d4c7, { side: THREE.DoubleSide }), 0.24, 0.03, 0.22); g.add(tower);
  g.add(cyl(0.06, 0.7, M(C.teal), -0.3, 0.03, -0.28, 10), cyl(0.06, 0.55, M(C.amber), -0.14, 0.03, -0.3, 10), cyl(0.05, 0.85, M(0xc58af9), 0.02, 0.03, -0.26, 10));
  g.add(sph(0.11, M(C.white), -0.28, 0.17, 0.12), sph(0.11, M(C.white), -0.28, 0.17, 0.34));
  g.add(box(0.5, 0.03, 0.04, M(C.dark), -0.1, 0.3, -0.12), box(0.04, 0.03, 0.4, M(C.dark), -0.05, 0.25, 0.1), box(0.22, 0.14, 0.2, M(C.blue), 0.3, 0.03, -0.26));
  chimney(g, 0.4, -0.02, 0.7);
  g.userData.smoke = [[0.4, 0.75, -0.02]]; g.userData.steam = [[0.24, 0.55, 0.22]];
  return g;
}

export function lngTerminal(elev = 0.2) {
  const g = new THREE.Group(); g.add(box(0.94, 0.03, 0.94, M(C.conc)));
  for (const z of [-0.23, 0.23]) {
    g.add(cyl(0.2, 0.26, M(C.white), -0.2, 0.03, z, 16));
    const d = sph(0.2, M(0xdfe9ef), -0.2, 0.29, z); d.scale.y = 0.09; g.add(d);
    g.add(cyl(0.205, 0.025, M(0x9be7ff), -0.2, 0.14, z, 16));
  }
  g.add(box(0.12, 0.6, 0.12, M(C.steel), 0.2, 0.03, -0.22), box(0.24, 0.12, 0.2, M(C.blue), 0.22, 0.03, 0.22));
  jetty(g, 1.0, 0.07 - elev);
  return g;
}

export function hq() {
  const g = new THREE.Group(); g.add(box(0.9, 0.03, 0.9, M(C.conc)));
  g.add(box(0.34, 0.95, 0.34, M(C.glass, { roughness: 0.25, metalness: 0.5 }), -0.12, 0.03, -0.1));
  for (let y = 0.15; y < 0.95; y += 0.16) g.add(box(0.35, 0.02, 0.35, M(C.white), -0.12, y, -0.1));
  g.add(box(0.36, 0.04, 0.36, M(C.dark), -0.12, 0.98, -0.1), box(0.42, 0.22, 0.3, M(C.white), 0.18, 0.03, 0.22), box(0.44, 0.03, 0.32, M(C.amber), 0.18, 0.25, 0.22));
  g.add(cyl(0.008, 0.3, M(C.dark), -0.12, 1.02, -0.1, 5));
  const flag = box(0.14, 0.08, 0.01, M(C.amber), -0.05, 1.22, -0.1); g.add(flag);
  g.add(cyl(0.1, 0.1, M(C.white), 0.25, 0.03, -0.25, 10), cyl(0.1, 0.1, M(C.white), -0.3, 0.03, 0.3, 10));
  g.userData.anim = (t) => { flag.rotation.y = Math.sin(t * 3) * 0.25; };
  return g;
}

export function ship(lng = false) {
  const g = new THREE.Group();
  g.add(box(0.95, 0.1, 0.2, M(lng ? 0x244a6b : 0x7a2b25), 0, -0.02, 0), box(0.9, 0.03, 0.19, M(0x8d5b4f), 0, 0.08, 0));
  g.add(box(0.14, 0.16, 0.16, M(C.white), -0.36, 0.11, 0), cyl(0.025, 0.08, M(C.amber), -0.38, 0.27, 0, 6));
  if (lng) for (const x of [-0.12, 0.1, 0.32]) { const d = sph(0.085, M(C.white), x, 0.11, 0); g.add(d); }
  else g.add(box(0.5, 0.03, 0.03, M(C.steel), 0.08, 0.11, 0), box(0.04, 0.05, 0.14, M(C.steel), 0.1, 0.11, 0));
  return g;
}
export function truck() {
  const g = new THREE.Group();
  const tank = cyl(0.035, 0.13, M(C.steel), 0, 0, 0, 8); tank.rotation.z = Math.PI / 2; tank.position.set(-0.02, 0.055, 0);
  g.add(tank, box(0.05, 0.06, 0.07, M(C.amber), 0.08, 0.015, 0));
  return g;
}
export function scaffold() {
  const m = new THREE.Mesh(G('scaf', () => new THREE.BoxGeometry(0.92, 0.7, 0.92, 3, 3, 3)), new THREE.MeshBasicMaterial({ color: 0xf2c94c, wireframe: true, transparent: true, opacity: 0.7 }));
  m.position.y = 0.35; return m;
}
