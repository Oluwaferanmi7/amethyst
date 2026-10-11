import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, reduce, legal, rentAt, current, player, debtTotal, canBuild } from '../app/js/rules.js';
import { SPACES, CHANCE, CHEST, START_CASH, GO_SALARY, JAIL_POS } from '../app/js/board.js';

// Deterministic "random": with j = floor(rng * (i + 1)) always equal to i, the shuffle
// leaves both decks in file order (card 0 of each deck is "Advance to GO").
const noRng = () => 0.999999;

function table(names = ['Ann', 'Bob']) {
  let s = newGame();
  names.forEach((name, i) => (s = reduce(s, { type: 'addPlayer', by: 'host', id: `p${i + 1}`, name })));
  return reduce(s, { type: 'start', by: 'host' }, noRng);
}
const roll = (s, dice, by = current(s).id) => reduce(s, { type: 'roll', by, dice }, noRng);
const act = (s, type, extra = {}) => reduce(s, { type, by: current(s).id, ...extra }, noRng);
// Tap through whatever the current player must acknowledge (rent, tax, a drawn card).
const settle = (s) => {
  for (let k = 0; k < 5 && s.pending && ['rent', 'tax', 'card'].includes(s.pending.type); k++) {
    s = reduce(s, { type: s.pending.type === 'card' ? 'cardOk' : 'pay', by: current(s).id }, noRng);
  }
  return s;
};
// Roll and tap through what follows.
const rollS = (s, dice, by = current(s).id) => settle(reduce(s, { type: 'roll', by, dice }, noRng));
// Pass on a purchase and let everyone sit out the auction.
const noBuy = (s) => {
  s = act(s, 'decline');
  for (const p of s.players) if (s.auction && !p.bankrupt && !s.auction.passed.includes(p.id)) s = reduce(s, { type: 'auctionPass', by: p.id }, noRng);
  return s;
};
const give = (s, id, space, houses = 0, mortgaged = false) => {
  s.props[space] = { owner: id, houses, mortgaged };
  return s;
};

test('lobby: players join, game needs two to start', () => {
  let s = newGame();
  assert.throws(() => reduce(s, { type: 'start', by: 'host' }));
  s = reduce(s, { type: 'addPlayer', by: 'host', id: 'a', name: 'Ann' });
  assert.throws(() => reduce(s, { type: 'start', by: 'host' }));
  s = reduce(s, { type: 'addPlayer', by: 'host', id: 'b', name: 'Bob' });
  s = reduce(s, { type: 'start', by: 'host' }, noRng);
  assert.equal(s.phase, 'play');
  assert.equal(s.players[0].cash, START_CASH);
  assert.notEqual(s.players[0].token, s.players[1].token);
  assert.equal(s.decks.chance.length, CHANCE.length);
});

test('roll, land on a street, buy it; then end turn', () => {
  let s = table();
  assert.deepEqual([...legal(s, 'p1')].filter((a) => a !== 'propose'), ['roll']);
  assert.deepEqual([...legal(s, 'p2')], ['propose'], 'not their turn, but they may offer a trade');
  s = roll(s, [1, 2]); // Harbor Lane (3), $60
  assert.equal(current(s).pos, 3);
  assert.deepEqual(s.pending, { type: 'buy', space: 3 });
  assert.ok(legal(s, 'p1').has('buy'));
  s = act(s, 'buy');
  assert.equal(player(s, 'p1').cash, START_CASH - 60);
  assert.equal(s.props[3].owner, 'p1');
  assert.ok(legal(s, 'p1').has('endTurn'));
  s = act(s, 'endTurn');
  assert.equal(current(s).id, 'p2');
});

test('declining leaves the property for sale once nobody bids', () => {
  let s = table();
  s = roll(s, [1, 2]);
  s = act(s, 'decline');
  assert.equal(s.auction.space, 3);
  s = reduce(s, { type: 'auctionPass', by: 'p1' }, noRng);
  assert.equal(s.auction, null, 'one player left with no bid: over');
  assert.equal(s.props[3], undefined);
  assert.equal(s.pending, null);
});

