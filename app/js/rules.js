// The rules engine. Pure: `reduce(state, action, rng)` returns a new state (or throws
// an Error with a short message for an illegal action). The table phone runs this;
// player phones only send actions and render the state they get back.
//
// State shape
//   phase     'lobby' | 'play' | 'over'
//   players   [{ id, name, token, color, cash, pos, inJail, jailTurns, jailFree, bankrupt }]
//   props     { [space]: { owner, houses (0-4, 5 = hotel), mortgaged } }
//   turn      index into players of whose turn it is
//   rolled    the current player has rolled and may end the turn (false again after doubles)
//   doubles   doubles rolled so far this turn
//   dice      [a, b] of the last throw
//   pending   null | { type: 'buy', space } | { type: 'utilityRoll', space }
//   debt      null | { items: [{ to, amount }], reason }  money owed that the player can't cover yet
//   decks     { chance: [card indexes], chest: [...] }  drawn from the front, returned to the back
//   card      the last card shown, { deck, text, by }
//   log       [{ n, text }] most recent last
//   seq       bumps on every change (phones use it to ignore stale states)
//   winner    player id once the game is over

import {
  SPACES, GROUPS, CHANCE, CHEST, TOKENS, PLAYER_COLORS, RAIL_RENT, UTILITY_MULT,
  START_CASH, GO_SALARY, JAIL_FINE, JAIL_POS, groupSpaces,
} from './board.js';

export const MAX_PLAYERS = 8;

export function newGame() {
  return {
    id: Math.random().toString(36).slice(2, 10), // phones use it to tell a new game from a stale state
    phase: 'lobby', players: [], props: {}, turn: 0, rolled: false, doubles: 0, dice: null,
    pending: null, debt: null, auction: null, trade: null,
    decks: { chance: [], chest: [] }, card: null, log: [], seq: 0, winner: null,
  };
}
//   auction   null | { space, bid, bidder, passed: [ids] }  runs when a buyer passes
//   trade     null | { from, to, give: { cash, props }, get: { cash, props } }  one offer at a time

const clone = (s) => JSON.parse(JSON.stringify(s));
const fail = (msg) => { throw new Error(msg); };
const money = (n) => `$${n}`;

export const player = (s, id) => s.players.find((p) => p.id === id);
export const current = (s) => s.players[s.turn];
export const alive = (s) => s.players.filter((p) => !p.bankrupt);
export const owned = (s, id) => Object.keys(s.props).map(Number).filter((i) => s.props[i].owner === id).sort((a, b) => a - b);

export function ownsGroup(s, id, group) {
  return groupSpaces(group).every((i) => s.props[i]?.owner === id);
}

// What a visitor pays to land on `space` right now (0 if nobody's home or it's mortgaged).
export function rentAt(s, space, dice) {
  const sp = SPACES[space];
  const pr = s.props[space];
  if (!pr || pr.mortgaged) return 0;
  if (sp.type === 'street') {
    if (pr.houses > 0) return sp.rent[pr.houses];
    return ownsGroup(s, pr.owner, sp.group) ? sp.rent[0] * 2 : sp.rent[0];
  }
  if (sp.type === 'rail') {
    const n = owned(s, pr.owner).filter((i) => SPACES[i].type === 'rail').length;
    return RAIL_RENT[n];
  }
  if (sp.type === 'utility') {
    const n = owned(s, pr.owner).filter((i) => SPACES[i].type === 'utility').length;
    const sum = dice ? dice[0] + dice[1] : 7;
    return UTILITY_MULT[n] * sum;
  }
  return 0;
}

export function netWorth(s, id) {
  const p = player(s, id);
  let total = p.cash;
  for (const i of owned(s, id)) {
    const sp = SPACES[i];
    const pr = s.props[i];
    total += pr.mortgaged ? sp.price / 2 : sp.price;
    if (pr.houses) total += pr.houses * sp.houseCost;
  }
  return total;
}

