// DOM interface: top bar, toolbar, side panel tabs, tile inspector, modals, toasts.
import { G, sfx, SAVE_KEY } from './game.js';
import * as S from './sim.js';
import * as R from './render.js';
import { N, T, TERRAIN, TIERS, COMMS, STOCKED, BUILDINGS, BUILD_MENU, REFINERY_MODES, TECHS, OBJECTIVES, WIN_NET_WORTH } from './data.js';
import { fmtMoney, fmtNum, fmtPrice, dateStr, clamp } from './util.js';
import { seasonOf, WORLD_EVENTS } from './market.js';

const $ = id => document.getElementById(id);
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cache = {};
function setHTML(id, html) { if (cache[id] !== html) { cache[id] = html; $(id).innerHTML = html; return true; } return false; }
let uiBusy = false, modalOpen = null;
export const hooks = { newGame: null };

// ---------- helpers ----------
const sigWord = v => v < 0 ? 'Unsurveyed' : v < 0.2 ? 'Nothing' : v < 0.4 ? 'Weak' : v < 0.6 ? 'Moderate' : v < 0.8 ? 'Strong' : 'Very strong';
const btn = (label, a, attrs = '', cls = '') => `<button class="b ${cls}" data-a="${a}" ${attrs}>${label}</button>`;
const bar = (f, color = 'var(--amber)') => `<div class="bar"><i style="width:${clamp(f * 100, 0, 100).toFixed(1)}%;background:${color}"></i></div>`;
export function toast(text, kind = 'info') {
  const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = text;
  $('toasts').prepend(el);
  while ($('toasts').children.length > 4) $('toasts').lastChild.remove();
  setTimeout(() => el.classList.add('out'), 4200); setTimeout(() => el.remove(), 4800);
}
export function floatLabel(x, y, text, cls = '') {
  const p = R.project(x, y, 1.1), el = document.createElement('div');
  el.className = 'float ' + cls; el.textContent = text; el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
  $('labels').appendChild(el); setTimeout(() => el.remove(), 2600);
}
function act(res, okSound = 'click') {
  if (res && res.ok === false) { toast(res.msg, 'bad'); sfx('bad'); return false; }
  sfx(okSound); R.sync(G.s); render(); return true;
}
export function setMode(m) {
  G.mode = m; document.body.dataset.mode = m.split(':')[0];
  R.setOverlay(G.overlay || m === 'survey' || m === 'drill');
  if (m === 'select') R.setHover(null);
  $('buildmenu').hidden = true;
  renderTools(); renderHint();
}
function renderHint() {
  const m = G.mode, s = G.s;
  const txt = m === 'survey' ? `Tap a tile to survey the ${S.surveyRadius(s) * 2 + 1}×${S.surveyRadius(s) * 2 + 1} area around it · ${fmtMoney(S.surveyCost(s))} · 4 days`
    : m === 'drill' ? 'Tap a tile to plan an exploration well. Red and yellow tiles are your best bets.'
    : m.startsWith('build:') ? `Tap a tile to build: ${BUILDINGS[m.slice(6)].name}` : '';
  $('hint').hidden = !txt; $('hint').innerHTML = txt ? `${esc(txt)} <button class="b" data-a="mode" data-m="select">Cancel</button>` : '';
}

// ---------- top bar ----------
function renderTop() {
  const s = G.s, nw = S.netWorth(s), pr = S.avgProfit(s);
  const o = OBJECTIVES[s.obj];
  setHTML('topstats', `
    <div class="brand"><b>${esc(s.name)}</b><span>${S.rankOf(nw)}</span></div>
    <div class="stat"><label>Date</label><b>${dateStr(s.day)}</b></div>
    <div class="stat"><label>Cash</label><b class="${s.cash < 0 ? 'neg' : ''}">${fmtMoney(s.cash)}</b></div>
    <div class="stat"><label>Profit / day</label><b class="${pr < 0 ? 'neg' : 'pos'}">${fmtMoney(pr)}</b></div>
    <div class="stat"><label>Net worth</label><b>${fmtMoney(nw)}</b></div>
    <div class="stat" title="Reputation affects permit costs, fines and protests"><label>Reputation</label><b class="${s.rep < 35 ? 'neg' : ''}">${Math.round(s.rep)}</b></div>`);
  setHTML('topctl', `${['❚❚', '▶', '▶▶', '▶▶▶'].map((l, i) => `<button class="b ${G.speed === i ? 'on' : ''}" data-a="speed" data-v="${i}" aria-label="${['Pause', 'Normal speed', 'Fast', 'Fastest'][i]}">${l}</button>`).join('')}
    <button class="b sidebtn" data-a="side">${G.side ? 'Hide panel' : 'Panel'}</button>`);
  document.documentElement.style.setProperty('--top', $('top').offsetHeight + 'px');
  setHTML('objective', o ? `<span>Next goal</span> ${esc(o.text)}${o.reward ? ` <em>+${fmtMoney(o.reward)}</em>` : ''}` : '<span>All goals complete</span> You run the show now.');
}

// ---------- tools ----------
function renderTools() {
  const m = G.mode;
  const t = (id, icon, label, on) => `<button class="tool ${on ? 'on' : ''}" data-a="${id}"><i>${icon}</i><span>${label}</span></button>`;
  setHTML('tools', [
    t('tool-select', '👆', 'Inspect', m === 'select'), t('tool-survey', '📡', 'Survey', m === 'survey'), t('tool-drill', '⛏️', 'Drill', m === 'drill'),
    t('tool-build', '🏗️', 'Build', m.startsWith('build')), '<hr>',
    t('tool-overlay', '🗺️', 'Seismic', G.overlay), t('tool-xray', '🔦', 'X-ray', G.xray), '<hr>',
    t('rotl', '↺', 'Rotate'), t('rotr', '↻', 'Rotate'), t('zin', '＋', 'Zoom'), t('zout', '－', 'Zoom'),
  ].join(''));
}
function renderBuildMenu() {
  const s = G.s;
  $('buildmenu').innerHTML = `<h3>Build a facility</h3>` + BUILD_MENU.map(k => {
    const d = BUILDINGS[k], locked = d.tech && !S.has(s, d.tech);
    return `<button class="card ${locked ? 'locked' : ''}" data-a="pickbuild" data-t="${k}" ${locked ? 'disabled' : ''}>
      <i>${d.icon}</i><div><b>${d.name}</b> <em>${fmtMoney(d.cost)}</em><p>${locked ? 'Locked: research ' + TECHS.find(q => q.id === d.tech).name + '.' : d.desc}</p><small>Upkeep ${fmtMoney(d.opex)}/day · ${d.days} days to build</small></div></button>`;
  }).join('');
}

