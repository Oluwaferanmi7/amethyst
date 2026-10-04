# Amethyst — Overview

A property-trading board game (Monopoly-styled, own street names) for phones. One phone is the **table** (shows the board, runs the rules); friends **join with its 4-letter code**. Same phone-to-phone plumbing as Sapphire (PeerJS/WebRTC, no server, no accounts).

## State (2026-10-04, session 1)
- Rules engine `app/js/rules.js` complete for: roll, doubles, 3 doubles → jail, GO salary, buy/pass, rent (sets double, houses/hotels, stations by count, utilities by dice), taxes, all 32 Chance/Community Chest cards, jail (roll/pay/card, third try), build (even rule, hotel), sell houses, mortgage/lift, debt (must raise cash) and bankruptcy to creditor or bank, host forfeit, winner.
- Tests: `npm test` → 20/20 pass.
- UI written but **not yet opened in a browser**: home (host / join), lobby, table (board + players + log, host can play too via "My hand" sheet), player hand (Hand / Board / Log tabs, build/mortgage buttons).
- PWA bits: manifest, sw.js, icons.

## Next
1. Smoke-test in two browser tabs: `node tools/serve.mjs` → http://localhost:8765 (one tab Host, one tab Join). Fix layout/wiring bugs.
2. Put on GitHub Pages (new public repo `amethyst`, deploy `app/`). Feranmi to confirm repo creation.
3. Session 2: auctions, trading, resume after table crash, sounds.

## Not done on purpose
Auctions when a buyer passes, player-to-player trades, bank housing shortage (32 houses / 12 hotels).
