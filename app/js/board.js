// Board data: 40 spaces, colour groups, both card decks.
// Everything themed lives here (places from the Bible). Rename freely; the rules only
// look at `type`, `group`, `price`, `rent`, `houseCost` and the card `effect`s.

export const APP_NAME = 'Amethyst';
export const START_CASH = 1500;
export const GO_SALARY = 200;
export const JAIL_FINE = 50;
export const JAIL_POS = 10;

// Colour groups in board order. `house` = cost of one house (hotel costs the same).
export const GROUPS = {
  brown: { name: 'Brown', color: '#8b5a2b', house: 50 },
  sky: { name: 'Sky', color: '#7cc5e8', house: 50 },
  pink: { name: 'Pink', color: '#d94f9a', house: 100 },
  orange: { name: 'Orange', color: '#f28c28', house: 100 },
  red: { name: 'Red', color: '#d83a3a', house: 150 },
  yellow: { name: 'Yellow', color: '#f2c84b', house: 150 },
  green: { name: 'Green', color: '#2e9e5b', house: 200 },
  indigo: { name: 'Indigo', color: '#3b4bd6', house: 200 },
};

const S = (name, group, price, rent) => ({ type: 'street', name, group, price, rent, houseCost: GROUPS[group].house });
const RR = (name) => ({ type: 'rail', name, price: 200 });
const U = (name) => ({ type: 'utility', name, price: 150 });

// rent = [base, 1 house, 2, 3, 4, hotel]
export const SPACES = [
  { type: 'go', name: 'GO' },
  S('Bethlehem', 'brown', 60, [2, 10, 30, 90, 160, 250]),
  { type: 'chest', name: 'Community Chest' },
  S('Nazareth', 'brown', 60, [4, 20, 60, 180, 320, 450]),
  { type: 'tax', name: 'Temple Tax', amount: 200 },
  RR('Emmaus Road'),
  S('Jericho', 'sky', 100, [6, 30, 90, 270, 400, 550]),
  { type: 'chance', name: 'Chance' },
  S('Capernaum', 'sky', 100, [6, 30, 90, 270, 400, 550]),
  S('Bethany', 'sky', 120, [8, 40, 100, 300, 450, 600]),
  { type: 'jail', name: 'Jail' },
  S('Hebron', 'pink', 140, [10, 50, 150, 450, 625, 750]),
  U('Lampstand'),
  S('Shiloh', 'pink', 140, [10, 50, 150, 450, 625, 750]),
  S('Bethel', 'pink', 160, [12, 60, 180, 500, 700, 900]),
  RR("King's Highway"),
  S('Samaria', 'orange', 180, [14, 70, 200, 550, 750, 950]),
  { type: 'chest', name: 'Community Chest' },
  S('Galilee', 'orange', 180, [14, 70, 200, 550, 750, 950]),
  S('Joppa', 'orange', 200, [16, 80, 220, 600, 800, 1000]),
  { type: 'parking', name: 'Oasis' },
  S('Damascus', 'red', 220, [18, 90, 250, 700, 875, 1050]),
  { type: 'chance', name: 'Chance' },
  S('Antioch', 'red', 220, [18, 90, 250, 700, 875, 1050]),
  S('Ephesus', 'red', 240, [20, 100, 300, 750, 925, 1100]),
  RR('Via Maris'),
  S('Corinth', 'yellow', 260, [22, 110, 330, 800, 975, 1150]),
  S('Philippi', 'yellow', 260, [22, 110, 330, 800, 975, 1150]),
  U("Jacob's Well"),
  S('Smyrna', 'yellow', 280, [24, 120, 360, 850, 1025, 1200]),
  { type: 'gotojail', name: 'Go To Jail' },
  S('Babylon', 'green', 300, [26, 130, 390, 900, 1100, 1275]),
  S('Nineveh', 'green', 300, [26, 130, 390, 900, 1100, 1275]),
  { type: 'chest', name: 'Community Chest' },
  S('Tyre', 'green', 320, [28, 150, 450, 1000, 1200, 1400]),
  RR('Appian Way'),
  { type: 'chance', name: 'Chance' },
  S('Zion', 'indigo', 350, [35, 175, 500, 1100, 1300, 1500]),
  { type: 'tax', name: "Caesar's Tribute", amount: 100 },
  S('Jerusalem', 'indigo', 400, [50, 200, 600, 1400, 1700, 2000]),
];

