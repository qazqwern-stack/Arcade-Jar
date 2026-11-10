# ORBIT PINBALL

Classic pixel pinball with three palettes, three balls, spring launch,
powered flippers, bumpers, rollover multiplier, drop targets and NOVA mode.
The approved release has no on-screen gameplay buttons:

- Before launch, hold anywhere on the table and release the spring.
- During play, left/right table halves control their respective flippers.
- Independent fingers are supported; cancellation never fires the spring.
- Keyboard arrows/A/D and Space remain available on desktop.

## Integration

ID `orbitpinball`, entry `games/pinball/index.html`, shared Hub SDK.
`data.profile` stores best score and palette. `data.run` stores the ball,
remaining balls, score, multiplier, table lights/cooldowns, spinner and
flipper positions. A four-second checkpoint and visibility/pagehide saves
use the same ordered save queue. Resuming an in-flight ball grants 0.8 seconds
of ball-save grace and clears held inputs.

Completed or replaced nonzero-score games submit once. Scores and invites
are scoped to this game. The profile and current game are saved together;
finished games clear their run state. No SQL migration or shop data is needed.

## Release and checks

Deploy the updated Supabase hub with `orbitpinball` in `GAMES`, preserving
the existing Telegram signature validation and `verify_jwt=false`. Merge
the PR to main for the existing Vercel Git deployment.

Run `node tests/pinball.cjs`, `node tests/merge2048.cjs`,
`node tests/nightdrift.cjs` and `node tests/riftboots.cjs`.
The pinball checks cover touch input, spring, flippers, rails, scoring,
ball counting, full simulations, snapshot restoration, real SDK reopening,
palette persistence and one-time results. The approved interactive prototype
is the visual reference; live Telegram testing is separate from simulations.
