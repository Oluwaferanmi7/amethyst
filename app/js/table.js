// The table phone: owns the game state, runs the rules, shows the board, relays state
// to every player phone. Optionally also seats the host as a player ("I'm playing too").

import { Link } from './link.js';
import { newGame, reduce, player, current } from './rules.js';
import { TOKENS } from './board.js';
import { renderHand } from './hand.js';
import { esc, money, boardHtml, playersHtml, logHtml, spaceHtml, toast } from './render.js';
import { load, save, remove } from './store.js';

const KEY = 'am.table.state';

export function startTable(root, { code, onHome }) {
  let s = load(KEY, null) || newGame();
  let hostSeat = load('am.table.seat', null); // { name, token } when the host plays too
  let ui = { tab: 'board', sheet: false };
  const names = new Map(); // code -> name said in hello, for the lobby

  let link = null; // assigned below; the Link constructor already calls onStatus
  link = new Link({
    code,
    onMessage: (msg, from, who) => {
      if (from !== 'controller') return;
      if (msg?.t === 'hello') {
        names.set(who, msg.name);
        if (s.phase === 'lobby' && !player(s, who)) {
          dispatch({ type: 'addPlayer', by: 'host', id: who, name: msg.name, token: msg.token }, who);
        } else if (s.phase === 'lobby' && msg.name && player(s, who).name !== msg.name) {
          dispatch({ type: 'rename', by: 'host', id: who, name: msg.name }, who);
        } else {
          sendState(who);
        }
      } else if (msg?.t === 'act' && msg.action) {
        dispatch({ ...msg.action, by: who }, who);
      }
    },
    onStatus: () => render(),
    onControllerChange: () => render(),
  });

  function sendState(who) {
    link.sendTo(who, { t: 'state', state: s, you: who });
  }
  function broadcast() {
    for (const who of link.controllerCodes) sendState(who);
  }
  function dispatch(action, who) {
    try {
      s = reduce(s, action);
      save(KEY, s);
      broadcast();
      render();
    } catch (e) {
      if (who && who !== code) link.sendTo(who, { t: 'err', msg: e.message });
      else toast(e.message);
    }
  }
  const sendLocal = (action) => dispatch(action, code);

  function render() {
    if (!link) return;
    const online = new Set(link.controllerCodes);
    if (s.phase === 'lobby') return renderLobby(online);
    const hostPlaying = !!player(s, code);
    const cur = current(s);
    root.innerHTML = `
      <div class="table">
        <header class="th">
          <button class="lnk" data-home>‹</button>
          <div class="codepill">Table <b>${code}</b> · ${online.size} phone${online.size === 1 ? '' : 's'}</div>
          <button class="lnk" data-menu>⋯</button>
        </header>
        ${s.phase === 'over' ? `<div class="winner">🏆 ${esc(player(s, s.winner).name)} wins!</div>` : ''}
        ${boardHtml(s, { highlight: cur?.pos })}
        ${playersHtml(s, hostPlaying ? code : null)}
        ${logHtml(s, 8)}
        ${hostPlaying ? `<button class="pri sheetbtn" data-sheet>${cur?.id === code && s.phase === 'play' ? '🎲 Your turn — open your hand' : 'My hand'} · ${money(player(s, code).cash)}</button>` : ''}
      </div>
      ${hostPlaying && ui.sheet ? `<div class="sheet"><div class="sheetbar"><button class="lnk" data-sheet>▾ Back to the board</button></div><div class="sheetbody"></div></div>` : ''}
      ${ui.menu ? menuHtml(online) : ''}
      ${ui.space != null ? `<div class="modal" data-close><div class="modalbox">${spaceHtml(s, ui.space)}<button data-close>Close</button></div></div>` : ''}`;
    if (hostPlaying && ui.sheet) {
      renderHand(root.querySelector('.sheetbody'), s, code, sendLocal, {
        tab: ui.tab === 'board' ? 'hand' : ui.tab,
        setTab: (t) => { ui.tab = t; render(); },
        showSpace: (i) => { ui.space = i; render(); },
      });
    }
    wire(online);
  }

  function menuHtml(online) {
    const others = s.players.filter((p) => !p.bankrupt && p.id !== code);
    return `<div class="modal" data-close><div class="modalbox menu">
      <h3>Table</h3>
      ${others.map((p) => `<button data-forfeit="${p.id}">Remove ${esc(p.name)} (${online.has(p.id) ? 'online' : 'offline'})</button>`).join('')}
      <button class="danger" data-newgame>New game</button>
      <button data-close>Close</button>
    </div></div>`;
  }

  function renderLobby(online) {
    const hostIn = !!player(s, code);
    root.innerHTML = `
      <div class="table lobby">
        <header class="th"><button class="lnk" data-home>‹ Home</button><span></span><span></span></header>
        <div class="joincode"><small>Friends join with the code</small><b>${code}</b><small>${link.host === 'ready' ? 'Ready for players' : esc(link.hostDetail || 'Connecting…')}</small></div>
        <div class="seats">
          ${s.players.map((p) => `<div class="seat" style="--c:${p.color}"><span class="tok">${p.token}</span><span class="nm">${esc(p.name)}</span><span class="st">${p.id === code ? 'this phone' : online.has(p.id) ? 'online' : 'offline'}</span><button class="lnk" data-remove="${p.id}">✕</button></div>`).join('')}
          ${s.players.length === 0 ? '<p class="muted">Nobody yet. Open Amethyst on another phone and tap Join.</p>' : ''}
        </div>
        ${hostIn ? '' : `<form class="hostseat" data-hostseat>
          <input name="name" placeholder="Your name" maxlength="16" value="${esc(hostSeat?.name || '')}" />
          <select name="token">${TOKENS.map((t) => `<option ${hostSeat?.token === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <button class="sm">I'm playing too</button>
        </form>`}
        <button class="pri xl" data-start ${s.players.length >= 2 ? '' : 'disabled'}>Start game${s.players.length < 2 ? ' (need 2+)' : ''}</button>
      </div>`;
    wire(online);
  }

  function wire() {
    root.querySelector('[data-home]')?.addEventListener('click', () => { link.disconnect(); onHome(); });
    root.querySelector('[data-start]')?.addEventListener('click', () => dispatch({ type: 'start', by: 'host' }));
    root.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => dispatch({ type: 'removePlayer', by: 'host', id: b.dataset.remove })));
    root.querySelector('[data-hostseat]')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      hostSeat = { name: String(f.get('name') || 'Host').trim() || 'Host', token: f.get('token') };
      save('am.table.seat', hostSeat);
      dispatch({ type: 'addPlayer', by: 'host', id: code, name: hostSeat.name, token: hostSeat.token });
    });
    root.querySelectorAll('[data-sheet]').forEach((b) => b.addEventListener('click', () => { ui.sheet = !ui.sheet; render(); }));
    root.querySelector('[data-menu]')?.addEventListener('click', () => { ui.menu = true; render(); });
    root.querySelectorAll('[data-close]').forEach((b) =>
      b.addEventListener('click', (e) => { if (e.target === b) { ui.menu = false; ui.space = null; render(); } }),
    );
    root.querySelectorAll('[data-forfeit]').forEach((b) =>
      b.addEventListener('click', () => { if (confirm(`Remove ${player(s, b.dataset.forfeit).name} from the game? Their deeds go back to the bank.`)) { ui.menu = false; dispatch({ type: 'forfeit', by: 'host', id: b.dataset.forfeit }); } }),
    );
    root.querySelector('[data-newgame]')?.addEventListener('click', () => {
      if (!confirm('Start a new game? The current one is lost.')) return;
      ui = { tab: 'board', sheet: false };
      s = newGame();
      remove(KEY);
      // Re-seat everyone who is still connected.
      if (hostSeat) dispatch({ type: 'addPlayer', by: 'host', id: code, name: hostSeat.name, token: hostSeat.token });
      for (const who of link.controllerCodes) dispatch({ type: 'addPlayer', by: 'host', id: who, name: names.get(who) || 'Player' }, who);
      broadcast();
      render();
    });
    root.querySelectorAll('.table .cell[data-space]').forEach((el) => el.addEventListener('click', () => { ui.space = Number(el.dataset.space); render(); }));
  }

  render();
  return { stop: () => link.disconnect() };
}