test('rent: single street, full set doubles, houses use the table, mortgaged pays nothing', () => {
  let s = table();
  give(s, 'p2', 1); // Old Mill Road base rent 2
  assert.equal(rentAt(s, 1), 2);
  give(s, 'p2', 3); // full brown set
  assert.equal(rentAt(s, 1), 4);
  s.props[1].houses = 3;
  assert.equal(rentAt(s, 1), 90);
  s.props[1].houses = 5;
  assert.equal(rentAt(s, 1), 250);
  s.props[1].mortgaged = true;
  assert.equal(rentAt(s, 1), 0);
});

test('landing on an owned street pays the owner', () => {
  let s = table();
  give(s, 'p2', 1);
  give(s, 'p2', 3);
  s = rollS(s, [1, 2]); // Harbor Lane, set owned → 4 x 2 = 8
  assert.equal(player(s, 'p1').cash, START_CASH - 8);
  assert.equal(player(s, 'p2').cash, START_CASH + 8);
  assert.equal(s.debt, null);
});

test('railroads and utilities scale with how many are owned', () => {
  let s = table();
  give(s, 'p2', 5);
  assert.equal(rentAt(s, 5), 25);
  give(s, 'p2', 15);
  give(s, 'p2', 25);
  give(s, 'p2', 35);
  assert.equal(rentAt(s, 5), 200);
  give(s, 'p2', 12);
  assert.equal(rentAt(s, 12, [3, 4]), 28);
  give(s, 'p2', 28);
  assert.equal(rentAt(s, 12, [3, 4]), 70);
});

test('passing GO pays the salary, landing on it too', () => {
  let s = table();
  s.players[0].pos = 38;
  s = roll(s, [1, 2]); // 38 + 3 = 41 → 1 (Old Mill Road)
  assert.equal(current(s).pos, 1);
  assert.equal(player(s, 'p1').cash, START_CASH + GO_SALARY);
  s = table();
  s.players[0].pos = 36;
  s = roll(s, [2, 2]); // doubles → 40 → GO
  assert.equal(current(s).pos, 0);
  assert.equal(player(s, 'p1').cash, START_CASH + GO_SALARY);
  assert.equal(s.rolled, false, 'doubles earn another roll');
});

test('doubles roll again; three doubles go to jail', () => {
  let s = table();
  s = rollS(s, [1, 1]); // → 2 Community Chest (file order deck: card 0 = Advance to GO)
  assert.equal(s.doubles, 1);
  assert.equal(s.rolled, false);
  assert.ok(legal(s, 'p1').has('roll'));
  s = rollS(s, [2, 2]);
  s = rollS(s, [3, 3]);
  const p = player(s, 'p1');
  assert.equal(p.inJail, true);
  assert.equal(p.pos, JAIL_POS);
  assert.ok(legal(s, 'p1').has('endTurn'));
});

test('go to jail space sends you to jail without salary', () => {
  let s = table();
  s.players[0].pos = 28;
  s = roll(s, [1, 1]); // 30 Go To Jail, even on doubles the turn ends
  assert.equal(player(s, 'p1').inJail, true);
  assert.equal(player(s, 'p1').pos, JAIL_POS);
  assert.equal(s.rolled, true);
  assert.equal(player(s, 'p1').cash, START_CASH);
});