// ---------- charts ----------
function drawLine(cv, data, color, { fill = true, grid = false, fmt = null } = {}) {
  if (!cv || !data.length) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight;
  if (!w) return;
  cv.width = w * dpr; cv.height = h * dpr;
  const c = cv.getContext('2d'); c.scale(dpr, dpr);
  let lo = Math.min(...data), hi = Math.max(...data); if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
  const pad = grid ? 16 : 2, X = i => (i / (data.length - 1 || 1)) * (w - (grid ? 44 : 2)) + 1, Y = v => h - pad - (v - lo) / (hi - lo) * (h - pad * 2);
  if (grid) {
    c.font = '10px "IBM Plex Mono", monospace'; c.fillStyle = '#8ea0ad'; c.strokeStyle = 'rgba(255,255,255,.07)'; c.textAlign = 'right';
    for (let k = 0; k <= 3; k++) { const v = lo + (hi - lo) * k / 3, y = Y(v); c.beginPath(); c.moveTo(0, y); c.lineTo(w - 44, y); c.stroke(); c.fillText(fmt ? fmt(v) : v.toFixed(1), w - 2, y + 3); }
  }
  c.beginPath(); data.forEach((v, i) => i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v)));
  c.strokeStyle = color; c.lineWidth = grid ? 2 : 1.4; c.lineJoin = 'round'; c.stroke();
  if (fill) { c.lineTo(X(data.length - 1), h); c.lineTo(X(0), h); c.closePath(); c.globalAlpha = 0.14; c.fillStyle = color; c.fill(); c.globalAlpha = 1; }
  if (grid) { c.beginPath(); c.arc(X(data.length - 1), Y(data[data.length - 1]), 3.5, 0, 7); c.fillStyle = color; c.fill(); }
}

