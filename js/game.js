// Shared UI/session state.
export const G = { s: null, mode: 'select', sel: null, tab: 'market', chart: 'crude', xray: false, overlay: false, speed: 1, hold: false, sound: true, side: true };
export const SAVE_KEY = 'crude-empire-save-v1';

let actx = null;
const TONES = { click: [520, 0.05, 'triangle'], good: [660, 0.14, 'sine', 880], bad: [200, 0.25, 'sawtooth', 120], cash: [880, 0.08, 'sine', 1320], strike: [330, 0.5, 'square', 990], build: [300, 0.1, 'triangle', 420] };
export function sfx(name) {
  if (!G.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const [f, d, type, f2] = TONES[name] || TONES.click;
    const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + d);
  } catch (e) { /* audio unavailable */ }
}