test('jail: pay to leave, or roll doubles, or third try pays the fine', () => {
  let s = table();
  s.players[0].inJail = true;
  s.players[0].pos = JAIL_POS;
  const opts = legal(s, 'p1');
  assert.ok(opts.has('roll') && opts.has('jailPay') && !opts.has('jailCard'));

  // Pay first
  let a = act(s, 'jailPay');
  assert.equal(player(a, 'p1').inJail, false);
  assert.equal(player(a, 'p1').cash, START_CASH - 50);
  assert.ok(legal(a, 'p1').has('roll'));

  // Fail twice, third try pays and moves
  let b = roll(s, [1, 2]);
  assert.equal(player(b, 'p1').inJail, true);
  assert.ok(legal(b, 'p1').has('endTurn'));
  b = act(b, 'endTurn');
  b = roll(b, [1, 2], 'p2');
  b = noBuy(b);
  b = act(b, 'endTurn');
  b = roll(b, [1, 2]);
  b = act(b, 'endTurn');
  b = roll(b, [1, 2], 'p2'); // Maple Street, for sale
  b = noBuy(b);
  b = act(b, 'endTurn');
  b = roll(b, [1, 2]); // third try
  assert.equal(player(b, 'p1').inJail, false);
  assert.equal(player(b, 'p1').pos, JAIL_POS + 3);
  assert.equal(player(b, 'p1').cash, START_CASH - 50);

  // Doubles walk out, move, but no extra throw
  let c = roll(s, [2, 2]);
  assert.equal(player(c, 'p1').inJail, false);
  assert.equal(player(c, 'p1').pos, JAIL_POS + 4);
  assert.equal(c.rolled, true);
});

test('get out of jail free card is kept and usable', () => {
  let s = table();
  const idx = CHANCE.findIndex((c) => c.effect.jailFree);
  s.decks.chance = [idx, ...s.decks.chance.filter((i) => i !== idx)];
  s.players[0].pos = 4;
  s = rollS(s, [1, 2]); // 7 Chance
  assert.equal(player(s, 'p1').jailFree, 1);
  assert.equal(s.decks.chance.includes(idx), false, 'card is out of the deck while held');
  s.players[0].inJail = true;
  s.players[0].pos = JAIL_POS;
  s.rolled = false;
  s.pending = null;
  assert.ok(legal(s, 'p1').has('jailCard'));
  s = act(s, 'jailCard');
  assert.equal(player(s, 'p1').jailFree, 0);
  assert.equal(player(s, 'p1').inJail, false);
  assert.equal(s.decks.chance.at(-1), idx, 'card returns to the bottom of the deck');
});

test('taxes charge the bank', () => {
  let s = table();
  s = rollS(s, [1, 3]); // 4 Income Tax
  assert.equal(player(s, 'p1').cash, START_CASH - 200);
  s = table();
  s.players[0].pos = 36;
  s = rollS(s, [1, 1]); // 38 Luxury Tax
  assert.equal(player(s, 'p1').cash, START_CASH - 100);
});

test('chance cards: advance to GO, back three, pay each player, nearest rail doubles rent', () => {
  const chance = (effectPredicate) => CHANCE.findIndex((c) => effectPredicate(c.effect));
  const atChance = (idx, pos = 4) => {
    let s = table(['Ann', 'Bob', 'Cy']);
    s.decks.chance = [idx, ...s.decks.chance.filter((i) => i !== idx)];
    s.players[0].pos = pos;
    return s;
  };
  let s = atChance(chance((e) => e.to === 0));
  s = rollS(s, [1, 2]); // 7 Chance → GO
  assert.equal(player(s, 'p1').pos, 0);
  assert.equal(player(s, 'p1').cash, START_CASH + GO_SALARY);

  s = atChance(chance((e) => e.move === -3));
  s = rollS(s, [1, 2]); // 7 → back 3 → 4 Income Tax
  assert.equal(player(s, 'p1').pos, 4);
  assert.equal(player(s, 'p1').cash, START_CASH - 200);

  s = atChance(chance((e) => e.each === -50));
  s = rollS(s, [1, 2]);
  assert.equal(player(s, 'p1').cash, START_CASH - 100);
  assert.equal(player(s, 'p2').cash, START_CASH + 50);
  assert.equal(player(s, 'p3').cash, START_CASH + 50);

  s = atChance(chance((e) => e.nearest === 'rail'));
  give(s, 'p2', 15); // East Station, one rail → 25, doubled 50
  s = rollS(s, [1, 2]);
  assert.equal(player(s, 'p1').pos, 15);
  assert.equal(player(s, 'p1').cash, START_CASH - 50);
  assert.equal(player(s, 'p2').cash, START_CASH + 50);

  s = atChance(chance((e) => e.nearest === 'utility'));
  give(s, 'p2', 12);
  s = rollS(s, [1, 2]);
  assert.deepEqual(s.pending, { type: 'utilityRoll', space: 12 });
  assert.deepEqual([...legal(s, 'p1')].filter((a) => a !== 'propose'), ['roll']);
  s = roll(s, [4, 5]);
  assert.equal(player(s, 'p1').cash, START_CASH - 90);
  assert.equal(s.pending, null);

  s = atChance(chance((e) => e.to === 5), 33); // trip to North Station from the last Chance → passes GO
  s = rollS(s, [1, 2]); // 36 Chance
  assert.equal(player(s, 'p1').pos, 5);
  assert.equal(player(s, 'p1').cash, START_CASH + GO_SALARY);
  assert.deepEqual(s.pending, { type: 'buy', space: 5 });
});

