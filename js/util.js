// Seeded RNG + formatting helpers. RNG state lives on any object with an `rs` int field.
export function rnd(s) {
  s.rs = (s.rs + 0x6D2B79F5) | 0;
  let t = s.rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const gauss = s => {
  let u = 0; while (u === 0) u = rnd(s);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd(s));
};
export const ri = (s, a, b) => a + Math.floor(rnd(s) * (b - a + 1));
export const rr = (s, a, b) => a + rnd(s) * (b - a);
export const pick = (s, arr) => arr[Math.floor(rnd(s) * arr.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export function fmtNum(v) {
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M';
  if (a >= 1e4) return (v / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'k';
  return Math.round(v).toLocaleString('en-US');
}
export const fmtMoney = v => (v < 0 ? '-$' : '$') + fmtNum(Math.abs(v));
export const fmtPrice = v => '$' + (v < 20 ? v.toFixed(2) : v.toFixed(1));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dateStr = day => `${MONTHS[Math.floor((day % 360) / 30)]} ${(day % 30) + 1}, Year ${Math.floor(day / 360) + 1}`;
export const monthName = day => MONTHS[Math.floor((day % 360) / 30)];
