// Three.js scene: terrain, buildings, underground X-ray view, particles, camera and picking.
import * as THREE from 'three';
import { N, T, TIERS } from './data.js';
import * as MD from './models.js';
import { isSea } from './sim.js';

const H = N / 2;
const wx = x => x - H + 0.5;
const TIER_Y = [-1.6, -3.0, -4.6];
let renderer, scene, camera, canvas, sun;
let terrainMesh, waterMesh, oceanMesh, overlayMesh, decor, under, hoverBox, selBox, particles;
let world = null;
const objs = new Map();      // building id -> { group, sig }
const rigObjs = new Map();   // rig id -> { group, bore }
const pulses = [];
const ships = new Map(), trucks = new Map(), pipes = new Map();
const decorAt = [];
const cam = { tx: 0, tz: 0, dist: 34, az: 0.7, pol: 0.95, gx: 0, gz: 0, gd: 34 };
let xray = false, tclock = 0;
const dummy = new THREE.Object3D(), col = new THREE.Color();
export const cb = { click: null, hover: null };

const surfY = i => Math.max(world.elev[i], 0);

export function init(cv) {
  canvas = cv;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fd3ee);
  scene.fog = new THREE.Fog(0x9fd3ee, 60, 150);
  camera = new THREE.PerspectiveCamera(38, 1, 0.5, 400);
  scene.add(new THREE.HemisphereLight(0xdcefff, 0x8a7a5a, 1.15));
  sun = new THREE.DirectionalLight(0xfff0d0, 2.1);
  sun.position.set(22, 34, 12); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -27, right: 27, top: 27, bottom: -27, near: 1, far: 90 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  scene.add(sun);

  const edge = new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
  hoverBox = new THREE.LineSegments(edge, new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }));
  selBox = new THREE.LineSegments(edge, new THREE.LineBasicMaterial({ color: 0xf2a03d, depthTest: false, transparent: true }));
  hoverBox.renderOrder = selBox.renderOrder = 10; hoverBox.visible = selBox.visible = false;
  scene.add(hoverBox, selBox);

  particles = makeParticles();
  bindControls();
  resize();
  window.addEventListener('resize', resize);
}
function resize() {
  const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}

