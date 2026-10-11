// A player's hand, rendered under the board on both the player phone and the table
// (when the host plays). Kept calm: header with cash + deed chips, the one thing to do
// now, then trades and the deed list folded away.
//
// renderHand(root, state, myId, send, ui):
//   send(action)       delivers the action to the table (locally or over the link)
//   ui.showSpace(i)    opens a deed card
//   ui.trade           {open, to, give:{cash,props}, get:{cash,props}} draft kept by the screen
//   ui.setTrade(t)     replaces the draft and re-renders
//   ui.animating       true while dice/tokens are moving: no buttons
//   ui.deltas          cash changes to float on the header

import { SPACES, GROUPS, JAIL_FINE } from './board.js';
import { legal, player, current, owned, debtTotal, canBuild, canSellHouse, canMortgage, canUnmortgage, unmortgageCost, netWorth, alive, tradeText, pendingCard, cardButtonLabel } from './rules.js';
import { esc, money, diceText, spaceHtml, playersHtml, logHtml, chipsHtml, confirmTap } from './render.js';

export function renderHand(root, s, meId, send, ui = {}) {
  const me = player(s, meId);
  if (!me) {
    root.innerHTML = `<div class="pane"><p class="muted">You're watching. The table will seat you for the next game.</p>${playersHtml(s)}${logHtml(s, 10)}</div>`;
    return;
  }
  const ok = ui.animating ? new Set() : legal(s, meId);
  const cur = current(s);
  const mine = s.phase === 'play' && cur.id === meId;
  const pd = s.pending;

  // ---- the one thing in front of you
  let now = '';
  if (ui.animating) now = `<p class="waiting">…</p>`;
  else if (s.phase === 'lobby') now = `<p class="muted">Waiting for the table to start the game…</p>`;
  else if (s.phase === 'over') now = `<p class="big">${s.winner === meId ? '🏆 You win!' : `${esc(player(s, s.winner).name)} wins.`}</p>`;
  else if (me.bankrupt) now = `<p class="muted">You're out. Thanks for playing!</p>`;
  else if (s.auction) now = auctionHtml(s, me, ok, ui);
  else if (!mine) now = `<p class="waiting">${cur.token} ${esc(cur.name)}'s turn${pd ? '…' : ''}</p>`;
  else if (s.debt) {
    const total = debtTotal(s);
    now = `<div class="alert"><b>You owe ${money(total)}</b><br><small>${esc(s.debt.reason)}. Sell buildings, mortgage deeds or trade to raise cash.</small></div>
      <div class="row">
        <button class="pri" data-act="payDebt" ${ok.has('payDebt') ? '' : 'disabled'}>Pay ${money(total)}</button>
        <button class="danger" data-act="bankrupt" data-confirm="Tap again: you're out">Bankrupt</button>
      </div>`;
  } else if (pd?.type === 'card') {
    now = `<button class="pri xl" data-act="cardOk">${cardButtonLabel(pendingCard(s), s, meId)}</button>`;
  } else if (pd?.type === 'rent') {
    now = `<button class="pri xl" data-act="pay">Pay ${money(pd.amount)} to ${esc(player(s, pd.to).name)}</button>`;
  } else if (pd?.type === 'tax') {
    now = `<button class="pri xl" data-act="pay">Pay ${money(pd.amount)}</button>`;
  } else if (pd?.type === 'buy') {
    const sp = SPACES[pd.space];
    now = `${spaceHtml(s, pd.space)}
      <div class="row">
        <button class="pri" data-act="buy" ${ok.has('buy') ? '' : 'disabled'}>Buy for ${money(sp.price)}</button>
        <button data-act="decline">Pass (auction)</button>
      </div>`;
  } else if (pd?.type === 'utilityRoll') {
    now = `<p>Roll again and pay 10× the throw for ${esc(SPACES[pd.space].name)}.</p><button class="pri xl" data-act="roll">🎲 Roll</button>`;
  } else if (!s.rolled) {
    if (me.inJail) {
      now = `<p>You're in Jail (${me.jailTurns}/3 tries). Roll doubles to get out, or pay.</p>
        <div class="row">
          <button class="pri" data-act="roll">🎲 Roll</button>
          <button data-act="jailPay" ${ok.has('jailPay') ? '' : 'disabled'}>Pay ${money(JAIL_FINE)}</button>
          ${me.jailFree ? `<button data-act="jailCard">Use card</button>` : ''}
        </div>`;
    } else {
      now = `<p class="muted">${s.doubles ? `Doubles! ${diceText(s.dice)} Roll again.` : 'Your turn. Tap Roll, or tap your piece on the board.'}</p><button class="pri xl" data-act="roll">🎲 Roll</button>`;
    }
  } else {
    now = `<p class="muted">${diceText(s.dice)} You're on ${esc(SPACES[me.pos].name)}.</p><button class="pri xl" data-act="endTurn">End turn</button>`;
  }

  // ---- trade: an offer on the table, or the form to make one
  let trade = '';
  if (s.trade) {
    const t = s.trade;
    const from = player(s, t.from), to = player(s, t.to);
    const txt = esc(tradeText(s, t));
    if (t.to === meId && !ui.animating) {
      trade = ui.trade?.open
        ? tradeFormHtml(s, me, ui.trade, true)
        : `<div class="offer"><b>${esc(from.name)} offers you a trade</b><br>${txt}
        <div class="row"><button class="pri" data-act="acceptTrade">Accept</button><button data-trade-counter>Counter</button><button data-act="rejectTrade">Decline</button></div></div>`;
    } else if (t.from === meId) {
      trade = `<div class="offer"><b>Waiting for ${esc(to.name)}</b><br>${txt}<div class="row"><button data-act="cancelTrade">Withdraw</button></div></div>`;
    } else {
      trade = `<div class="offer muted">${esc(from.name)} → ${esc(to.name)}: ${txt}</div>`;
    }
  } else if (ok.has('propose') && ui.trade?.open) {
    trade = tradeFormHtml(s, me, ui.trade, false);
  } else if (ok.has('propose')) {
    trade = `<button class="sm wide" data-trade-open>🤝 Propose a trade</button>`;
  }

  // ---- deeds, grouped by colour (folded by default; chips above give the overview)
  const mineProps = owned(s, meId);
  const byGroup = new Map();
  for (const i of mineProps) {
    const g = SPACES[i].group || SPACES[i].type;
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(i);
  }
  const canAct = mine && !s.auction && !ui.animating;
  const deeds = mineProps.length
    ? [...byGroup]
        .map(([g, list]) => {
          const color = GROUPS[g]?.color || (g === 'rail' ? '#999' : '#bbb');
          const label = GROUPS[g]?.name || (g === 'rail' ? 'Stations' : 'Utilities');
          const full = GROUPS[g] && list.length === SPACES.filter((x) => x.group === g).length;
          return `<div class="grp"><div class="gh" style="--c:${color}">${label}${full ? ' · full set' : ''}</div>${list
            .map((i) => {
              const sp = SPACES[i];
              const pr = s.props[i];
              const tag = pr.mortgaged ? '<small class="mort">mortgaged</small>' : pr.houses === 5 ? '<small class="hot">hotel</small>' : pr.houses ? `<small class="hs">${'▮'.repeat(pr.houses)}</small>` : '';
              const btns = [];
              if (canAct && !s.debt && canBuild(s, meId, i)) btns.push(`<button class="sm" data-act="build" data-space="${i}">+ ${pr.houses === 4 ? 'Hotel' : 'House'} ${money(sp.houseCost)}</button>`);
              if (canAct && canSellHouse(s, meId, i)) btns.push(`<button class="sm" data-act="sellHouse" data-space="${i}">Sell ${money(sp.houseCost / 2)}</button>`);
              if (canAct && canMortgage(s, meId, i)) btns.push(`<button class="sm" data-act="mortgage" data-space="${i}">Mortgage ${money(sp.price / 2)}</button>`);
              if (canAct && !s.debt && canUnmortgage(s, meId, i)) btns.push(`<button class="sm" data-act="unmortgage" data-space="${i}">Lift ${money(unmortgageCost(i))}</button>`);
              return `<div class="deed"><span class="dn" data-info="${i}">${esc(sp.name)} ${tag}</span><span class="db">${btns.join('')}</span></div>`;
            })
            .join('')}</div>`;
        })
        .join('')
    : '<p class="muted">No deeds yet.</p>';
  const canBuildAny = canAct && mineProps.some((i) => canBuild(s, meId, i));
  const openDeeds = ui.deedsOpen || canBuildAny || (s.debt && mine);

  const d = (ui.deltas || []).find((x) => x.id === meId);
  const fl = d ? `<span class="float ${d.delta > 0 ? 'up' : 'down'}">${d.delta > 0 ? '+' : '−'}${money(Math.abs(d.delta))}</span>` : '';

  root.innerHTML = `
    <div class="hand">
      <header class="hh" style="--c:${me.color}">
        <span class="tok">${me.token}</span>
        <div><div class="nm">${esc(me.name)}</div><div class="sub">${esc(SPACES[me.pos].name)}${me.inJail ? ' · in Jail' : ''}${me.jailFree ? ` · ${me.jailFree} jail card` : ''}</div></div>
        <div class="cash"><div>${money(me.cash)}${fl}</div><small>worth ${money(netWorth(s, meId))}</small></div>
      </header>
      ${chipsHtml(s, meId)}
      <section class="now">${now}</section>
      ${trade ? `<section class="tradebox">${trade}</section>` : ''}
      <details class="deedbox" ${openDeeds ? 'open' : ''} data-deeds><summary>My deeds (${mineProps.length})${canBuildAny ? ' · you can build' : ''}</summary><section class="deeds">${deeds}</section></details>
      ${playersHtml(s, meId, ui.deltas)}
      <details class="logbox"><summary>Log</summary>${logHtml(s, 40)}</details>
    </div>`;

  wire(root, s, meId, send, ui);
}