export const RAIL_RENT = [0, 25, 50, 100, 200];
export const UTILITY_MULT = [0, 4, 10];

// Card effects:
//   { to: n, passGo: true }         move to space n, collecting salary if passing GO
//   { move: -3 }                    move back 3
//   { nearest: 'rail'|'utility' }   advance to the nearest one; rent x2 (rail) or dice x10 (utility)
//   { cash: n }                     bank pays (n>0) or you pay (n<0)
//   { each: n }                     every other player pays you n (n>0) or you pay each n (n<0)
//   { repairs: [house, hotel] }     pay per building
//   { jail: true } / { jailFree: true }
export const CHANCE = [
  { text: 'Advance to GO. Collect $200.', effect: { to: 0, passGo: true } },
  { text: 'Advance to Ephesus. If you pass GO, collect $200.', effect: { to: 24, passGo: true } },
  { text: 'Advance to Hebron. If you pass GO, collect $200.', effect: { to: 11, passGo: true } },
  { text: 'Advance to the nearest Utility. If owned, roll the dice and pay the owner 10× the throw.', effect: { nearest: 'utility' } },
  { text: 'Advance to the nearest Road. If owned, pay the owner twice the toll.', effect: { nearest: 'rail' } },
  { text: 'Advance to the nearest Road. If owned, pay the owner twice the toll.', effect: { nearest: 'rail' } },
  { text: 'The bank pays you a dividend of $50.', effect: { cash: 50 } },
  { text: 'Get out of Jail free. Keep this card until needed.', effect: { jailFree: true } },
  { text: 'Go back three spaces.', effect: { move: -3 } },
  { text: 'Go directly to Jail. Do not pass GO, do not collect $200.', effect: { jail: true } },
  { text: 'Make general repairs on all your property: $25 per house, $100 per hotel.', effect: { repairs: [25, 100] } },
  { text: 'Speeding fine. Pay $15.', effect: { cash: -15 } },
  { text: 'Take the Emmaus Road. If you pass GO, collect $200.', effect: { to: 5, passGo: true } },
  { text: 'Go up to Jerusalem.', effect: { to: 39, passGo: false } },
  { text: 'You have been elected chairman of the board. Pay each player $50.', effect: { each: -50 } },
  { text: 'Your building loan matures. Collect $150.', effect: { cash: 150 } },
];

export const CHEST = [
  { text: 'Advance to GO. Collect $200.', effect: { to: 0, passGo: true } },
  { text: 'Bank error in your favour. Collect $200.', effect: { cash: 200 } },
  { text: "Doctor's fee. Pay $50.", effect: { cash: -50 } },
  { text: 'From sale of stock you get $50.', effect: { cash: 50 } },
  { text: 'Get out of Jail free. Keep this card until needed.', effect: { jailFree: true } },
  { text: 'Go directly to Jail. Do not pass GO, do not collect $200.', effect: { jail: true } },
  { text: 'Holiday fund matures. Receive $100.', effect: { cash: 100 } },
  { text: 'Income tax refund. Collect $20.', effect: { cash: 20 } },
  { text: 'It is your birthday. Collect $10 from every player.', effect: { each: 10 } },
  { text: 'Life insurance matures. Collect $100.', effect: { cash: 100 } },
  { text: 'Pay hospital fees of $100.', effect: { cash: -100 } },
  { text: 'Pay school fees of $50.', effect: { cash: -50 } },
  { text: 'Receive $25 consultancy fee.', effect: { cash: 25 } },
  { text: 'You are assessed for street repairs: $40 per house, $115 per hotel.', effect: { repairs: [40, 115] } },
  { text: 'You have won second prize in a beauty contest. Collect $10.', effect: { cash: 10 } },
  { text: 'You inherit $100.', effect: { cash: 100 } },
];

export const TOKENS = ['🎩', '🐕', '🚗', '🚢', '🐈', '🦆', '🤖', '👟'];
export const PLAYER_COLORS = ['#e0565b', '#3d8bfd', '#36b37e', '#f5a623', '#a259ff', '#19b5c9', '#ff6fb5', '#8d99ae'];

export const groupSpaces = (group) => SPACES.map((s, i) => (s.group === group ? i : -1)).filter((i) => i >= 0);
