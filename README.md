# Strikefront

Strikefront is an original 3D tactical FPS browser prototype inspired by round-based attack-and-defend shooters. Infiltrate a compact city map, plant the bomb at Site A or B, and survive against defender bots until detonation. The game is designed for desktop mouse/keyboard and Android tablets with touch controls.

## Controls

- `WASD`: Move
- Mouse or right-side drag: Look
- Left click or `FIRE`: Shoot
- `R` or `RELOAD`: Reload
- `E` or `USE`: Plant / defuse
- `Shift`: Sprint
- `Esc`: Pause

## Development

```bash
pnpm install
PORT=3000 HOST=0.0.0.0 pnpm dev
```

Validation commands:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm smoke
```

The game uses Three.js, TypeScript, and Vite. It includes an original low-poly city map, round timer, defender bots, shooting, bomb sites, minimap, English HUD, and tablet touch controls. Online multiplayer and payments are intentionally out of scope for this local prototype.