// ---------- world ----------
export function loadWorld(s) {
  world = s.world;
  for (const o of [terrainMesh, waterMesh, oceanMesh, overlayMesh, decor, under]) if (o) scene.remove(o);
  for (const m of [objs, rigObjs, ships, trucks, pipes]) { for (const v of m.values()) scene.remove(v.group || v); m.clear(); }
  pulses.splice(0).forEach(p => scene.remove(p.m));

  const cnt = N * N;
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, -0.5, 0);
  terrainMesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9, transparent: false }), cnt);
  terrainMesh.receiveShadow = true;
  const palette = { [T.DEEP]: [0x2c4a5e], [T.SHALLOW]: [0xc9b77f, 0xbfae76], [T.GRASS]: [0x6fae4e, 0x67a548, 0x78b556], [T.DESERT]: [0xdcb872, 0xd4ae66, 0xe2c282], [T.TUNDRA]: [0xe8eef2, 0xdde6ec, 0xf3f7f9], [T.MOUNTAIN]: [0x8a8f96, 0x7f858c] };
  let seed = 12345; const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < cnt; i++) {
    const x = i % N, y = Math.floor(i / N), e = world.elev[i];
    dummy.position.set(wx(x), e, wx(y)); dummy.scale.set(0.97, e + 1.4, 0.97); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
    terrainMesh.setMatrixAt(i, dummy.matrix);
    const p = palette[world.terrain[i]]; col.setHex(p[Math.floor(R() * p.length)]);
    terrainMesh.setColorAt(i, col);
  }
  scene.add(terrainMesh);

  waterMesh = new THREE.Mesh(new THREE.PlaneGeometry(N, N).rotateX(-Math.PI / 2), new THREE.MeshPhongMaterial({ color: 0x2a8fd0, transparent: true, opacity: 0.66, shininess: 90, specular: 0x88bbdd }));
  waterMesh.position.y = -0.02; waterMesh.receiveShadow = true;
  // Ocean beyond the map: a big ring-like plane with a hole would be overkill; draw it just below.
  oceanMesh = new THREE.Mesh(new THREE.PlaneGeometry(500, 500).rotateX(-Math.PI / 2), new THREE.MeshPhongMaterial({ color: 0x1f6fa8, shininess: 60 }));
  oceanMesh.position.y = -1.45;
  const skirt = new THREE.Mesh(new THREE.RingGeometry(N * 0.5, 260, 4, 1).rotateX(-Math.PI / 2).rotateY(Math.PI / 4), new THREE.MeshPhongMaterial({ color: 0x2379b5, shininess: 60 }));
  skirt.scale.set(Math.SQRT2, 1, Math.SQRT2); skirt.position.y = 1.43; oceanMesh.add(skirt);
  scene.add(waterMesh, oceanMesh);

  // Survey overlay
  overlayMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.93, 0.93).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.62, depthWrite: false }), cnt);
  overlayMesh.renderOrder = 3; overlayMesh.visible = false;
  scene.add(overlayMesh);

  // Decor: trees, rocks, peaks
  decor = new THREE.Group(); decorAt.length = 0;
  const trees = [], rocks = [], peaks = [], caps = [];
  for (let i = 0; i < cnt; i++) {
    const x = i % N, y = Math.floor(i / N), t = world.terrain[i], e = world.elev[i];
    decorAt[i] = [];
    const put = (arr, sx, sy, c) => arr.push({ i, x: wx(x) + (R() - 0.5) * 0.7, y: e, z: wx(y) + (R() - 0.5) * 0.7, sx, sy, c, r: R() * 6 });
    if (t === T.GRASS) { const n = R() < 0.5 ? 0 : 1 + Math.floor(R() * 3); for (let k = 0; k < n; k++) put(trees, 0.8 + R() * 0.5, 0.8 + R() * 0.7, R() < 0.5 ? 0x2f7d3b : 0x3d8f45); }
    else if (t === T.TUNDRA) { if (R() < 0.3) put(trees, 0.7, 1.1, 0x4b7a68); if (R() < 0.15) put(rocks, 1, 1, 0xb8c4cc); }
    else if (t === T.DESERT) { if (R() < 0.3) put(rocks, 0.7 + R(), 0.6 + R() * 0.8, 0xb98d55); }
    else if (t === T.MOUNTAIN) {
      const hgt = 0.55 + R() * 0.75;
      peaks.push({ i, x: wx(x), y: e, z: wx(y), sx: 0.9, sy: hgt, c: R() < 0.5 ? 0x868b92 : 0x797f87, r: Math.PI / 4 });
      caps.push({ i, x: wx(x), y: e + hgt * 0.62, z: wx(y), sx: 0.9 * 0.38, sy: hgt * 0.38, c: 0xf5f7f9, r: Math.PI / 4 });
    }
  }
  const inst = (geo, list, shadow) => {
    const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 }), Math.max(1, list.length));
    m.count = list.length; m.castShadow = shadow; m.receiveShadow = true;
    list.forEach((d, k) => {
      dummy.position.set(d.x, d.y, d.z); dummy.scale.set(d.sx, d.sy, d.sx); dummy.rotation.set(0, d.r, 0); dummy.updateMatrix();
      m.setMatrixAt(k, dummy.matrix); m.setColorAt(k, col.setHex(d.c)); decorAt[d.i].push([m, k]);
    });
    decor.add(m); return m;
  };
  inst(new THREE.ConeGeometry(0.13, 0.4, 6).translate(0, 0.2, 0), trees, true);
  inst(new THREE.DodecahedronGeometry(0.09, 0).translate(0, 0.04, 0), rocks, true);
  inst(new THREE.ConeGeometry(0.72, 1, 4).translate(0, 0.5, 0), peaks, true);
  inst(new THREE.ConeGeometry(0.72, 1, 4).translate(0, 0.5, 0), caps, false);
  scene.add(decor);

  // Underground
  under = new THREE.Group(); under.visible = false;
  for (let t = 0; t < 3; t++) {
    const gh = new THREE.GridHelper(N, N / 2, 0x3b556b, 0x26394a); gh.position.y = TIER_Y[t] - 0.25; gh.material.transparent = true; gh.material.opacity = 0.5; under.add(gh);
  }
  const total = world.reservoirs.reduce((a, r) => a + r.tiles.length, 0);
  under.blobs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.66, 10, 8), new THREE.MeshStandardMaterial({ roughness: 0.4, emissive: 0x222222, flatShading: true }), total);
  under.bores = new THREE.Group();
  under.add(under.blobs, under.bores);
  scene.add(under);

  cam.gx = cam.tx = wx(world.hq.x); cam.gz = cam.tz = wx(world.hq.y); cam.gd = cam.dist = 26;
  setXray(xray);
  updateOverlay(s); sync(s);
}