test('community chest: repairs bill per building, birthday collects from everyone', () => {
  const chest = (pred) => CHEST.findIndex((c) => pred(c.effect));
  let s = table(['Ann', 'Bob', 'Cy']);
  s.decks.chest = [chest((e) => e.repairs), ...s.decks.chest.filter((i) => i !== chest((e) => e.repairs))];
  give(s, 'p1', 1, 3);
  give(s, 'p1', 3, 5);
  s = rollS(s, [1, 1]); // 2 Community Chest
  assert.equal(player(s, 'p1').cash, START_CASH - (3 * 40 + 115));

  s = table(['Ann', 'Bob', 'Cy']);
  const bday = chest((e) => e.each === 10);
  s.decks.chest = [bday, ...s.decks.chest.filter((i) => i !== bday)];
  s = rollS(s, [1, 1]);
  assert.equal(player(s, 'p1').cash, START_CASH + 20);
  assert.equal(player(s, 'p2').cash, START_CASH - 10);
});

test('building: full set, even build, hotel at five, sell back for half', () => {
  let s = table();
  give(s, 'p1', 1);
  assert.equal(canBuild(s, 'p1', 1), false, 'needs the full set');
  give(s, 'p1', 3);
  assert.equal(canBuild(s, 'p1', 1), true);
  s = act(s, 'build', { space: 1 });
  assert.equal(s.props[1].houses, 1);
  assert.equal(player(s, 'p1').cash, START_CASH - 50);
  assert.equal(canBuild(s, 'p1', 1), false, 'even build: the other street first');
  assert.equal(canBuild(s, 'p1', 3), true);
  s = act(s, 'build', { space: 3 });
  for (let k = 0; k < 4; k++) {
    s = act(s, 'build', { space: 1 });
    s = act(s, 'build', { space: 3 });
  }
  assert.equal(s.props[1].houses, 5);
  assert.equal(canBuild(s, 'p1', 1), false, 'hotel is the limit');
  assert.throws(() => act(s, 'build', { space: 1 }));
  assert.equal(legal(s, 'p1').has('sellHouse'), true);
  const cash = player(s, 'p1').cash;
  s = act(s, 'sellHouse', { space: 1 });
  assert.equal(player(s, 'p1').cash, cash + 25);
  assert.equal(s.props[1].houses, 4);
  assert.throws(() => act(s, 'sellHouse', { space: 1 }), /sell/); // even rule: sell from 3 first
});

test('mortgage pays half, lifting costs 110%, no mortgage with buildings in the set', () => {
  let s = table();
  give(s, 'p1', 6); // Maple Street $100
  s = act(s, 'mortgage', { space: 6 });
  assert.equal(player(s, 'p1').cash, START_CASH + 50);
  assert.equal(rentAt(s, 6), 0);
  s = act(s, 'unmortgage', { space: 6 });
  assert.equal(player(s, 'p1').cash, START_CASH + 50 - 55);
  give(s, 'p1', 8);
  give(s, 'p1', 9, 1);
  assert.equal(legal(s, 'p1').has('mortgage'), false);
});

