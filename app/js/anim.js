// Shows states one at a time with animation in between: the dice tumble first, then
// every token that moved hops square by square. Screens feed states in with push();
// `render(state, opts)` is called for each frame with:
//   opts.dice      the dice to draw (the new throw, while the old positions still show)
//   opts.rolling   true while the dice tumble
//   opts.override  { playerId: pos } positions to draw instead of the state's own
//   opts.hop       playerId of the token mid-hop
//   opts.animating true for every frame before the final one (hide prompts)
//   opts.deltas    [{ id, delta }] cash changes to float up on the final frame

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export const DICE_MS = 1100;
export const FOLLOW_ZOOM = 1.6; // camera on the moving token
export const ZOOM_IN_MS = 500; // time for the camera to reach the token before it moves
export const HOP_MS = 150;

export function createPresenter({ render, onStep }) {
  let view = null;
  let queue = [];
  let busy = false;

  async function drain() {
    busy = true;
    while (queue.length) {
      const next = queue.shift();
      try {
        await present(view, next);
      } catch {}
      view = next;
    }
    busy = false;
  }

  function cashDeltas(prev, next) {
    if (!prev) return [];
    return next.players
      .map((p) => {
        const q = prev.players.find((x) => x.id === p.id);
        return q && q.cash !== p.cash ? { id: p.id, delta: p.cash - q.cash } : null;
      })
      .filter(Boolean);
  }

  async function present(prev, next) {
    const deltas = cashDeltas(prev, next);
    if (!prev || prev.id !== next.id || prev.phase !== 'play' || next.phase === 'lobby') {
      render(next, { deltas, settle: true });
      return;
    }
    const diceChanged = JSON.stringify(prev.dice) !== JSON.stringify(next.dice);
    const moves = next.players
      .map((p) => {
        const q = prev.players.find((x) => x.id === p.id);
        if (!q || q.pos === p.pos || p.bankrupt) return null;
        return { id: p.id, from: q.pos, to: p.pos, jump: p.inJail && !q.inJail };
      })
      .filter(Boolean);

    const override = {};
    if (diceChanged) {
      // 1. dice tumble in the centre with the whole board in view
      render(prev, { dice: next.dice, rolling: true, override, animating: true, settle: true });
      onStep?.('dice');
      await wait(DICE_MS);
    }
    for (const m of moves) {
      // 2. camera zooms onto the piece about to move (dice hidden while zoomed)
      render(prev, { dice: next.dice, override, animating: true, hideDice: true, focus: m.from, zoom: FOLLOW_ZOOM, settle: true });
      await wait(ZOOM_IN_MS);
      if (m.jump) {
        onStep?.('jail');
        render(prev, { dice: next.dice, override, siren: m.id, animating: true, hideDice: true, focus: m.from, zoom: FOLLOW_ZOOM });
        await wait(900);
        override[m.id] = m.to;
        render(prev, { dice: next.dice, override, hop: m.id, siren: m.id, animating: true, hideDice: true, focus: m.to, zoom: FOLLOW_ZOOM });
        await wait(900);
        continue;
      }
      const back = (m.from - m.to + 40) % 40;
      const fwd = (m.to - m.from + 40) % 40;
      const dir = back > 0 && back <= 3 ? -1 : 1;
      const steps = dir === 1 ? fwd : back;
      for (let k = 1; k <= steps; k++) {
        override[m.id] = (m.from + dir * k + 40) % 40;
        // 3. glide with each hop
        render(prev, { dice: next.dice, override, hop: m.id, animating: true, hideDice: true, focus: override[m.id], zoom: FOLLOW_ZOOM });
        onStep?.('hop');
        await wait(k === steps ? HOP_MS * 2 : HOP_MS);
      }
    }
    // 4. zoom out to the whole board; 5. the dice fade back in at the centre
    render(next, { deltas, settle: true });
  }

  return {
    push(next) {
      queue.push(next);
      if (!busy) drain();
    },
    // Re-draw the current view (after a UI-only change) without re-animating.
    redraw() {
      if (view && !busy) render(view, {});
    },
    get view() {
      return view;
    },
    get busy() {
      return busy;
    },
  };
}
