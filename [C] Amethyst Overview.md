# Amethyst — Overview

A property-trading board game (Monopoly-styled, own street names) for phones. One phone is the **table** (shows the board, runs the rules); friends **join with its 4-letter code**. Same phone-to-phone plumbing as Sapphire (PeerJS/WebRTC, no server, no accounts).

## State (2026-10-11, end of session 3)
- **Live: https://oluwaferanmi7.github.io/amethyst/** (repo Oluwaferanmi7/amethyst, public; every push to main redeploys in ~20 s).
- **Feranmi's session-2 feedback, all built:**
  - Nothing teleports. `app/js/anim.js` shows states one at a time: 3D CSS dice tumble in from the sides (~1.1 s), then every token that moved hops square by square (150 ms/step, tick sound; backwards for "go back 3"; a jump + sound for jail). Prompts only appear once the token has landed. Both the table and the player phones animate.
  - Landing on something is now an event you see and tap: rent, tax and drawn cards set `s.pending` (`rent`/`tax`/`card`) and wait for `pay` / `cardOk`. Everyone sees the banner or the flipped card under the board ("Ann landed on Oak Terrace · rent $14 to Bob"); the acting player has the button ("Pay $14 to Bob", "Collect $100", "Go to Jail", "Go"). Cash changes float up (+$14 / −$14) on the header and the players strip. The board centre only holds the dice + whose turn (and the auction notice).
  - Tap your own piece on the board to roll (it pulses on your turn).
  - Hand kept calm: header with cash, a row of colour **deed chips** (tap for the deed card), the one thing to do now, trade box, "My deeds" folded (auto-opens when you can build or are in debt), players, log folded.
  - Trades: the receiver can **Counter** (form pre-filled from their offer, swapped); engine allows `propose` by the receiver while an offer is pending.
  - Jail: engine verified + regression test: rolling 10 from GO = just visiting (end turn, roll normally next turn). On the board, jailed tokens sit in a barred box in the Jail cell, visitors in the open corner. What Feranmi most likely saw was a "Go to Jail" card teleporting the token with only the small centre text (no animation): exactly what the card prompt + hop fix.
- `npm test` → 28/28 (new: pending prompts, visiting jail, counter-offer).
- Dev server moved to **port 8766** (Topaz holds 8765).
- Verified 2026-10-11 in two tabs: dice tumble → hop → Chance card flip on both phones → "Go" → backwards hop to Income Tax → banner on both phones → Pay → −$200 floats → Bob rolls by tapping his piece → deed card + Buy/Pass at phone size.

- **2026-10-11 fixes from his first look:** dice showed 1:1 during the spin then snapped to the throw (the spin keyframes ended at zero rotation = face 1) → each face sets --fx/--fy and the spin ends on that orientation (verified: spinning cube's final transform === static cube's). Jail: siren sound (4 sweeps) + red/blue flash over the board + "🚔 X goes to Jail!" notice, ~1.8 s, before the token appears in the cell.

- **2026-10-11 afternoon (from his landscape photo):** places renamed after the Bible (`board.js`: brown Bethlehem/Nazareth · sky Jericho/Capernaum/Bethany · pink Hebron/Shiloh/Bethel · orange Samaria/Galilee/Joppa · red Damascus/Antioch/Ephesus · yellow Corinth/Philippi/Smyrna · green Babylon/Nineveh/Tyre · indigo Zion/Jerusalem · roads Emmaus Road, King's Highway, Via Maris, Appian Way · Lampstand + Jacob's Well · Temple Tax, Caesar's Tribute · Oasis). Names now printed on the cells (tiny bold, no mid-word breaks). **Landscape is the designed layout**: board fills the left (height-bound), the hand is a scrolling column on the right, safe-area insets on both sides for the Dynamic Island; manifest orientation = landscape; portrait still works with a "turn your phone sideways" hint. Felt table background + framed board with shadow. Deeds are now little **property cards** in the hand; tapping one opens a sheet with the deed info and its actions (build / sell / mortgage / lift), so the long deed list is gone. Sheet scrolls on short screens.
- Verified at 844×390 in two tabs: layout, names, Bob buys → card appears → tap → sheet with "Mortgage for $60", sheet fits/scrolls, Close reachable.

- **2026-10-11 evening, follow camera (he showed Monopoly GO's isometric view; agreed on a middle path, not a 3D city):** the board rests with a 7° tilt (CSS perspective); while the dice tumble the camera zooms 1.35× onto the roller, then 1.7× following the token each hop (pan = translate to the cell centre, then scale), siren frames 1.5×, and the landing frame eases back to 1× over 0.7 s. Dice now land ON the board next to the piece that threw them (smaller cubes, own tumble path) and stay there until the next throw. Camera vars are CSS custom properties on `.board` (`--z/--tx/--ty`, classes `zoomed`/`settle`); `keepBoardNode()` swaps the freshly rendered board for the previous node so CSS transitions glide between frames instead of jumping. Probed in the browser: vars correct, node persists across redraws, tilt present at rest.

- **2026-10-11 night, his verdict on v6 was "it's bad lol":** dice jumping to where the last throw landed read as teleporting. Reworked per his spec: **dice are an overlay fixed in the middle of the board area** (outside the camera transform, always centred, come back every turn; **tap the dice to roll**, they pulse + "tap to roll" pill on your roll). **Camera = whoever's turn it is**: rests at 1.45× on the current player's piece (also when the turn simply passes), 1.6× following them while they move, settles back to 1.45× on them. ⤡ now toggles "whole board" (camera off) instead of shrinking the board. Sampled in the browser every 300 ms during a roll: rest on Ann → ROLLING → 1.6× following 14→24 cell by cell → settle on her at 24. The whole-board overview is the ⤡ toggle now; nobody has asked for it to come back automatically.

- **2026-10-11, his screenshots of v7 ("the board can't look like this the entire game"):** resting at 1.45× on the current player meant the board was always a zoomed corner, and because the view centred on that player the centred dice looked like they followed them. Reworked to his exact order: **at rest the whole board shows** (zoom 1, dice in the centre) → roll: dice tumble on the full board → camera zooms (0.5 s) onto the piece about to move, dice fade out → glides with each hop → zooms back out (0.7 s) → dice fade back in at the centre. A turn passing without a move leaves the whole board as is. Sampled every 250 ms in the browser: rest/shown → ROLLING at rest → 1.6× following with dice hidden → rest/shown.

## Next
1. Feranmi plays a real game with the new build (sideways!).
2. Ideas not started: token movement sound per step is a plain tick (could be nicer), bank housing limit (32/12), trade history, a timer for slow bidders, locations/theme for street names (he mentioned it, then parked it).

## Dev notes
- `node tools/serve.mjs 8766` → http://localhost:8766 (8765 is Topaz). Open `?as=2` in a second tab for a second "phone" (separate code + storage).
- The service worker only registers on https, so localhost always serves fresh files.
- `link.js` is Sapphire's module with prefix `fera-am-v1-`; the app makes ONE Link in main.js and screens call `link.setHandlers(...)` (status callback deferred). Anything a handler touches must be a hoisted `function`, not a `const` declared later (bit us twice).

## Not done on purpose
Auctions when a buyer passes, player-to-player trades, bank housing shortage (32 houses / 12 hotels).