test('debt: must raise cash, then pay; bankruptcy hands everything to the creditor', () => {
  let s = table();
  give(s, 'p2', 39, 5); // hotel on Amethyst Row, rent 2000
  give(s, 'p2', 37);
  give(s, 'p1', 1);
  give(s, 'p1', 3);
  s.players[0].pos = 36;
  s = rollS(s, [1, 2]); // 39
  assert.equal(debtTotal(s), 2000);
  assert.equal(player(s, 'p1').cash, START_CASH, 'cash untouched until paid');
  let opts = legal(s, 'p1');
  assert.ok(opts.has('mortgage') && opts.has('bankrupt') && !opts.has('payDebt') && !opts.has('endTurn'));
  s = act(s, 'mortgage', { space: 1 });
  assert.equal(player(s, 'p1').cash, START_CASH + 30);
  assert.throws(() => act(s, 'endTurn'));
  s = act(s, 'bankrupt');
  assert.equal(s.phase, 'over');
  assert.equal(s.winner, 'p2');
  assert.equal(s.props[1].owner, 'p2');
  assert.equal(s.props[1].mortgaged, true, 'mortgage travels with the deed');
  assert.equal(player(s, 'p2').cash, START_CASH + START_CASH + 30);
  assert.equal(player(s, 'p1').bankrupt, true);
});

test('debt can be paid once there is enough cash, and the game goes on with three players', () => {
  let s = table(['Ann', 'Bob', 'Cy']);
  give(s, 'p2', 39, 5);
  give(s, 'p2', 37);
  give(s, 'p1', 31);
  give(s, 'p1', 32);
  give(s, 'p1', 34);
  s.players[0].pos = 36;
  s = rollS(s, [1, 2]);
  s = act(s, 'mortgage', { space: 31 }); // +150
  s = act(s, 'mortgage', { space: 32 }); // +150
  s = act(s, 'mortgage', { space: 34 }); // +160 → 1960 still short
  assert.ok(!legal(s, 'p1').has('payDebt'));
  s.players[0].cash += 100; // pretend
  assert.ok(legal(s, 'p1').has('payDebt'));
  s = act(s, 'payDebt');
  assert.equal(s.debt, null);
  assert.equal(player(s, 'p1').cash, 60);
  assert.ok(legal(s, 'p1').has('endTurn'));
});

test('bankrupt to the bank clears the deeds; the host can forfeit a player', () => {
  let s = table(['Ann', 'Bob', 'Cy']);
  give(s, 'p1', 1, 2);
  give(s, 'p1', 3, 2);
  s = reduce(s, { type: 'forfeit', by: 'host', id: 'p1' });
  assert.equal(player(s, 'p1').bankrupt, true);
  assert.equal(s.props[1], undefined);
  assert.equal(current(s).id, 'p2', 'turn moved on');
  s = roll(s, [1, 2], 'p2');
  s = noBuy(s);
  s = act(s, 'endTurn');
  assert.equal(current(s).id, 'p3');
  s = roll(s, [1, 2], 'p3');
  s = noBuy(s);
  s = act(s, 'endTurn');
  assert.equal(current(s).id, 'p2', 'skips the bankrupt player');
});