// Buildable / sellable / mortgageable checks shared by the reducer and the hand UI.
export function canBuild(s, id, space) {
  const sp = SPACES[space];
  const pr = s.props[space];
  const p = player(s, id);
  if (!p || sp.type !== 'street' || pr?.owner !== id || pr.mortgaged || pr.houses >= 5) return false;
  if (!ownsGroup(s, id, sp.group)) return false;
  const group = groupSpaces(sp.group);
  if (group.some((i) => s.props[i].mortgaged)) return false;
  const min = Math.min(...group.map((i) => s.props[i].houses));
  return pr.houses === min && p.cash >= sp.houseCost;
}
export function canSellHouse(s, id, space) {
  const sp = SPACES[space];
  const pr = s.props[space];
  if (sp.type !== 'street' || pr?.owner !== id || pr.houses === 0) return false;
  const max = Math.max(...groupSpaces(sp.group).map((i) => s.props[i]?.houses || 0));
  return pr.houses === max;
}
export function canMortgage(s, id, space) {
  const sp = SPACES[space];
  const pr = s.props[space];
  if (pr?.owner !== id || pr.mortgaged) return false;
  if (sp.type === 'street' && groupSpaces(sp.group).some((i) => s.props[i]?.houses > 0)) return false;
  return true;
}
// Mortgage value plus 10% interest. Prices are multiples of 20, so this is always whole.
export const unmortgageCost = (space) => Math.round((SPACES[space].price / 2) * 1.1);
export function canUnmortgage(s, id, space) {
  const pr = s.props[space];
  return pr?.owner === id && pr.mortgaged && player(s, id).cash >= unmortgageCost(space);
}

// The buttons a phone should show. Host actions are not listed here.
export function legal(s, id) {
  const p = player(s, id);
  if (!p || s.phase !== 'play' || p.bankrupt) return new Set();
  const out = new Set();
  const mine = current(s).id === id;

  // An auction freezes everything else; every player still in it can bid or pass.
  if (s.auction) {
    if (!s.auction.passed.includes(id)) {
      if (p.cash > s.auction.bid) out.add('bid');
      if (s.auction.bidder !== id) out.add('auctionPass');
    }
    return out;
  }
  // Trades run alongside the turn: the receiver answers, the proposer can withdraw.
  if (s.trade) {
    if (s.trade.to === id) out.add('acceptTrade').add('rejectTrade').add('propose'); // propose = counter-offer
    if (s.trade.from === id) out.add('cancelTrade');
  } else if (alive(s).length > 1) {
    out.add('propose');
  }

  if (s.debt && mine) {
    if (p.cash >= debtTotal(s)) out.add('payDebt');
    out.add('bankrupt');
    if (owned(s, id).some((i) => canSellHouse(s, id, i))) out.add('sellHouse');
    if (owned(s, id).some((i) => canMortgage(s, id, i))) out.add('mortgage');
    return out;
  }
  if (!mine) return out;
  if (s.pending?.type === 'buy') {
    if (p.cash >= SPACES[s.pending.space].price) out.add('buy');
    out.add('decline');
  } else if (s.pending?.type === 'utilityRoll') {
    out.add('roll');
  } else if (s.pending?.type === 'rent' || s.pending?.type === 'tax') {
    out.add('pay');
  } else if (s.pending?.type === 'card') {
    out.add('cardOk');
  } else if (!s.rolled) {
    out.add('roll');
    if (p.inJail) {
      if (p.cash >= JAIL_FINE) out.add('jailPay');
      if (p.jailFree > 0) out.add('jailCard');
    }
  } else {
    out.add('endTurn');
  }
  const props = owned(s, id);
  if (props.some((i) => canBuild(s, id, i))) out.add('build');
  if (props.some((i) => canSellHouse(s, id, i))) out.add('sellHouse');
  if (props.some((i) => canMortgage(s, id, i))) out.add('mortgage');
  if (props.some((i) => canUnmortgage(s, id, i))) out.add('unmortgage');
  return out;
}

export const debtTotal = (s) => (s.debt ? s.debt.items.reduce((a, b) => a + b.amount, 0) : 0);

