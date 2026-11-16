// Pure game simulation. No DOM, no rendering: state in, state out. One tick = one day.
import { N, T, TERRAIN, TIERS, COMMS, STOCKED, BUILDINGS, PLATFORM, REFINERY_MODES, TECHS, OBJECTIVES, RANKS, START_CASH, WIN_NET_WORTH } from './data.js';
import { generateWorld } from './world.js';
import { rnd, gauss, ri, rr, pick, clamp, fmtMoney, fmtNum } from './util.js';
import { initMarket, stepMarket, rollWorldEvent, applyShock, WORLD_EVENTS } from './market.js';

// ---------- helpers ----------
export const buildingAt = (s, x, y) => s.buildings.find(b => b.x === x && b.y === y);
export const rigAt = (s, x, y) => s.rigs.find(r => r.x === x && r.y === y);
export const terr = (s, x, y) => s.world.terrain[y * N + x];
export const isSea = (s, x, y) => terr(s, x, y) <= 1;
export const has = (s, t) => !!s.tech.done[t];
const inMap = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
export function isCoastal(s, x, y) {
  if (isSea(s, x, y)) return false;
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => inMap(x + a, y + b) && isSea(s, x + a, y + b));
}
const live = (s, type) => s.buildings.filter(b => b.type === type && !b.build);
const any = (s, type) => s.buildings.some(b => b.type === type && !b.build);

function news(s, text, kind = 'info') {
  s.news.unshift({ d: s.day, t: text, k: kind });
  if (s.news.length > 80) s.news.pop();
  s.fx.push({ t: 'news', text, kind });
}
function money(s, amt, cat) {
  s.cash += amt;
  s.fin.today[cat] = (s.fin.today[cat] || 0) + amt;
  s.fin.month[cat] = (s.fin.month[cat] || 0) + amt;
}
const fail = msg => ({ ok: false, msg });
const OK = { ok: true };
const pay = (s, cost, cat) => { if (s.cash < cost) return false; money(s, -cost, cat); return true; };
const short = cost => fail(`Not enough cash. You need ${fmtMoney(cost)}.`);

export function caps(s) {
  const c = { crude: 0, prod: 0, gas: 0, gasProc: 0 };
  for (const b of s.buildings) if (!b.build) {
    const d = BUILDINGS[b.type];
    c.crude += d.crudeCap || 0; c.prod += d.prodCap || 0; c.gas += d.gasCap || 0; c.gasProc += d.gasProc || 0;
  }
  return c;
}
export const prodStock = s => s.stock.gasoline + s.stock.diesel + s.stock.jet + s.stock.chem;
export function freeCap(s, c) {
  const k = COMMS[c].store, cp = caps(s);
  if (k === 'crude') return Math.max(0, cp.crude - s.stock.crude);
  if (k === 'gas') return Math.max(0, cp.gas - s.stock.gas);
  if (k === 'prod') return Math.max(0, cp.prod - prodStock(s));
  return 0;
}
export function sellPrice(s, c) {
  if (c === 'crude' && s.hedge) return s.hedge.price;
  return s.market.prices[c] * (any(s, 'terminal') ? 1.08 : 1);
}
export const buyPrice = (s, c) => s.market.prices[c] * 1.04;

export function assetBook(s) {
  let v = 0;
  for (const b of s.buildings) v += (b.cost || 0) * 0.6;
  return v;
}
export function netWorth(s) {
  let v = s.cash - s.debt + assetBook(s);
  for (const c of STOCKED) v += s.stock[c] * s.market.prices[c];
  const tapped = new Set();
  for (const b of s.buildings) if (b.type === 'well') for (const r of b.res) tapped.add(r);
  for (const id of tapped) { const r = s.world.reservoirs[id]; v += r.oil * s.market.prices.crude * 0.12 + r.gas * s.market.prices.gas * 0.08; }
  return v;
}
export const creditLimit = s => 5e6 + 0.5 * assetBook(s);
export function rankOf(nw) { let r = RANKS[0][1]; for (const [v, n] of RANKS) if (nw >= v) r = n; return r; }
export const repMult = s => s.rep < 40 ? 1.25 : s.rep > 80 ? 0.92 : 1;

// ---------- new game ----------
export function newGame(seed, name = 'Wildcat Petroleum') {
  const world = generateWorld(seed);
  const s = {
    v: 1, seed, rs: (seed * 7919 + 13) | 0, name, day: 0, cash: START_CASH, debt: 0, rep: 60, wage: 1, neg: 0,
    world, survey: new Array(N * N).fill(-1), surveyTier: new Array(N * N).fill(-2),
    jobs: [], rigs: [], buildings: [], nextId: 1,
    stock: { crude: 0, gas: 0, gasoline: 0, diesel: 0, jet: 0, chem: 0 },
    auto: {}, tech: { done: {}, cur: null },
    contracts: { offers: [], active: [], next: 60 },
    news: [], pending: null, fx: [], hedge: null, carbonTax: null, nextDecision: 90, aiNext: 0,
    stats: { oil: 0, gas: 0, flared: 0, dry: 0, strikes: 0, surveys: 0, drilled: 0, contracts: 0, gasCaptured: 0, revenue: 0 },
    last: { oil: 0, gas: 0, flared: 0, refined: 0, shut: false },
    obj: 0, fin: { today: {}, month: {}, last: {}, net30: [], nw: [] }, over: null, won: false,
    rivals: [['Meridian Oil', 38e6], ['Borealis Energy', 85e6], ['Kestrel Petroleum', 22e6], ['Saltmarsh & Sons', 160e6]].map(([n, v]) => ({ n, v })),
  };
  for (const c of STOCKED) s.auto[c] = { on: true, min: 0 };
  s.buildings.push({ id: s.nextId++, type: 'hq', x: world.hq.x, y: world.hq.y, cost: 3e6 });
  initMarket(s);
  // The rumoured seep: a free look at the ground around the starter field.
  const sx = world.starter % N, sy = Math.floor(world.starter / N);
  revealSurvey(s, sx, sy, 1, false);
  const dx = sx - world.hq.x, dy = sy - world.hq.y;
  const dir = (Math.abs(dy) > Math.abs(dx) / 2 ? (dy < 0 ? 'north' : 'south') : '') + (Math.abs(dx) > Math.abs(dy) / 2 ? (dx < 0 ? 'west' : 'east') : '');
  news(s, `Welcome to ${name}. Locals report an oil seep a few miles ${dir} of your head office. Turn on the seismic view and drill the red tiles.`, 'good');
  return s;
}

