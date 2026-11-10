# RIFT BOOTS

Arcade Jar's vertical pixel action game. Three controls: left, right, jump/fire.
On solid ground the action button jumps; airborne it shoots down with recoil.
Safe enemy stomps reload the boots. Spiked enemies hurt on contact.

Four zones contain three procedural floors each. Every floor guarantees two
Time Voids. Shops use gems earned **during this run**, not Hub's persistent
coin wallet. Lifetime collected gems unlock palettes and the Boulder style.
Ordinary platforms and Time Voids preserve combos; damage and the floor exit
reset them. Kill thresholds 8/15/25 grant 100 gems / one ammo capacity / one HP.

## Integration

- Game ID: `riftboots`, entry point: `games/riftboots/index.html`.
- Shared `../../hub-sdk.js`: initialization, autosave, leaderboard, invites,
  exit and completed-run submission. Scores are maximum depth in metres.
- `data.profile` stores lifetime gems, style, palette and best depth.
- `data.run` stores the floor seed, compact world changes, player, combo,
  shop state and offered perks. Resume preserves existing perk choices.
- The current-floor checkpoint is saved every four seconds and when hidden.
- No SQL changes or persistent shop catalog entries are required.

## Release

Deploy `supabase/functions/hub/index.ts` with `riftboots` in `GAMES` before
releasing the frontend. Preserve the existing Telegram signature validation
and the current `verify_jwt = false` configuration. Deploying Vercel alone
does not update the Supabase function. Merge the PR to the production branch
to trigger the existing Vercel Git deployment.

## Checks

Run `node tests/riftboots.cjs` from the repository root. Tests cover physics,
combat, rewards, all twelve floor transitions, safe generation, checkpoint
restore, stable perk choices, save size and Hub result submission.