const RAMP = [[0, 0x3a5f8a], [0.2, 0x3d8f8a], [0.4, 0x8fbf4a], [0.6, 0xf2c94c], [0.8, 0xf2843d], [1, 0xe5383b]];
const c2 = new THREE.Color();
export function updateOverlay(s) {
  for (let i = 0; i < N * N; i++) {
    const v = s.survey[i], x = i % N, y = Math.floor(i / N);
    dummy.position.set(wx(x), surfY(i) + 0.03, wx(y)); dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(v < 0 ? 0 : 1); dummy.updateMatrix();
    overlayMesh.setMatrixAt(i, dummy.matrix);
    if (v >= 0) {
      let k = 0; while (k < RAMP.length - 2 && v > RAMP[k + 1][0]) k++;
      const f = (v - RAMP[k][0]) / (RAMP[k + 1][0] - RAMP[k][0]);
      col.setHex(RAMP[k][1]).lerp(c2.setHex(RAMP[k + 1][1]), Math.max(0, Math.min(1, f)));
      overlayMesh.setColorAt(i, col);
    }
  }
  overlayMesh.instanceMatrix.needsUpdate = true; if (overlayMesh.instanceColor) overlayMesh.instanceColor.needsUpdate = true;
}
export function setOverlay(on) { if (overlayMesh) overlayMesh.visible = on; }
export function setXray(on) {
  xray = on; if (!terrainMesh) return;
  const m = terrainMesh.material; m.transparent = on; m.opacity = on ? 0.16 : 1; m.depthWrite = !on; m.needsUpdate = true;
  waterMesh.material.opacity = on ? 0.12 : 0.66; oceanMesh.visible = !on; decor.visible = !on; under.visible = on;
  scene.background.setHex(on ? 0x0d1620 : 0x9fd3ee); scene.fog.color.setHex(on ? 0x0d1620 : 0x9fd3ee);
}

function hideDecor(i) { for (const [m, k] of decorAt[i]) { m.getMatrixAt(k, dummy.matrix); dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale); dummy.scale.setScalar(0); dummy.updateMatrix(); m.setMatrixAt(k, dummy.matrix); m.instanceMatrix.needsUpdate = true; } decorAt[i] = []; }

function seaDir(s, x, y) {
  for (const [a, b, r] of [[1, 0, 0], [0, 1, -Math.PI / 2], [-1, 0, Math.PI], [0, -1, Math.PI / 2]])
    if (x + a >= 0 && y + b >= 0 && x + a < N && y + b < N && isSea(s, x + a, y + b)) return { a, b, r };
  return { a: 1, b: 0, r: 0 };
}
function makeBuilding(s, b) {
  const i = b.y * N + b.x, e = world.elev[i];
  let g;
  switch (b.type) {
    case 'hq': g = MD.hq(); break;
    case 'well': g = b.sea ? MD.platform(b.level, -e) : MD.pumpjack(b.level); break;
    case 'tank': g = MD.tankFarm(); break;
    case 'refinery': g = MD.refinery(); break;
    case 'gasplant': g = MD.gasPlant(); break;
    case 'terminal': g = MD.terminal(e); break;
    case 'petchem': g = MD.petchem(); break;
    case 'lng': g = MD.lngTerminal(e); break;
  }
  g.position.set(wx(b.x), surfY(i), wx(b.y));
  if (b.type === 'terminal' || b.type === 'lng') g.rotation.y = seaDir(s, b.x, b.y).r;
  else if (b.type === 'well' && !b.sea) g.rotation.y = (b.id * 1.3) % 6.28;
  if (b.build) g.add(MD.scaffold());
  hideDecor(i);
  return g;
}
function tilePath(a, b) { // L-shaped tile path
  const p = [[a.x, a.y]]; let x = a.x, y = a.y;
  while (x !== b.x) { x += Math.sign(b.x - x); p.push([x, y]); }
  while (y !== b.y) { y += Math.sign(b.y - y); p.push([x, y]); }
  return p;
}
function makePipe(a, b) {
  const g = new THREE.Group(), path = tilePath(a, b), mat = MD.M(0xc9ced4, { metalness: 0.5, roughness: 0.4 });
  const pt = ([x, y]) => new THREE.Vector3(wx(x), Math.max(world.elev[y * N + x], -0.12) + 0.07, wx(y));
  for (let k = 0; k < path.length - 1; k++) {
    const p = pt(path[k]), q = pt(path[k + 1]), len = p.distanceTo(q);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len + 0.06, 6).rotateX(Math.PI / 2), mat);
    m.position.copy(p).lerp(q, 0.5); m.lookAt(q); m.castShadow = true; g.add(m);
  }
  return g;
}

