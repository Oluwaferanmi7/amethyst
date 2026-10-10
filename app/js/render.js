// Shared views: the board, dice, a space's details, the players strip, the log.

import { SPACES, GROUPS, RAIL_RENT } from './board.js';
import { rentAt, player, unmortgageCost } from './rules.js';

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
const DICE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
export const diceHtml = (dice, rolling) => (dice ? `<span class="dice ${rolling ? 'rolling' : ''}">${DICE[dice[0]]}${DICE[dice[1]]}</span>` : '');

// opts: highlight (space index), rolling (animate dice), meId (for "you" cues)
export function boardHtml(s, opts = {}) {
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
    else if (sp.type === 'utility') top = `<i class="ic">${sp.name.startsWith('Water') ? '🚰' : '⚡'}</i>`;
    else top = `<i class="ic">${ICON[sp.type]}</i>`;
    let mid = '';
    if (pr?.houses === 5) mid = '<b class="hotel"></b>';
    else if (pr?.houses) mid = `<span class="houses">${'<b></b>'.repeat(pr.houses)}</span>`;
    else if (sp.price && !pr) mid = `<small>${sp.price}</small>`;
    const here = s.players.filter((p) => !p.bankrupt && p.pos === i);
    const toks = here.length ? `<span class="toks">${here.map((p) => `<em style="--c:${p.color}" title="${esc(p.name)}">${p.token}</em>`).join('')}</span>` : '';
    return `<div class="${cls.join(' ')}" style="${style}" data-space="${i}" ${owner ? 'data-owned' : ''}>${top}${mid}${toks}</div>`;
  });
  const cur = s.players[s.turn];
  let notice = '';
  if (s.phase === 'lobby') notice = `<div class="notice">Waiting to start</div>`;
  else if (s.phase === 'over') notice = `<div class="notice">🏆 ${esc(player(s, s.winner).name)} wins</div>`;
  else if (s.auction) notice = `<div class="notice">🔨 Auction: ${esc(SPACES[s.auction.space].name)}<br>${s.auction.bidder ? `${money(s.auction.bid)} by ${esc(player(s, s.auction.bidder).name)}` : 'no bids yet'}</div>`;
  else if (s.card) notice = `<div class="cardtxt"><b>${s.card.deck === 'chance' ? 'Chance' : 'Community Chest'}</b><br>${esc(s.card.text)}</div>`;
  const centre = `<div class="centre">
    <div class="brand">Amethyst</div>
    ${s.phase === 'play' && cur ? `<div class="whose" style="--c:${cur.color}">${cur.token} ${cur.id === opts.meId ? 'Your turn' : esc(cur.name)}${cur.inJail ? ' · in Jail' : ''}</div>` : ''}
    ${diceHtml(s.dice, opts.rolling)}
    ${notice}
  </div>`;
  return `<div class="board ${opts.small ? 'small' : ''}">${cells.join('')}${centre}</div>`;
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
  if (owner) {
    const status = pr.mortgaged ? 'mortgaged' : pr.houses === 5 ? 'hotel' : pr.houses ? `${pr.houses} house${pr.houses > 1 ? 's' : ''}` : '';
    rows.push(['Owner', `<span style="color:${owner.color}">${owner.token} ${esc(owner.name)}</span>${status ? ' · ' + status : ''}`]);
    if (!pr.mortgaged) rows.push(['Rent now', money(rentAt(s, i, s.dice))]);
  }
  const bar = sp.type === 'street' ? `style="border-top:6px solid ${GROUPS[sp.group].color}"` : '';
  return `<div class="space" ${bar}><h3>${esc(sp.name)}</h3>${rows.map(([k, v]) => `<div><span>${k}</span><span>${v}</span></div>`).join('')}</div>`;
}

export function playersHtml(s, meId) {
  return `<div class="players">${s.players
    .map((p, i) => {
      const cls = ['pl', i === s.turn && s.phase === 'play' ? 'now' : '', p.bankrupt ? 'out' : '', p.id === meId ? 'me' : ''];
      const owned = Object.values(s.props).filter((x) => x.owner === p.id).length;
      return `<div class="${cls.join(' ')}" style="--c:${p.color}"><span class="tok">${p.token}</span><span class="nm">${esc(p.name)}${p.id === meId ? ' (you)' : ''}${p.inJail ? ' 🔒' : ''}</span><span class="cash">${p.bankrupt ? 'out' : money(p.cash)}</span><span class="cnt">${owned} deed${owned === 1 ? '' : 's'}</span></div>`;
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

// A bottom sheet with a deed card; `root` is the screen's root.
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