// ---------- exploration ----------
function signalAt(s, i, accurate) {
  const w = s.world; let best = 0, tier = -1;
  for (let t = 0; t < 3; t++) {
    const id = w.resAt[t][i]; if (id < 0) continue;
    const r = w.reservoirs[id]; if (r.oil < 1 && r.gas < 1) continue;
    const v = r.rich * (accurate ? 1 : [1, 0.75, 0.5][t]) * (0.4 + 0.6 * Math.max(r.oil / r.oil0, r.gas / r.gas0));
    if (v > best) { best = v; tier = t; }
  }
  if (best === 0) {
    const x = i % N, y = Math.floor(i / N);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!inMap(x + dx, y + dy)) continue;
      const j = (y + dy) * N + x + dx;
      if (w.resAt[0][j] >= 0 || w.resAt[1][j] >= 0 || w.resAt[2][j] >= 0) best = 0.2;
    }
    if (!accurate && rnd(s) < 0.04) best = rr(s, 0.4, 0.7); // false anomaly
  }
  return { v: clamp(best + gauss(s) * (accurate ? 0.05 : 0.17), 0, 1), tier };
}
function revealSurvey(s, cx, cy, r, accurate) {
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    if (!inMap(x, y)) continue;
    const i = y * N + x;
    if (s.surveyTier[i] > -2 && !accurate) continue; // keep better data
    const sig = signalAt(s, i, accurate);
    s.survey[i] = sig.v; s.surveyTier[i] = accurate ? sig.tier : -2;
  }
  s.fx.push({ t: 'survey' });
}
export const surveyCost = s => has(s, 'seismic3d') ? 250e3 : 150e3;
export const surveyRadius = s => has(s, 'seismic3d') ? 3 : 2;
export function startSurvey(s, x, y) {
  if (!inMap(x, y)) return fail('Out of bounds.');
  if (s.jobs.some(j => j.x === x && j.y === y)) return fail('A crew is already surveying here.');
  const cost = surveyCost(s);
  if (!pay(s, cost, 'explore')) return short(cost);
  s.jobs.push({ x, y, left: 4, r: surveyRadius(s), acc: has(s, 'seismic3d') });
  s.stats.surveys++;
  return OK;
}

export function drillCost(s, x, y, tier, fromTier = -1) {
  const base = TIERS[tier].cost - (fromTier >= 0 ? TIERS[fromTier].cost * 0.9 : 0);
  return Math.round(base * TERRAIN[terr(s, x, y)].drill * (has(s, 'bits') ? 0.85 : 1) * repMult(s) / 1e3) * 1e3;
}
export function canDrillAt(s, x, y) {
  if (!inMap(x, y)) return 'Out of bounds.';
  const t = terr(s, x, y);
  if (t === T.MOUNTAIN) return 'Rigs cannot work in the mountains.';
  if (t === T.DEEP && !has(s, 'deepwater')) return 'Deep sea needs Deepwater Engineering research.';
  if (buildingAt(s, x, y) || rigAt(s, x, y)) return 'This tile is occupied.';
  return null;
}
export function startDrill(s, x, y, tier) {
  const why = canDrillAt(s, x, y); if (why) return fail(why);
  const cost = drillCost(s, x, y, tier);
  if (!pay(s, cost, 'explore')) return short(cost);
  s.rigs.push({ id: s.nextId++, x, y, tier, depth: 0, status: 'drilling', log: [{ d: 0, t: 'Spudded in. Drilling ahead.' }], found: [], spent: cost, hinted: -1, idle: 0 });
  s.stats.drilled++;
  return OK;
}
export function deepenRig(s, id) {
  const rig = s.rigs.find(r => r.id === id);
  if (!rig || rig.status !== 'td' || rig.tier >= 2) return fail('Cannot deepen this well.');
  const cost = drillCost(s, rig.x, rig.y, rig.tier + 1, rig.tier);
  if (!pay(s, cost, 'explore')) return short(cost);
  rig.tier++; rig.status = 'drilling'; rig.spent += cost; rig.idle = 0;
  rig.log.push({ d: Math.round(rig.depth), t: `Deepening to ${TIERS[rig.tier].depth} m.` });
  return OK;
}
export function abandonRig(s, id) {
  const i = s.rigs.findIndex(r => r.id === id); if (i < 0) return fail('No rig.');
  s.rigs.splice(i, 1); return OK;
}
export function wellCost(s, x, y) {
  const t = terr(s, x, y);
  return t === T.DEEP ? PLATFORM.costDeep : t === T.SHALLOW ? PLATFORM.cost : Math.round(BUILDINGS.well.cost * (t === T.TUNDRA ? 1.3 : 1));
}
export function completeWell(s, id) {
  const rig = s.rigs.find(r => r.id === id);
  if (!rig || rig.status !== 'td' || !rig.found.length) return fail('Nothing to complete.');
  const cost = wellCost(s, rig.x, rig.y);
  if (!pay(s, cost, 'capex')) return short(cost);
  const sea = isSea(s, rig.x, rig.y);
  s.buildings.push({ id: s.nextId++, type: 'well', x: rig.x, y: rig.y, sea, tier: rig.tier, res: rig.found.slice(), level: 1, pipe: false,
    build: sea ? PLATFORM.days : BUILDINGS.well.days, build0: sea ? PLATFORM.days : BUILDINGS.well.days, cost: cost + rig.spent * 0.5, offline: 0, cum: 0, last: null });
  s.rigs.splice(s.rigs.indexOf(rig), 1);
  relink(s);
  return OK;
}