// Reconcile scene objects with sim state. Cheap enough to call every tick.
export function sync(s) {
  if (!world) return;
  const seen = new Set();
  for (const b of s.buildings) {
    seen.add(b.id);
    const sig = `${b.type}|${b.build ? 1 : 0}|${b.level || 0}`;
    let o = objs.get(b.id);
    if (!o || o.sig !== sig) { if (o) scene.remove(o.group); o = { group: makeBuilding(s, b), sig }; scene.add(o.group); objs.set(b.id, o); }
    o.b = b;
    if (b.build) { const p = 1 - b.build / b.build0; o.group.scale.y = 0.2 + 0.8 * p; } else o.group.scale.y = 1;
    // pipelines, trucks, ships
    const dep = b.type === 'well' && s.buildings.find(q => q.id === b.depot);
    if (dep && b.pipe) { const k = b.id + ':' + dep.id; if (!pipes.has(b.id) || pipes.get(b.id).k !== k) { if (pipes.has(b.id)) scene.remove(pipes.get(b.id)); const g = makePipe(b, dep); g.k = k; pipes.set(b.id, g); scene.add(g); } }
    if (dep && !b.pipe && !b.build && !b.sea && !trucks.has(b.id)) { const g = MD.truck(); g.ph = Math.random(); trucks.set(b.id, g); scene.add(g); }
    if (trucks.has(b.id)) { const g = trucks.get(b.id); if (b.pipe || !dep) { scene.remove(g); trucks.delete(b.id); } else { g.a = b; g.d = dep; } }
    if ((b.type === 'terminal' || b.type === 'lng') && !b.build && !ships.has(b.id)) { const g = MD.ship(b.type === 'lng'); g.dir = seaDir(s, b.x, b.y); g.home = b; g.ph = Math.random() * 30; ships.set(b.id, g); scene.add(g); }
  }
  for (const [id, o] of objs) if (!seen.has(id)) { scene.remove(o.group); objs.delete(id); }
  for (const m of [pipes, trucks, ships]) for (const [id, g] of m) if (!seen.has(id)) { scene.remove(g); m.delete(id); }

  const rs = new Set();
  for (const r of s.rigs) {
    rs.add(r.id);
    let o = rigObjs.get(r.id);
    if (!o) {
      const i = r.y * N + r.x, sea = world.terrain[i] <= 1;
      const g = sea ? MD.jackup(-world.elev[i]) : MD.derrick();
      g.position.set(wx(r.x), surfY(i), wx(r.y)); hideDecor(i);
      o = { group: g }; scene.add(g); rigObjs.set(r.id, o);
    }
    o.r = r;
  }
  for (const [id, o] of rigObjs) if (!rs.has(id)) { scene.remove(o.group); rigObjs.delete(id); }

  // survey pulses
  for (const j of s.jobs) if (!pulses.some(p => p.j === j)) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x9be7ff, transparent: true, depthTest: false }));
    m.position.set(wx(j.x), surfY(j.y * N + j.x) + 0.1, wx(j.y)); m.renderOrder = 5; scene.add(m); pulses.push({ j, m, r: j.r + 0.5 });
  }
  for (let k = pulses.length - 1; k >= 0; k--) if (!s.jobs.includes(pulses[k].j)) { scene.remove(pulses[k].m); pulses.splice(k, 1); }

  syncUnder(s);
}
function syncUnder(s) {
  let k = 0;
  const oil = new THREE.Color(0xf2a03d), gas = new THREE.Color(0x4fd1c5);
  for (const r of world.reservoirs) for (const i of r.tiles) {
    const f = r.disc ? 0.35 + 0.65 * Math.max(r.oil / r.oil0, r.gas / r.gas0) : 0;
    dummy.position.set(wx(i % N), TIER_Y[r.tier], wx(Math.floor(i / N))); dummy.rotation.set(0, 0, 0);
    dummy.scale.set(f, f * 0.5, f); dummy.updateMatrix();
    under.blobs.setMatrixAt(k, dummy.matrix); under.blobs.setColorAt(k, r.type === 'oil' ? oil : gas); k++;
  }
  under.blobs.instanceMatrix.needsUpdate = true; if (under.blobs.instanceColor) under.blobs.instanceColor.needsUpdate = true;
  // wellbores
  while (under.bores.children.length) under.bores.remove(under.bores.children[0]);
  const bore = (x, y, depthY, color) => {
    const top = surfY(y * N + x), len = top - depthY;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, len, 6), new THREE.MeshBasicMaterial({ color }));
    m.position.set(wx(x), top - len / 2, wx(y)); under.bores.add(m);
  };
  for (const b of s.buildings) if (b.type === 'well') bore(b.x, b.y, TIER_Y[b.tier], 0xffffff);
  for (const r of s.rigs) bore(r.x, r.y, -0.2 + (TIER_Y[2] - 0.0) * (r.depth / TIERS[2].depth), 0xff7043);
}

