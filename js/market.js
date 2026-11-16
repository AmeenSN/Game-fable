// Commodity price model: mean-reverting noise + long cycles + seasons + news shocks + player impact.
import { rnd, gauss, ri, pick } from './util.js';

const KEYS = ['crude', 'gas', 'gasoline', 'diesel', 'jet', 'chem', 'lng'];
const OU = { crude: [0.02, 0.02], gas: [0.03, 0.034], gasoline: [0.05, 0.017], diesel: [0.05, 0.015], jet: [0.05, 0.021], chem: [0.04, 0.021], lng: [0.04, 0.024] };

// fx: log-price shocks per commodity. season: 'winter' | 'summer' | 'storm'.
export const WORLD_EVENTS = [
  { id: 'opec_cut', title: 'OPEC+ slashes output', news: 'OPEC+ agrees a surprise production cut. Crude rallies.', fx: { crude: 0.22 }, dur: 80, w: 3 },
  { id: 'price_war', title: 'Producer price war', news: 'Major exporters open the taps in a fight for market share. Crude tumbles.', fx: { crude: -0.28 }, dur: 70, w: 2 },
  { id: 'recession', title: 'Recession fears', news: 'Factory output slumps worldwide. Energy demand sags.', fx: { crude: -0.18, gas: -0.12 }, dur: 120, w: 2 },
  { id: 'boom', title: 'Global growth boom', news: 'Economies are roaring and they are thirsty for fuel.', fx: { crude: 0.15, gas: 0.1 }, dur: 100, w: 2 },
  { id: 'vortex', title: 'Polar vortex', news: 'Record cold grips the north. Heating demand goes through the roof.', fx: { gas: 0.45, lng: 0.2, diesel: 0.1 }, dur: 30, season: 'winter', w: 3 },
  { id: 'mild', title: 'Mild winter', news: 'A warm winter leaves gas storage brimming.', fx: { gas: -0.3 }, dur: 45, season: 'winter', w: 2 },
  { id: 'hurricane', title: 'Hurricane makes landfall', news: 'A major hurricane shuts refineries along the coast. Offshore crews evacuate.', fx: { gasoline: 0.2, diesel: 0.15 }, dur: 30, season: 'storm', w: 3 },
  { id: 'driving', title: 'Summer driving boom', news: 'Holiday traffic hits records. Gasoline stocks drain fast.', fx: { gasoline: 0.15 }, dur: 40, season: 'summer', w: 2 },
  { id: 'air_up', title: 'Air travel surge', news: 'Airlines add routes as bookings soar. Jet fuel is scarce.', fx: { jet: 0.25 }, dur: 60, w: 2 },
  { id: 'air_down', title: 'Travel slump', news: 'A health scare grounds flights and keeps commuters home.', fx: { jet: -0.4, gasoline: -0.15 }, dur: 60, w: 1 },
  { id: 'ev', title: 'EV sales milestone', news: 'Electric cars take a record share of new sales. Gasoline demand softens.', fx: { gasoline: -0.12 }, dur: 150, w: 1 },
  { id: 'plastics_up', title: 'Packaging boom', news: 'Manufacturers scramble for plastics feedstock.', fx: { chem: 0.25 }, dur: 70, w: 2 },
  { id: 'plastics_ban', title: 'Single-use plastics ban', news: 'New bans on single-use plastics dent petrochemical demand.', fx: { chem: -0.22 }, dur: 90, w: 1 },
  { id: 'conflict', title: 'Conflict in a producing region', news: 'Fighting threatens export routes. Traders pile into crude and gas.', fx: { crude: 0.3, gas: 0.2 }, dur: 50, w: 2 },
  { id: 'outage', title: 'Refinery outages abroad', news: 'Fires at two overseas mega-refineries tighten fuel supply.', fx: { gasoline: 0.18, diesel: 0.18, jet: 0.18 }, dur: 35, w: 2 },
  { id: 'lng_asia', title: 'Asian LNG scramble', news: 'Asian utilities bid aggressively for LNG cargoes.', fx: { lng: 0.35 }, dur: 90, w: 2 },
  { id: 'glut', title: 'Shale glut', news: 'Shale drillers flood the market with cheap gas and light oil.', fx: { gas: -0.25, crude: -0.1 }, dur: 90, w: 2 },
  { id: 'blockade', title: 'Tanker strait blockade', news: 'A key shipping strait is closed to tankers.', fx: { crude: 0.2, lng: 0.15 }, dur: 25, w: 1 },
  { id: 'carbontax', title: 'Carbon tax introduced', news: 'Government levies a carbon tax of $2.50 per barrel produced for the next 180 days.', fx: {}, dur: 180, w: 1 },
];