function auctionHtml(s, me, ok, ui) {
  const a = s.auction;
  const sp = SPACES[a.space];
  const out = a.passed.includes(me.id);
  const leader = a.bidder ? player(s, a.bidder) : null;
  const still = alive(s).filter((p) => !a.passed.includes(p.id)).map((p) => p.token).join(' ');
  const head = `<div class="auc"><b>🔨 Auction: ${esc(sp.name)}</b><div class="muted">${leader ? `High bid ${money(a.bid)} by ${leader.id === me.id ? 'you' : esc(leader.name)}` : 'No bids yet'} · still in: ${still}</div></div>`;
  if (out) return `${head}<p class="muted">You're out of this one.</p>`;
  if (!ok.has('bid') && !ok.has('auctionPass')) return `${head}<p class="muted">You're the high bidder. Waiting for the others…</p>`;
  const steps = [10, 50, 100].map((d) => a.bid + d).filter((v) => v <= me.cash);
  const custom = Number(ui.bid) || 0;
  return `${head}
    ${spaceHtml(s, a.space)}
    <div class="row wrap">
      ${steps.map((v) => `<button class="pri" data-act="bid" data-amount="${v}">${money(v)}</button>`).join('')}
    </div>
    <div class="row">
      <input type="number" inputmode="numeric" placeholder="Other amount" data-bid-input value="${custom || ''}" min="${a.bid + 1}" max="${me.cash}" />
      <button data-act="bid" data-amount-from-input ${ok.has('bid') ? '' : 'disabled'}>Bid</button>
      <button class="danger" data-act="auctionPass" ${ok.has('auctionPass') ? '' : 'disabled'}>Pass</button>
    </div>`;
}

