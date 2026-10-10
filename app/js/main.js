// Home screen and routing. The app keeps ONE phone-to-phone link for its whole life;
// screens (table / player) borrow it. A phone is either the table or a player, and the
// last choice is remembered so the app reopens there.

import { Link } from './link.js';
import { startTable } from './table.js';
import { startPlayer } from './player.js';
import { TOKENS } from './board.js';
import { esc, confirmTap } from './render.js';
import { load, save, remove, deviceCode, cleanCode } from './store.js';
import { sound } from './sound.js';

const root = document.getElementById('app');
const code = deviceCode();
const link = new Link({ code });
let screen = null;

document.addEventListener('pointerdown', () => sound.unlock(), { once: true, capture: true });

function go(mode) {
  screen?.stop?.();
  screen = null;
  if (mode?.mode === 'table') {
    save('am.mode', { mode: 'table' });
    screen = startTable(root, { code, link, fresh: !!mode.fresh, onHome: () => go(null) });
  } else if (mode?.mode === 'player') {
    save('am.mode', mode);
    screen = startPlayer(root, { code, link, tableCode: mode.tableCode, name: mode.name, token: mode.token, onHome: () => go(null) });
  } else {
    remove('am.mode');
    home();
  }
}

function home() {
  const last = load('am.join', { name: '', token: TOKENS[0], tableCode: '' });
  const saved = load('am.table.state', null);
  const inProgress = saved && saved.phase === 'play';
  root.innerHTML = `
    <div class="home">
      <div class="logo"><span>◆</span><h1>Amethyst</h1><p>Buy the block. Bankrupt your friends.</p></div>
      <section class="homecard">
        <h2>Host a table</h2>
        <p class="muted">This phone shows the board and runs the game. Friends join with its code <b>${code}</b>.</p>
        ${inProgress ? `<button class="pri" data-table>Continue the game in progress</button><button data-table-fresh>Start a fresh table</button>` : `<button class="pri" data-table-fresh>Host a table</button>`}
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
  root.querySelector('[data-table]')?.addEventListener('click', () => go({ mode: 'table' }));
  const fresh = root.querySelector('[data-table-fresh]');
  if (fresh && inProgress) confirmTap(fresh, 'Tap again to throw the old game away', () => go({ mode: 'table', fresh: true }));
  else fresh?.addEventListener('click', () => go({ mode: 'table', fresh: true }));
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
