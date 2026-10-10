# Amethyst — Overview

A property-trading board game (Monopoly-styled, own street names) for phones. One phone is the **table** (shows the board, runs the rules); friends **join with its 4-letter code**. Same phone-to-phone plumbing as Sapphire (PeerJS/WebRTC, no server, no accounts).

## State (2026-10-10, end of session 2)
- **Live: https://oluwaferanmi7.github.io/amethyst/** (repo Oluwaferanmi7/amethyst, public; every push to main redeploys in ~20 s).
- Rules engine `app/js/rules.js`: everything from session 1 plus **auctions** (pass → everyone bids from their phone; ends when all but the high bidder pass) and **trades** (anyone can propose deeds + cash both ways at any time; receiver accepts/declines; re-validated on accept). `npm test` → 25/25.
- **Board never leaves the screen** (Feranmi's ask): every screen = header, board pinned at the top (sticky), hand underneath. No tabs, no sheet. ⤡ shrinks the board to 62 % for small phones (remembered per phone).
- **Dice animation + synth sounds** (`app/js/sound.js`, no audio files): dice, cash in/out, card, your turn, auction/offer ping, win/lose. 🔊 toggle per phone.
- **Bugs from Feranmi's first real game, fixed:** (1) each screen made its own peer connection and never destroyed it, so after leaving a screen the phone's code was held by a ghost and the next screen could never register ("issues with the code") → one Link per app, screens swap handlers (`link.setHandlers`, status callback deferred with queueMicrotask). (2) New game didn't reach player phones: they drop any state with a lower seq, and a fresh game restarts seq → games now carry an `id`; phones only drop older states of the *same* game. (3) All native confirm() dialogs replaced with a two-tap "Tap again…" (`confirmTap` in render.js); confirm() blocked the page in the desktop browser and is ugly in a PWA.
- Home screen: "Continue the game in progress" / "Start a fresh table" when a saved game exists. Table ⋯ menu: remove a player, New game (same players).
- Verified 2026-10-10 in two tabs at phone size over the real peer server: roll, buy, pass → auction (bid, pass, win), trade (propose, accept, deeds + cash moved), leave + rejoin lands back in the seat, New game reaches the other phone.

## Next
1. Feranmi plays a real game on phones with the new build; report anything confusing.
2. Ideas not started: token movement animation, bank housing limit (32/12), a history of trades, a timer for slow bidders, nicer street names/theme.

## Dev notes
- `node tools/serve.mjs` → http://localhost:8765. Open `?as=2` in a second tab for a second "phone" (separate code + storage).
- The service worker only registers on https, so localhost always serves fresh files.
- `link.js` is Sapphire's module with prefix `fera-am-v1-`; its constructor calls onStatus synchronously, so screens declare `let link = null` before constructing it.

## Not done on purpose
Auctions when a buyer passes, player-to-player trades, bank housing shortage (32 houses / 12 hotels).
