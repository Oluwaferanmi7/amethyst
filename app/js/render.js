// Shared views: the board (with 3D dice and animated tokens), a space's details, the
// players strip, the log, the event banner (card / rent / tax everyone sees).

import { SPACES, GROUPS, RAIL_RENT, CHANCE, CHEST } from './board.js';
import { rentAt, player, unmortgageCost, pendingCard } from './rules.js';

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const money = (n) => `$${Number(n).toLocaleString()}`;

// Grid cell (1-based col/row) for each board index. GO sits bottom-right; play runs
// anticlockwise: bottom row right→left, up the left side, across the top, down the right.
export function cellOf(i) {
  if (i <= 10) return { col: 11 - i, row: 11 };
  if (i <= 20) return { col: 1, row: 11 - (i - 10) };
  if (i <= 30) return { col: 1 + (i - 20), row: 1 };
  return { col: 11, row: 1 + (i - 30) };
}

const ICON = { go: 'GO', chest: '▣', chance: '?', tax: '$', rail: '🚂', utility: '⚡', jail: '▦', parking: 'P', gotojail: '👮' };

// ---- 3D dice: two cubes; `rolling` tumbles them across the centre, then they settle on the throw.
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const face = (n, cls) => `<div class="f ${cls}">${Array.from({ length: 9 }, (_, i) => `<i class="${PIPS[n].includes(i) ? 'on' : ''}"></i>`).join('')}</div>`;
const cube = (n, k, rolling) =>
  `<div class="dwrap ${rolling ? 'rolling' : ''} d${k}"><div class="cube" data-face="${n}">${face(1, 'front')}${face(6, 'back')}${face(2, 'top')}${face(5, 'bottom')}${face(3, 'right')}${face(4, 'left')}</div></div>`;
export const diceHtml = (dice, rolling) => (dice ? `<span class="dice3d">${cube(dice[0], 1, rolling)}${cube(dice[1], 2, rolling)}</span>` : '');
// Small flat version for text lines.
const FLAT = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
export const diceText = (dice) => (dice ? `<span class="dice">${FLAT[dice[0]]}${FLAT[dice[1]]}</span>` : '');

// opts: highlight, rolling, dice, override {id: pos}, hop (id), meId, small, mine (true when
// tapping your own token should roll)
export function boardHtml(s, opts = {}) {
  const override = opts.override || {};
  const posOf = (p) => (override[p.id] !== undefined ? override[p.id] : p.pos);
  const cells = SPACES.map((sp, i) => {
    const { col, row } = cellOf(i);
    const pr = s.props[i];
    const cls = ['cell', sp.type, pr?.mortgaged ? 'mortgaged' : ''];
    if (opts.highlight === i) cls.push('hl');
    if (s.auction?.space === i) cls.push('auction');
    const owner = pr ? player(s, pr.owner) : null;
    const style = `grid-column:${col};grid-row:${row};${owner ? `--owner:${owner.color}` : ''}`;
    let top = '';
    if (sp.type === 'street') top = `<i class="bar" style="background:${GROUPS[sp.group].color}"></i>`;
    else if (sp.type === 'utility') top = `<i class="ic">${sp.name.startsWith('Jacob') ? '🚰' : '🕯️'}</i>`;
    else top = `<i class="ic">${ICON[sp.type]}</i>`;
    const named = sp.type === 'street' || sp.type === 'rail' || sp.type === 'utility' || sp.type === 'tax';
    let mid = named ? `<span class="nm">${esc(sp.name)}</span>` : '';
    if (pr?.houses === 5) mid += '<b class="hotel"></b>';
    else if (pr?.houses) mid += `<span class="houses">${'<b></b>'.repeat(pr.houses)}</span>`;
    else if (sp.price && !pr) mid += `<small>${sp.price}</small>`;
    const here = s.players.filter((p) => !p.bankrupt && posOf(p) === i);
    const tok = (p) => `<em style="--c:${p.color}" title="${esc(p.name)}" class="${opts.hop === p.id ? 'hop' : ''} ${p.id === opts.meId ? 'me' : ''}" data-token="${p.id}">${p.token}</em>`;
    let toks = '';
    if (sp.type === 'jail') {
      const jailed = here.filter((p) => p.inJail && override[p.id] === undefined);
      const visiting = here.filter((p) => !jailed.includes(p));
      toks = `${jailed.length ? `<span class="toks jailed">${jailed.map(tok).join('')}</span>` : ''}${visiting.length ? `<span class="toks">${visiting.map(tok).join('')}</span>` : ''}`;
    } else if (here.length) toks = `<span class="toks">${here.map(tok).join('')}</span>`;
    const mine = opts.mine && here.some((p) => p.id === opts.meId);
    return `<div class="${cls.join(' ')} ${mine ? 'tapme' : ''}" style="${style}" data-space="${i}" ${owner ? 'data-owned' : ''}>${top}${mid}${toks}</div>`;
  });
  const cur = s.players[s.turn];
  let notice = '';
  if (opts.siren) notice = `<div class="notice jail">🚔 ${esc(player(s, opts.siren).name)} goes to Jail!</div>`;
  else if (s.phase === 'lobby') notice = `<div class="notice">Waiting to start</div>`;
  else if (s.phase === 'over') notice = `<div class="notice">🏆 ${esc(player(s, s.winner).name)} wins</div>`;
  else if (s.auction) notice = `<div class="notice">🔨 ${esc(SPACES[s.auction.space].name)}<br>${s.auction.bidder ? `${money(s.auction.bid)} · ${esc(player(s, s.auction.bidder).name)}` : 'no bids yet'}</div>`;
  const centre = `<div class="centre">
    ${s.phase === 'play' && cur ? `<div class="whose" style="--c:${cur.color}">${cur.token} ${cur.id === opts.meId ? 'Your turn' : esc(cur.name)}${cur.inJail ? ' · in Jail' : ''}</div>` : `<div class="brand">Amethyst</div>`}
    ${diceHtml(opts.dice || s.dice, opts.rolling)}
    ${notice}
  </div>`;
  return `<div class="board ${opts.small ? 'small' : ''} ${opts.siren ? 'siren' : ''}">${cells.join('')}${centre}</div>`;
}