// ---------- side panel tabs ----------
const TABS = [['market', 'Market'], ['ops', 'Operations'], ['deals', 'Contracts'], ['research', 'Research'], ['finance', 'Finance'], ['intel', 'News']];
function tabMarket(s) {
  const P = s.market.prices, cp = S.caps(s), c0 = G.chart, h0 = s.market.hist[c0];
  const chg = (c, n = 30) => { const h = s.market.hist[c]; const a = h[Math.max(0, h.length - 1 - n)]; return (h[h.length - 1] / a - 1) * 100; };
  const sea = seasonOf(s.day);
  let h = `<div class="chartbox"><div class="charthead"><b style="color:${COMMS[c0].color}">${COMMS[c0].name}</b><span>${fmtPrice(P[c0])} / ${COMMS[c0].unit}</span><small>past year · low ${fmtPrice(Math.min(...h0))} · high ${fmtPrice(Math.max(...h0))}</small></div><canvas id="chart"></canvas></div>`;
  h += `<div class="stores">
    <div><label>Crude tanks <b>${fmtNum(s.stock.crude)} / ${fmtNum(cp.crude)}</b></label>${bar(s.stock.crude / (cp.crude || 1))}</div>
    <div><label>Product tanks <b>${fmtNum(S.prodStock(s))} / ${fmtNum(cp.prod)}</b></label>${bar(S.prodStock(s) / (cp.prod || 1), '#ef6461')}</div>
    <div><label>Gas storage <b>${fmtNum(s.stock.gas)} / ${fmtNum(cp.gas)}</b></label>${bar(cp.gas ? s.stock.gas / cp.gas : 0, '#4fd1c5')}</div></div>`;
  if (s.last.shut) h += `<div class="warn">Crude tanks are full. Wells are throttled. Sell crude or build a Tank Farm.</div>`;
  if (s.hedge) h += `<div class="note">Crude hedged at ${fmtPrice(s.hedge.price)} until ${dateStr(s.hedge.until)}.</div>`;
  if (sea.winter) h += `<div class="note">Winter: heating demand lifts gas and diesel.</div>`; else if (sea.summer) h += `<div class="note">Summer: driving season lifts gasoline and jet fuel.</div>`;
  for (const c of [...STOCKED, 'lng']) {
    const d = COMMS[c], ch = chg(c), a = s.auto[c], st = s.stock[c] || 0;
    const stp = c === 'gas' ? 0.2 : c === 'crude' ? 2 : 5;
    h += `<div class="comm ${c === c0 ? 'sel' : ''}" data-a="chart" data-c="${c}">
      <div class="l1"><span class="dot" style="background:${d.color}"></span><b>${d.name}</b><span class="price">${fmtPrice(P[c])}</span><span class="chg ${ch >= 0 ? 'up' : 'dn'}">${ch >= 0 ? '▲' : '▼'}${Math.abs(ch).toFixed(1)}%</span><canvas class="spark" data-c="${c}"></canvas></div>`;
    if (c === 'lng') h += `<div class="l2 dim">${s.buildings.some(b => b.type === 'lng') ? `Exported straight from your LNG terminal: ${fmtNum(s.last.lng || 0)} mcf/day.` : 'Needs an LNG Terminal. Sold directly, never stored.'}</div>`;
    else h += `<div class="l2"><span class="stock">${fmtNum(st)} ${d.unit}<small>${fmtMoney(st * S.sellPrice(s, c))}</small></span>
        ${btn('Sell ¼', 'sell', `data-c="${c}" data-q="0.25"`)}${btn('Sell all', 'sell', `data-c="${c}" data-q="1"`)}${btn('Buy ' + fmtNum(d.lot), 'buy', `data-c="${c}"`)}</div>
      <div class="l3">${btn(a.on ? 'Auto-sell on' : 'Holding stock', 'auto', `data-c="${c}"`, a.on ? 'on' : 'hold')}
        ${a.on ? `<span class="dim">only above</span>${btn('−', 'floor', `data-c="${c}" data-d="${-stp}"`, 'mini')}<b class="floor">${a.min > 0 ? fmtPrice(a.min) : 'any price'}</b>${btn('+', 'floor', `data-c="${c}" data-d="${stp}"`, 'mini')}${btn('Now', 'floornow', `data-c="${c}"`, 'mini')}` : '<span class="dim">waiting for a better price</span>'}</div>`;
    h += `</div>`;
  }
  return h;
}
function wellStatus(b) {
  if (b.build) return ['building', `${b.build}d to go`];
  if (b.offline > 0) return ['bad', `offline ${b.offline}d`];
  const st = b.last ? b.last.st : 'ok';
  return st === 'shut' ? ['bad', 'tanks full'] : st === 'nogas' ? ['bad', 'needs gas plant'] : st === 'flaring' ? ['warn', 'flaring gas'] : b.dead ? ['bad', 'dry'] : ['ok', 'flowing'];
}
function tabOps(s) {
  const L = s.last, wells = s.buildings.filter(b => b.type === 'well'), fac = s.buildings.filter(b => b.type !== 'well');
  let h = `<div class="kpis"><div><label>Oil</label><b>${fmtNum(L.oil)}</b><small>bbl/day</small></div><div><label>Gas captured</label><b>${fmtNum(L.gas)}</b><small>mcf/day</small></div><div><label>Flared</label><b class="${L.flared > 1 ? 'neg' : ''}">${fmtNum(L.flared)}</b><small>mcf/day</small></div><div><label>Refined</label><b>${fmtNum(L.refined)}</b><small>bbl/day</small></div></div>`;
  if (L.flared > 1) h += `<div class="warn">You are flaring gas. It costs reputation and money. A Gas Plant captures it.</div>`;
  if (s.rigs.length) h += `<h3>Rigs</h3>` + s.rigs.map(r => `<div class="item" data-a="goto" data-x="${r.x}" data-y="${r.y}"><b>Rig (${r.x},${r.y})</b><span class="tag ${r.status === 'td' ? 'warn' : 'ok'}">${r.status === 'td' ? 'awaiting orders' : Math.round(r.depth) + ' / ' + TIERS[r.tier].depth + ' m'}</span>${bar(r.depth / TIERS[r.tier].depth)}</div>`).join('');
  h += `<h3>Wells (${wells.length})</h3>`;
  if (!wells.length) h += `<p class="dim">No wells yet. Survey, drill, then complete a strike.</p>`;
  for (const b of wells) {
    const [k, txt] = wellStatus(b), r0 = s.world.reservoirs[b.res[0]];
    const f = Math.max(...b.res.map(id => { const r = s.world.reservoirs[id]; return r.type === 'oil' ? r.oil / r.oil0 : r.gas / r.gas0; }));
    h += `<div class="item" data-a="goto" data-x="${b.x}" data-y="${b.y}"><b>${b.sea ? 'Platform' : 'Well'} #${b.id}</b> <small>${TIERS[b.tier].name} ${r0.type}${b.level > 1 ? ' · Mk ' + b.level : ''}${b.pipe ? ' · piped' : ''}</small><span class="tag ${k}">${txt}</span>
      <div class="sub">${b.last ? `${fmtNum(b.last.oil)} bbl/d · ${fmtNum(b.last.gas + b.last.flared)} mcf/d` : ''} · field ${Math.round(f * 100)}% left</div>${bar(f, r0.type === 'oil' ? 'var(--amber)' : '#4fd1c5')}</div>`;
  }
  h += `<h3>Facilities</h3>`;
  for (const b of fac) {
    const d = BUILDINGS[b.type];
    const info = b.build ? `${b.build}d to go` : b.offline > 0 ? `offline ${b.offline}d` : b.type === 'refinery' ? `${fmtNum(b.last ? b.last.in : 0)} bbl/d · ${REFINERY_MODES[b.mode].name}` : b.type === 'petchem' ? `${fmtNum(b.last ? b.last.out : 0)} bbl/d` : b.type === 'lng' ? `${fmtNum(b.last ? b.last.out : 0)} mcf/d` : 'online';
    h += `<div class="item" data-a="goto" data-x="${b.x}" data-y="${b.y}"><b>${d.icon} ${d.name}</b><span class="tag ${b.build ? 'building' : b.offline > 0 ? 'bad' : 'ok'}">${info}</span></div>`;
  }
  return h;
}
function tabDeals(s) {
  const K = s.contracts;
  let h = `<h3>Active contracts (${K.active.length}/3)</h3>`;
  if (!K.active.length) h += `<p class="dim">None. Contracts pay above market but punish missed deadlines.</p>`;
  for (const k of K.active) {
    const d = COMMS[k.c], left = k.due - s.day;
    h += `<div class="deal"><b>${esc(k.who)}</b><span class="tag ${left < 20 ? 'warn' : 'ok'}">${left} days left</span>
      <div class="sub">${fmtNum(k.done)} / ${fmtNum(k.qty)} ${d.unit} of <b style="color:${d.color}">${d.name}</b> at ${fmtPrice(k.price)} <small>(spot ${fmtPrice(s.market.prices[k.c])})</small></div>${bar(k.done / k.qty, d.color)}
      <div class="rowb"><span class="dim">In stock: ${fmtNum(s.stock[k.c])}</span>${btn('Deliver from stock', 'deliver', `data-id="${k.id}"`, 'pri')}</div></div>`;
  }
  h += `<h3>Offers</h3>`;
  if (!K.offers.length) h += `<p class="dim">No offers on the table. Buyers call every month or two.</p>`;
  for (const k of K.offers) {
    const d = COMMS[k.c], prem = (k.price / s.market.prices[k.c] - 1) * 100;
    h += `<div class="deal"><b>${esc(k.who)}</b><span class="tag">expires in ${k.expires - s.day}d</span>
      <div class="sub">Deliver ${fmtNum(k.qty)} ${d.unit} of <b style="color:${d.color}">${d.name}</b> within ${k.days} days at ${fmtPrice(k.price)} <small class="${prem >= 0 ? 'pos' : 'neg'}">(${prem >= 0 ? '+' : ''}${prem.toFixed(0)}% vs spot)</small></div>
      <div class="sub">Worth ${fmtMoney(k.qty * k.price)} · penalty if missed ${fmtMoney(k.penalty)}</div>
      <div class="rowb">${btn('Decline', 'decline', `data-id="${k.id}"`)}${btn('Accept', 'accept', `data-id="${k.id}"`, 'pri')}</div></div>`;
  }
  return h;
}
function tabResearch(s) {
  let h = '';
  if (s.tech.cur) { const t = TECHS.find(q => q.id === s.tech.cur.id); h += `<div class="deal"><b>Researching: ${t.name}</b><span class="tag ok">${s.tech.cur.left} days</span>${bar(1 - s.tech.cur.left / t.days, '#8fb8ff')}</div>`; }
  else h += `<p class="dim">Your lab is idle. One project runs at a time.</p>`;
  for (const t of TECHS) {
    const done = S.has(s, t.id), cur = s.tech.cur && s.tech.cur.id === t.id, locked = t.req && !S.has(s, t.req);
    h += `<div class="tech ${done ? 'done' : ''} ${locked ? 'locked' : ''}"><div><b>${t.name}</b>${done ? '<span class="tag ok">done</span>' : cur ? '<span class="tag building">in progress</span>' : ''}<p>${t.desc}</p>
      <small>${locked ? 'Requires ' + TECHS.find(q => q.id === t.req).name : `${fmtMoney(t.cost)} · ${t.days} days`}</small></div>
      ${done || cur ? '' : btn('Research', 'research', `data-id="${t.id}" ${locked || s.tech.cur ? 'disabled' : ''}`, 'pri')}</div>`;
  }
  return h;
}
const CATS = [['sales', 'Spot sales'], ['contracts', 'Contracts'], ['opex', 'Upkeep & wages'], ['transport', 'Haulage'], ['feedstock', 'Feedstock imports'], ['trade', 'Stock purchases'], ['interest', 'Interest'], ['tax', 'Taxes & fines'], ['events', 'Events & bonuses'], ['explore', 'Exploration'], ['capex', 'Construction'], ['research', 'Research']];
function tabFinance(s) {
  const nw = S.netWorth(s), lim = S.creditLimit(s);
  const pl = (m, title) => { let tot = 0, r = ''; for (const [k, n] of CATS) if (m[k]) { tot += m[k]; r += `<tr><td>${n}</td><td class="${m[k] < 0 ? 'neg' : 'pos'}">${fmtMoney(m[k])}</td></tr>`; } return `<table class="pl"><caption>${title}</caption>${r || '<tr><td class="dim">Nothing yet</td><td></td></tr>'}<tr class="tot"><td>Cash flow</td><td class="${tot < 0 ? 'neg' : 'pos'}">${fmtMoney(tot)}</td></tr></table>`; };
  const board = [...s.rivals.map(r => ({ n: r.n, v: r.v })), { n: s.name, v: nw, me: true }].sort((a, b) => b.v - a.v);
  return `<div class="chartbox"><div class="charthead"><b>Net worth</b><span>${fmtMoney(nw)}</span><small>goal ${fmtMoney(WIN_NET_WORTH)}</small></div><canvas id="nwchart"></canvas>${bar(nw / WIN_NET_WORTH)}</div>
    <h3>Bank</h3><div class="deal"><div class="sub">Debt <b>${fmtMoney(s.debt)}</b> of ${fmtMoney(lim)} credit · 9% a year (${fmtMoney(s.debt * 0.09 / 360)}/day)</div>
      <div class="rowb">${btn('Borrow $1M', 'borrow', 'data-v="1e6"')}${btn('Borrow $5M', 'borrow', 'data-v="5e6"')}${btn('Repay $1M', 'repay', 'data-v="1e6"')}${btn('Repay all', 'repay', 'data-v="1e12"')}</div></div>
    ${pl(s.fin.month, 'This month')}${pl(s.fin.last, 'Last month')}
    <h3>Industry league</h3><table class="pl">${board.map((r, i) => `<tr class="${r.me ? 'me' : ''}"><td>${i + 1}. ${esc(r.n)}</td><td>${fmtMoney(r.v)}</td></tr>`).join('')}</table>
    <h3>Company</h3><div class="deal"><div class="sub">Reputation ${Math.round(s.rep)}/100 · ${s.rep < 40 ? 'permits cost 25% more' : s.rep > 80 ? 'permits cost 8% less' : 'neutral'}${s.rep < 30 ? ' · monthly fines' : ''}</div>
      <div class="rowb">${btn('Fund a community project ($500k, +5 rep)', 'donate')}</div></div>
    <div class="deal"><div class="sub">Lifetime: ${fmtNum(s.stats.oil)} bbl oil · ${fmtNum(s.stats.gas)} mcf gas · ${s.stats.strikes} discoveries · ${s.stats.dry} dry holes</div>
      <div class="rowb">${btn('Save', 'save')}${btn(G.sound ? 'Sound on' : 'Sound off', 'sound')}${btn('How to play', 'help')}${btn('New game', 'newgame')}</div></div>`;
}
function tabIntel(s) {
  const groups = {};
  for (const m of s.market.mods) (groups[m.id] = groups[m.id] || { label: m.label, left: m.left, fx: [] }).fx.push(m);
  let h = `<h3>Market movers</h3>`;
  const ids = Object.keys(groups);
  if (!ids.length && !s.market.sched.length) h += `<p class="dim">Markets are calm. It will not last.</p>`;
  for (const id of ids) { const g = groups[id]; h += `<div class="deal"><b>${esc(g.label)}</b><span class="tag">${g.left} days left</span><div class="sub">${g.fx.filter(m => m.c !== 'none').map(m => `<span class="${m.amt > 0 ? 'pos' : 'neg'}">${COMMS[m.c].name} ${m.amt > 0 ? '▲' : '▼'}${Math.abs((Math.exp(m.amt * Math.min(1, m.left / (m.dur * 0.3))) - 1) * 100).toFixed(0)}%</span>`).join(' · ') || 'Carbon tax: $2.50 per barrel produced'}</div></div>`; }
  for (const r of s.market.sched) { h += `<div class="deal rumor"><b>Rumour</b><span class="tag warn">unconfirmed</span><div class="sub">Traders expect "${esc(rumorTitle(r.id))}" within ${r.day - s.day} days. About one rumour in four is hot air.</div></div>`; }
  h += `<h3>Newswire</h3>` + s.news.slice(0, 40).map(n => `<div class="news ${n.k}"><small>${dateStr(n.d)}</small>${esc(n.t)}</div>`).join('');
  return h;
}
const rumorTitle = id => (WORLD_EVENTS.find(e => e.id === id) || { title: id }).title;