// ------------------------------------------------------------------ reducer

export function reduce(prev, action, rng = Math.random) {
  const s = clone(prev);
  const { type, by } = action;
  const log = (text) => { s.log.push({ n: ++s.seq, text }); if (s.log.length > 80) s.log.shift(); };
  s._log = log;

  if (by === 'host') {
    hostAction(s, action, rng);
  } else {
    const p = player(s, by) || fail('You are not in this game');
    if (s.phase !== 'play') fail('The game has not started');
    if (p.bankrupt) fail('You are out of the game');
    const ok = legal(s, by);
    if (!ok.has(type)) fail(current(s).id !== by && !s.auction && !s.trade ? 'Not your turn' : `Can't ${type} right now`);
    playerAction(s, p, action, rng);
  }
  delete s._log;
  s.seq++;
  return s;
}

function hostAction(s, a, rng) {
  const log = s._log;
  switch (a.type) {
    case 'addPlayer': {
      if (s.phase !== 'lobby') fail('Game already started');
      if (player(s, a.id)) fail('Already in');
      if (s.players.length >= MAX_PLAYERS) fail('Table is full');
      const used = new Set(s.players.map((p) => p.token));
      const token = (a.token && !used.has(a.token) && TOKENS.includes(a.token) ? a.token : TOKENS.find((t) => !used.has(t)));
      const color = PLAYER_COLORS[s.players.length % PLAYER_COLORS.length];
      s.players.push({ id: a.id, name: String(a.name || 'Player').slice(0, 16), token, color, cash: START_CASH, pos: 0, inJail: false, jailTurns: 0, jailFree: 0, bankrupt: false });
      log(`${a.name} joined the table`);
      return;
    }
    case 'removePlayer': {
      if (s.phase !== 'lobby') fail('Game already started');
      const i = s.players.findIndex((p) => p.id === a.id);
      if (i < 0) fail('No such player');
      log(`${s.players[i].name} left`);
      s.players.splice(i, 1);
      return;
    }
    case 'rename': {
      const p = player(s, a.id) || fail('No such player');
      p.name = String(a.name || p.name).slice(0, 16);
      return;
    }
    case 'start': {
      if (s.phase !== 'lobby') fail('Already started');
      if (s.players.length < 2) fail('Need at least 2 players');
      s.decks.chance = shuffle(CHANCE.map((_, i) => i), rng);
      s.decks.chest = shuffle(CHEST.map((_, i) => i), rng);
      s.phase = 'play';
      s.turn = 0;
      log(`Game on. ${current(s).name} rolls first.`);
      return;
    }
    case 'forfeit': {
      // Host removes a player who left mid-game. Everything goes back to the bank.
      if (s.phase !== 'play') fail('Not playing');
      const p = player(s, a.id) || fail('No such player');
      if (p.bankrupt) fail('Already out');
      log(`${p.name} forfeits`);
      goBankrupt(s, p, 'bank');
      return;
    }
    default:
      fail(`Unknown host action ${a.type}`);
  }
}