// The thing that just happened, shown on EVERY phone under the board: a drawn card, rent
// or tax due, a property for sale. The acting player's button lives in the hand.
export function eventHtml(s, meId) {
  const pd = s.pending;
  if (!pd || s.phase !== 'play') return '';
  const cur = s.players[s.turn];
  const who = cur.id === meId ? 'You' : esc(cur.name);
  if (pd.type === 'card') {
    const c = pendingCard(s);
    const chance = pd.deck === 'chance';
    return `<div class="playcard ${chance ? 'chance' : 'chest'}"><div class="pc-in"><small>${chance ? '? Chance' : '▣ Community Chest'} · ${who}</small><p>${esc(c.text)}</p></div></div>`;
  }
  if (pd.type === 'rent') {
    const to = player(s, pd.to);
    return `<div class="event rent"><b>${who} landed on ${esc(SPACES[pd.space].name)}</b><span>${pd.double ? 'Double rent ' : 'Rent '}${money(pd.amount)} to ${pd.to === meId ? 'you' : esc(to.name)}</span></div>`;
  }
  if (pd.type === 'tax') return `<div class="event tax"><b>${who} landed on ${esc(SPACES[pd.space].name)}</b><span>${money(pd.amount)} to the bank</span></div>`;
  if (pd.type === 'buy' && cur.id !== meId) return `<div class="event buy"><b>${who} landed on ${esc(SPACES[pd.space].name)}</b><span>For sale at ${money(SPACES[pd.space].price)}</span></div>`;
  if (pd.type === 'utilityRoll' && cur.id !== meId) return `<div class="event"><b>${who} must roll again</b><span>10× the throw for ${esc(SPACES[pd.space].name)}</span></div>`;
  return '';
}

// Everything worth knowing about one space, as a small card.
export function spaceHtml(s, i) {
  const sp = SPACES[i];
  const pr = s.props[i];
  const owner = pr ? player(s, pr.owner) : null;
  const rows = [];
  if (sp.type === 'street') {
    rows.push(['Price', money(sp.price)]);
    rows.push(['Rent', money(sp.rent[0]) + ' · set ' + money(sp.rent[0] * 2)]);
    rows.push(['1–4 houses', sp.rent.slice(1, 5).map(money).join(' / ')]);
    rows.push(['Hotel', money(sp.rent[5])]);
    rows.push(['House cost', money(sp.houseCost)]);
    rows.push(['Mortgage', money(sp.price / 2) + ', lift ' + money(unmortgageCost(i))]);
  } else if (sp.type === 'rail') {
    rows.push(['Price', money(sp.price)]);
    rows.push(['Rent', RAIL_RENT.slice(1).map(money).join(' / ') + ' by stations owned']);
    rows.push(['Mortgage', money(sp.price / 2)]);
  } else if (sp.type === 'utility') {
    rows.push(['Price', money(sp.price)]);
    rows.push(['Rent', '4× the throw, 10× with both']);
    rows.push(['Mortgage', money(sp.price / 2)]);
  } else if (sp.type === 'tax') rows.push(['Pay', money(sp.amount)]);
  else if (sp.type === 'jail') rows.push(['Visiting', 'Nothing happens. Only "Go To Jail", three doubles or a card put you inside.']);
  if (owner) {
    const status = pr.mortgaged ? 'mortgaged' : pr.houses === 5 ? 'hotel' : pr.houses ? `${pr.houses} house${pr.houses > 1 ? 's' : ''}` : '';
    rows.push(['Owner', `<span style="color:${owner.color}">${owner.token} ${esc(owner.name)}</span>${status ? ' · ' + status : ''}`]);
    if (!pr.mortgaged) rows.push(['Rent now', money(rentAt(s, i, s.dice))]);
  }
  const bar = sp.type === 'street' ? `style="border-top:6px solid ${GROUPS[sp.group].color}"` : '';
  return `<div class="space" ${bar}><h3>${esc(sp.name)}</h3>${rows.map(([k, v]) => `<div><span>${k}</span><span>${v}</span></div>`).join('')}</div>`;
}

