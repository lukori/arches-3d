# Arches 3D

A 3D version of [Arches Zoom](https://github.com/lukori/arches-zoom). There are no images: the pink room, lavender hall, yellow arch and rainbow corridor are built and lit in three.js. Walking toward the webcam moves the camera down the corridor.

Live: https://lukori.github.io/arches-3d/

## How it works

- Silhouette logic is the same as the 2D piece. The webcam is shrunk to 160×120 and thresholded, then the black pixels are counted. After 30 frames that count becomes the baseline.
- How far you walk = (silhouette − baseline) / (baseline × `range`), from 0 to 1, eased by `smoothing` each frame. With `range` 0.5 you reach the end at 1.5× the baseline, the same as the 2D zoom reaching 10×.
- The camera follows a **route**: a list of `[x, z]` points in `ROUTES` in `main.js`. The walk position (0–1) is a point along that route, and the camera looks where the route is heading.
- Without a camera, scroll or the ↑/↓ keys walk the route.

## Rooms and routes

| Route | URL | Path |
|---|---|---|
| `main` | `?` (default) | straight through all the arches into the pink room |
| `yellow` | `?route=yellow` | turns right in the lavender hall, through a side door into the yellow room |

To add a room: build it in the "The building" section, open a doorway with `archWall`, and add a route.
Choosing the route live (e.g. leaning left/right) isn't built yet.

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

Lighting: Neutral tone mapping at exposure 0.85. ACES washed the pastels out to near-white.