function renderSide() {
  const s = G.s;
  $('side').hidden = !G.side;
  if (!G.side) return;
  const K = s.contracts, badge = { deals: K.offers.length || '', ops: s.rigs.filter(r => r.status === 'td').length || '' };
  setHTML('tabs', TABS.map(([k, n]) => `<button class="tab ${G.tab === k ? 'on' : ''}" data-a="tab" data-t="${k}">${n}${badge[k] ? `<i>${badge[k]}</i>` : ''}</button>`).join(''));
  const f = { market: tabMarket, ops: tabOps, deals: tabDeals, research: tabResearch, finance: tabFinance, intel: tabIntel }[G.tab];
  if (setHTML('panel', f(s)) || G.tab === 'market' || G.tab === 'finance') drawCharts();
}
function drawCharts() {
  const s = G.s;
  if (G.tab === 'market') {
    drawLine($('chart'), s.market.hist[G.chart], COMMS[G.chart].color, { grid: true, fmt: v => '$' + (v < 20 ? v.toFixed(2) : v.toFixed(0)) });
    document.querySelectorAll('canvas.spark').forEach(cv => drawLine(cv, s.market.hist[cv.dataset.c].slice(-90), COMMS[cv.dataset.c].color, { fill: false }));
  } else if (G.tab === 'finance') drawLine($('nwchart'), s.fin.nw.length > 1 ? s.fin.nw : [S.netWorth(s), S.netWorth(s)], '#f2a03d', { grid: true, fmt: v => '$' + fmtNum(v) });
}

