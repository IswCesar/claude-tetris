# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A classic Tetris implementation in vanilla JavaScript with HTML5 Canvas. No dependencies, no build step, no package.json, no tests — three files (`index.html`, `style.css`, `game.js`) that cooperate directly.

## Running the game

Open `index.html` directly in a browser, or serve it statically:

```bash
python3 -m http.server 8000
# or
npx serve .
```

Then visit `http://localhost:8000`. There is no build, lint, or test command — changes to `game.js`/`style.css`/`index.html` take effect on browser reload.

## Architecture

All game logic lives in `game.js` as top-level state and functions (no classes, no modules). Key pieces:

- **Board model**: `board` is a `ROWS × COLS` matrix where each cell is `0` (empty) or a color index `1–7` identifying which piece type occupies it.
- **Pieces**: `PIECES` defines the 7 tetrominoes as square matrices. Rotation is done by `rotateCW` (transpose + reverse), not by pre-defined rotation states.
- **Collision** (`collide`): checks board bounds and overlap with locked cells for a given shape/offset.
- **Wall kicks** (`tryRotate`): on rotation collision, tries horizontal offsets `[0, -1, 1, -2, 2]` before giving up on the rotation.
- **Game loop** (`loop`): driven by `requestAnimationFrame`, accumulates elapsed time in `dropAccum` and advances the piece one row when it exceeds `dropInterval`.
- **Line clearing** (`clearLines`): scans bottom-to-top, splices full rows out and unshifts empty rows at the top.
- **Scoring**: `LINE_SCORES = [0, 100, 300, 500, 800]` multiplied by current `level`; hard drop adds 2 points/row dropped, soft drop adds 1 point/row.
- **Leveling/speed**: level increases every 10 lines; `dropInterval = max(100, 1000 - (level - 1) * 90)` ms.
- **Ghost piece**: `ghostY()` projects the current piece straight down to its landing row; drawn via `drawBlock(..., alpha=0.2)`.

Control flow: `init()` builds the board and starts the loop → `loop()` ticks gravity and calls `draw()` each frame → keyboard events (`keydown`) handle move/rotate/soft-drop/hard-drop/pause directly against the module-level `current` piece state. `spawn()` promotes `next` to `current`, generates a new `next`, and triggers `endGame()` if the new piece immediately collides.

## Tunable constants (top of `game.js`)

`COLS`, `ROWS`, `BLOCK` (cell size in px), `COLORS` (per-piece palette), `LINE_SCORES`, `dropInterval` (initial fall speed). If `COLS`/`ROWS`/`BLOCK` change, update the `<canvas id="board">` `width`/`height` in `index.html` to match (`COLS × BLOCK`, `ROWS × BLOCK`).
