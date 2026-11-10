# NIGHT DRIFT

Arcade Jar one-touch pixel sandboarding. Tap/Space jumps; hold in the air
to backflip, release before landing. Four biomes change scenery and mechanics:
wind ribbons, ruin ramps, canyon updrafts and protective oasis lotuses.

180 goals form 60 sets of three, unlocking six riders and longer bonuses.
Zen has no score, deaths or goal progression.

## Hub integration

- Game ID `nightdrift`; entry `games/nightdrift/index.html`.
- Uses the shared Hub SDK for profile saves, run checkpoints, leaderboard,
  invites, return to hub and completed-run submissions.
- `data.profile` stores goals, rider, lifetime coins, stats and best distance.
- `data.run` stores the seed, remaining objects, physics, score and effects.
  It includes an up-to-date profile for the SDK's four-second autosave.
- Both classic and Zen runs can be resumed. Only completed classic runs
  submit scores. The leaderboard ranks points; distance remains in profile.
- Collected coins track goal progress; there is no persistent coin shop.
- No SQL migration or `shop_items` changes are required.

## Release and verification

Deploy the hub Edge Function with `nightdrift` in `GAMES` before the frontend.
Keep the existing Telegram signature checks and `verify_jwt=false` setting.
Merge the PR to `main` for the existing Vercel Git integration.

Run `node tests/nightdrift.cjs` and `node tests/riftboots.cjs`.
Tests cover gameplay, Zen isolation, all goals, checkpoints, save size,
profile reopening and classic-only result submission through the real SDK.
The approved inline prototype is the visual reference; a live Telegram
playthrough is a separate check from these offline simulations.