function playerAction(s, p, a, rng) {
  switch (a.type) {
    case 'roll': return doRoll(s, p, rng, a.dice);
    case 'buy': return doBuy(s, p);
    case 'pay': {
      // Rent or tax the player has seen and is now settling (debt flow if they're short).
      const pd = s.pending;
      s.pending = null;
      if (pd.type === 'rent') {
        s._log(`${p.name} pays ${money(pd.amount)} rent to ${player(s, pd.to).name}`);
        charge(s, p, pd.to, pd.amount, `Rent for ${SPACES[pd.space].name}`);
      } else {
        s._log(`${p.name} pays ${money(pd.amount)} ${SPACES[pd.space].name}`);
        charge(s, p, 'bank', pd.amount, SPACES[pd.space].name);
      }
      return;
    }
    case 'cardOk': {
      const { deck, idx } = s.pending;
      s.pending = null;
      applyCard(s, p, deck, idx);
      return;
    }
    case 'decline': {
      const space = s.pending.space;
      s.pending = null;
      s._log(`${p.name} passes on ${SPACES[space].name}. It goes to auction.`);
      startAuction(s, space);
      return;
    }
    case 'bid': {
      const amount = Math.floor(Number(a.amount));
      if (!(amount > s.auction.bid)) fail(`Bid more than ${money(s.auction.bid)}`);
      if (amount > p.cash) fail('Not enough cash');
      s.auction.bid = amount;
      s.auction.bidder = p.id;
      s._log(`${p.name} bids ${money(amount)} for ${SPACES[s.auction.space].name}`);
      settleAuction(s);
      return;
    }
    case 'auctionPass': {
      s.auction.passed.push(p.id);
      s._log(`${p.name} is out of the auction`);
      settleAuction(s);
      return;
    }
    case 'propose': {
      const countering = s.trade && s.trade.to === p.id;
      if (countering && a.to !== s.trade.from) fail('Counter the player who offered');
      const t = validateTrade(s, p.id, a);
      s.trade = t;
      s._log(`${p.name} ${countering ? 'counters with' : `offers ${player(s, t.to).name} a trade:`} ${tradeText(s, t)}`);
      return;
    }
    case 'acceptTrade': {
      const t = s.trade;
      s.trade = null;
      validateTrade(s, t.from, t); // still valid? (cash or deeds may have moved since)
      applyTrade(s, t);
      s._log(`${p.name} accepts the trade: ${tradeText(s, t)}`);
      return;
    }
    case 'rejectTrade': {
      s._log(`${p.name} turns the trade down`);
      s.trade = null;
      return;
    }
    case 'cancelTrade': {
      s._log(`${p.name} withdraws the trade`);
      s.trade = null;
      return;
    }
    case 'jailPay': {
      p.cash -= JAIL_FINE;
      p.inJail = false;
      p.jailTurns = 0;
      s._log(`${p.name} pays ${money(JAIL_FINE)} to leave Jail`);
      return;
    }
    case 'jailCard': {
      p.jailFree--;
      p.inJail = false;
      p.jailTurns = 0;
      returnJailFree(s);
      s._log(`${p.name} uses a Get Out of Jail Free card`);
      return;
    }
    case 'endTurn': return endTurn(s);
    case 'build': {
      if (!canBuild(s, p.id, a.space)) fail("Can't build there");
      const sp = SPACES[a.space];
      p.cash -= sp.houseCost;
      s.props[a.space].houses++;
      s._log(`${p.name} builds ${s.props[a.space].houses === 5 ? 'a hotel' : 'a house'} on ${sp.name}`);
      return;
    }
    case 'sellHouse': {
      if (!canSellHouse(s, p.id, a.space)) fail("Can't sell there");
      const sp = SPACES[a.space];
      s.props[a.space].houses--;
      p.cash += sp.houseCost / 2;
      s._log(`${p.name} sells a building on ${sp.name} for ${money(sp.houseCost / 2)}`);
      return;
    }
    case 'mortgage': {
      if (!canMortgage(s, p.id, a.space)) fail("Can't mortgage that");
      const sp = SPACES[a.space];
      s.props[a.space].mortgaged = true;
      p.cash += sp.price / 2;
      s._log(`${p.name} mortgages ${sp.name} for ${money(sp.price / 2)}`);
      return;
    }
    case 'unmortgage': {
      if (!canUnmortgage(s, p.id, a.space)) fail("Can't lift that mortgage");
      const sp = SPACES[a.space];
      p.cash -= unmortgageCost(a.space);
      s.props[a.space].mortgaged = false;
      s._log(`${p.name} lifts the mortgage on ${sp.name}`);
      return;
    }
    case 'payDebt': {
      const total = debtTotal(s);
      if (p.cash < total) fail('Not enough cash');
      for (const it of s.debt.items) transfer(s, p, it.to, it.amount);
      s._log(`${p.name} settles up (${money(total)})`);
      s.debt = null;
      return;
    }
    case 'bankrupt': {
      const tos = new Set(s.debt.items.map((i) => i.to));
      const to = tos.size === 1 ? [...tos][0] : 'bank';
      s._log(`${p.name} is bankrupt`);
      goBankrupt(s, p, to);
      return;
    }
    default:
      fail(`Unknown action ${a.type}`);
  }
}

