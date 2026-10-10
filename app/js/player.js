// A player phone: dials the table, says hello, renders the state that comes back
// (board on top, hand underneath) and sends taps as actions.

import { renderHand } from './hand.js';
import { current } from './rules.js';
import { esc, boardHtml, spaceModal, toast } from './render.js';
import { load, save } from './store.js';
import { sound } from './sound.js';

const EMPTY_TRADE = () => ({ open: false, to: null, give: { cash: 0, props: [] }, get: { cash: 0, props: [] } });

export function startPlayer(root, { code, link, tableCode, name, token, onHome }) {
  let s = null;
  let ui = { space: null, rolling: false, trade: EMPTY_TRADE(), small: load('am.small', false) };
  let status = 'connecting';
  let rollTimer = null;

  link.setHandlers({
    onOpen: () => link.send({ t: 'hello', name, token }),
    onMessage: (msg, from) => {
      if (from !== 'target') return;
      if (msg?.t === 'state') {
        if (s && msg.state.id === s.id && msg.state.seq < s.seq) return; // stale (same game, older)
        const prev = s;
        s = msg.state;
        sound.cue(prev, s, code);
        if (prev && JSON.stringify(prev.dice) !== JSON.stringify(s.dice)) {
          ui.rolling = true;
          clearTimeout(rollTimer);
          rollTimer = setTimeout(() => { ui.rolling = false; render(); }, 700);
        }
        render();
      } else if (msg?.t === 'err') {
        toast(msg.msg);
      }
    },
    onStatus: ({ target }) => {
      status = target;
      render();
    },
  });
  link.connect(tableCode);

  const send = (action) => {
    if (!link.connected) return toast('Not connected to the table');
    link.send({ t: 'act', action });
  };

  function render() {
    const conn = status === 'connected' ? '' : `<div class="connbar">${status === 'notfound' ? `No table with code ${tableCode} yet…` : 'Connecting to the table…'}</div>`;
    const cur = s && s.phase === 'play' ? current(s) : null;
    root.innerHTML = `
      <div class="player screen">
        <header class="th">
          <button class="lnk" data-home>‹ Leave</button>
          <div class="codepill">Table <b>${tableCode}</b></div>
          <span><button class="lnk" data-small title="Board size">${ui.small ? '⤢' : '⤡'}</button><button class="lnk" data-mute>${sound.muted ? '🔇' : '🔊'}</button></span>
        </header>
        ${conn}
        ${s ? `<div class="boardwrap">${boardHtml(s, { highlight: cur?.pos, rolling: ui.rolling, meId: code, small: ui.small })}</div>` : ''}
        <div class="under"><div class="handroot">${s ? '' : '<p class="muted center">Waiting for the table…</p>'}</div></div>
        ${ui.space != null && s ? spaceModal(s, ui.space) : ''}
      </div>`;
    if (s) {
      renderHand(root.querySelector('.handroot'), s, code, send, {
        showSpace: (i) => { ui.space = i; render(); },
        trade: ui.trade,
        setTrade: (t) => { ui.trade = t; render(); },
        bid: ui.bid,
      });
    }
    root.querySelector('[data-home]').addEventListener('click', () => onHome());
    root.querySelector('[data-mute]')?.addEventListener('click', () => { sound.toggle(); render(); });
    root.querySelector('[data-small]')?.addEventListener('click', () => { ui.small = !ui.small; save('am.small', ui.small); render(); });
    root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', (e) => { if (e.target === b) { ui.space = null; render(); } }));
    root.querySelectorAll('.player .cell[data-space]').forEach((el) => el.addEventListener('click', () => { ui.space = Number(el.dataset.space); render(); }));
  }

  render();
  return {
    stop: () => {
      clearTimeout(rollTimer);
      link.disconnect();
      link.setHandlers({});
    },
  };
}