function tradeFormHtml(s, me, d, counter) {
  const others = alive(s).filter((p) => p.id !== me.id);
  const to = player(s, d.to) || others[0];
  const list = (id, chosen, side) =>
    owned(s, id)
      .map((i) => {
        const pr = s.props[i];
        const dis = pr.houses ? 'disabled' : '';
        return `<label class="pick ${dis}"><input type="checkbox" data-pick="${side}" value="${i}" ${chosen.includes(i) ? 'checked' : ''} ${dis}/><span><i style="background:${GROUPS[SPACES[i].group]?.color || '#999'}"></i>${esc(SPACES[i].name)}${pr.mortgaged ? ' (m)' : ''}${pr.houses ? ' (buildings)' : ''}</span></label>`;
      })
      .join('') || '<p class="muted small">No deeds</p>';
  return `<div class="tradeform">
    <div class="row"><b>${counter ? 'Counter-offer to' : 'Trade with'}</b>${counter ? `<span>${to.token} ${esc(to.name)}</span>` : `<select data-trade-to>${others.map((p) => `<option value="${p.id}" ${p.id === to.id ? 'selected' : ''}>${p.token} ${esc(p.name)}</option>`).join('')}</select>`}</div>
    <div class="cols">
      <div><div class="gh">You give</div>${list(me.id, d.give.props, 'give')}<input type="number" inputmode="numeric" placeholder="+ cash" data-cash="give" value="${d.give.cash || ''}" max="${me.cash}" /></div>
      <div><div class="gh">You get</div>${list(to.id, d.get.props, 'get')}<input type="number" inputmode="numeric" placeholder="+ cash" data-cash="get" value="${d.get.cash || ''}" max="${to.cash}" /></div>
    </div>
    <div class="row"><button class="pri" data-trade-send>${counter ? 'Send counter-offer' : 'Send offer'}</button><button data-trade-close>Cancel</button></div>
  </div>`;
}

