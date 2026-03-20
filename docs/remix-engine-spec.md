# The Remix Engine: Technical Architecture Spec v0.1

> "Every classic game is a canvas. Every cult film is a palette. The remix engine is the brush."
> — Brad Chen, 3am

## What Is the Remix Engine?

The remix engine is the core abstraction that transforms ystack from a game studio into a **platform**. Instead of building games from scratch, we build mashups: classic gameplay mechanics married to iconic film/cultural aesthetics.

Game 001: **SnakeY** (Snake × Tron) — shipped.
Game 002: **StackY** (Tetris × Willy Wonka) — shipping this weekend.
Game 003+: The engine makes this trivial.

## Architecture Overview

### Layer 1: Game Mechanics Core
Each classic game mechanic lives as an independent, tested module:
- `snake-core` — grid movement, collision, growth
- `tetris-core` — tetromino rotation (SRS), line clears, gravity
- `breakout-core` — ball physics, paddle, brick destruction
- Future cores plug in via the same interface

### Layer 2: Theme Engine
Themes are declarative configuration packages that reskin a core:
```
theme/
  manifest.json      # metadata, color palette, font stack
  sprites/            # visual assets
  sounds/             # audio assets  
  events.json         # maps game events to theme moments
  particles.json      # particle effect definitions
```

The **events.json** is where the magic happens. It maps generic game events to themed experiences:
```json
{
  "line_clear_4": {
    "animation": "golden-ticket-reveal",
    "sound": "oompa-loompa-fanfare",
    "particles": "chocolate-explosion",
    "screen_effect": "factory-gates-open"
  }
}
```

### Layer 3: Remix Compositor
The compositor takes a core + theme and produces a playable game:
1. Loads the game mechanic core
2. Applies the theme overlay
3. Wires up event mappings
4. Outputs a standalone game bundle

This is the key insight: **games are functions of (mechanics, aesthetics)**. The remix engine makes both pluggable.

## The Golden Ticket Mechanic (StackY × Wonka)

When a player achieves a 4-line clear (Tetris), they receive a Golden Ticket. The ticket:
1. Triggers a full-screen animation (Wonka factory gates opening)
2. Grants access to a "chocolate factory" bonus level
3. Unlocks the ability to remix — the player can now swap theme elements
4. **Player becomes creator** — this is the wedge into UGC

The 4-line clear → Golden Ticket → Creator pipeline is the entire business model in one interaction.

## Technical Stack
- **Runtime**: Browser-native, zero dependencies
- **Rendering**: Canvas API (proven with SnakeY)
- **State Management**: Pure functions, event-driven
- **Testing**: Jest + custom game-state assertions (Klaus's framework from SnakeY)
- **Build**: Vite, single-file output per game

## Shipping Timeline
- **Saturday 3/21**: StackY core mechanics (tetromino rotation, line clears, gravity)
- **Sunday 3/22**: Wonka theme applied, Golden Ticket event wired
- **Monday 3/23**: Polish, test suite, ship Game 002
- **Tuesday 3/24**: Remix engine abstraction extracted from Games 001 + 002

## Open Questions
1. Do we support mobile touch controls from day 1?
2. How do we handle theme licensing? (Wonka is public domain post-Dahl estate, need to verify)
3. Should the remix compositor run at build time or runtime?
4. When do we open the theme SDK to external creators?

## The Vision

Every game we ship proves the engine works. Every theme we apply proves the abstraction holds. By game 5, the engine builds itself. By game 10, creators are building for us. By game 50, we're the platform.

We're not building games. We're building the operating system for interactive entertainment remixes.

---
*Draft v0.1 — Brad Chen, Ship Day, March 20 2026*
*"The best time to architect a platform is the day you ship your first product."*
