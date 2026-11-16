// Boot + main loop.
import { G, SAVE_KEY } from './game.js';
import * as S from './sim.js';
import * as R from './render.js';
import * as UI from './ui.js';

const DAYS_PER_SEC = [0, 1.2, 3, 7];
let acc = 0, last = performance.now();

function startGame(state) {
  G.s = state; G.sel = null; G.mode = 'select'; G.speed = 1;
  R.loadWorld(state); R.setSelect(null);
  UI.setMode('select'); UI.renderAll();
}
UI.hooks.newGame = name => startGame(S.newGame((Math.random() * 1e9) | 0, name));
UI.hooks.load = () => {
  try {
    const st = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (st && st.v === 1) { st.fx = []; startGame(st); return true; }
  } catch (e) { /* fall through */ }
  UI.toast('Could not load the saved game.', 'bad'); return false;
};

function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const s = G.s;
  const running = s && G.speed > 0 && !G.hold && !s.over && !s.pending;
  if (running) {
    acc += dt * DAYS_PER_SEC[G.speed];
    let n = 0;
    while (acc >= 1 && n < 3) { acc -= 1; n++; S.tick(s); if (s.pending || s.over || s.fx.some(f => f.t === 'strike' || f.t === 'dry')) { acc = 0; break; } }
    if (n) { R.sync(s); UI.drainFx(); UI.render(); }
  }
  R.frame(dt, !!running);
  requestAnimationFrame(loop);
}

function boot(data) {
  R.init(document.getElementById('c'));
  R.cb.click = UI.onTileClick; R.cb.hover = UI.onTileHover;
  UI.bind();
  G.side = window.innerWidth >= 860;
  let resumed = false;
  if (data && data.save) { try { const st = JSON.parse(data.save); st.fx = []; startGame(st); resumed = true; } catch (e) { /* ignore */ } }
  if (!resumed) { startGame(S.newGame(20240607, 'Wildcat Petroleum')); UI.helpDialog(true); }
  window.__game = { G, S, R, UI };
  requestAnimationFrame(loop);
}
const hot = window.claude && window.claude.hot;
if (hot && hot.snapshot) hot.snapshot(() => ({ save: JSON.stringify(G.s) }));
if (hot && hot.ready) hot.ready(boot); else boot((hot && hot.data) || {});