// ---------- particles ----------
function makeParticles() {
  const MAX = 260;
  const m = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.82 }), MAX);
  m.frustumCulled = false; scene.add(m);
  const list = [];
  for (let i = 0; i < MAX; i++) { dummy.scale.setScalar(0); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); m.setColorAt(i, col.setHex(0xffffff)); }
  return { m, list, MAX };
}
function emit(x, y, z, vx, vy, vz, life, size, color, grav = 0, grow = 1) {
  if (particles.list.length >= particles.MAX) return;
  particles.list.push({ x, y, z, vx, vy, vz, life, max: life, size, color, grav, grow });
}
function stepParticles(dt) {
  const { m, list, MAX } = particles;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i]; p.life -= dt;
    if (p.life <= 0 || p.y < -0.2) { list.splice(i, 1); continue; }
    p.vy -= p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
  }
  for (let i = 0; i < MAX; i++) {
    const p = list[i];
    if (p) { const a = p.life / p.max; dummy.position.set(p.x, p.y, p.z); dummy.scale.setScalar(p.size * (p.grow > 1 ? 1 + (1 - a) * (p.grow - 1) : 1) * Math.min(1, a * 3)); m.setColorAt(i, col.setHex(p.color)); }
    else dummy.scale.setScalar(0);
    dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
  }
  m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
}
const bursts = [];
export function burst(type, x, y) { bursts.push({ type, x: wx(x), z: wx(y), y: surfY(y * N + x), t: type === 'gusher' || type === 'gasjet' ? 4 : type === 'fire' ? 3 : 0.4 }); }