// ------------------------------------------------------------------ turn mechanics

function rollDice(rng, forced) {
  if (forced && forced.length === 2) return [forced[0], forced[1]];
  return [1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)];
}

function doRoll(s, p, rng, forced) {
  const dice = rollDice(rng, forced);
  s.dice = dice;
  const sum = dice[0] + dice[1];
  const isDouble = dice[0] === dice[1];

  if (s.pending?.type === 'utilityRoll') {
    const space = s.pending.space;
    s.pending = null;
    const amount = 10 * sum;
    s._log(`${p.name} rolls ${sum} and owes ${money(amount)} for ${SPACES[space].name}`);
    charge(s, p, s.props[space].owner, amount, `Rent for ${SPACES[space].name}`);
    return;
  }

  if (p.inJail) {
    if (isDouble) {
      p.inJail = false;
      p.jailTurns = 0;
      s._log(`${p.name} rolls doubles (${dice[0]}+${dice[1]}) and walks out of Jail`);
      s.rolled = true; // doubles out of jail do not earn another throw
      advance(s, p, sum);
      return;
    }
    p.jailTurns++;
    if (p.jailTurns >= 3) {
      p.inJail = false;
      p.jailTurns = 0;
      s._log(`${p.name} rolls ${dice[0]}+${dice[1]}: third try, pays ${money(JAIL_FINE)} and leaves Jail`);
      s.rolled = true;
      charge(s, p, 'bank', JAIL_FINE, 'Jail fine');
      advance(s, p, sum);
      return;
    }
    s._log(`${p.name} rolls ${dice[0]}+${dice[1]}, still in Jail`);
    s.rolled = true;
    return;
  }

  if (isDouble) {
    s.doubles++;
    if (s.doubles >= 3) {
      s._log(`${p.name} rolls a third double. Straight to Jail.`);
      s.rolled = true;
      sendToJail(s, p);
      return;
    }
    s.rolled = false; // roll again after this move resolves
    s._log(`${p.name} rolls ${dice[0]}+${dice[1]}, doubles!`);
  } else {
    s.rolled = true;
    s._log(`${p.name} rolls ${dice[0]}+${dice[1]}`);
  }
  advance(s, p, sum);
}

function advance(s, p, steps) {
  const from = p.pos;
  const to = (from + steps) % 40;
  if (to < from) {
    p.cash += GO_SALARY;
    s._log(`${p.name} passes GO and collects ${money(GO_SALARY)}`);
  }
  p.pos = to;
  land(s, p);
}

// Teleport (cards). Pays the GO salary when the trip wraps the board (or ends on GO).
function moveTo(s, p, to, collect = true) {
  if (collect && to <= p.pos) {
    p.cash += GO_SALARY;
    s._log(`${p.name} passes GO and collects ${money(GO_SALARY)}`);
  }
  p.pos = to;
  land(s, p);
}

function land(s, p) {
  const sp = SPACES[p.pos];
  switch (sp.type) {
    case 'street':
    case 'rail':
    case 'utility': {
      const pr = s.props[p.pos];
      if (!pr) {
        s.pending = { type: 'buy', space: p.pos };
        s._log(`${p.name} lands on ${sp.name} (${money(sp.price)}, for sale)`);
      } else if (pr.owner === p.id) {
        s._log(`${p.name} lands on ${sp.name} (their own)`);
      } else if (pr.mortgaged) {
        s._log(`${p.name} lands on ${sp.name} (mortgaged, no rent)`);
      } else {
        const rent = rentAt(s, p.pos, s.dice);
        s._log(`${p.name} lands on ${sp.name}: ${money(rent)} rent due to ${player(s, pr.owner).name}`);
        s.pending = { type: 'rent', space: p.pos, amount: rent, to: pr.owner };
      }
      return;
    }
    case 'tax':
      s._log(`${p.name} lands on ${sp.name}: ${money(sp.amount)} due`);
      s.pending = { type: 'tax', space: p.pos, amount: sp.amount };
      return;
    case 'chance': return drawCard(s, p, 'chance');
    case 'chest': return drawCard(s, p, 'chest');
    case 'gotojail':
      s._log(`${p.name} lands on Go To Jail`);
      sendToJail(s, p);
      return;
    case 'go':
      s._log(`${p.name} lands on GO`);
      return;
    case 'jail':
      s._log(`${p.name} is just visiting Jail`);
      return;
    case 'parking':
      s._log(`${p.name} lands on Free Parking`);
      return;
  }
}

