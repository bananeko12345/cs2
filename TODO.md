# Strikefront TODO

## Complete: original tactical FPS vertical slice

Strikefront is an original Three.js browser FPS inspired by round-based attack-and-defend shooters. The player infiltrates a compact city map, plants a bomb at Site A or B, and defends it against patrol bots.

Completed requirements:

- WASD movement, mouse look, left-click shooting, R reload, Shift sprint, and E plant/defuse.
- Android tablet support with a virtual movement stick, right-side drag look, FIRE, USE, and RELOAD buttons.
- Round timer, health, ammo, score, eliminations, minimap, bomb sites, start banner, pause screen, and result screen.
- English player-facing game text and English sharing metadata.
- Original game name, visual language, favicon, and generated bomb prop; no copied real-game UI or assets.
- Local single-player scope; online multiplayer and payments are out of scope.

Validation completed with `pnpm typecheck`, `pnpm test` (37 tests), `pnpm build`, and `pnpm smoke`. Smoke coverage includes desktop movement/bomb planting and an Android tablet emulation check for visible touch controls and starting a round.