// ---------- frame ----------
let smokeAcc = 0;
export function frame(dt, running) {
  if (!world) return;
  tclock += dt;
  const t = tclock;
  // camera easing
  const k = 1 - Math.exp(-dt * 9);
  cam.tx += (cam.gx - cam.tx) * k; cam.tz += (cam.gz - cam.tz) * k; cam.dist += (cam.gd - cam.dist) * k;
  const sp = Math.sin(cam.pol), cp = Math.cos(cam.pol);
  camera.position.set(cam.tx + cam.dist * sp * Math.sin(cam.az), cam.dist * cp + (xray ? -1.5 : 0), cam.tz + cam.dist * sp * Math.cos(cam.az));
  camera.lookAt(cam.tx, xray ? -1.5 : 0, cam.tz);

  waterMesh.position.y = -0.03 + Math.sin(t * 0.8) * 0.012;
  smokeAcc += dt; const puff = smokeAcc > 0.22; if (puff) smokeAcc = 0;
  for (const o of objs.values()) {
    const b = o.b, g = o.group, on = running && !b.build && !(b.offline > 0);
    const active = on && (b.type !== 'well' || (b.last && b.last.oil + b.last.gas > 0)) && (b.type !== 'refinery' || (b.last && b.last.in > 0));
    if (g.userData.anim) g.userData.anim(t, active, b.last && b.last.flared > 1);
    if (puff && active && !xray) {
      for (const p of g.userData.smoke || []) emit(g.position.x + p[0], g.position.y + p[1], g.position.z + p[2], 0.12, 0.35, 0.05, 2.6, 0.06, 0x8c9299, 0, 3);
      for (const p of g.userData.steam || []) emit(g.position.x + p[0], g.position.y + p[1], g.position.z + p[2], 0.08, 0.3, 0.03, 2.2, 0.08, 0xffffff, 0, 2.6);
    }
  }
  for (const o of rigObjs.values()) o.group.userData.anim(t, running && o.r.status === 'drilling');
  for (const p of pulses) { const f = (t * 0.6) % 1; p.m.scale.setScalar(0.3 + f * p.r); p.m.material.opacity = 1 - f; }

  for (const g of trucks.values()) {
    if (!g.a) continue;
    const ph = running ? (g.ph = (g.ph + dt * 0.5 / Math.max(2, g.a.dist)) % 2) : g.ph, f = ph < 1 ? ph : 2 - ph;
    const x = g.a.x + (g.d.x - g.a.x) * f, y = g.a.y + (g.d.y - g.a.y) * f;
    const i = Math.round(y) * N + Math.round(x);
    g.position.set(wx(x), surfY(i) + 0.02, wx(y));
    g.rotation.y = Math.atan2(-(g.d.y - g.a.y), g.d.x - g.a.x) + (ph < 1 ? 0 : Math.PI);
    g.visible = !xray;
  }
  for (const g of ships.values()) {
    if (running) g.ph = (g.ph + dt) % 40;
    const ph = g.ph, far = 22, near = 1.75;
    const d = ph < 12 ? far - (far - near) * (1 - Math.pow(1 - ph / 12, 2)) : ph < 26 ? near : near + (far - near) * Math.pow((ph - 26) / 14, 2);
    g.position.set(wx(g.home.x) + g.dir.a * d + g.dir.b * 0.3, 0.02 + Math.sin(t * 1.5 + g.ph) * 0.01, wx(g.home.y) + g.dir.b * d + g.dir.a * 0.3);
    g.rotation.y = g.dir.r + (ph < 26 ? Math.PI : 0);
    g.visible = !xray;
  }

  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i]; b.t -= dt; if (b.t <= 0) { bursts.splice(i, 1); continue; }
    const r = () => Math.random() - 0.5;
    if (b.type === 'gusher') for (let k2 = 0; k2 < 3; k2++) emit(b.x, b.y + 1, b.z, r() * 0.9, 2.6 + Math.random(), r() * 0.9, 1.8, 0.05, 0x14100c, 4.5);
    else if (b.type === 'gasjet') for (let k2 = 0; k2 < 3; k2++) emit(b.x, b.y + 1, b.z, r() * 0.5, 2 + Math.random(), r() * 0.5, 0.9, 0.07, Math.random() < 0.5 ? 0xffa726 : 0x4fd1c5, 0, 1.6);
    else if (b.type === 'fire') for (let k2 = 0; k2 < 4; k2++) emit(b.x + r() * 0.4, b.y + 0.2, b.z + r() * 0.4, r() * 0.4, 1 + Math.random() * 1.5, r() * 0.4, 1.3, 0.09, Math.random() < 0.6 ? 0xff7043 : 0x2b2b2b, 0, 2.2);
    else if (b.type === 'dust') for (let k2 = 0; k2 < 3; k2++) emit(b.x + r() * 0.6, b.y + 0.1, b.z + r() * 0.6, r(), 0.5, r(), 0.9, 0.07, 0xcbb994, 0, 2);
    else if (b.type === 'spark') for (let k2 = 0; k2 < 4; k2++) emit(b.x + r() * 0.5, b.y + 0.3, b.z + r() * 0.5, r(), 1.5 + Math.random(), r(), 1, 0.045, 0xf2c94c, 3);
  }
  stepParticles(dt);
  renderer.render(scene, camera);
}

