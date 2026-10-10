// A player's hand: cash, what to do now, their deeds with build/mortgage buttons.
// Pure view: renderHand(root, state, myId, send) where send(action) delivers the action
// to the table (locally on the table phone, over the link on a player phone).

import { SPACES, GROUPS, JAIL_FINE } from './board.js';
import { legal, player, current, owned, debtTotal, canBuild, canSellHouse, canMortgage, canUnmortgage, unmortgageCost, netWorth } from './rules.js';
import { esc, money, diceHtml, spaceHtml, boardHtml, playersHtml, logHtml } from './render.js';

export function renderHand(root, s, meId, send, ui) {
  const me = player(s, meId);
  if (!me) {
    root.innerHTML = `<div class="pane"><p class="muted">You're watching. The table will seat you for the next game.</p>${boardHtml(s)}${playersHtml(s)}</div>`;
    return;
  }
  const ok = legal(s, meId);
  const cur = current(s);
  const mine = s.phase === 'play' && cur.id === meId;

  // ---- status line + the one decision in front of you
  let now = '';
  if (s.phase === 'lobby') now = `<p class="muted">Waiting for the table to start the game…</p>`;
  else if (s.phase === 'over') now = `<p class="big">${s.winner === meId ? '🏆 You win!' : `${esc(player(s, s.winner).name)} wins.`}</p>`;
  else if (me.bankrupt) now = `<p class="muted">You're out. Thanks for playing!</p>`;
  else if (!mine) now = `<p class="muted">${cur.token} ${esc(cur.name)}'s turn ${diceHtml(s.dice)}</p>`;
  else if (s.debt) {
    const total = debtTotal(s);
    now = `<div class="alert"><b>You owe ${money(total)}</b><br><small>${esc(s.debt.reason)}. Sell buildings or mortgage deeds to raise cash.</small></div>
      <div class="row">
        <button class="pri" data-act="payDebt" ${ok.has('payDebt') ? '' : 'disabled'}>Pay ${money(total)}</button>
        <button class="danger" data-act="bankrupt">Declare bankruptcy</button>
      </div>`;
  } else if (s.pending?.type === 'buy') {
    const sp = SPACES[s.pending.space];
    now = `${spaceHtml(s, s.pending.space)}
      <div class="row">
        <button class="pri" data-act="buy" ${ok.has('buy') ? '' : 'disabled'}>Buy for ${money(sp.price)}</button>
        <button data-act="decline">Pass</button>
      </div>`;
  } else if (s.pending?.type === 'utilityRoll') {
    now = `<p>Roll again and pay 10× the throw for ${esc(SPACES[s.pending.space].name)}.</p><button class="pri xl" data-act="roll">Roll</button>`;
  } else if (!s.rolled) {
    if (me.inJail) {
      now = `<p>You're in Jail (${me.jailTurns}/3 tries). Roll doubles to get out, or pay.</p>
        <div class="row">
          <button class="pri" data-act="roll">Roll</button>
          <button data-act="jailPay" ${ok.has('jailPay') ? '' : 'disabled'}>Pay ${money(JAIL_FINE)}</button>
          ${me.jailFree ? `<button data-act="jailCard">Use card</button>` : ''}
        </div>`;
    } else {
      now = `<p class="muted">${s.doubles ? `Doubles! ${diceHtml(s.dice)} Roll again.` : 'Your turn.'}</p><button class="pri xl" data-act="roll">Roll</button>`;
    }
  } else {
    now = `<p class="muted">${diceHtml(s.dice)} You're on ${esc(SPACES[me.pos].name)}.</p><button class="pri xl" data-act="endTurn">End turn</button>`;
  }

  const card = s.card && s.card.by === meId && mine ? `<div class="card"><b>${s.card.deck === 'chance' ? 'Chance' : 'Community Chest'}</b><br>${esc(s.card.text)}</div>` : '';

  // ---- deeds, grouped by colour
  const mineProps = owned(s, meId);
  const byGroup = new Map();
  for (const i of mineProps) {
    const g = SPACES[i].group || SPACES[i].type;
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(i);
  }
  const deeds = mineProps.length
    ? [...byGroup]
        .map(([g, list]) => {
          const color = GROUPS[g]?.color || (g === 'rail' ? '#999' : '#bbb');
          const label = GROUPS[g]?.name || (g === 'rail' ? 'Stations' : 'Utilities');
          const full = GROUPS[g] && list.length === Object.keys(SPACES).filter((k) => SPACES[k].group === g).length;
          return `<div class="grp"><div class="gh" style="--c:${color}">${label}${full ? ' · full set' : ''}</div>${list
            .map((i) => {
              const sp = SPACES[i];
              const pr = s.props[i];
              const tag = pr.mortgaged ? '<small class="mort">mortgaged</small>' : pr.houses === 5 ? '<small class="hot">hotel</small>' : pr.houses ? `<small class="hs">${'▮'.repeat(pr.houses)}</small>` : '';
              const btns = [];
              if (mine && !s.debt && canBuild(s, meId, i)) btns.push(`<button class="sm" data-act="build" data-space="${i}">+ ${pr.houses === 4 ? 'Hotel' : 'House'} ${money(sp.houseCost)}</button>`);
              if (mine && canSellHouse(s, meId, i)) btns.push(`<button class="sm" data-act="sellHouse" data-space="${i}">Sell ${money(sp.houseCost / 2)}</button>`);
              if (mine && canMortgage(s, meId, i)) btns.push(`<button class="sm" data-act="mortgage" data-space="${i}">Mortgage ${money(sp.price / 2)}</button>`);
              if (mine && !s.debt && canUnmortgage(s, meId, i)) btns.push(`<button class="sm" data-act="unmortgage" data-space="${i}">Lift ${money(unmortgageCost(i))}</button>`);
              return `<div class="deed"><span class="dn" data-info="${i}">${esc(sp.name)} ${tag}</span><span class="db">${btns.join('')}</span></div>`;
            })
            .join('')}</div>`;
        })
        .join('')
    : '<p class="muted">No deeds yet.</p>';

  const tab = ui?.tab || 'hand';
  root.innerHTML = `
    <div class="hand">
      <header class="hh" style="--c:${me.color}">
        <span class="tok">${me.token}</span>
        <div><div class="nm">${esc(me.name)}</div><div class="sub">${esc(SPACES[me.pos].name)}${me.jailFree ? ` · ${me.jailFree} jail card` : ''}</div></div>
        <div class="cash"><div>${money(me.cash)}</div><small>worth ${money(netWorth(s, meId))}</small></div>
      </header>
      <nav class="tabs">
        <button data-tab="hand" class="${tab === 'hand' ? 'on' : ''}">Hand</button>
        <button data-tab="board" class="${tab === 'board' ? 'on' : ''}">Board</button>
        <button data-tab="log" class="${tab === 'log' ? 'on' : ''}">Log</button>
      </nav>
      ${tab === 'hand' ? `<section class="now">${now}${card}</section><section class="deeds">${deeds}</section>` : ''}
      ${tab === 'board' ? `<section>${boardHtml(s, { highlight: me.pos })}${playersHtml(s, meId)}</section>` : ''}
      ${tab === 'log' ? `<section>${playersHtml(s, meId)}${logHtml(s, 40)}</section>` : ''}
    </div>`;

  root.querySelectorAll('[data-act]').forEach((b) =>
    b.addEventListener('click', () => {
      const a = { type: b.dataset.act, by: meId };
      if (b.dataset.space) a.space = Number(b.dataset.space);
      send(a);
    }),
  );
  root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => ui?.setTab?.(b.dataset.tab)));
  root.querySelectorAll('[data-info], .cell[data-space]').forEach((el) =>
    el.addEventListener('click', () => ui?.showSpace?.(Number(el.dataset.info ?? el.dataset.space))),
  );
}
