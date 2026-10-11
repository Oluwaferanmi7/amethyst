# Amethyst

A property-trading board game for phones, with places from the Bible (Bethlehem to Jerusalem, the Emmaus Road, Jacob's Well). One phone is the **table** (shows the board and runs the rules); friends **join with its four-letter code**. Phones talk to each other directly over WebRTC (PeerJS), so there's no server, no account and nothing to host beyond these static files.

## Play

1. Open the app on every phone (add it to the home screen if you like).
2. One phone taps **Host a table** and reads out its code. The host can tap **I'm playing too** to take a seat.
3. Everyone else taps **Join**, types the code and a name, picks a token.
4. The table taps **Start game**. **Hold the phone sideways**: the board fills the left, your hand (cash, what to do now, your deeds as cards) sits on the right. Upright still works with the hand below the board. The camera sits on whoever's turn it is. On your turn tap the dice in the middle (or Roll, or your own piece): the dice tumble, the camera follows your token as it hops square by square, then rests on you, and whatever you land on comes up as a card or a banner with one button: Buy / Pass, Pay rent, Pay tax, or the Chance / Community Chest card with Collect, Pay or Go. The ⤡ button shows the whole board instead of following, 🔊 mutes the sounds.

Everyone needs internet. A phone that locks or loses signal reconnects on its own and lands back in the same seat.

## Rules in this version

Standard house-free rules: $1,500 to start, $200 for passing GO, doubles roll again (three in a row go to Jail), Jail by doubles, $50 or a card (third try pays), full colour sets double rent, houses must be built evenly, hotel after four houses, mortgages at half price and lifted at 110%, Chance and Community Chest decks, flat $200 income tax and $100 luxury tax. A player who can't pay must sell buildings or mortgage until they can, or declare bankruptcy (the creditor takes everything).

When a buyer passes, the deed goes to **auction**: everyone can bid from their phone, and it ends once all but the high bidder have passed. Any player can **propose a trade** (deeds and cash both ways) at any time; the other player accepts, declines or **counters** with their own offer. Not in yet: the bank's housing limit.

## Develop

```
npm test                 # rules engine, Node's built-in test runner
node tools/serve.mjs 8766  # http://localhost:8766  (open ?as=2 in a second tab for a second "phone")
```

- `app/js/rules.js`: the whole game as a pure reducer. `reduce(state, action)` → new state or throws.
- `app/js/board.js`: streets, prices, rents, cards. Rename things here.
- `app/js/link.js`: phone-to-phone link (shared with Sapphire).
- `app/js/anim.js`: shows states one at a time, dice tumble then token hops with the camera following, before prompts appear.
- `app/js/sound.js`: synth sounds, no audio files.
- `app/js/table.js` / `player.js` / `hand.js` / `render.js`: screens.

Pushing to `main` deploys `app/` to GitHub Pages.