function rigDay(s, rig) {
  if (rig.status === 'td') { rig.idle++; if (rig.idle > 5) money(s, -5000, 'explore'); return; }
  const target = TIERS[rig.tier].depth, sea = isSea(s, rig.x, rig.y);
  const speed = 160 * (has(s, 'bits') ? 1.4 : 1) * (sea ? 0.8 : 1) * rr(s, 0.75, 1.25);
  const i = rig.y * N + rig.x, w = s.world;
  // Blowout risk once into pressured rock.
  if (rig.depth > 500 && rnd(s) < (has(s, 'bop') ? 0.0004 : 0.0028)) {
    const cost = sea ? 3e6 : 1.2e6;
    money(s, -cost, 'events'); s.rep = clamp(s.rep - (sea ? 14 : 8), 0, 100);
    news(s, `BLOWOUT at the rig on (${rig.x},${rig.y})! The rig is lost. Cleanup costs ${fmtMoney(cost)}.`, 'bad');
    s.fx.push({ t: 'blowout', x: rig.x, y: rig.y });
    s.rigs.splice(s.rigs.indexOf(rig), 1);
    return;
  }
  const before = rig.depth;
  rig.depth = Math.min(target, rig.depth + speed);
  const rocks = ['sandstone', 'shale', 'limestone', 'salt', 'dolomite', 'siltstone', 'anhydrite'];
  if (Math.floor(before / 400) !== Math.floor(rig.depth / 400) && rig.depth < target)
    rig.log.push({ d: Math.round(rig.depth), t: `Drilling ${pick(s, rocks)}. ${pick(s, ['Bit holding up.', 'Good rate of penetration.', 'Slow going.', 'Mud weight steady.', 'Tripping for a new bit.'])}` });
  // Mud-log hint at ~60% of the way to this tier's target.
  if (rig.hinted < rig.tier && rig.depth > target * 0.6) {
    rig.hinted = rig.tier;
    const real = w.resAt[rig.tier][i] >= 0 && alive(w.reservoirs[w.resAt[rig.tier][i]]);
    if (real ? rnd(s) < 0.75 : rnd(s) < 0.1) rig.log.push({ d: Math.round(rig.depth), t: 'Gas readings rising in the mud returns.', k: 'hint' });
    else rig.log.push({ d: Math.round(rig.depth), t: 'Mud returns clean. No shows yet.' });
  }
  if (rig.depth >= target) {
    rig.status = 'td'; rig.idle = 0;
    const found = [];
    for (let t = 0; t <= rig.tier; t++) { const id = w.resAt[t][i]; if (id >= 0 && alive(w.reservoirs[id])) found.push(id); }
    const fresh = found.filter(id => !rig.found.includes(id));
    rig.found = found;
    for (const id of fresh) discover(s, id);
    let deeper = false;
    if (rig.tier < 2) {
      const real = [rig.tier + 1, 2].some(t => w.resAt[t][i] >= 0 && alive(w.reservoirs[w.resAt[t][i]]));
      deeper = real ? rnd(s) < 0.65 : rnd(s) < 0.1;
    }
    rig.deeper = deeper;
    if (fresh.length) {
      const r = w.reservoirs[fresh[fresh.length - 1]];
      rig.log.push({ d: target, t: r.type === 'oil' ? 'OIL! Black gold flowing to surface.' : 'GAS! High-pressure gas zone confirmed.', k: 'strike' });
      s.fx.push({ t: 'strike', x: rig.x, y: rig.y, gas: r.type === 'gas', id: rig.id });
      news(s, `${r.type === 'oil' ? 'Oil' : 'Gas'} strike at (${rig.x},${rig.y})! ${TIERS[r.tier].name} field, est. ${r.type === 'oil' ? fmtNum(r.est.oil) + ' bbl' : fmtNum(r.est.gas) + ' mcf'}.`, 'good');
    } else if (!found.length) {
      s.stats.dry++;
      rig.log.push({ d: target, t: 'Total depth reached. Dry hole.', k: 'dry' });
      s.fx.push({ t: 'dry', x: rig.x, y: rig.y, id: rig.id });
    } else {
      rig.log.push({ d: target, t: 'Total depth reached. Nothing new down here.', k: 'dry' });
      s.fx.push({ t: 'dry', x: rig.x, y: rig.y, id: rig.id });
    }
    if (deeper) rig.log.push({ d: target, t: 'Hydrocarbon shows in the last cuttings. Something may lie deeper.', k: 'hint' });
  }
}
const alive = r => r.oil > 1 || r.gas > 1;
function discover(s, id) {
  const r = s.world.reservoirs[id];
  if (r.disc) return;
  r.disc = true; s.stats.strikes++;
  const e = rr(s, 0.75, 1.3);
  r.ef = e; r.est = { oil: r.oil * e, gas: r.gas * e };
  for (const i of r.tiles) { s.survey[i] = Math.max(s.survey[i], r.rich); s.surveyTier[i] = r.tier; }
  s.fx.push({ t: 'survey' });
}

