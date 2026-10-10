// The table phone: owns the game state, runs the rules, shows the board, relays state
// to every player phone. The host can also take a seat; their hand then sits under the board.

import { newGame, reduce, player, current } from './rules.js';
import { TOKENS } from './board.js';
import { renderHand } from './hand.js';
import { esc, boardHtml, playersHtml, logHtml, spaceModal, toast, confirmTap } from './render.js';
import { load, save, remove } from './store.js';
import { sound } from './sound.js';

const KEY = 'am.table.state';
const EMPTY_TRADE = () => ({ open: false, to: null, give: { cash: 0, props: [] }, get: { cash: 0, props: [] } });

export function startTable(root, { code, link, fresh, onHome }) {
  let s = (!fresh && load(KEY, null)) || newGame();
  if (fresh) remove(KEY);
  let hostSeat = load('am.table.seat', null); // { name, token } when the host plays too
  let ui = { menu: false, space: null, rolling: false, trade: EMPTY_TRADE(), small: load('am.small', false) };
  const names = new Map(); // code -> name said in hello
  let rollTimer = null;
  const sendLocal = (action) => dispatch(action, code);

  link.disconnect(); // a table never dials out
  link.setHandlers({
    onMessage: (msg, from, who) => {
      if (from !== 'controller') return;
      if (msg?.t === 'hello') {
        names.set(who, msg.name);
        const seated = player(s, who);
        if (s.phase === 'lobby' && !seated) dispatch({ type: 'addPlayer', by: 'host', id: who, name: msg.name, token: msg.token }, who);
        else if (s.phase === 'lobby' && msg.name && seated.name !== msg.name) dispatch({ type: 'rename', by: 'host', id: who, name: msg.name }, who);
        else sendState(who);
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
      const prev = s;
      s = reduce(s, action);
      save(KEY, s);
      broadcast();
      sound.cue(prev, s, code);
      if (JSON.stringify(prev.dice) !== JSON.stringify(s.dice)) {
        ui.rolling = true;
        clearTimeout(rollTimer);
        rollTimer = setTimeout(() => { ui.rolling = false; render(); }, 700);
      }
      render();
    } catch (e) {
      if (who && who !== code) link.sendTo(who, { t: 'err', msg: e.message });
      else toast(e.message);
    }
  }

  function render() {
    const online = new Set(link.controllerCodes);
    if (s.phase === 'lobby') return renderLobby(online);
    const hostPlaying = !!player(s, code);
    const cur = current(s);
    root.innerHTML = `
      <div class="table screen">
        <header class="th">
          <button class="lnk" data-home>‹</button>
          <div class="codepill">Table <b>${code}</b> · ${online.size} phone${online.size === 1 ? '' : 's'}</div>
          <span><button class="lnk" data-small title="Board size">${ui.small ? '⤢' : '⤡'}</button><button class="lnk" data-mute>${sound.muted ? '🔇' : '🔊'}</button><button class="lnk" data-menu>⋯</button></span>
        </header>
        <div class="boardwrap">${boardHtml(s, { highlight: cur?.pos, rolling: ui.rolling, meId: hostPlaying ? code : null, small: ui.small })}</div>
        <div class="under">
          ${hostPlaying ? '<div class="handroot"></div>' : `${playersHtml(s)}<details class="logbox" open><summary>Log</summary>${logHtml(s, 30)}</details>`}
        </div>
      </div>
      ${ui.menu ? menuHtml(online) : ''}
      ${ui.space != null ? spaceModal(s, ui.space) : ''}`;
    if (hostPlaying) {
      renderHand(root.querySelector('.handroot'), s, code, sendLocal, {
        showSpace: (i) => { ui.space = i; render(); },
        trade: ui.trade,
        setTrade: (t) => { ui.trade = t; render(); },
        bid: ui.bid,
      });
    }
    wire();
  }

  function menuHtml(online) {
    const others = s.players.filter((p) => !p.bankrupt && p.id !== code);
    return `<div class="modal" data-close><div class="modalbox menu">
      <h3>Table ${code}</h3>
      ${others.map((p) => `<button data-forfeit="${p.id}">Remove ${esc(p.name)} (${online.has(p.id) ? 'online' : 'offline'})</button>`).join('')}
      <button class="danger" data-newgame>New game (same players)</button>
      <button data-close>Close</button>
    </div></div>`;
  }

  function renderLobby(online) {
    const hostIn = !!player(s, code);
    root.innerHTML = `
      <div class="table lobby screen">
        <header class="th"><button class="lnk" data-home>‹ Home</button><span></span><button class="lnk" data-mute>${sound.muted ? '🔇' : '🔊'}</button></header>
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
    wire();
  }

  function wire() {
    root.querySelector('[data-home]')?.addEventListener('click', () => onHome());
    root.querySelector('[data-start]')?.addEventListener('click', () => dispatch({ type: 'start', by: 'host' }));
    root.querySelector('[data-mute]')?.addEventListener('click', () => { sound.toggle(); render(); });
    root.querySelector('[data-small]')?.addEventListener('click', () => { ui.small = !ui.small; save('am.small', ui.small); render(); });
    root.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => dispatch({ type: 'removePlayer', by: 'host', id: b.dataset.remove })));
    root.querySelector('[data-hostseat]')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      hostSeat = { name: String(f.get('name') || 'Host').trim() || 'Host', token: f.get('token') };
      save('am.table.seat', hostSeat);
      dispatch({ type: 'addPlayer', by: 'host', id: code, name: hostSeat.name, token: hostSeat.token });
    });
    root.querySelector('[data-menu]')?.addEventListener('click', () => { ui.menu = true; render(); });
    root.querySelectorAll('[data-close]').forEach((b) =>
      b.addEventListener('click', (e) => { if (e.target === b) { ui.menu = false; ui.space = null; render(); } }),
    );
    root.querySelectorAll('[data-forfeit]').forEach((b) =>
      confirmTap(b, 'Tap again to remove them (deeds go to the bank)', () => {
        ui.menu = false;
        dispatch({ type: 'forfeit', by: 'host', id: b.dataset.forfeit });
      }),
    );
    const ng = root.querySelector('[data-newgame]');
    if (ng) confirmTap(ng, 'Tap again: the current game is lost', newGameSamePlayers);
    root.querySelectorAll('.table .cell[data-space]').forEach((el) => el.addEventListener('click', () => { ui.space = Number(el.dataset.space); render(); }));
  }

  // Back to the lobby with everyone who was seated (connected phones get a fresh hello anyway).
  function newGameSamePlayers() {
    const seated = s.players.map((p) => ({ id: p.id, name: p.name, token: p.token }));
    ui = { ...ui, menu: false, space: null, trade: EMPTY_TRADE() };
    s = newGame();
    remove(KEY);
    for (const p of seated) {
      try {
        s = reduce(s, { type: 'addPlayer', by: 'host', id: p.id, name: p.name, token: p.token });
      } catch {}
    }
    save(KEY, s);
    broadcast();
    render();
  }

  render();
  return {
    stop: () => {
      clearTimeout(rollTimer);
      link.setHandlers({});
    },
  };
}
