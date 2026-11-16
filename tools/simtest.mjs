// Headless smoke test: a simple bot plays several seeds; checks for crashes/NaN and prints balance figures.
import * as S from '../js/sim.js';
import { N, TIERS } from '../js/data.js';
import { fmtMoney } from '../js/util.js';

const seeds = process.argv[2] ? [+process.argv[2]] : [1, 2, 3, 4, 5, 6];
if (process.argv[2]) {
  const s = S.newGame(seeds[0]); const ch = '~-.:*^';
  for (let y = 0; y < N; y++) { let l = ''; for (let x = 0; x < N; x++) { const i = y * N + x; l += (x === s.world.hq.x && y === s.world.hq.y) ? 'H' : s.world.resAt[0][i] >= 0 ? 'o' : s.world.resAt[1][i] >= 0 ? 'O' : s.world.resAt[2][i] >= 0 ? '@' : ch[s.world.terrain[i]]; } console.log(l); }
}
let bad = 0;
for (const seed of seeds) {
  const s = S.newGame(seed);
  const land = s.world.terrain.filter(t => t >= 2).length;
  for (let d = 0; d < 3600 && !s.over; d++) {
    S.tick(s);
    if (s.pending) S.resolveDecision(s, 0);
    s.fx.length = 0;
    if (s.cash < 0) S.borrow(s, 2e6);
    if (s.cash > 6e6 && s.debt > 0) S.repay(s, 2e6);
    // complete / deepen / abandon rigs at TD
    for (const r of s.rigs.slice()) if (r.status === 'td') {
      if (r.found.length) { if (!S.completeWell(s, r.id).ok && r.idle > 30) S.abandonRig(s, r.id); }
      else if (r.deeper && r.tier < 2 && s.cash > 4e6) S.deepenRig(s, r.id); else S.abandonRig(s, r.id);
    }
    if (d % 10 === 0 && s.rigs.length < 2 && s.cash > 2.5e6) {
      // drill the best surveyed, undrilled tile; else survey somewhere new
      let best = -1, bi = -1;
      for (let i = 0; i < N * N; i++) { const x = i % N, y = (i / N) | 0; const wellsOn = id => s.buildings.filter(b => b.type === 'well' && b.res.includes(id)).length + s.rigs.length; const rid = s.world.resAt[0][i]; if (rid >= 0 && s.world.reservoirs[rid].disc && wellsOn(rid) >= 2) continue; if (s.survey[i] > best && !S.canDrillAt(s, x, y) && !(s.tried || (s.tried = {}))[i]) { best = s.survey[i]; bi = i; } }
      if (best > 0.45) { s.tried[bi] = 1; const tier = s.surveyTier[bi] >= 0 ? s.surveyTier[bi] : (s.cash > 8e6 ? 1 : 0); S.startDrill(s, bi % N, (bi / N) | 0, tier); }
      else { const i = Math.floor(Math.random() * N * N); if (s.survey[i] < 0) S.startSurvey(s, i % N, (i / N) | 0); }
    }
    const count = t => s.buildings.filter(b => b.type === t).length;
    const place = t => { for (let i = 0; i < N * N; i++) { const x = i % N, y = (i / N) | 0; if (Math.abs(x - s.world.hq.x) + Math.abs(y - s.world.hq.y) < 6 && !S.canBuildAt(s, t, x, y)) return S.build(s, t, x, y); } };
    if (d % 30 === 0) {
      if (s.last.shut && s.cash > 2e6) place('tank');
      if (s.last.flared > 3000 && !count('gasplant') && s.cash > 5e6) place('gasplant');
      if (s.last.oil > 900 && count('refinery') < 2 && s.cash > 9e6) place('refinery');
      if (count('refinery') && !count('terminal') && s.cash > 12e6) place('terminal');
      if (!s.tech.cur && s.cash > 12e6) for (const t of ['seismic3d', 'bits', 'bop', 'horizontal', 'cracking', 'eor', 'deepwater']) if (!s.tech.done[t] && S.research(s, t).ok) break;
      for (const w of s.buildings) if (w.type === 'well' && !w.pipe && w.dist < 8 && s.cash > 4e6) S.buildPipeline(s, w.id);
    }
    if (!Number.isFinite(s.cash) || Object.values(s.stock).some(v => !Number.isFinite(v) || v < -1e-6)) { console.log('NaN/negative at day', s.day, s.cash, s.stock); bad++; break; }
    if ([360, 1080, 1800, 3599].includes(d)) console.log(`seed ${seed} y${(d / 360).toFixed(0)}: cash ${fmtMoney(s.cash)} nw ${fmtMoney(S.netWorth(s))} oil ${s.last.oil | 0}/d gas ${s.last.gas | 0}/d wells ${count('well')} strikes ${s.stats.strikes} dry ${s.stats.dry} rep ${s.rep | 0} profit/d ${fmtMoney(S.avgProfit(s))}`);
  }
  console.log(`seed ${seed}: land ${(land / N / N * 100) | 0}% reservoirs ${s.world.reservoirs.length} end ${s.over || (s.won ? 'WON' : 'alive')} day ${s.day} obj ${s.obj}`);
  JSON.parse(JSON.stringify(s));
}
process.exit(bad ? 1 : 0);