// ---------- building ----------
export function buildCost(s, type, x, y) {
  return Math.round(BUILDINGS[type].cost * (terr(s, x, y) === T.TUNDRA ? 1.3 : 1));
}
export function canBuildAt(s, type, x, y) {
  if (!inMap(x, y)) return 'Out of bounds.';
  const d = BUILDINGS[type], t = terr(s, x, y);
  if (d.tech && !has(s, d.tech)) return `Requires ${TECHS.find(q => q.id === d.tech).name} research.`;
  if (t <= 1) return 'Facilities must be built on land.';
  if (t === T.MOUNTAIN) return 'Too steep to build on.';
  if (buildingAt(s, x, y) || rigAt(s, x, y)) return 'This tile is occupied.';
  if (d.coastal && !isCoastal(s, x, y)) return `${d.name} must sit on the coast.`;
  return null;
}
export function build(s, type, x, y) {
  const why = canBuildAt(s, type, x, y); if (why) return fail(why);
  const cost = buildCost(s, type, x, y), d = BUILDINGS[type];
  if (!pay(s, cost, 'capex')) return short(cost);
  const b = { id: s.nextId++, type, x, y, cost, build: d.days, build0: d.days, offline: 0 };
  if (type === 'refinery') { b.mode = 'balanced'; b.import = false; }
  if (type === 'petchem') b.import = false;
  s.buildings.push(b);
  relink(s);
  return OK;
}
export function demolish(s, id) {
  const b = s.buildings.find(q => q.id === id);
  if (!b || b.type === 'hq') return fail('Cannot remove this.');
  const cost = Math.round(b.cost * 0.08);
  if (!pay(s, cost, 'capex')) return short(cost);
  s.buildings.splice(s.buildings.indexOf(b), 1);
  relink(s);
  clampStock(s);
  return OK;
}
function clampStock(s) {
  const cp = caps(s);
  s.stock.crude = Math.min(s.stock.crude, cp.crude); s.stock.gas = Math.min(s.stock.gas, cp.gas);
  const p = prodStock(s);
  if (p > cp.prod && p > 0) for (const c of ['gasoline', 'diesel', 'jet', 'chem']) s.stock[c] *= cp.prod / p;
}
// Link each well to its nearest depot and compute haulage distance.
export function relink(s) {
  const depots = s.buildings.filter(b => BUILDINGS[b.type].depot);
  for (const w of s.buildings) if (w.type === 'well') {
    let best = 1e9, dep = null;
    for (const d of depots) { const dist = Math.abs(d.x - w.x) + Math.abs(d.y - w.y); if (dist < best) { best = dist; dep = d; } }
    w.depot = dep ? dep.id : 0; w.dist = dep ? best : 20;
  }
}
export const haulCost = w => w.pipe ? 0.2 : w.sea ? 5 + 0.3 * w.dist : 1 + 0.35 * w.dist;
export const pipeCost = (s, w) => Math.round(w.dist * (w.sea ? 220e3 : 90e3) * (has(s, 'pipes') ? 0.6 : 1));
export function buildPipeline(s, id) {
  const w = s.buildings.find(q => q.id === id);
  if (!w || w.type !== 'well' || w.pipe) return fail('No pipeline possible.');
  const cost = pipeCost(s, w);
  if (!pay(s, cost, 'capex')) return short(cost);
  w.pipe = true; w.cost += cost;
  return OK;
}
export const upgradeCost = (s, w) => Math.round(wellCost(s, w.x, w.y) * (w.level === 1 ? 0.5 : 0.8));
export function upgradeWell(s, id) {
  const w = s.buildings.find(q => q.id === id);
  if (!w || w.type !== 'well' || w.level >= 3) return fail('Already fully upgraded.');
  const cost = upgradeCost(s, w);
  if (!pay(s, cost, 'capex')) return short(cost);
  w.level++; w.cost += cost;
  return OK;
}

// ---------- production ----------
const decl = (f, eor) => { const fl = eor ? 0.3 : 0.12; return fl + (1 - fl) * Math.pow(Math.max(0, f), 0.8); };
function wellFlows(s, b) {
  const m = [1, 1.35, 1.7][b.level - 1] * (has(s, 'horizontal') ? 1.35 : 1), eor = has(s, 'eor'), out = [];
  for (const id of b.res) {
    const r = s.world.reservoirs[id];
    out.push({ r, oil: Math.min(r.oil, r.rateOil * m * decl(r.oil / r.oil0, eor)), gas: Math.min(r.gas, r.rateGas * m * decl(r.gas / r.gas0, eor)) });
  }
  return out;
}
export function wellRate(s, b) {
  let oil = 0, gas = 0;
  for (const f of wellFlows(s, b)) { oil += f.oil; gas += f.gas; }
  return { oil, gas };
}
export function wellOpex(s, b) { return (b.sea ? PLATFORM.opex : BUILDINGS.well.opex) * s.wage; }

function produce(s) {
  const cp = caps(s), L = s.last = { oil: 0, gas: 0, flared: 0, refined: 0, shut: false, chem: 0, lng: 0 };
  const wells = s.buildings.filter(b => b.type === 'well' && !b.build);
  const flows = [];
  let wantOil = 0, assoc = 0, gasWell = 0;
  for (const b of wells) {
    if (b.offline > 0) { b.last = { oil: 0, gas: 0, flared: 0, st: 'offline' }; continue; }
    const f = wellFlows(s, b); flows.push([b, f]);
    for (const q of f) { if (q.r.type === 'oil') { wantOil += q.oil; assoc += q.gas; } else gasWell += q.gas; }
  }
  const k = wantOil > 0 ? clamp((cp.crude - s.stock.crude) / wantOil, 0, 1) : 1;
  L.shut = k < 0.999 && wantOil > 0;
  assoc *= k;
  const C = Math.min(cp.gasProc, Math.max(0, cp.gas - s.stock.gas));
  const capA = Math.min(assoc, C), ka = assoc > 0 ? capA / assoc : 1;
  const kg = gasWell > 0 ? clamp((C - capA) / gasWell, 0, 1) : 1;
  let roomCrude = Math.max(0, cp.crude - s.stock.crude);
  for (const [b, f] of flows) {
    let oil = 0, gas = 0, flared = 0;
    for (const q of f) {
      // Clamp to what is left: several wells may drain the same field on the same day.
      const kk = q.r.type === 'oil' ? k : kg;
      const o = Math.min(q.oil * kk, Math.max(0, q.r.oil)), g = Math.min(q.gas * kk, Math.max(0, q.r.gas));
      q.r.oil -= o; q.r.gas -= g; oil += o;
      if (q.r.type === 'oil') { gas += g * ka; flared += g * (1 - ka); } else gas += g;
    }
    oil = Math.min(oil, roomCrude); roomCrude -= oil;
    s.stock.crude += oil; s.stock.gas += gas;
    if (oil > 0) money(s, -oil * haulCost(b), 'transport');
    b.cum += oil;
    const gasOnly = b.res.every(id => s.world.reservoirs[id].type === 'gas');
    b.last = { oil, gas, flared, st: gasOnly && kg < 0.05 ? 'nogas' : !gasOnly && k < 0.05 ? 'shut' : flared > 1 ? 'flaring' : 'ok' };
    L.oil += oil; L.gas += gas; L.flared += flared;
    if (flared > 1) s.rep = clamp(s.rep - (has(s, 'ccs') ? 0.003 : 0.006), 0, 100);
    if (b.res.every(id => !alive(s.world.reservoirs[id])) && !b.dead) { b.dead = true; news(s, `Well #${b.id} at (${b.x},${b.y}) has run dry. Plug it to stop paying upkeep.`, 'warn'); }
  }
  s.stats.oil += L.oil; s.stats.gas += L.gas + L.flared; s.stats.flared += L.flared; s.stats.gasCaptured += L.gas;
  if (s.carbonTax && !has(s, 'ccs') && L.oil > 0) money(s, -L.oil * s.carbonTax.rate, 'tax');

  // Refineries
  const crack = has(s, 'cracking');
  for (const b of live(s, 'refinery')) {
    if (b.offline > 0) { b.last = { in: 0 }; continue; }
    const yld = crack ? 0.97 : 0.92;
    let f = 1200 * (crack ? 1.25 : 1);
    f = Math.min(f, freeCap(s, 'gasoline') / yld);
    const fromStock = Math.min(f, s.stock.crude);
    let imp = 0;
    if (b.import && fromStock < f) { imp = Math.min(f - fromStock, Math.max(0, s.cash) / (s.market.prices.crude * 1.05)); money(s, -imp * s.market.prices.crude * 1.05, 'feedstock'); }
    f = fromStock + imp; s.stock.crude -= fromStock;
    const m = REFINERY_MODES[b.mode];
    for (const c of ['gasoline', 'diesel', 'jet']) s.stock[c] += f * yld * m[c];
    b.last = { in: f, imp }; L.refined += f;
  }
  for (const b of live(s, 'petchem')) {
    if (b.offline > 0) { b.last = { out: 0 }; continue; }
    let k2 = Math.min(1, freeCap(s, 'chem') / 450);
    let crudeHave = s.stock.crude, gasHave = s.stock.gas;
    if (!b.import) k2 = Math.min(k2, crudeHave / 400, gasHave / 2000);
    const cNeed = 400 * k2, gNeed = 2000 * k2;
    const cBuy = Math.max(0, cNeed - crudeHave), gBuy = Math.max(0, gNeed - gasHave);
    const cost = cBuy * s.market.prices.crude * 1.05 + gBuy * s.market.prices.gas * 1.05;
    if (cost > Math.max(0, s.cash)) { b.last = { out: 0 }; continue; }
    if (cost > 0) money(s, -cost, 'feedstock');
    s.stock.crude -= cNeed - cBuy; s.stock.gas -= gNeed - gBuy;
    s.stock.chem += 450 * k2; b.last = { out: 450 * k2 }; L.chem += 450 * k2;
  }
  for (const b of live(s, 'lng')) {
    if (b.offline > 0) { b.last = { out: 0 }; continue; }
    const q = Math.min(12000, s.stock.gas);
    s.stock.gas -= q; money(s, q * s.market.prices.lng, 'sales'); s.stats.revenue += q * s.market.prices.lng;
    b.last = { out: q }; L.lng += q;
  }
}

