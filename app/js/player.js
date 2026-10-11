// A player phone: dials the table, says hello, renders the state that comes back
// (board on top, hand underneath) and sends taps as actions. States go through the
// presenter so dice tumble and tokens hop before prompts appear.

import { renderHand } from './hand.js';
import { current, legal } from './rules.js';
import { boardHtml, spaceModal, eventHtml, toast } from './render.js';
import { load, save } from './store.js';
import { sound } from './sound.js';
import { createPresenter } from './anim.js';

const EMPTY_TRADE = () => ({ open: false, to: null, give: { cash: 0, props: [] }, get: { cash: 0, props: [] } });

export function startPlayer(root, { code, link, tableCode, name, token, onHome }) {
  let s = null;
  let ui = { space: null, trade: EMPTY_TRADE(), small: load('am.small', false) };
  let status = 'connecting';

  const presenter = createPresenter({ render: draw, onStep: (k) => sound.play(k === 'dice' ? 'dice' : k === 'jail' ? 'siren' : 'hop') });

  link.setHandlers({
    onOpen: () => link.send({ t: 'hello', name, token }),
    onMessage: (msg, from) => {
      if (from !== 'target') return;
      if (msg?.t === 'state') {
        if (s && msg.state.id === s.id && msg.state.seq < s.seq) return; // stale (same game, older)
        const prev = s;
        s = msg.state;
        sound.cue(prev, s, code);
        presenter.push(s);
      } else if (msg?.t === 'err') {
        toast(msg.msg);
      }
    },
    onStatus: ({ target }) => {
      status = target;
      redraw();
    },
  });
  link.connect(tableCode);

  const send = (action) => {
    if (!link.connected) return toast('Not connected to the table');
    link.send({ t: 'act', action });
  };
  function redraw() {
    if (presenter.view) presenter.redraw();
    else draw(null, {});
  }

  function draw(v, opts) {
    const conn = status === 'connected' ? '' : `<div class="connbar">${status === 'notfound' ? `No table with code ${tableCode} yet…` : 'Connecting to the table…'}</div>`;
    const cur = v && v.phase === 'play' ? current(v) : null;
    const mine = !!v && !opts.animating && legal(v, code).has('roll') && !v.auction;
    root.innerHTML = `
      <div class="player screen">
        ${v ? `<div class="boardwrap">${boardHtml(v, { highlight: cur?.pos, meId: code, small: ui.small, mine, ...opts })}</div>` : ''}
        <div class="side">
          <header class="th">
            <button class="lnk" data-home>‹ Leave</button>
            <div class="codepill">Table <b>${tableCode}</b></div>
            <span><button class="lnk" data-small title="Board size">${ui.small ? '⤢' : '⤡'}</button><button class="lnk" data-mute>${sound.muted ? '🔇' : '🔊'}</button></span>
          </header>
          ${conn}
          <div class="rotate-hint">Turn your phone sideways for the full table</div>
          <div class="under">${v && !opts.animating ? eventHtml(v, code) : ''}<div class="handroot">${v ? '' : '<p class="muted center">Waiting for the table…</p>'}</div></div>
        </div>
      </div>`;
    if (v) {
      renderHand(root.querySelector('.handroot'), v, code, send, {
        space: ui.space,
        closeSpace: () => { ui.space = null; redraw(); },
        showSpace: (i) => { ui.space = i; redraw(); },
        trade: ui.trade,
        setTrade: (t) => { ui.trade = t; redraw(); },
        bid: ui.bid,
        deedsOpen: ui.deedsOpen,
        animating: opts.animating,
        deltas: opts.deltas,
      });
      root.querySelector('.handroot').addEventListener('toggle', (e) => { if (e.target.hasAttribute('data-deeds')) ui.deedsOpen = e.target.open; }, true);
    }
    root.querySelector('[data-home]').addEventListener('click', () => onHome());
    root.querySelector('[data-mute]')?.addEventListener('click', () => { sound.toggle(); redraw(); });
    root.querySelector('[data-small]')?.addEventListener('click', () => { ui.small = !ui.small; save('am.small', ui.small); redraw(); });
    root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', (e) => { if (e.target === b) { ui.space = null; redraw(); } }));
    root.querySelectorAll('.player .cell[data-space]').forEach((el) =>
      el.addEventListener('click', () => {
        if (mine && el.classList.contains('tapme')) return send({ type: 'roll', by: code });
        ui.space = Number(el.dataset.space);
        redraw();
      }),
    );
  }

  draw(null, {});
  return {
    stop: () => {
      link.disconnect();
      link.setHandlers({});
    },
  };
}