// ---------- inspector ----------
function strata(cv, s, rig) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight; if (!w) return;
  cv.width = w * dpr; cv.height = h * dpr; const c = cv.getContext('2d'); c.scale(dpr, dpr);
  const maxD = 4500, Y = d => 14 + d / maxD * (h - 20);
  let seed = rig.x * 73 + rig.y * 131 + 7; const rn = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const cols = ['#8a6f4d', '#6f6457', '#a08a63', '#5b5f66', '#93806a', '#77695a', '#4f555c', '#b09a72'];
  c.fillStyle = S.isSea(s, rig.x, rig.y) ? '#2a8fd0' : '#6fae4e'; c.fillRect(0, 0, w, 14);
  let d = 0, k = 0;
  while (d < maxD) { const t = 250 + rn() * 600; c.fillStyle = cols[(k++ + Math.floor(rn() * 3)) % cols.length]; c.fillRect(0, Y(d), w, Y(Math.min(maxD, d + t)) - Y(d) + 1); d += t; }
  c.font = '10px "IBM Plex Mono", monospace';
  TIERS.forEach((t, i) => {
    c.setLineDash([4, 3]); c.strokeStyle = i <= rig.tier ? '#fff' : 'rgba(255,255,255,.35)'; c.beginPath(); c.moveTo(0, Y(t.depth)); c.lineTo(w, Y(t.depth)); c.stroke(); c.setLineDash([]);
    c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(2, Y(t.depth) - 13, 104, 12); c.fillStyle = '#fff'; c.fillText(`${t.name} · ${t.depth} m`, 5, Y(t.depth) - 4);
  });
  for (const id of rig.found) { const r = s.world.reservoirs[id]; c.fillStyle = r.type === 'oil' ? '#14100c' : '#4fd1c5'; c.beginPath(); c.ellipse(w * 0.62, Y(TIERS[r.tier].depth) + 4, w * 0.3, 8, 0, 0, 7); c.fill(); c.strokeStyle = r.type === 'oil' ? '#f2a03d' : '#fff'; c.stroke(); }
  const x = w * 0.62; c.strokeStyle = '#f2c94c'; c.lineWidth = 3; c.beginPath(); c.moveTo(x, 4); c.lineTo(x, Y(rig.depth)); c.stroke();
  c.fillStyle = '#e5383b'; c.beginPath(); c.moveTo(x - 5, Y(rig.depth) - 4); c.lineTo(x + 5, Y(rig.depth) - 4); c.lineTo(x, Y(rig.depth) + 5); c.fill();
  c.fillStyle = '#3a4048'; c.fillRect(x - 7, 0, 14, 8);
}
function rigActions(s, rig) {
  if (rig.status !== 'td') return '';
  let h = '';
  if (rig.found.length) h += btn(`Complete as ${S.isSea(s, rig.x, rig.y) ? 'platform' : 'pumpjack'} · ${fmtMoney(S.wellCost(s, rig.x, rig.y))}`, 'complete', `data-id="${rig.id}"`, 'pri');
  if (rig.tier < 2) h += btn(`Deepen to ${TIERS[rig.tier + 1].depth} m · ${fmtMoney(S.drillCost(s, rig.x, rig.y, rig.tier + 1, rig.tier))}`, 'deepen', `data-id="${rig.id}"`);
  h += btn('Plug and abandon', 'abandon', `data-id="${rig.id}"`);
  return h;
}
function fieldLines(s, i, upto = 2) {
  let h = '';
  for (let t = 0; t <= upto; t++) {
    const id = s.world.resAt[t][i]; if (id < 0) continue;
    const r = s.world.reservoirs[id]; if (!r.disc) continue;
    const f = r.type === 'oil' ? r.oil / r.oil0 : r.gas / r.gas0;
    h += `<div class="field"><b style="color:${r.type === 'oil' ? 'var(--amber)' : '#4fd1c5'}">${TIERS[t].name} ${r.type} field</b> · ${r.tiles.length} tiles<div class="sub">about ${r.type === 'oil' ? fmtNum(r.oil * r.ef) + ' bbl' : fmtNum(r.gas * r.ef) + ' mcf'} left (${Math.round(f * 100)}%)</div>${bar(f, r.type === 'oil' ? 'var(--amber)' : '#4fd1c5')}</div>`;
  }
  return h;
}
function renderInspect() {
  const s = G.s, t = G.sel;
  $('inspect').hidden = !t;
  if (!t) return;
  const i = t.y * N + t.x, tt = s.world.terrain[i], b = S.buildingAt(s, t.x, t.y), rig = S.rigAt(s, t.x, t.y), v = s.survey[i];
  let h = `<header><b>${b ? (b.type === 'well' ? (b.sea ? 'Platform' : 'Well') + ' #' + b.id : BUILDINGS[b.type].name) : rig ? 'Drilling rig' : TERRAIN[tt].name}</b><small>(${t.x},${t.y}) ${TERRAIN[tt].name}${S.isCoastal(s, t.x, t.y) ? ' · coast' : ''}</small><button class="x" data-a="desel" aria-label="Close">×</button></header>`;
  h += `<div class="sig"><label>Seismic signal</label><b>${sigWord(v)}${v >= 0 ? ' · ' + Math.round(v * 100) + '%' : ''}</b>${s.surveyTier[i] >= 0 ? `<small>likely ${TIERS[s.surveyTier[i]].name.toLowerCase()}</small>` : ''}${v >= 0 ? bar(v, v > 0.6 ? '#e5383b' : v > 0.4 ? '#f2c94c' : '#3d8f8a') : ''}</div>`;
  if (rig) {
    h += `<div class="sub">${rig.status === 'td' ? 'At total depth. Awaiting your orders (standby $5k/day after 5 days).' : `Drilling to ${TIERS[rig.tier].name.toLowerCase()} target: ${Math.round(rig.depth)} / ${TIERS[rig.tier].depth} m`}</div>
      <canvas id="strata"></canvas><div class="log">${rig.log.slice(-4).reverse().map(l => `<div class="${l.k || ''}"><small>${l.d} m</small>${esc(l.t)}</div>`).join('')}</div>
      ${fieldLines(s, i, rig.tier)}<div class="acts">${rigActions(s, rig)}</div>`;
  } else if (b) {
    const d = BUILDINGS[b.type];
    if (b.build) h += `<div class="sub">Under construction: ${b.build} days to go.</div>${bar(1 - b.build / b.build0, '#f2c94c')}`;
    if (b.type === 'well') {
      const [k, txt] = wellStatus(b), rate = S.wellRate(s, b);
      h += `<div class="sub"><span class="tag ${k}">${txt}</span> Mk ${b.level} · ${TIERS[b.tier].name}</div>
        <div class="grid2"><div><label>Oil</label><b>${fmtNum(b.last ? b.last.oil : 0)}</b><small>of ${fmtNum(rate.oil)} bbl/d</small></div><div><label>Gas</label><b>${fmtNum(b.last ? b.last.gas + b.last.flared : 0)}</b><small>mcf/d${b.last && b.last.flared > 1 ? ' · flared' : ''}</small></div>
        <div><label>Haulage</label><b>$${S.haulCost(b).toFixed(2)}</b><small>per bbl · ${b.pipe ? 'pipeline' : b.sea ? 'shuttle tanker' : 'trucks'} · ${b.dist} tile${b.dist === 1 ? '' : 's'}</small></div><div><label>Upkeep</label><b>${fmtMoney(S.wellOpex(s, b))}</b><small>per day</small></div></div>
        ${fieldLines(s, i, b.tier)}<div class="acts">
        ${b.level < 3 ? btn(`Upgrade to Mk ${b.level + 1} (+${b.level === 1 ? 35 : 26}% flow) · ${fmtMoney(S.upgradeCost(s, b))}`, 'upgrade', `data-id="${b.id}"`, 'pri') : ''}
        ${!b.pipe ? btn(`Lay pipeline to depot · ${fmtMoney(S.pipeCost(s, b))}`, 'pipe', `data-id="${b.id}"`) : ''}
        ${btn(`Plug and abandon · ${fmtMoney(b.cost * 0.08)}`, 'demolish', `data-id="${b.id}"`, 'danger')}</div>`;
    } else {
      h += `<p class="sub">${d.desc}</p>`;
      if (b.offline > 0) h += `<div class="warn">Offline for repairs: ${b.offline} days.</div>`;
      if (b.type === 'refinery' && !b.build) {
        h += `<div class="sub">Processing ${fmtNum(b.last ? b.last.in : 0)} bbl/day${b.last && b.last.imp > 0 ? ` (${fmtNum(b.last.imp)} imported)` : ''}. Output focus:</div><div class="acts row">${Object.entries(REFINERY_MODES).map(([k, m]) => btn(m.name, 'refmode', `data-id="${b.id}" data-m="${k}"`, b.mode === k ? 'on' : '')).join('')}</div>
          <div class="sub dim">Gasoline ${fmtPrice(s.market.prices.gasoline)} · Diesel ${fmtPrice(s.market.prices.diesel)} · Jet ${fmtPrice(s.market.prices.jet)}</div>`;
      }
      if ((b.type === 'refinery' || b.type === 'petchem') && !b.build) h += `<div class="acts">${btn(b.import ? 'Importing feedstock when short (spot +5%)' : 'Runs on your own stock only', 'import', `data-id="${b.id}"`, b.import ? 'on' : '')}</div>`;
      if (b.type !== 'hq') h += `<div class="acts">${btn(`Demolish · ${fmtMoney(b.cost * 0.08)}`, 'demolish', `data-id="${b.id}"`, 'danger')}</div>`;
    }
  } else {
    h += fieldLines(s, i);
    const why = S.canDrillAt(s, t.x, t.y);
    h += `<div class="acts">${btn(`Survey around here · ${fmtMoney(S.surveyCost(s))}`, 'surveyhere')}${why ? `<p class="dim">${why}</p>` : btn('Plan a well here…', 'drillhere', '', 'pri')}</div>`;
  }
  setHTML('inspect', h);
  if (rig && $('strata')) strata($('strata'), s, rig);
}