// ---------- trading ----------
export function sell(s, c, qty) {
  const q = Math.min(qty, s.stock[c]); if (q <= 0) return 0;
  const rev = q * sellPrice(s, c);
  s.stock[c] -= q; money(s, rev, 'sales'); s.stats.revenue += rev;
  s.market.imp[c] += q / COMMS[c].depth;
  return rev;
}
export function buy(s, c, qty) {
  const p = buyPrice(s, c);
  const q = Math.floor(Math.min(qty, freeCap(s, c), Math.max(0, s.cash) / p));
  if (q <= 0) return fail(freeCap(s, c) < 1 ? 'No storage space for that.' : 'Not enough cash.');
  s.stock[c] += q; money(s, -q * p, 'trade');
  s.market.imp[c] -= q / COMMS[c].depth;
  return OK;
}
const reserved = (s, c) => s.contracts.active.reduce((a, k) => a + (k.c === c ? k.qty - k.done : 0), 0);
function autoSell(s) {
  for (const c of STOCKED) {
    const a = s.auto[c];
    if (!a.on || s.market.prices[c] < a.min) continue;
    let keep = reserved(s, c);
    if (c === 'gas' && (any(s, 'lng') || any(s, 'petchem'))) keep += 14000;
    sell(s, c, s.stock[c] - keep);
  }
}

// ---------- contracts ----------
function genContract(s) {
  const opts = ['crude'];
  if (any(s, 'refinery')) opts.push('gasoline', 'diesel', 'jet', 'gasoline', 'diesel');
  else if (rnd(s) < 0.25) opts.push(pick(s, ['gasoline', 'diesel', 'jet']));
  if (any(s, 'gasplant')) opts.push('gas');
  if (any(s, 'petchem')) opts.push('chem', 'chem');
  const c = pick(s, opts), nRef = live(s, 'refinery').length;
  const daily = c === 'crude' ? s.last.oil : c === 'gas' ? s.last.gas : c === 'chem' ? 450 * live(s, 'petchem').length : nRef * 400;
  const step = c === 'gas' ? 10000 : 500;
  const qty = Math.max(COMMS[c].lot, Math.round(daily * ri(s, 15, 40) / step) * step);
  const price = s.market.prices[c] * rr(s, 1.08, 1.28), days = ri(s, 60, 120);
  const who = pick(s, ['Northline Rail', 'Atlas Airways', 'Corvin Chemicals', 'Harbor City Utilities', 'Granite Freight', 'Delta Plastics', 'Summit Power', 'Bluewater Shipping']);
  s.contracts.offers.push({ id: s.nextId++, who, c, qty, price, days, penalty: Math.round(0.2 * qty * price), expires: s.day + 30, done: 0 });
  s.fx.push({ t: 'toast', text: `New contract offer from ${who}.`, kind: 'info' });
}
export function acceptContract(s, id) {
  const i = s.contracts.offers.findIndex(k => k.id === id); if (i < 0) return fail('Offer gone.');
  if (s.contracts.active.length >= 3) return fail('You can only run three contracts at once.');
  const k = s.contracts.offers.splice(i, 1)[0];
  k.due = s.day + k.days; s.contracts.active.push(k);
  return OK;
}
export function declineContract(s, id) { s.contracts.offers = s.contracts.offers.filter(k => k.id !== id); return OK; }
export function deliverContract(s, id) {
  const k = s.contracts.active.find(q => q.id === id); if (!k) return fail('No such contract.');
  const q = Math.min(k.qty - k.done, s.stock[k.c]);
  if (q <= 0) return fail(`No ${COMMS[k.c].name} in stock to deliver.`);
  s.stock[k.c] -= q; k.done += q; money(s, q * k.price, 'contracts'); s.stats.revenue += q * k.price;
  if (k.done >= k.qty - 0.5) {
    s.contracts.active.splice(s.contracts.active.indexOf(k), 1);
    s.stats.contracts++; s.rep = clamp(s.rep + 2, 0, 100);
    news(s, `Contract with ${k.who} fulfilled. Reputation up.`, 'good');
  }
  return OK;
}

