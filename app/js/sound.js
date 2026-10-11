// Tiny synth sounds, no audio files. iOS only plays after a user gesture, so main.js
// calls unlock() on the first tap. Mute is remembered per phone.

import { load, save } from './store.js';

let ctx = null;
let muted = load('am.mute', false);

export const sound = {
  get muted() {
    return muted;
  },
  toggle() {
    muted = !muted;
    save('am.mute', muted);
    if (!muted) play('turn');
    return muted;
  },
  unlock() {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
    } catch {}
  },
  play,
  // Compare two states and play what changed, from `meId`'s point of view.
  cue(prev, next, meId) {
    if (!prev || !next || prev.seq === next.seq) return;
    const me = (s) => s.players.find((p) => p.id === meId);
    const dice = JSON.stringify(prev.dice) !== JSON.stringify(next.dice);
    if (dice) play('dice');
    else if (next.card && next.card !== prev.card && (!prev.card || prev.card.text !== next.card.text)) play('card');
    const a = me(prev), b = me(next);
    if (a && b && b.cash > a.cash && !dice) play('cash');
    if (a && b && b.cash < a.cash && !dice) play('pay');
    if (next.phase === 'play' && next.players[next.turn]?.id === meId && prev.players[prev.turn]?.id !== meId) play('turn');
    if ((next.auction && !prev.auction) || (next.trade && !prev.trade && next.trade.to === meId)) play('ping');
    if (next.phase === 'over' && prev.phase !== 'over') play(next.winner === meId ? 'win' : 'lose');
  },
};

function tone(freq, t0, dur, type = 'sine', gain = 0.15) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noise(t0, dur, gain = 0.2) {
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = gain;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 1800;
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t0);
}

function play(name) {
  if (muted) return;
  try {
    sound.unlock();
    if (!ctx) return;
    const t = ctx.currentTime;
    switch (name) {
      case 'dice':
        for (let i = 0; i < 6; i++) noise(t + i * 0.07 + Math.random() * 0.02, 0.05, 0.25 - i * 0.03);
        tone(220, t + 0.45, 0.08, 'triangle', 0.08);
        break;
      case 'cash':
        tone(880, t, 0.08, 'square', 0.06);
        tone(1320, t + 0.09, 0.14, 'square', 0.06);
        break;
      case 'pay':
        tone(330, t, 0.12, 'sawtooth', 0.05);
        tone(262, t + 0.12, 0.18, 'sawtooth', 0.05);
        break;
      case 'card':
        noise(t, 0.04, 0.15);
        tone(1500, t + 0.03, 0.05, 'sine', 0.05);
        break;
      case 'turn':
        tone(660, t, 0.1, 'sine', 0.12);
        tone(880, t + 0.11, 0.1, 'sine', 0.12);
        tone(1320, t + 0.22, 0.25, 'sine', 0.12);
        break;
      case 'ping':
        tone(988, t, 0.12, 'sine', 0.1);
        tone(988, t + 0.18, 0.12, 'sine', 0.1);
        break;
      case 'siren': {
        for (let i = 0; i < 4; i++) {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'square';
          o.frequency.setValueAtTime(620, t + i * 0.45);
          o.frequency.linearRampToValueAtTime(930, t + i * 0.45 + 0.22);
          o.frequency.linearRampToValueAtTime(620, t + i * 0.45 + 0.45);
          g.gain.setValueAtTime(0.05, t + i * 0.45);
          g.gain.setValueAtTime(0.05, t + i * 0.45 + 0.44);
          g.gain.linearRampToValueAtTime(0.0001, t + i * 0.45 + 0.45);
          o.connect(g).connect(ctx.destination);
          o.start(t + i * 0.45);
          o.stop(t + i * 0.45 + 0.46);
        }
        break;
      }
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.13, 0.3, 'triangle', 0.12));
        break;
      case 'lose':
        [392, 349, 311, 262].forEach((f, i) => tone(f, t + i * 0.2, 0.35, 'sawtooth', 0.05));
        break;
    }
  } catch {}
}
