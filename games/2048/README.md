# 2048 / MATERIALS

Classic 4×4 2048 with eight retained skins: Petri dish, crystals, stellar
evolution, origami, terminal, mercury, city and embroidery. The in-game
appearance selector changes the material without resetting board or score.
Swipe controls are primary; there are no on-screen direction buttons.
Keyboard arrows/WASD remain available on desktop. Numbers and synthesized
sound are optional; sound starts disabled. Demo scenes are not exposed in
the production UI.

## Integration

- ID `merge2048`, entry `games/2048/index.html`.
- Uses the shared Hub SDK for initialization, persistence, leaderboard,
  invitations, exit and score submission.
- `data.profile` stores high score, selected skin and number-label preference.
- `data.run` stores board, score, elapsed time, win/continue/game-over state
  and whether its result has been submitted.
- Saves after each completed move and preference change. Closing during
  an animation settles the move, including the spawned tile, before saving.
- Finished or replaced nonzero-score rounds submit once. The 2048 win screen
  allows continued play; it does not create a second round.
- The shared SDK's remote save now resolves after server acknowledgement,
  so this game's save queue can preserve request order.
- No SQL changes or shop catalog entries are required.

## Release and verification

Deploy the hub Edge Function with `merge2048` in `GAMES` before the frontend.
Preserve existing Telegram signature validation and `verify_jwt=false`.
Merge the PR to main for the existing Vercel Git deployment.

Run `node tests/merge2048.cjs`, `node tests/nightdrift.cjs` and
`node tests/riftboots.cjs`. Tests cover 1,200 directional plans, single-merge
rules, swipe events, all eight renderers, skin changes, save/reopen,
one-time results and remote save acknowledgement, plus existing games.
Live Telegram touch/render testing remains distinct from these simulations.