// ---------- research & finance ----------
export function research(s, id) {
  const t = TECHS.find(q => q.id === id);
  if (!t || has(s, id)) return fail('Already researched.');
  if (s.tech.cur) return fail('Your lab is busy with another project.');
  if (t.req && !has(s, t.req)) return fail(`Requires ${TECHS.find(q => q.id === t.req).name} first.`);
  if (!pay(s, t.cost, 'research')) return short(t.cost);
  s.tech.cur = { id, left: t.days };
  return OK;
}
export function borrow(s, amt) {
  const room = creditLimit(s) - s.debt;
  const a = Math.min(amt, room); if (a < 1) return fail('The bank will not lend you any more.');
  s.debt += a; s.cash += a; return OK;
}
export function repay(s, amt) {
  const a = Math.min(amt, s.debt, Math.max(0, s.cash)); if (a < 1) return fail('Nothing to repay.');
  s.debt -= a; s.cash -= a; return OK;
}
export function donate(s) {
  if (!pay(s, 500e3, 'events')) return short(500e3);
  s.rep = clamp(s.rep + 5, 0, 100); return OK;
}
export function setRefMode(s, id, mode) { const b = s.buildings.find(q => q.id === id); if (b && REFINERY_MODES[mode]) b.mode = mode; return OK; }
export function toggleImport(s, id) { const b = s.buildings.find(q => q.id === id); if (b) b.import = !b.import; return OK; }

// ---------- decision events ----------
const DECISIONS = {
  strike: {
    ok: s => live(s, 'well').length >= 3,
    make: () => ({ title: 'Roughnecks threaten to walk', text: 'Your field crews want a 10% raise. The union rep is tapping a wrench against your desk.',
      options: [{ l: 'Grant the raise', h: 'All upkeep +10% permanently. Reputation +3.' }, { l: 'Refuse', h: '50% chance of a 12-day strike across every well.' }] }),
    apply: (s, ev, i) => {
      if (i === 0) { s.wage *= 1.1; s.rep = clamp(s.rep + 3, 0, 100); news(s, 'You granted the raise. The crews cheer.', 'info'); }
      else if (rnd(s) < 0.5) { for (const b of live(s, 'well')) b.offline = Math.max(b.offline, 12); news(s, 'STRIKE! Every well is idle for 12 days.', 'bad'); }
      else news(s, 'The crews grumble but stay on the job.', 'good');
    },
  },
  protest: {
    ok: s => live(s, 'well').length >= 2,
    make: () => ({ title: 'Protesters at the gate', text: 'A local group is blockading an access road over noise, dust and flaring.',
      options: [{ l: 'Fund a community programme ($400k)', h: 'Reputation +8.' }, { l: 'Ignore them', h: 'Reputation −6. They might shut a well down for a while.' }] }),
    apply: (s, ev, i) => {
      if (i === 0 && s.cash >= 400e3) { money(s, -400e3, 'events'); s.rep = clamp(s.rep + 8, 0, 100); news(s, 'The new clinic bears your company name. Goodwill rises.', 'good'); }
      else { s.rep = clamp(s.rep - 6, 0, 100); if (rnd(s) < 0.4) { const b = pick(s, live(s, 'well')); b.offline = 10; news(s, `Protesters chained themselves to well #${b.id}. Offline for 10 days.`, 'bad'); } else news(s, 'The protest fizzles out, but the headlines were ugly.', 'warn'); }
    },
  },
  buyout: {
    ok: s => live(s, 'well').some(b => b.last && b.last.oil + b.last.gas > 0),
    make: s => {
      const b = pick(s, live(s, 'well').filter(q => q.last && q.last.oil + q.last.gas > 0));
      const price = Math.round((b.last.oil * s.market.prices.crude + b.last.gas * s.market.prices.gas) * rr(s, 220, 380) / 1e4) * 1e4;
      return { title: 'A rival wants your well', text: `Saltmarsh & Sons offer ${fmtMoney(price)} cash for well #${b.id} at (${b.x},${b.y}), currently making ${fmtNum(b.last.oil)} bbl/d.`, wid: b.id, price,
        options: [{ l: `Sell for ${fmtMoney(price)}`, h: 'You lose the well. The field stays in the ground for whoever drills next.' }, { l: 'Keep it', h: 'No change.' }] };
    },
    apply: (s, ev, i) => {
      const b = s.buildings.find(q => q.id === ev.wid);
      if (i === 0 && b) { s.buildings.splice(s.buildings.indexOf(b), 1); money(s, ev.price, 'events'); news(s, `Sold well #${b.id} for ${fmtMoney(ev.price)}.`, 'info'); }
    },
  },
  tip: {
    ok: s => s.world.reservoirs.some(r => !r.disc),
    make: () => ({ title: 'The wildcatter\'s map', text: 'A sunburnt old driller slides a stained map across the bar. "Biggest thing I never drilled. Three-fifty and it\'s yours."',
      options: [{ l: 'Buy the map ($350k)', h: 'Might mark a real field. Might be a bar story.' }, { l: 'Buy him a drink instead', h: 'No change.' }] }),
    apply: (s, ev, i) => {
      if (i !== 0 || s.cash < 350e3) return;
      money(s, -350e3, 'explore');
      const und = s.world.reservoirs.filter(r => !r.disc);
      if (rnd(s) < 0.75 && und.length) {
        const r = pick(s, und);
        for (const t of r.tiles) { s.survey[t] = clamp(r.rich + gauss(s) * 0.05, 0, 1); s.surveyTier[t] = r.tier; }
        const t0 = r.tiles[0];
        news(s, `The map marks ground near (${t0 % N},${Math.floor(t0 / N)}). Your geologists think it is the real thing.`, 'good');
        s.fx.push({ t: 'focus', x: t0 % N, y: Math.floor(t0 / N) });
      } else {
        const x = ri(s, 3, N - 4), y = ri(s, 3, N - 4);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (s.survey[(y + dy) * N + x + dx] < 0) s.survey[(y + dy) * N + x + dx] = rr(s, 0.5, 0.85);
        news(s, `The map marks ground near (${x},${y}). Looks promising...`, 'good');
        s.fx.push({ t: 'focus', x, y });
      }
      s.fx.push({ t: 'survey' });
    },
  },
  audit: {
    ok: s => s.stats.revenue > 5e6,
    make: s => {
      const fine = Math.round(clamp(s.stats.revenue * 0.01, 200e3, 4e6) / 1e4) * 1e4;
      return { title: 'Tax audit', text: `The revenue service disputes your depletion allowances and demands ${fmtMoney(fine)}.`, fine,
        options: [{ l: `Pay ${fmtMoney(fine)}`, h: 'Painful, but it ends here.' }, { l: 'Fight it in court', h: '50%: pay nothing. 50%: pay double.' }] };
    },
    apply: (s, ev, i) => {
      if (i === 0) { money(s, -ev.fine, 'tax'); news(s, 'You settled with the tax office.', 'info'); }
      else if (rnd(s) < 0.5) news(s, 'Your lawyers win. The audit is dropped.', 'good');
      else { money(s, -ev.fine * 2, 'tax'); news(s, `You lost in court and pay ${fmtMoney(ev.fine * 2)}.`, 'bad'); }
    },
  },
  hedge: {
    ok: s => s.last.oil > 200 && !s.hedge,
    make: s => {
      const price = Math.round(s.market.prices.crude * rr(s, 0.98, 1.06) * 10) / 10;
      return { title: 'A hedge on the table', text: `A bank offers to buy every barrel of crude you sell over the next 120 days at a fixed $${price.toFixed(1)}. Spot is $${s.market.prices.crude.toFixed(1)}.`, price,
        options: [{ l: `Lock in $${price.toFixed(1)}`, h: 'Protection if prices fall. Regret if they soar.' }, { l: 'Stay on spot prices', h: 'No change.' }] };
    },
    apply: (s, ev, i) => { if (i === 0) { s.hedge = { price: ev.price, until: s.day + 120 }; news(s, `Crude hedged at $${ev.price.toFixed(1)} for 120 days.`, 'info'); } },
  },
};
export function resolveDecision(s, i) {
  const ev = s.pending; if (!ev) return;
  s.pending = null;
  DECISIONS[ev.type].apply(s, ev, i);
}

