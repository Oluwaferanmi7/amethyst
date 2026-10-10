// Home screen and routing. A phone is either the table (hosts the game) or a player
// (joins a table by its code). The last choice is remembered so the app reopens there.

import { startTable } from './table.js';
import { startPlayer } from './player.js';
import { TOKENS } from './board.js';
import { esc } from './render.js';
import { load, save, remove, deviceCode, cleanCode } from './store.js';

const root = document.getElementById('app');
const code = deviceCode();
let screen = null;

function go(mode) {
  screen?.stop?.();
  screen = null;
  if (mode?.mode === 'table') {
    save('am.mode', mode);
    screen = startTable(root, { code, onHome: () => go(null) });
  } else if (mode?.mode === 'player') {
    save('am.mode', mode);
    screen = startPlayer(root, { code, tableCode: mode.tableCode, name: mode.name, token: mode.token, onHome: () => go(null) });
  } else {
    remove('am.mode');
    home();
  }
}

function home() {
  const last = load('am.join', { name: '', token: TOKENS[0], tableCode: '' });
  const hasGame = !!load('am.table.state', null);
  root.innerHTML = `
    <div class="home">
      <div class="logo"><span>◆</span><h1>Amethyst</h1><p>Buy the block. Bankrupt your friends.</p></div>
      <section class="homecard">
        <h2>Host a table</h2>
        <p class="muted">This phone shows the board and runs the game. Friends join with its code <b>${code}</b>.</p>
        <button class="pri" data-table>${hasGame ? 'Open the table (game in progress)' : 'Host a table'}</button>
      </section>
      <section class="homecard">
        <h2>Join a table</h2>
        <form data-join>
          <input name="tableCode" placeholder="Table code" maxlength="4" autocapitalize="characters" autocomplete="off" value="${esc(last.tableCode)}" required />
          <input name="name" placeholder="Your name" maxlength="16" value="${esc(last.name)}" required />
          <div class="tokens">${TOKENS.map((t) => `<label><input type="radio" name="token" value="${t}" ${t === last.token ? 'checked' : ''}/><span>${t}</span></label>`).join('')}</div>
          <button class="pri">Join</button>
        </form>
      </section>
      <p class="muted center small">This phone's code: ${code}. Everyone needs internet; phones talk to each other directly.</p>
    </div>`;
  root.querySelector('[data-table]').addEventListener('click', () => go({ mode: 'table' }));
  root.querySelector('[data-join]').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const tableCode = cleanCode(f.get('tableCode'));
    const name = String(f.get('name') || '').trim().slice(0, 16);
    const token = f.get('token') || TOKENS[0];
    if (tableCode.length !== 4) return;
    if (tableCode === code) return alert("That's this phone's own code. Enter the table phone's code.");
    save('am.join', { tableCode, name, token });
    go({ mode: 'player', tableCode, name, token });
  });
}

go(load('am.mode', null));

// Offline shell cache, only on the real site (on localhost it would hide fresh edits).
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
