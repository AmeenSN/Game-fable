// Procedural island + hidden reservoirs.
import { N, T, TIERS } from './data.js';
import { rnd, rr, ri, pick, lerp } from './util.js';

export function generateWorld(seed) {
  const g = { rs: seed | 0 };
  const G = 48;
  const mk = () => { const a = new Float32Array(G * G); for (let i = 0; i < a.length; i++) a[i] = rnd(g); return a; };
  const n1 = mk(), n2 = mk(), n3 = mk();
  const vn = (a, x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const at = (i, j) => a[(((j % G) + G) % G) * G + (((i % G) + G) % G)];
    return lerp(lerp(at(xi, yi), at(xi + 1, yi), sx), lerp(at(xi, yi + 1), at(xi + 1, yi + 1), sx), sy);
  };
  const fbm = (a, x, y) => vn(a, x, y) * 0.55 + vn(a, x * 2.1 + 7, y * 2.1 + 3) * 0.3 + vn(a, x * 4.3 + 13, y * 4.3 + 5) * 0.15;

  const terrain = new Array(N * N), elev = new Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    const nx = (x + 0.5) / N * 2 - 1, ny = (y + 0.5) / N * 2 - 1;
    const d = Math.sqrt(nx * nx + ny * ny);
    const h = fbm(n1, x * 0.11, y * 0.11) + 0.4 - 0.72 * d * d;
    let t;
    if (h < 0.4) t = T.DEEP;
    else if (h < 0.5) t = T.SHALLOW;
    else {
      const lat = y / N + (fbm(n2, x * 0.13, y * 0.13) - 0.5) * 0.4;
      if (fbm(n3, x * 0.2, y * 0.2) > 0.66 && h > 0.6) t = T.MOUNTAIN;
      else if (lat < 0.33) t = T.TUNDRA;
      else if (lat > 0.6 && fbm(n2, x * 0.09 + 40, y * 0.09 + 40) > 0.42) t = T.DESERT;
      else t = T.GRASS;
    }
    terrain[i] = t;
    elev[i] = t === T.DEEP ? -0.85 : t === T.SHALLOW ? -0.3 : 0.12 + Math.round(Math.min(1, (h - 0.5) / 0.4) * 5) / 5 * 0.45;
  }
  const sea = i => terrain[i] <= 1;
  const land = i => terrain[i] >= 2 && terrain[i] !== T.MOUNTAIN;
  const nb4 = (x, y) => [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].filter(([a, b]) => a >= 0 && b >= 0 && a < N && b < N);

  // HQ: coastal non-tundra land tile closest to the map centre.
  let hq = null, best = 1e9;
  for (let y = 2; y < N - 2; y++) for (let x = 2; x < N - 2; x++) {
    const i = y * N + x;
    if (!land(i) || terrain[i] === T.TUNDRA) continue;
    if (!nb4(x, y).some(([a, b]) => sea(b * N + a))) continue;
    const dd = Math.abs(x - N / 2) + Math.abs(y - N * 0.55);
    if (dd < best) { best = dd; hq = { x, y }; }
  }
  if (!hq) hq = { x: N >> 1, y: N >> 1 };

  const resAt = [0, 1, 2].map(() => new Array(N * N).fill(-1));
  const reservoirs = [];
  const hqI = hq.y * N + hq.x;
  const blob = (start, size, tier) => {
    const set = [start];
    for (let tries = 0; set.length < size && tries < 300; tries++) {
      const b = pick(g, set), [nx, ny] = pick(g, [[1, 0], [-1, 0], [0, 1], [0, -1]]);
      const x = (b % N) + nx, y = Math.floor(b / N) + ny;
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      const i = y * N + x;
      if (!set.includes(i) && resAt[tier][i] < 0 && i !== hqI) set.push(i);
    }
    return set;
  };
  const add = (start, tier, type, q) => {
    const tiles = blob(start, [ri(g, 3, 6), ri(g, 5, 9), ri(g, 8, 14)][tier], tier);
    const id = reservoirs.length, v = rr(g, 0.8, 1.25);
    let oil, gas, rateOil, rateGas;
    if (type === 'oil') {
      oil = lerp([150e3, 600e3, 2e6][tier], [450e3, 1.6e6, 6e6][tier], q);
      const gor = rr(g, 0.5, 2);
      gas = oil * gor; rateOil = TIERS[tier].oilRate * v; rateGas = rateOil * gor;
    } else {
      gas = lerp([4e6, 14e6, 45e6][tier], [10e6, 34e6, 120e6][tier], q);
      oil = gas / 400; rateGas = TIERS[tier].gasRate * v; rateOil = rateGas / 400;
    }
    for (const i of tiles) resAt[tier][i] = id;
    reservoirs.push({ id, tier, type, tiles, oil, oil0: oil, gas, gas0: gas, rateOil, rateGas, rich: 0.55 + 0.45 * q, disc: false });
  };

  // Guaranteed starter field: shallow oil on land a short drive from HQ.
  const near = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.abs(x - hq.x) + Math.abs(y - hq.y);
    if (d >= 3 && d <= 5 && land(y * N + x)) near.push(y * N + x);
  }
  const starter = near.length ? pick(g, near) : hqI + 2;
  add(starter, 0, 'oil', 0.85);

  const want = [10, 9, 6];
  for (let tier = 0; tier < 3; tier++) {
    for (let k = 0; k < want[tier]; k++) {
      for (let tries = 0; tries < 80; tries++) {
        const i = ri(g, 0, N * N - 1);
        if (resAt[tier][i] >= 0 || i === hqI || terrain[i] === T.MOUNTAIN) continue;
        if (tier === 2 && !(sea(i) || terrain[i] === T.TUNDRA) && rnd(g) < 0.7) continue;
        if (tier === 0 && sea(i) && rnd(g) < 0.65) continue;
        add(i, tier, rnd(g) < 0.7 ? 'oil' : 'gas', rnd(g));
        break;
      }
    }
  }
  return { N, terrain, elev, resAt, reservoirs, hq, starter };
}