// ---------- incidents ----------
function incidents(s) {
  for (const b of s.buildings) {
    if (b.build) continue;
    if (b.offline > 0) { b.offline--; continue; }
    if (b.type === 'well') {
      if (rnd(s) < 0.0012) {
        const cost = (b.sea ? 250e3 : 60e3) * rr(s, 0.7, 1.4);
        b.offline = ri(s, 4, 9); money(s, -cost, 'events');
        s.fx.push({ t: 'toast', text: `Well #${b.id} broke down. Repairs: ${fmtMoney(cost)}, back in ${b.offline} days.`, kind: 'warn' });
      } else if (b.pipe && !has(s, 'pipes') && rnd(s) < 0.0004) {
        money(s, -350e3, 'events'); s.rep = clamp(s.rep - 5, 0, 100); b.offline = 5;
        news(s, `Pipeline leak near well #${b.id}. Cleanup costs $350k and the press is circling.`, 'bad');
      } else if (!b.pipe && b.last && b.last.oil > 0 && rnd(s) < 0.0002) {
        money(s, -80e3, 'events'); s.rep = clamp(s.rep - 2, 0, 100);
        news(s, `A ${b.sea ? 'shuttle tanker' : 'tanker truck'} from well #${b.id} spilled its load. $80k cleanup.`, 'warn');
      }
    } else if ((b.type === 'refinery' || b.type === 'petchem') && rnd(s) < 0.0004) {
      b.offline = 14; money(s, -600e3, 'events'); s.rep = clamp(s.rep - 2, 0, 100);
      news(s, `Fire at your ${BUILDINGS[b.type].name}! Offline for 14 days, $600k in damage.`, 'bad');
      s.fx.push({ t: 'blowout', x: b.x, y: b.y });
    }
  }
}

function worldEvents(s) {
  for (const r of rollWorldEvent(s)) {
    const e = WORLD_EVENTS.find(q => q.id === r.id);
    if (r.announce) { news(s, `RUMOUR: traders whisper of "${e.title}".`, 'rumor'); continue; }
    if (!r.real) { news(s, `The "${e.title}" rumour came to nothing.`, 'info'); continue; }
    applyShock(s, e);
    news(s, e.news, 'world');
    if (e.id === 'hurricane') {
      const off = live(s, 'well').filter(b => b.sea);
      const d = ri(s, 5, 10);
      for (const b of off) b.offline = Math.max(b.offline, d);
      if (off.length) news(s, `Your ${off.length} offshore platform${off.length > 1 ? 's are' : ' is'} evacuated for ${d} days.`, 'bad');
    }
    if (e.id === 'carbontax') s.carbonTax = { until: s.day + 180, rate: 2.5 };
  }
}

function objectives(s) {
  const nw = netWorth(s);
  const done = {
    survey: s.stats.surveys > 0, drill: s.stats.drilled > 0, strike: s.stats.strikes > 0,
    produce: any(s, 'well'), prod10k: s.stats.oil >= 10000, tank: any(s, 'tank'),
    research: Object.keys(s.tech.done).length > 0, refinery: any(s, 'refinery'), contract: s.stats.contracts > 0,
    gas: s.stats.gasCaptured > 0, offshore: live(s, 'well').some(b => b.sea), nw100: nw >= 100e6, nw500: nw >= WIN_NET_WORTH,
  };
  while (s.obj < OBJECTIVES.length && done[OBJECTIVES[s.obj].id]) {
    const o = OBJECTIVES[s.obj++];
    if (o.reward) money(s, o.reward, 'events');
    news(s, `Objective complete: ${o.text}.${o.reward ? ' Bonus ' + fmtMoney(o.reward) + '.' : ''}`, 'good');
    s.fx.push({ t: 'objective' });
  }
  if (!s.won && nw >= WIN_NET_WORTH) { s.won = true; s.fx.push({ t: 'win' }); }
}