// ---------- modals ----------
export function modal(html, opts = {}) {
  modalOpen = opts; $('modal').innerHTML = `<div class="sheet ${opts.cls || ''}">${html}</div>`; $('modal').hidden = false; G.hold = true;
}
export function closeModal() { $('modal').hidden = true; $('modal').innerHTML = ''; modalOpen = null; G.hold = false; }
export const isModal = () => !!modalOpen;

function drillDialog(x, y) {
  const s = G.s, why = S.canDrillAt(s, x, y);
  if (why) { toast(why, 'bad'); sfx('bad'); return; }
  const i = y * N + x, v = s.survey[i], tt = s.world.terrain[i], st = s.surveyTier[i];
  const spd = 160 * (S.has(s, 'bits') ? 1.4 : 1) * (tt <= 1 ? 0.8 : 1);
  modal(`<h2>Plan a well at (${x},${y})</h2>
    <p>${TERRAIN[tt].name} · seismic signal <b>${sigWord(v).toLowerCase()}</b>${v >= 0 ? ` (${Math.round(v * 100)}%)` : ''}${st >= 0 ? ` · geologists expect a <b>${TIERS[st].name.toLowerCase()}</b> target` : v >= 0 && !S.has(s, 'seismic3d') ? ' · depth unknown without 3D seismic' : ''}.</p>
    <p class="dim">Pick how deep to drill. A well taps every field it passes through. Deeper costs more, but you can deepen a well later if the cuttings look promising.</p>
    <div class="choices">${TIERS.map((t, k) => `<button class="card ${st === k ? 'rec' : ''}" data-a="drillgo" data-x="${x}" data-y="${y}" data-t="${k}"><div><b>${t.name} · ${t.depth} m</b> <em>${fmtMoney(S.drillCost(s, x, y, k))}</em>
      <p>${['Small, quick fields. The safe first step.', 'Bigger fields and stronger flow.', 'Elephant country: huge fields, huge bills.'][k]}</p><small>about ${Math.ceil(t.depth / spd)} days · typical flow ${fmtNum(t.oilRate)} bbl/d${st === k ? ' · recommended' : ''}</small></div></button>`).join('')}</div>
    <div class="rowb">${btn('Cancel', 'close')}</div>`);
}
function rigDialog(rig, strike) {
  const s = G.s, i = rig.y * N + rig.x;
  const r = rig.found.length ? s.world.reservoirs[rig.found[rig.found.length - 1]] : null;
  modal(`<h2 class="${strike ? 'pos' : ''}">${strike ? (r.type === 'oil' ? 'Oil strike!' : 'Gas strike!') : rig.found.length ? 'Nothing new at this depth' : 'Dry hole'}</h2>
    <p>${strike ? `The bit broke into a ${TIERS[r.tier].name.toLowerCase()} ${r.type} field at (${rig.x},${rig.y}).` : `The well at (${rig.x},${rig.y}) reached ${TIERS[rig.tier].depth} m without a new discovery.`}
    ${rig.deeper ? ' <b class="hintc">The last cuttings carried hydrocarbon shows. Something may lie deeper.</b>' : rig.tier < 2 ? ' No shows in the last cuttings.' : ''}</p>
    ${fieldLines(s, i, rig.tier)}
    ${r && r.type === 'gas' && !s.buildings.some(b => b.type === 'gasplant') ? '<div class="warn">A gas well needs a Gas Plant before it can flow.</div>' : ''}
    <div class="acts">${rigActions(s, rig)}${btn('Decide later', 'close')}</div>`, { cls: strike ? 'strike' : '' });
}
function decisionDialog() {
  const ev = G.s.pending;
  modal(`<h2>${esc(ev.title)}</h2><p>${esc(ev.text)}</p><div class="choices">${ev.options.map((o, k) => `<button class="card" data-a="decide" data-i="${k}"><div><b>${esc(o.l)}</b><p>${esc(o.h)}</p></div></button>`).join('')}</div>`, { sticky: true });
}
export function helpDialog(first) {
  let saved = null; try { saved = localStorage.getItem(SAVE_KEY); } catch (e) { /* no storage */ }
  modal(`<h1>Crude Empire</h1><p class="lead">Find it. Drill it. Refine it. Sell it at the top.</p>
    <ol class="how">
      <li><b>Survey</b> to paint a seismic heat-map. Red means a strong signal. Cheap surveys are noisy and sometimes wrong.</li>
      <li><b>Drill</b> an exploration well and choose a depth. Watch the drill log for gas shows, then complete, deepen or abandon.</li>
      <li><b>Produce.</b> Fields are finite and decline. Haulage costs by distance, so lay pipelines. Full tanks throttle wells.</li>
      <li><b>Refine and trade.</b> Prices swing with seasons, cycles and world news. Hold stock for a spike or take contracts.</li>
      <li><b>Grow</b> offshore and into the deep. Reach ${fmtMoney(WIN_NET_WORTH)} net worth to become an Oil Baron. Run out of cash for 90 days and the bank takes it all.</li>
    </ol>
    <p class="dim">Drag to pan · right-drag or two fingers to rotate · wheel or pinch to zoom · Space pauses · X toggles the underground X-ray view.</p>
    ${first ? `<label class="field2" for="coname">Company name</label><input id="coname" maxlength="28" value="Wildcat Petroleum">
      <div class="rowb">${saved ? btn('Continue saved game', 'continue') : ''}${btn('Start a new company', 'start', '', 'pri')}</div>` : `<div class="rowb">${btn('Back to work', 'close', '', 'pri')}</div>`}`, { sticky: first, cls: 'welcome' });
}
function endDialog(kind) {
  const s = G.s;
  modal(kind === 'win' ? `<h1>Oil Baron</h1><p class="lead">${esc(s.name)} is worth ${fmtMoney(S.netWorth(s))} after ${Math.floor(s.day / 360)} years and ${s.day % 360} days.</p><p>${s.stats.strikes} discoveries, ${s.stats.dry} dry holes, ${fmtNum(s.stats.oil)} barrels lifted. The league table has a new name at the top table.</p><div class="rowb">${btn('Keep playing', 'close', '', 'pri')}${btn('New game', 'newgame')}</div>`
    : `<h1>Foreclosed</h1><p class="lead">The bank has taken the keys to ${esc(s.name)}.</p><p>You lasted ${dateStr(s.day)} and lifted ${fmtNum(s.stats.oil)} barrels. Every baron goes bust at least once.</p><div class="rowb">${btn('Try again', 'newgame', '', 'pri')}</div>`, { sticky: kind !== 'win', cls: 'welcome' });
}

