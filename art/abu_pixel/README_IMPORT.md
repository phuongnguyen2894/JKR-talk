# Abu Pixel Art - 4 Stages Package v2

Contains four accessory-free base character sprites for Abu, aligned to a shared 384x384 canvas.

## Included stages
- Stage 0: Baby
- Stage 1: Juvenile
- Stage 2: Adolescent
- Stage 3: Adult

## Import notes
- PNG, RGBA, transparent background.
- Canvas: 384 x 384 px.
- Facing: right.
- Baseline Y: 361 px.
- Use nearest-neighbor filtering to avoid blurring pixel edges.
- Each base sprite has NO clothing, NO accessory, NO held item, and NO baked ground shadow.
- Cosmetic items should be imported as separate overlays/layers and equipped at runtime.

## Contents
- `sprites/base/`: ready-to-place static stage PNGs.
- `source/`: source sheet and tight crops used for stage extraction.
- `manifest.json`: stage metadata.
- `preview_4_stages.png`: overview preview.

## QA status
This package provides four static concept sprites, not a complete animation pack. Stage silhouettes and pixel-art styling are approximate AI-generated art; inspect in-engine and polish manually before production release. No idle/walk/eat/play/sleep animation frames are included yet.