function sendToJail(s, p) {
  p.pos = JAIL_POS;
  p.inJail = true;
  p.jailTurns = 0;
  s.rolled = true;
  s.doubles = 0;
}

function doBuy(s, p) {
  const space = s.pending.space;
  const sp = SPACES[space];
  p.cash -= sp.price;
  s.props[space] = { owner: p.id, houses: 0, mortgaged: false };
  s.pending = null;
  s._log(`${p.name} buys ${sp.name} for ${money(sp.price)}`);
}

function endTurn(s) {
  if (s.pending) fail('Finish what you landed on first');
  if (s.debt) fail('Settle your debt first');
  if (s.auction) fail('The auction is still on');
  const n = s.players.length;
  let i = s.turn;
  do i = (i + 1) % n; while (s.players[i].bankrupt);
  s.turn = i;
  s.rolled = false;
  s.doubles = 0;
  s.pending = null;
  s.card = null;
  s._log(`${current(s).name}'s turn`);
}

// ------------------------------------------------------------------ money

// Move cash. `to` is a player id or 'bank'. Caller guarantees `from` can pay.
function transfer(s, from, to, amount) {
  from.cash -= amount;
  if (to !== 'bank') player(s, to).cash += amount;
}

// Charge `p`; if they can't cover it, record a debt they must raise money for.
function charge(s, p, to, amount, reason) {
  if (amount <= 0) return;
  if (p.cash >= amount && !s.debt) {
    transfer(s, p, to, amount);
    return;
  }
  s.debt = s.debt || { items: [], reason };
  s.debt.items.push({ to, amount });
  s._log(`${p.name} can't cover ${money(amount)} and must raise cash`);
}

function goBankrupt(s, p, to) {
  // Buildings go back to the bank for half; everything else goes to the creditor.
  let cash = p.cash;
  for (const i of owned(s, p.id)) {
    const pr = s.props[i];
    if (pr.houses) {
      cash += (pr.houses * SPACES[i].houseCost) / 2;
      pr.houses = 0;
    }
    if (to === 'bank') delete s.props[i];
    else pr.owner = to;
  }
  if (to !== 'bank') {
    const c = player(s, to);
    c.cash += Math.max(0, cash);
    c.jailFree += p.jailFree;
    s._log(`${c.name} takes over everything ${p.name} had`);
  } else {
    for (let k = 0; k < p.jailFree; k++) returnJailFree(s);
    s._log(`${p.name}'s properties return to the bank`);
  }
  p.cash = 0;
  p.jailFree = 0;
  p.bankrupt = true;
  p.inJail = false;
  s.debt = null;
  s.pending = null;
  if (s.trade && (s.trade.from === p.id || s.trade.to === p.id)) s.trade = null;
  if (s.auction) {
    if (s.auction.bidder === p.id) {
      s.auction.bidder = null;
      s.auction.bid = 0;
    }
    if (!s.auction.passed.includes(p.id)) s.auction.passed.push(p.id);
    settleAuction(s);
    if (s.auction && current(s).id === p.id) {
      // Host removed the player whose turn it was mid-auction: call it off.
      s._log(`Auction for ${SPACES[s.auction.space].name} is called off`);
      s.auction = null;
    }
  }

  const left = alive(s);
  if (left.length === 1) {
    s.phase = 'over';
    s.winner = left[0].id;
    s._log(`${left[0].name} wins!`);
    return;
  }
  if (current(s).id === p.id) {
    s.rolled = true;
    endTurn(s);
  }
}