test('illegal actions are refused with a reason', () => {
  let s = table();
  assert.throws(() => reduce(s, { type: 'roll', by: 'p2' }), /Not your turn/);
  assert.throws(() => reduce(s, { type: 'endTurn', by: 'p1' }), /Can't endTurn/);
  assert.throws(() => reduce(s, { type: 'roll', by: 'ghost' }), /not in this game/);
  s = roll(s, [1, 2]);
  assert.throws(() => reduce(s, { type: 'roll', by: 'p1' }), /Can't roll/);
});

test('auction: highest bidder wins when everyone else passes; the decliner may bid too', () => {
  let s = table(['Ann', 'Bob', 'Cy']);
  s = roll(s, [1, 2]); // Harbor Lane
  s = act(s, 'decline');
  assert.ok(legal(s, 'p2').has('bid') && legal(s, 'p3').has('bid') && legal(s, 'p1').has('bid'));
  assert.ok(!legal(s, 'p1').has('endTurn'));
  s = reduce(s, { type: 'bid', by: 'p2', amount: 30 }, noRng);
  assert.throws(() => reduce(s, { type: 'bid', by: 'p3', amount: 30 }, noRng), /more than/);
  assert.ok(!legal(s, 'p2').has('auctionPass'), 'the high bidder cannot pass');
  s = reduce(s, { type: 'bid', by: 'p1', amount: 45 }, noRng);
  s = reduce(s, { type: 'auctionPass', by: 'p3' }, noRng);
  s = reduce(s, { type: 'auctionPass', by: 'p2' }, noRng);
  assert.equal(s.auction, null);
  assert.equal(s.props[3].owner, 'p1');
  assert.equal(player(s, 'p1').cash, START_CASH - 45);
  assert.ok(legal(s, 'p1').has('endTurn'));
});

test('auction: a player who cannot afford the price can still decline into an auction', () => {
  let s = table();
  s.players[0].cash = 20;
  s = roll(s, [1, 2]);
  assert.ok(!legal(s, 'p1').has('buy') && legal(s, 'p1').has('decline'));
  s = act(s, 'decline');
  assert.ok(legal(s, 'p1').has('bid'));
  assert.throws(() => reduce(s, { type: 'bid', by: 'p1', amount: 25 }, noRng), /cash/);
});

test('trade: propose, accept moves deeds and cash both ways; reject clears it', () => {
  let s = table();
  give(s, 'p1', 1);
  give(s, 'p2', 3);
  give(s, 'p2', 5);
  const offer = { type: 'propose', by: 'p2', to: 'p1', give: { cash: 100, props: [3] }, get: { cash: 0, props: [1] } };
  s = reduce(s, offer, noRng); // Bob proposes on Ann's turn: allowed
  assert.equal(s.trade.from, 'p2');
  assert.deepEqual([...legal(s, 'p1')].filter((a) => a.includes('Trade')), ['acceptTrade', 'rejectTrade']);
  assert.ok(legal(s, 'p2').has('cancelTrade'));
  assert.throws(() => reduce(s, { ...offer, by: 'p2' }, noRng), /propose/, 'the proposer cannot re-propose while it is pending');
  let r = reduce(s, { type: 'rejectTrade', by: 'p1' }, noRng);
  assert.equal(r.trade, null);
  assert.equal(r.props[1].owner, 'p1');
  s = reduce(s, { type: 'acceptTrade', by: 'p1' }, noRng);
  assert.equal(s.trade, null);
  assert.equal(s.props[1].owner, 'p2');
  assert.equal(s.props[3].owner, 'p1');
  assert.equal(player(s, 'p1').cash, START_CASH + 100);
  assert.equal(player(s, 'p2').cash, START_CASH - 100);
});

test('trade: refuses buildings, deeds you do not own, cash you do not have, and empty offers', () => {
  let s = table();
  give(s, 'p1', 1, 2);
  give(s, 'p1', 3, 2);
  give(s, 'p2', 6);
  const t = (extra) => reduce(s, { type: 'propose', by: 'p1', to: 'p2', give: { cash: 0, props: [] }, get: { cash: 0, props: [] }, ...extra }, noRng);
  assert.throws(() => t({ give: { props: [1] } }), /buildings/);
  assert.throws(() => t({ give: { props: [6] } }), /doesn't own/);
  assert.throws(() => t({ give: { cash: 5000 } }), /doesn't have/);
  assert.throws(() => t({}), /Offer something/);
  assert.throws(() => t({ to: 'p1', give: { cash: 10 } }), /another player/);
  const ok = t({ get: { props: [6] }, give: { cash: 120 } });
  assert.equal(ok.trade.get.props[0], 6);
});

test('trade: accepting re-checks the offer after things changed', () => {
  let s = table();
  give(s, 'p1', 1);
  s = reduce(s, { type: 'propose', by: 'p1', to: 'p2', give: { cash: 0, props: [1] }, get: { cash: 300, props: [] } }, noRng);
  s.players[1].cash = 100; // Bob spent his money meanwhile
  assert.throws(() => reduce(s, { type: 'acceptTrade', by: 'p2' }, noRng), /doesn't have/);
});

test('rent, tax and cards wait for the player to tap before money moves', () => {
  let s = table();
  give(s, 'p2', 3);
  s = roll(s, [1, 2]);
  assert.deepEqual(s.pending, { type: 'rent', space: 3, amount: 4, to: 'p2' });
  assert.equal(player(s, 'p1').cash, START_CASH, 'nothing taken yet');
  assert.deepEqual([...legal(s, 'p1')].filter((a) => a !== 'propose'), ['pay']);
  s = act(s, 'pay');
  assert.equal(player(s, 'p1').cash, START_CASH - 4);
  assert.equal(player(s, 'p2').cash, START_CASH + 4);
  assert.ok(legal(s, 'p1').has('endTurn'));

  s = table();
  s = roll(s, [1, 3]); // Income Tax
  assert.equal(s.pending.type, 'tax');
  s = act(s, 'pay');
  assert.equal(player(s, 'p1').cash, START_CASH - 200);

  s = table();
  s = roll(s, [1, 1]); // Community Chest, card 0 = Advance to GO
  assert.equal(s.pending.type, 'card');
  assert.equal(s.card.text, CHEST[0].text);
  assert.equal(player(s, 'p1').pos, 2, 'not moved until tapped');
  s = act(s, 'cardOk');
  assert.equal(player(s, 'p1').pos, 0);
  assert.equal(player(s, 'p1').cash, START_CASH + GO_SALARY);
  assert.equal(s.rolled, false, 'doubles still earn another throw');
});

test('rolling 10 from GO is just visiting: no jail, free to move next turn', () => {
  let s = table();
  s = roll(s, [4, 6]);
  const a = player(s, 'p1');
  assert.equal(a.pos, JAIL_POS);
  assert.equal(a.inJail, false);
  assert.ok(legal(s, 'p1').has('endTurn'));
  s = act(s, 'endTurn');
  s = roll(s, [1, 2], 'p2');
  s = noBuy(s);
  s = act(s, 'endTurn');
  assert.ok(legal(s, 'p1').has('roll') && !legal(s, 'p1').has('jailPay'));
  s = roll(s, [2, 3]);
  assert.equal(player(s, 'p1').pos, 15);
});

test('trade: the receiver can counter instead of accepting', () => {
  let s = table();
  give(s, 'p1', 1);
  give(s, 'p2', 3);
  s = reduce(s, { type: 'propose', by: 'p1', to: 'p2', give: { cash: 0, props: [1] }, get: { cash: 50, props: [3] } }, noRng);
  assert.ok(legal(s, 'p2').has('propose'));
  assert.throws(() => reduce(s, { type: 'propose', by: 'p2', to: 'p2', give: { cash: 10 } }, noRng));
  s = reduce(s, { type: 'propose', by: 'p2', to: 'p1', give: { cash: 0, props: [3] }, get: { cash: 20, props: [1] } }, noRng);
  assert.equal(s.trade.from, 'p2');
  assert.equal(s.trade.to, 'p1');
  s = reduce(s, { type: 'acceptTrade', by: 'p1' }, noRng);
  assert.equal(s.props[1].owner, 'p2');
  assert.equal(s.props[3].owner, 'p1');
  assert.equal(player(s, 'p1').cash, START_CASH - 20);
});