// One chip per deed, colour-coded, in board order. Tap for the deed card.
export function chipsHtml(s, id) {
  const mine = Object.keys(s.props).map(Number).filter((i) => s.props[i].owner === id).sort((a, b) => a - b);
  if (!mine.length) return '';
  return `<div class="chips">${mine
    .map((i) => {
      const sp = SPACES[i];
      const pr = s.props[i];
      const color = sp.group ? GROUPS[sp.group].color : sp.type === 'rail' ? '#8d99ae' : '#5fb3c9';
      const mark = pr.mortgaged ? 'M' : pr.houses === 5 ? 'H' : pr.houses ? pr.houses : sp.type === 'rail' ? '🚂' : sp.type === 'utility' ? '⚡' : '';
      return `<span class="chip ${pr.mortgaged ? 'mort' : ''}" style="--c:${color}" data-info="${i}" title="${esc(sp.name)}">${mark}</span>`;
    })
    .join('')}</div>`;
}

export function playersHtml(s, meId, deltas = []) {
  return `<div class="players">${s.players
    .map((p, i) => {
      const cls = ['pl', i === s.turn && s.phase === 'play' ? 'now' : '', p.bankrupt ? 'out' : '', p.id === meId ? 'me' : ''];
      const owned = Object.values(s.props).filter((x) => x.owner === p.id).length;
      const d = deltas.find((x) => x.id === p.id);
      const fl = d ? `<span class="float ${d.delta > 0 ? 'up' : 'down'}">${d.delta > 0 ? '+' : '−'}${money(Math.abs(d.delta))}</span>` : '';
      return `<div class="${cls.join(' ')}" style="--c:${p.color}"><span class="tok">${p.token}</span><span class="nm">${esc(p.name)}${p.id === meId ? ' (you)' : ''}${p.inJail ? ' 🔒' : ''}</span><span class="cash">${p.bankrupt ? 'out' : money(p.cash)}${fl}</span><span class="cnt">${owned} deed${owned === 1 ? '' : 's'}</span></div>`;
    })
    .join('')}</div>`;
}

export function logHtml(s, n = 12) {
  return `<div class="log">${s.log.slice(-n).reverse().map((l) => `<div>${esc(l.text)}</div>`).join('')}</div>`;
}

export function toast(text, ms = 2200) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add('on');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('on'), ms);
}

export function spaceModal(s, i) {
  return `<div class="modal" data-close><div class="modalbox">${spaceHtml(s, i)}<button data-close>Close</button></div></div>`;
}

// Two-tap confirmation instead of a native confirm() (blocks the page, ugly in a PWA).
// First tap arms the button for 3 s and relabels it; a second tap runs the action.
export function confirmTap(button, label, action) {
  button.addEventListener('click', () => {
    if (button.dataset.armed) {
      delete button.dataset.armed;
      action();
      return;
    }
    const was = button.innerHTML;
    button.dataset.armed = '1';
    button.classList.add('armed');
    button.innerHTML = label;
    setTimeout(() => {
      if (!button.isConnected) return;
      delete button.dataset.armed;
      button.classList.remove('armed');
      button.innerHTML = was;
    }, 3000);
  });
}

// Owned deeds as little property cards (the hand's main view of what you own).
export function deedCardsHtml(s, id) {
  const mine = Object.keys(s.props).map(Number).filter((i) => s.props[i].owner === id).sort((a, b) => a - b);
  if (!mine.length) return '<p class="muted small">No deeds yet. Land on a place and buy it.</p>';
  return `<div class="deedcards">${mine
    .map((i) => {
      const sp = SPACES[i];
      const pr = s.props[i];
      const color = sp.group ? GROUPS[sp.group].color : sp.type === 'rail' ? '#4a4a5a' : '#2f7f99';
      const status = pr.mortgaged ? 'MORTGAGED' : pr.houses === 5 ? 'HOTEL' : pr.houses ? '▮'.repeat(pr.houses) : '';
      const line = sp.type === 'street' ? `rent ${money(rentAt(s, i, [3, 4]))}` : sp.type === 'rail' ? 'road' : 'utility';
      return `<button class="deedcard ${pr.mortgaged ? 'mort' : ''}" style="--c:${color}" data-info="${i}"><span class="dc-head">${esc(sp.name)}</span><span class="dc-body">${status ? `<b>${status}</b>` : line}</span></button>`;
    })
    .join('')}</div>`;
}

// Deed card plus the actions its owner can take right now (build, sell, mortgage, lift).
// `acts` is a list of { act, label, space } the hand computed; empty for other people's deeds.
export function spaceModalWithActions(s, i, acts = []) {
  const btns = acts.map((a) => `<button class="${a.pri ? 'pri' : ''}" data-act="${a.act}" data-space="${a.space}">${a.label}</button>`).join('');
  return `<div class="modal" data-close><div class="modalbox">${spaceHtml(s, i)}${btns ? `<div class="row wrap">${btns}</div>` : ''}<button data-close>Close</button></div></div>`;
}
