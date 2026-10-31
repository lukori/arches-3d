# Arches 3D

A 3D version of [Arches Zoom](https://github.com/lukori/arches-zoom). There are no images: the pink room, lavender hall, yellow arch and rainbow corridor are built and lit in three.js. Walking toward the webcam moves the camera down the corridor.

Live: https://lukori.github.io/arches-3d/

## How it works

- The baseline frames only start counting after the camera's first second, so the baseline isn't taken while the Mac camera is still adjusting brightness. A too-low baseline sent the walk straight to the end.
- Silhouette logic is the same as the 2D piece. The webcam is shrunk to 160×120 and thresholded, then the black pixels are counted. After 30 frames that count becomes the baseline.
- How far you walk = (silhouette − baseline) / (baseline × `range`), from 0 to 1, eased by `smoothing` each frame. With `range` 0.5 you reach the end at 1.5× the baseline, the same as the 2D zoom reaching 10×.
- The camera follows a **route**: a list of `[x, z]` points in `ROUTES` in `main.js`. The walk position (0–1) is a point along that route, and the camera looks where the route is heading.
- Without a camera, scroll or the ↑/↓ keys walk the route.

## Rooms and the head turn

- The walk goes straight down the corridor into the pink end room.
- **Gray (lavender) hall = slow zone.** `grayHold` (0.3) of the whole walk is squeezed into the 1.7 m around the side door, so stepping forward or back there barely moves you while you turn your head. Natural share would be about 0.07.
- **Look right to go in.** In the gray hall a face tracker (MediaPipe Face Landmarker, loaded after the camera starts) measures head turn. Turned right more than `turnAngle` (25°) for `holdTime` (0.5 s) switches to the branch into the yellow room. Walking closer then moves you into the room.
- While you're in the gray hall the view turns a little with your head (`lookFollow` 0.5), so you see the doorway as you look at it.
- Stepping back out of the gray hall (toward the entrance) returns to the corridor.
- Face detection only runs in the gray hall, about 10 times a second. It's the heaviest part, so check fps there in `?debug`.
- If looking right is read as left, set `turnSign` to -1.
- Without a camera: ↑/↓ walk, hold → to "look right".
- `?route=yellow` goes into the yellow room without the head turn (for testing).

To add a room: build it in "The building", open a doorway with `archWall`, add a branch curve, and decide what switches to it.

## Controls

- Click or **F**: fullscreen
- **R**: reset the baseline
- `?debug`: silhouette preview, live numbers, +/− per parameter (the URL updates, so the tuned link can be copied), Save/Copy log

## Defaults

| Param | Value | Why |
|---|---|---|
| `range` | 0.5 | same as the 2D piece (end at 1.5× baseline) |
| `smoothing` | 0.1 | same as the 2D piece |
| `threshold` | 0.5 | p5 `THRESHOLD` default |
| `baselineFrames` | 30 | same as the 2D piece |
| `fov` | 60 | |
| `bloom` | 0.45 | soft glow on the light strips |
| `ao` | 1 | soft contact shading in corners and inside the arches (0 = off) |
| `shadows` | 1 | each room has one light high up that casts shadows (0 = off, faster). Read at load |
| `grayHold` | 0.3 | share of the walk spent in the gray hall (slow zone) |
| `turnAngle` | 25 | degrees of head turn right that count |
| `holdTime` | 0.5 | seconds to hold the turn, so a quick glance doesn't trigger it |
| `lookFollow` | 0.5 | how much the view follows your head in the gray hall |
| `turnSign` | 1 | -1 flips left/right |

Lighting: Neutral tone mapping at exposure 0.85. ACES washed the pastels out to near-white.

Ceilings are tall (entrance 10 m, lavender 7.5, yellow 6.5, rainbow 5.5, end 7) so the first view doesn't show the room as a box. Shadow maps are drawn once, because nothing in the building moves. Pixel ratio is capped at 1.5 for speed. If it stutters, try `?ao=0` and then `?shadows=0`.
