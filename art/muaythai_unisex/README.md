# Cute Unisex Muay Thai Avatar Fighter — Prototype Pack

This package follows the approved direction: cute/unisex chibi body, short-sleeved jersey, matching Muay Thai shorts, gloves/wraps, no drawn head/face/hair, and a runtime circular user avatar overlay.

## Included
- Red/Blue prototype `idle` and `punch` poses (transparent PNG, 480x528 canvas).
- Two-pose atlases per team (960x528).
- Magenta marker-circle starter files for head position.
- `manifest.json` style and dimensions.

## Important status
This is a **prototype package, not a production-complete animation pack**. The approved illustration only contains two poses. Other required actions (`walk`, `kick`, `block`, `hit`, `knockdown`, `victory`, `defeat`) and frame-by-frame animation must still be drawn. The marker circle is a starter marker and has not been verified to exactly match a finalized avatar placement for every pose. Do not use placeholder marker coordinates as final game data.

## Files
- `prototype/red/idle/idle_prototype.png`
- `prototype/red/punch/punch_prototype.png`
- `prototype/blue/...`
- `red_prototype_atlas.png`, `blue_prototype_atlas.png`
- `marker/{red,blue}/{idle,punch}/...png`

## Claude Code instructions
Read the project first. Use the prototype images as style/shape references only. Implement the animation system with the existing game conventions, then create the remaining action poses in the same approved style. Preserve the avatar as a runtime overlay and generate accurate marker images only after each final pose is fixed. Do not claim duplicated/static frames are animations.

Target art specification from user: 480x528, 10:11, PNG RGBA, feet aligned consistently, facing right in source files (blue flipped by game), 8 FPS loops for idle/walk/block; attack timings per game.