// ------------------------------------------------------------------ cards

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// A Get Out of Jail Free card that is handed back goes to the bottom of its deck.
function returnJailFree(s) {
  for (const [deck, cards] of [['chance', CHANCE], ['chest', CHEST]]) {
    const idx = cards.findIndex((c) => c.effect.jailFree);
    if (!s.decks[deck].includes(idx)) {
      s.decks[deck].push(idx);
      return;
    }
  }
}

// Drawing shows the card to everyone; the player then taps to apply it (cardOk).
function drawCard(s, p, deck) {
  const cards = deck === 'chance' ? CHANCE : CHEST;
  const idx = s.decks[deck].shift();
  const card = cards[idx];
  s.card = { deck, text: card.text, by: p.id };
  s.pending = { type: 'card', deck, idx };
  s._log(`${p.name} draws ${deck === 'chance' ? 'Chance' : 'Community Chest'}: "${card.text}"`);
}

// The card a pending 'card' refers to.
export const pendingCard = (s) => (s.pending?.type === 'card' ? (s.pending.deck === 'chance' ? CHANCE : CHEST)[s.pending.idx] : null);

// What the player's button should say for the card in front of them.
export function cardButtonLabel(card, s, id) {
  const e = card.effect;
  if (e.cash > 0) return `Collect ${money(e.cash)}`;
  if (e.cash < 0) return `Pay ${money(-e.cash)}`;
  if (e.each > 0) return `Collect ${money(e.each)} from each player`;
  if (e.each < 0) return `Pay ${money(-e.each)} to each player`;
  if (e.repairs) {
    let total = 0;
    for (const i of owned(s, id)) {
      const h = s.props[i].houses;
      total += h === 5 ? e.repairs[1] : h * e.repairs[0];
    }
    return total ? `Pay ${money(total)}` : 'Nothing to repair';
  }
  if (e.jail) return 'Go to Jail';
  if (e.jailFree) return 'Keep the card';
  return 'Go';
}

function applyCard(s, p, deck, idx) {
  const cards = deck === 'chance' ? CHANCE : CHEST;
  const card = cards[idx];
  const e = card.effect;
  if (e.jailFree) {
    p.jailFree++; // kept by the player, not returned to the deck yet
  } else {
    s.decks[deck].push(idx);
  }
  if (e.cash) {
    if (e.cash > 0) p.cash += e.cash;
    else charge(s, p, 'bank', -e.cash, card.text);
  } else if (e.each) {
    const others = alive(s).filter((o) => o.id !== p.id);
    if (e.each > 0) {
      // Others pay what they can; a $10 shortfall is not worth a debt round on their behalf.
      for (const o of others) {
        const paid = Math.min(o.cash, e.each);
        transfer(s, o, p.id, paid);
        if (paid < e.each) s._log(`${o.name} only had ${money(paid)}`);
      }
    } else {
      for (const o of others) charge(s, p, o.id, -e.each, card.text);
    }
  } else if (e.repairs) {
    let total = 0;
    for (const i of owned(s, p.id)) {
      const h = s.props[i].houses;
      total += h === 5 ? e.repairs[1] : h * e.repairs[0];
    }
    if (total) charge(s, p, 'bank', total, card.text);
  } else if (e.jail) {
    sendToJail(s, p);
  } else if (e.move) {
    p.pos = (p.pos + e.move + 40) % 40;
    land(s, p);
  } else if (e.to !== undefined) {
    moveTo(s, p, e.to, true);
  } else if (e.nearest) {
    let i = p.pos;
    do i = (i + 1) % 40; while (SPACES[i].type !== e.nearest);
    if (i <= p.pos) {
      p.cash += GO_SALARY;
      s._log(`${p.name} passes GO and collects ${money(GO_SALARY)}`);
    }
    p.pos = i;
    const sp = SPACES[i];
    const pr = s.props[i];
    if (!pr) {
      s.pending = { type: 'buy', space: i };
      s._log(`${p.name} arrives at ${sp.name} (${money(sp.price)}, for sale)`);
    } else if (pr.owner === p.id || pr.mortgaged) {
      s._log(`${p.name} arrives at ${sp.name}, no rent due`);
    } else if (e.nearest === 'rail') {
      const rent = rentAt(s, i, s.dice) * 2;
      s._log(`${p.name} arrives at ${sp.name}: double rent ${money(rent)} due to ${player(s, pr.owner).name}`);
      s.pending = { type: 'rent', space: i, amount: rent, to: pr.owner, double: true };
    } else {
      s.pending = { type: 'utilityRoll', space: i };
      s._log(`${p.name} arrives at ${sp.name}: roll again and pay 10× the throw`);
    }
  }
}

