// A player phone: dials the table, says hello, renders whatever state comes back and
// sends taps as actions. Reconnects by itself (the link module handles the plumbing).

import { Link } from './link.js';
import { renderHand } from './hand.js';
import { esc, spaceHtml, toast } from './render.js';

export function startPlayer(root, { code, tableCode, name, token, onHome }) {
  let s = null;
  let ui = { tab: 'hand', space: null };
  let status = 'connecting';

  const link = new Link({
    code,
    onOpen: () => link.send({ t: 'hello', name, token }),
    onMessage: (msg, from) => {
      if (from !== 'target') return;
      if (msg?.t === 'state') {
        if (s && msg.state.seq < s.seq) return; // stale
        s = msg.state;
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
    root.innerHTML = `
      <div class="player">
        <header class="th"><button class="lnk" data-home>‹ Leave</button><div class="codepill">Table <b>${tableCode}</b></div><span></span></header>
        ${conn}
        <div class="handroot">${s ? '' : '<p class="muted center">Waiting for the table…</p>'}</div>
        ${ui.space != null && s ? `<div class="modal" data-close><div class="modalbox">${spaceHtml(s, ui.space)}<button data-close>Close</button></div></div>` : ''}
      </div>`;
    if (s) {
      renderHand(root.querySelector('.handroot'), s, code, send, {
        tab: ui.tab,
        setTab: (t) => { ui.tab = t; render(); },
        showSpace: (i) => { ui.space = i; render(); },
      });
    }
    root.querySelector('[data-home]').addEventListener('click', () => { link.disconnect(); onHome(); });
    root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', (e) => { if (e.target === b) { ui.space = null; render(); } }));
  }

  render();
  return { stop: () => link.disconnect() };
}