// ---------- fx from the sim ----------
export function drainFx() {
  const s = G.s; let overlay = false;
  for (const f of s.fx.splice(0)) {
    switch (f.t) {
      case 'news': toast(f.text, f.kind); $('ticker').textContent = f.text; $('ticker').className = f.kind; if (f.kind === 'bad') sfx('bad'); else if (f.kind === 'good') sfx('good'); break;
      case 'toast': toast(f.text, f.kind); break;
      case 'survey': overlay = true; break;
      case 'surveyDone': floatLabel(f.x, f.y, 'Survey complete', 'info'); if (!G.overlay) { G.overlay = true; R.setOverlay(true); renderTools(); } break;
      case 'strike': { R.burst(f.gas ? 'gasjet' : 'gusher', f.x, f.y); floatLabel(f.x, f.y, f.gas ? 'GAS!' : 'OIL!', 'big'); sfx('strike'); R.focus(f.x, f.y); const rig = s.rigs.find(r => r.id === f.id); if (rig && !isModal()) { G.sel = { x: f.x, y: f.y }; R.setSelect(G.sel); rigDialog(rig, true); } break; }
      case 'dry': { R.burst('dust', f.x, f.y); floatLabel(f.x, f.y, 'Dry', 'badl'); const rig = s.rigs.find(r => r.id === f.id); if (rig && !isModal()) { G.sel = { x: f.x, y: f.y }; R.setSelect(G.sel); R.focus(f.x, f.y); rigDialog(rig, false); } break; }
      case 'blowout': R.burst('fire', f.x, f.y); floatLabel(f.x, f.y, 'BLOWOUT', 'badl'); R.focus(f.x, f.y); break;
      case 'built': R.burst('spark', f.x, f.y); sfx('build'); break;
      case 'focus': R.focus(f.x, f.y, 18); break;
      case 'month': save(true); break;
      case 'objective': sfx('cash'); break;
      case 'win': endDialog('win'); break;
      case 'over': endDialog('over'); break;
    }
  }
  if (overlay) R.updateOverlay(s);
  if (s.pending && !isModal()) decisionDialog();
}
export function save(quiet) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.s)); if (!quiet) toast('Game saved.', 'good'); } catch (e) { if (!quiet) toast('Saving is not available in this browser.', 'bad'); }
}

// ---------- map interaction ----------
export function onTileClick(t) {
  if (!t || isModal()) return;
  const s = G.s, m = G.mode;
  if (m === 'survey') { if (act(S.startSurvey(s, t.x, t.y))) floatLabel(t.x, t.y, '-' + fmtMoney(S.surveyCost(s)), 'cost'); }
  else if (m === 'drill') drillDialog(t.x, t.y);
  else if (m.startsWith('build:')) {
    const type = m.slice(6);
    if (act(S.build(s, type, t.x, t.y), 'build')) { floatLabel(t.x, t.y, '-' + fmtMoney(S.buildCost(s, type, t.x, t.y)), 'cost'); G.sel = t; R.setSelect(t); setMode('select'); render(); }
  } else { G.sel = t; R.setSelect(t); sfx('click'); renderInspect(); }
}
export function onTileHover(t) {
  const s = G.s, m = G.mode;
  if (!t) { R.setHover(null); return; }
  if (m === 'survey') R.setHover(t, S.surveyRadius(s) * 2 + 1, 0x9be7ff);
  else if (m === 'drill') R.setHover(t, 1, S.canDrillAt(s, t.x, t.y) ? 0xe5383b : 0x7CFC9A);
  else if (m.startsWith('build:')) R.setHover(t, 1, S.canBuildAt(s, m.slice(6), t.x, t.y) ? 0xe5383b : 0x7CFC9A);
  else R.setHover(t, 1, 0xffffff);
}