// ------------------------------------------------------------------ auctions

function startAuction(s, space) {
  s.auction = { space, bid: 0, bidder: null, passed: [] };
  settleAuction(s); // a lone player simply doesn't get it
}

// Ends the auction once everyone but the high bidder has passed (or everyone has).
function settleAuction(s) {
  const a = s.auction;
  if (!a) return;
  const still = alive(s).filter((p) => !a.passed.includes(p.id));
  const sp = SPACES[a.space];
  if (a.bidder && still.length === 1 && still[0].id === a.bidder) {
    const w = player(s, a.bidder);
    w.cash -= a.bid;
    s.props[a.space] = { owner: w.id, houses: 0, mortgaged: false };
    s._log(`${w.name} wins ${sp.name} at auction for ${money(a.bid)}`);
    s.auction = null;
  } else if (still.length === 0 || (!a.bidder && still.length <= 1)) {
    s._log(`Nobody wants ${sp.name}; it stays with the bank`);
    s.auction = null;
  }
}

// ------------------------------------------------------------------ trades

const tradeProps = (list) => [...new Set((list || []).map(Number).filter((i) => Number.isInteger(i)))];

// Checks an offer and returns it in canonical shape. Buildings must be sold first;
// mortgaged deeds move as they are.
function validateTrade(s, fromId, a) {
  const from = player(s, fromId);
  const to = player(s, a.to);
  if (!to || to.bankrupt || to.id === fromId) fail('Pick another player');
  const give = { cash: Math.max(0, Math.floor(Number(a.give?.cash) || 0)), props: tradeProps(a.give?.props) };
  const get = { cash: Math.max(0, Math.floor(Number(a.get?.cash) || 0)), props: tradeProps(a.get?.props) };
  if (give.cash > from.cash) fail(`${from.name} doesn't have ${money(give.cash)}`);
  if (get.cash > to.cash) fail(`${to.name} doesn't have ${money(get.cash)}`);
  for (const i of give.props) {
    if (s.props[i]?.owner !== fromId) fail(`${from.name} doesn't own ${SPACES[i].name}`);
    if (s.props[i].houses) fail(`Sell the buildings on ${SPACES[i].name} first`);
  }
  for (const i of get.props) {
    if (s.props[i]?.owner !== to.id) fail(`${to.name} doesn't own ${SPACES[i].name}`);
    if (s.props[i].houses) fail(`${SPACES[i].name} has buildings on it`);
  }
  if (!give.cash && !get.cash && !give.props.length && !get.props.length) fail('Offer something');
  return { from: fromId, to: to.id, give, get };
}

function applyTrade(s, t) {
  const from = player(s, t.from);
  const to = player(s, t.to);
  from.cash -= t.give.cash;
  to.cash += t.give.cash;
  to.cash -= t.get.cash;
  from.cash += t.get.cash;
  for (const i of t.give.props) s.props[i].owner = to.id;
  for (const i of t.get.props) s.props[i].owner = from.id;
}

export function tradeText(s, t) {
  const side = (x) => [...x.props.map((i) => SPACES[i].name), x.cash ? money(x.cash) : ''].filter(Boolean).join(' + ') || 'nothing';
  return `${side(t.give)} for ${side(t.get)}`;
}