// ---------- picking, cursor, camera ----------
const ray = new THREE.Raycaster(), v2 = new THREE.Vector2();
export function pickTile(cx, cy) {
  if (!terrainMesh) return null;
  const r = canvas.getBoundingClientRect();
  v2.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(v2, camera);
  // Intersect with the sea-level plane first for sea tiles, otherwise the terrain boxes.
  const hit = ray.intersectObject(terrainMesh, false)[0];
  const o = ray.ray.origin, d = ray.ray.direction;
  let px, pz;
  if (d.y < -1e-4) { const tt = -o.y / d.y; px = o.x + d.x * tt; pz = o.z + d.z * tt; }
  if (hit && hit.point.y > 0.01) { const i = hit.instanceId; return { x: i % N, y: Math.floor(i / N) }; }
  if (px === undefined) return null;
  const x = Math.floor(px + H), y = Math.floor(pz + H);
  return x >= 0 && y >= 0 && x < N && y < N ? { x, y } : null;
}
function place(boxm, t, size) {
  if (!t || !world) { boxm.visible = false; return; }
  let top = 0;
  for (let y = t.y - (size >> 1); y <= t.y + (size >> 1); y++) for (let x = t.x - (size >> 1); x <= t.x + (size >> 1); x++)
    if (x >= 0 && y >= 0 && x < N && y < N) top = Math.max(top, surfY(y * N + x));
  boxm.visible = true; boxm.position.set(wx(t.x), top + 0.06, wx(t.y)); boxm.scale.set(size, 1, size);
}
export function setHover(t, size = 1, color = 0xffffff) { place(hoverBox, t, size); hoverBox.material.color.setHex(color); }
export function setSelect(t) { place(selBox, t, 1); }
export function focus(x, y, dist) { cam.gx = wx(x); cam.gz = wx(y); if (dist) cam.gd = dist; }
export function project(x, y, h = 0.8) {
  const v = new THREE.Vector3(wx(x), surfY(y * N + x) + h, wx(y)).project(camera), r = canvas.getBoundingClientRect();
  return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
}
export function rotate(d) { cam.az += d; }
export function zoom(f) { cam.gd = Math.max(7, Math.min(70, cam.gd * f)); }

function pan(dx, dy) {
  const s = cam.dist * 0.0016;
  const cx = Math.cos(cam.az), sz = Math.sin(cam.az);
  cam.gx -= (dx * cx + dy * sz) * s; cam.gz -= (-dx * sz + dy * cx) * s;
  cam.gx = Math.max(-H, Math.min(H, cam.gx)); cam.gz = Math.max(-H, Math.min(H, cam.gz));
  cam.tx = cam.gx; cam.tz = cam.gz;
}
function bindControls() {
  const pts = new Map(); let moved = 0, mode = null, pinch = null;
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) { moved = 0; mode = (e.button === 2 || e.button === 1 || e.shiftKey || e.ctrlKey) ? 'rot' : 'pan'; }
    else if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), a: Math.atan2(b.y - a.y, b.x - a.x) }; moved = 99; }
  });
  canvas.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId);
    if (!p) { if (e.pointerType === 'mouse' && cb.hover) cb.hover(pickTile(e.clientX, e.clientY)); return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 1) {
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved < 6) return;
      if (mode === 'rot') { cam.az -= dx * 0.006; cam.pol = Math.max(0.2, Math.min(1.45, cam.pol - dy * 0.005)); }
      else pan(dx, dy);
    } else if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
      zoom(pinch.d / d); cam.dist = cam.gd;
      let da = ang - pinch.a; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
      cam.az -= da; pinch = { d, a: ang };
    }
  });
  const up = e => {
    if (!pts.has(e.pointerId)) return;
    const wasSingle = pts.size === 1; pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (wasSingle && moved < 6 && e.type === 'pointerup' && e.button === 0 && cb.click) cb.click(pickTile(e.clientX, e.clientY));
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', () => cb.hover && cb.hover(null));
  canvas.addEventListener('wheel', e => { e.preventDefault(); zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
}
export function keyPan(dx, dy) { pan(dx, dy); }