// ---------- actions ----------
function handle(a, d) {
  const s = G.s, id = +d.id;
  switch (a) {
    case 'speed': G.speed = +d.v; sfx('click'); break;
    case 'side': G.side = !G.side; break;
    case 'tab': G.tab = d.t; cache.panel = null; $('panel').scrollTop = 0; break;
    case 'chart': G.chart = d.c; break;
    case 'mode': setMode(d.m); break;
    case 'tool-select': setMode('select'); break;
    case 'tool-survey': setMode(G.mode === 'survey' ? 'select' : 'survey'); break;
    case 'tool-drill': setMode(G.mode === 'drill' ? 'select' : 'drill'); break;
    case 'tool-build': { const open = $('buildmenu').hidden; setMode('select'); if (open) { renderBuildMenu(); $('buildmenu').hidden = false; } break; }
    case 'pickbuild': setMode('build:' + d.t); break;
    case 'tool-overlay': G.overlay = !G.overlay; R.setOverlay(G.overlay || G.mode !== 'select'); renderTools(); break;
    case 'tool-xray': G.xray = !G.xray; R.setXray(G.xray); renderTools(); if (G.xray) toast('X-ray view: discovered fields glow underground and shrink as you drain them.', 'info'); break;
    case 'rotl': R.rotate(-Math.PI / 4); break;
    case 'rotr': R.rotate(Math.PI / 4); break;
    case 'zin': R.zoom(0.75); break;
    case 'zout': R.zoom(1.33); break;
    case 'sell': { const rev = S.sell(s, d.c, s.stock[d.c] * +d.q); if (rev > 0) { toast(`Sold for ${fmtMoney(rev)}.`, 'good'); sfx('cash'); } else toast('Nothing in stock to sell.', 'bad'); break; }
    case 'buy': act(S.buy(s, d.c, COMMS[d.c].lot), 'cash'); break;
    case 'auto': s.auto[d.c].on = !s.auto[d.c].on; break;
    case 'floor': s.auto[d.c].min = Math.max(0, Math.round((s.auto[d.c].min + +d.d) * 10) / 10); break;
    case 'floornow': s.auto[d.c].min = Math.round(s.market.prices[d.c] * 10) / 10; break;
    case 'goto': G.sel = { x: +d.x, y: +d.y }; R.setSelect(G.sel); R.focus(+d.x, +d.y, 16); if (window.innerWidth < 760) G.side = false; break;
    case 'desel': G.sel = null; R.setSelect(null); break;
    case 'surveyhere': if (act(S.startSurvey(s, G.sel.x, G.sel.y))) floatLabel(G.sel.x, G.sel.y, '-' + fmtMoney(S.surveyCost(s)), 'cost'); break;
    case 'drillhere': drillDialog(G.sel.x, G.sel.y); return;
    case 'drillgo': closeModal(); if (act(S.startDrill(s, +d.x, +d.y, +d.t), 'build')) { G.sel = { x: +d.x, y: +d.y }; R.setSelect(G.sel); setMode('select'); } break;
    case 'complete': if (act(S.completeWell(s, id), 'build')) closeModal(); break;
    case 'deepen': if (act(S.deepenRig(s, id), 'build')) closeModal(); break;
    case 'abandon': act(S.abandonRig(s, id)); closeModal(); break;
    case 'upgrade': act(S.upgradeWell(s, id), 'build'); break;
    case 'pipe': act(S.buildPipeline(s, id), 'build'); break;
    case 'demolish': if (d.sure) { act(S.demolish(s, id)); G.sel = null; R.setSelect(null); } else { toast('Tap again to confirm.', 'warn'); armed = id; setTimeout(() => { armed = 0; render(); }, 3000); } break;
    case 'refmode': act(S.setRefMode(s, id, d.m)); break;
    case 'import': act(S.toggleImport(s, id)); break;
    case 'accept': act(S.acceptContract(s, id), 'good'); break;
    case 'decline': act(S.declineContract(s, id)); break;
    case 'deliver': act(S.deliverContract(s, id), 'cash'); break;
    case 'research': act(S.research(s, d.id), 'good'); break;
    case 'borrow': act(S.borrow(s, +d.v), 'cash'); break;
    case 'repay': act(S.repay(s, +d.v), 'cash'); break;
    case 'donate': act(S.donate(s), 'good'); break;
    case 'save': save(false); break;
    case 'sound': G.sound = !G.sound; break;
    case 'help': helpDialog(false); return;
    case 'close': closeModal(); break;
    case 'decide': S.resolveDecision(s, +d.i); closeModal(); R.sync(s); break;
    case 'newgame': if (d.sure || s.over) { closeModal(); helpDialog(true); return; } toast('Tap New game again to abandon this company.', 'warn'); armedNew = true; setTimeout(() => { armedNew = false; render(); }, 3000); break;
    case 'start': hooks.newGame(($('coname').value || '').trim() || 'Wildcat Petroleum'); closeModal(); break;
    case 'continue': if (hooks.load()) closeModal(); break;
  }
  render();
}
let armed = 0, armedNew = false;
export function bind() {
  document.addEventListener('pointerdown', e => { if (e.target.closest('#side,#inspect,#modal,#tools,#buildmenu,#top')) uiBusy = true; });
  const rel = () => { if (uiBusy) { uiBusy = false; setTimeout(render, 0); } };
  document.addEventListener('pointerup', rel); document.addEventListener('pointercancel', rel);
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-a]');
    if (!el || el.disabled) { if (e.target.id === 'modal' && modalOpen && !modalOpen.sticky) closeModal(); return; }
    const d = { ...el.dataset };
    if (d.a === 'demolish' && armed === +d.id) d.sure = 1;
    if (d.a === 'newgame' && armedNew) d.sure = 1;
    e.stopPropagation();
    handle(d.a, d);
  });
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === 'escape') { if (modalOpen && !modalOpen.sticky) closeModal(); else setMode('select'); }
    else if (isModal()) return;
    else if (k === ' ') { e.preventDefault(); G.speed = G.speed ? 0 : (G.lastSpeed || 1); }
    else if ('123'.includes(k)) G.speed = +k;
    else if (k === 's') handle('tool-survey', {}); else if (k === 'd') handle('tool-drill', {}); else if (k === 'b') handle('tool-build', {});
    else if (k === 'x') handle('tool-xray', {}); else if (k === 'o') handle('tool-overlay', {});
    else if (k === 'q') R.rotate(-0.4); else if (k === 'e') R.rotate(0.4);
    else if (k.startsWith('arrow')) R.keyPan({ arrowleft: 60, arrowright: -60 }[k] || 0, { arrowup: 60, arrowdown: -60 }[k] || 0);
    if (G.speed) G.lastSpeed = G.speed;
    render();
  });
}

export function render() {
  if (!G.s || uiBusy) return;
  renderTop(); renderSide(); renderInspect();
}
export function renderAll() { for (const k in cache) delete cache[k]; renderTools(); renderHint(); render(); }