export function initMarket(s) {
  const m = s.market = { x: {}, ph: {}, imp: {}, prices: {}, hist: {}, mods: [], sched: [], next: s.day + ri(s, 25, 45) };
  for (const k of KEYS) { m.x[k] = 0; m.imp[k] = 0; m.hist[k] = []; m.ph[k] = rnd(s) * 6.283; }
  for (let d = -360; d <= 0; d++) { advance(s); computePrices(s, d); record(s); }
}
function advance(s) {
  const m = s.market;
  for (const k of KEYS) { m.x[k] += -OU[k][0] * m.x[k] + OU[k][1] * gauss(s); m.imp[k] *= 0.93; }
}
function record(s) {
  const m = s.market;
  for (const k of KEYS) { m.hist[k].push(m.prices[k]); if (m.hist[k].length > 360) m.hist[k].shift(); }
}
function mod(s, c) {
  let v = 0;
  for (const md of s.market.mods) if (md.c === c) v += md.amt * Math.min(1, md.left / (md.dur * 0.3));
  return v;
}
export function computePrices(s, day) {
  const m = s.market, x = m.x, tau = 6.283185;
  const winter = Math.cos(tau * (day % 360) / 360), summer = -winter;
  const crude = 70 * Math.exp(x.crude + 0.16 * Math.sin(tau * day / 840 + m.ph.crude) + mod(s, 'crude'));
  const gas = 3.6 * Math.exp(x.gas + 0.2 * Math.sin(tau * day / 700 + m.ph.gas) + 0.22 * winter + mod(s, 'gas'));
  const raw = {
    crude, gas,
    gasoline: crude * Math.exp(0.38 + x.gasoline + 0.07 * summer + mod(s, 'gasoline')),
    diesel: crude * Math.exp(0.42 + x.diesel + 0.05 * winter + mod(s, 'diesel')),
    jet: crude * Math.exp(0.48 + x.jet + 0.04 * summer + mod(s, 'jet')),
    chem: (crude * 1.9 + gas * 10) * Math.exp(x.chem + mod(s, 'chem')),
    lng: gas * 2.6 * Math.exp(x.lng + mod(s, 'lng')),
  };
  for (const k of KEYS) m.prices[k] = raw[k] * Math.exp(-0.15 * m.imp[k]);
}
export function stepMarket(s) {
  const m = s.market;
  advance(s);
  for (const md of m.mods) md.left--;
  m.mods = m.mods.filter(md => md.left > 0);
  computePrices(s, s.day);
  record(s);
}
export function seasonOf(day) {
  const doy = day % 360;
  return { winter: doy >= 300 || doy < 60, summer: doy >= 150 && doy < 240, storm: doy >= 210 && doy < 300 };
}
// Returns an event to apply now (or null). Handles rumours.
export function rollWorldEvent(s) {
  const m = s.market, out = [];
  for (const r of m.sched) if (r.day <= s.day) out.push(r);
  m.sched = m.sched.filter(r => r.day > s.day);
  if (s.day >= m.next) {
    m.next = s.day + ri(s, 28, 55);
    const sea = seasonOf(s.day), active = new Set(m.mods.map(x => x.id));
    const pool = [];
    for (const e of WORLD_EVENTS) {
      if (e.season && !sea[e.season]) continue;
      if (active.has(e.id) || m.sched.some(r => r.id === e.id)) continue;
      if (e.id === 'carbontax' && (s.day < 400 || s.carbonTax)) continue;
      for (let i = 0; i < e.w; i++) pool.push(e);
    }
    if (pool.length) {
      const e = pick(s, pool);
      if (rnd(s) < 0.6) {
        m.sched.push({ id: e.id, day: s.day + ri(s, 8, 20), real: rnd(s) < 0.75, rumor: true });
        out.push({ id: e.id, announce: true });
      } else out.push({ id: e.id, real: true });
    }
  }
  return out;
}
export function applyShock(s, e) {
  for (const c in e.fx) s.market.mods.push({ id: e.id, label: e.title, c, amt: e.fx[c], dur: e.dur, left: e.dur });
  if (!Object.keys(e.fx).length) s.market.mods.push({ id: e.id, label: e.title, c: 'none', amt: 0, dur: e.dur, left: e.dur });
}