// ---------- the daily tick ----------
export function tick(s) {
  if (s.over || s.pending) return;
  s.day++; s.fin.today = {};
  stepMarket(s);
  worldEvents(s);
  if (s.hedge && s.day > s.hedge.until) { s.hedge = null; news(s, 'Your crude hedge has expired. Back on spot prices.', 'info'); }
  if (s.carbonTax && s.day > s.carbonTax.until) { s.carbonTax = null; news(s, 'The carbon tax has lapsed.', 'info'); }

  for (const j of s.jobs) if (--j.left <= 0) { revealSurvey(s, j.x, j.y, j.r, j.acc); s.fx.push({ t: 'surveyDone', x: j.x, y: j.y }); }
  s.jobs = s.jobs.filter(j => j.left > 0);
  for (const rig of s.rigs.slice()) rigDay(s, rig);
  for (const b of s.buildings) if (b.build && --b.build <= 0) {
    b.build = 0;
    s.fx.push({ t: 'built', x: b.x, y: b.y });
    s.fx.push({ t: 'toast', text: `${b.type === 'well' ? (b.sea ? 'Platform' : 'Pumpjack') : BUILDINGS[b.type].name} completed.`, kind: 'good' });
  }
  if (s.tech.cur && --s.tech.cur.left <= 0) {
    const t = TECHS.find(q => q.id === s.tech.cur.id);
    s.tech.done[t.id] = true; s.tech.cur = null;
    if (t.id === 'eor') for (const r of s.world.reservoirs) { r.oil *= 1.25; r.oil0 *= 1.25; }
    if (t.id === 'ai') s.aiNext = s.day + 10;
    news(s, `Research complete: ${t.name}.`, 'good');
  }
  if (has(s, 'ai') && s.day >= s.aiNext) {
    s.aiNext = s.day + 150;
    const und = s.world.reservoirs.filter(r => !r.disc && r.tiles.some(i => s.surveyTier[i] !== r.tier));
    if (und.length) {
      const r = pick(s, und);
      for (const i of r.tiles) { s.survey[i] = r.rich; s.surveyTier[i] = r.tier; }
      const t0 = r.tiles[0];
      news(s, `AI model flags a ${TIERS[r.tier].name.toLowerCase()} prospect near (${t0 % N},${Math.floor(t0 / N)}).`, 'good');
      s.fx.push({ t: 'survey' });
    }
  }

  produce(s);
  autoSell(s);

  // Running costs
  let opex = 2000 + 150 * s.buildings.length;
  for (const b of s.buildings) if (!b.build) opex += b.type === 'well' ? wellOpex(s, b) : BUILDINGS[b.type].opex * s.wage;
  money(s, -opex, 'opex');
  if (s.debt > 0) money(s, -s.debt * 0.09 / 360, 'interest');
  if (s.cash < 0) money(s, s.cash * 0.2 / 360, 'interest');

  incidents(s);

  // Contracts
  const K = s.contracts;
  K.offers = K.offers.filter(k => k.expires > s.day);
  if (s.day >= K.next) { K.next = s.day + ri(s, 30, 55); if (K.offers.length < 3) genContract(s); }
  for (const k of K.active.slice()) if (s.day > k.due) {
    K.active.splice(K.active.indexOf(k), 1);
    const pen = Math.round(k.penalty * (1 - k.done / k.qty));
    money(s, -pen, 'contracts'); s.rep = clamp(s.rep - 4, 0, 100);
    news(s, `You missed the ${k.who} deadline. Penalty ${fmtMoney(pen)}.`, 'bad');
  }

  // Decisions
  if (s.day >= s.nextDecision) {
    s.nextDecision = s.day + ri(s, 60, 110);
    const pool = Object.keys(DECISIONS).filter(k => DECISIONS[k].ok(s));
    if (pool.length) { const type = pick(s, pool); s.pending = { type, ...DECISIONS[type].make(s) }; }
  }

  // Reputation drifts back toward neutral.
  const repCap = has(s, 'ccs') ? 90 : 70;
  if (s.rep < repCap) s.rep = Math.min(repCap, s.rep + (has(s, 'ccs') ? 0.03 : 0.01));

  // Rivals follow the oil price with their own luck.
  const h = s.market.hist.crude, ret = h.length > 1 ? Math.log(h[h.length - 1] / h[h.length - 2]) : 0;
  for (const r of s.rivals) r.v *= 1 + 0.0007 + 0.4 * ret + gauss(s) * 0.004;

  // Books
  const t = s.fin.today;
  const net = Object.keys(t).reduce((a, k) => a + (k === 'capex' || k === 'explore' || k === 'research' || k === 'trade' ? 0 : t[k]), 0);
  s.fin.net30.push(net); if (s.fin.net30.length > 30) s.fin.net30.shift();
  if (s.day % 5 === 0) { s.fin.nw.push(netWorth(s)); if (s.fin.nw.length > 300) s.fin.nw.shift(); }
  if (s.day % 30 === 0) {
    s.fin.last = s.fin.month; s.fin.month = {};
    if (s.rep < 30) { money(s, -200e3, 'tax'); news(s, 'Regulators fine you $200k over your environmental record.', 'bad'); }
    s.fx.push({ t: 'month' });
  }
  objectives(s);

  // Insolvency
  if (s.cash < 0) {
    s.neg++;
    if (s.neg === 1 || s.neg === 45) news(s, `You are overdrawn. Raise cash within ${90 - s.neg} days or the bank forecloses.`, 'bad');
    if (s.neg >= 90) { s.over = 'bankrupt'; s.fx.push({ t: 'over' }); }
  } else s.neg = 0;
}
export const avgProfit = s => s.fin.net30.length ? s.fin.net30.reduce((a, b) => a + b, 0) / s.fin.net30.length : 0;
