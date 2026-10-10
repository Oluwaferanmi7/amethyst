# Amethyst

A property-trading board game for phones. One phone is the **table** (shows the board and runs the rules); friends **join with its four-letter code**. Phones talk to each other directly over WebRTC (PeerJS), so there's no server, no account and nothing to host beyond these static files.

## Play

1. Open the app on every phone (add it to the home screen if you like).
2. One phone taps **Host a table** and reads out its code. The host can tap **I'm playing too** to take a seat.
3. Everyone else taps **Join**, types the code and a name, picks a token.
4. The table taps **Start game**. Every phone shows the board on top and that player's hand under it: roll, buy, build, mortgage, trade, end turn. The ⤡ button shrinks the board, 🔊 mutes the sounds.

Everyone needs internet. A phone that locks or loses signal reconnects on its own and lands back in the same seat.

## Rules in this version

Standard house-free rules: $1,500 to start, $200 for passing GO, doubles roll again (three in a row go to Jail), Jail by doubles, $50 or a card (third try pays), full colour sets double rent, houses must be built evenly, hotel after four houses, mortgages at half price and lifted at 110%, Chance and Community Chest decks, flat $200 income tax and $100 luxury tax. A player who can't pay must sell buildings or mortgage until they can, or declare bankruptcy (the creditor takes everything).

When a buyer passes, the deed goes to **auction**: everyone can bid from their phone, and it ends once all but the high bidder have passed. Any player can **propose a trade** (deeds and cash both ways) at any time; the other player accepts or declines on their phone. Not in yet: the bank's housing limit.

## Develop

```
npm test                 # rules engine, Node's built-in test runner
node tools/serve.mjs     # http://localhost:8765  (open ?as=2 in a second tab for a second "phone")
```

- `app/js/rules.js`: the whole game as a pure reducer. `reduce(state, action)` → new state or throws.
- `app/js/board.js`: streets, prices, rents, cards. Rename things here.
- `app/js/link.js`: phone-to-phone link (shared with Sapphire).
- `app/js/table.js` / `player.js` / `hand.js` / `render.js`: screens.

Pushing to `main` deploys `app/` to GitHub Pages.