const EMPTY = () => ({ open: false, to: null, give: { cash: 0, props: [] }, get: { cash: 0, props: [] } });

function wire(root, s, meId, send, ui) {
  root.querySelectorAll('[data-act]').forEach((b) => {
    const fire = () => {
      const a = { type: b.dataset.act, by: meId };
      if (b.dataset.space) a.space = Number(b.dataset.space);
      if (b.dataset.amount) a.amount = Number(b.dataset.amount);
      if (b.hasAttribute('data-amount-from-input')) a.amount = Number(root.querySelector('[data-bid-input]')?.value);
      send(a);
    };
    if (b.dataset.confirm) confirmTap(b, b.dataset.confirm, fire);
    else b.addEventListener('click', fire);
  });
  root.querySelectorAll('[data-info]').forEach((el) => el.addEventListener('click', () => ui.showSpace?.(Number(el.dataset.info))));
  root.querySelector('[data-bid-input]')?.addEventListener('input', (e) => { ui.bid = e.target.value; });
  root.querySelector('[data-deeds]')?.addEventListener('toggle', (e) => { ui.deedsOpen = e.target.open; });

  // Trade form: keep the draft in ui.trade so re-renders don't lose ticks.
  const draft = () => ui.trade || EMPTY();
  root.querySelector('[data-trade-open]')?.addEventListener('click', () => ui.setTrade?.({ ...draft(), open: true }));
  root.querySelector('[data-trade-counter]')?.addEventListener('click', () => {
    const t = s.trade; // start from their offer, seen from my side
    ui.setTrade?.({ open: true, to: t.from, give: { cash: t.get.cash, props: [...t.get.props] }, get: { cash: t.give.cash, props: [...t.give.props] } });
  });
  root.querySelector('[data-trade-close]')?.addEventListener('click', () => ui.setTrade?.(EMPTY()));
  root.querySelector('[data-trade-to]')?.addEventListener('change', (e) => ui.setTrade?.({ ...draft(), to: e.target.value, get: { cash: 0, props: [] } }));
  root.querySelectorAll('[data-pick]').forEach((cb) =>
    cb.addEventListener('change', () => {
      const d = draft();
      const side = cb.dataset.pick;
      const v = Number(cb.value);
      const props = d[side].props.filter((x) => x !== v);
      if (cb.checked) props.push(v);
      ui.trade = { ...d, [side]: { ...d[side], props } };
    }),
  );
  root.querySelectorAll('[data-cash]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const d = draft();
      const side = inp.dataset.cash;
      ui.trade = { ...d, [side]: { ...d[side], cash: Number(inp.value) || 0 } };
    }),
  );
  root.querySelector('[data-trade-send]')?.addEventListener('click', () => {
    const d = draft();
    const to = root.querySelector('[data-trade-to]')?.value || d.to || s.trade?.from;
    send({ type: 'propose', by: meId, to, give: d.give, get: d.get });
    ui.setTrade?.(EMPTY());
  });
}
