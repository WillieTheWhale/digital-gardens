# Digital Gardens — landing page

A static, dependency-free landing page. The artwork is drawn live in the browser:
a small software renderer rasterises a 3D scene (hanging pothos, desks, compute
racks) into a grid of text glyphs, and the camera moves through that scene as
the page scrolls.

## Run it

Open `index.html` directly, or serve the folder:

```bash
python3 -m http.server 8000
```

To produce a single self-contained file for sharing:

```bash
node tools/bundle.mjs
```

## Deploying

Every push to `main` runs `.github/workflows/deploy.yml`, which checks that the
scripts parse, copies `index.html`, `css/`, `js/` and `assets/` into a clean
folder and publishes that to GitHub Pages. Nothing else in the repo is served.

## Layout

| File | What it holds |
| --- | --- |
| `index.html` | Markup and all the copy |
| `css/style.css` | Type, layout, colours of the page itself |
| `js/engine.js` | The glyph renderer, camera, and every ink colour used in the drawing |
| `js/flora.js` | The hanging planter: how vines and leaves are generated, grow and move |
| `js/room.js` | Desks, screens, chairs and racks |
| `js/main.js` | Scene contents, the scroll-driven camera path, pointer and sound |
| `assets/fonts/` | Instrument Serif and IBM Plex Mono (both SIL OFL, licences alongside) |

## Things you are likely to change

- **Copy** — edit `index.html`. Each `<section data-stage="n">` pairs with entry `n` of `KEYS` in `js/main.js`.
- **Contact address** — the "Get in touch" link in `index.html` points at a placeholder (`hello@digitalgardens.example`).
- **Background** — `--paper` in `css/style.css`.
- **Plant and furniture colours** — the theme block near the top of `js/engine.js`.
- **Camera framing per section** — `KEYS` in `js/main.js` (what it looks at, how wide, from where).
- **How lush the plants are** — the `DG.Plant({...})` options in `js/main.js` (`long`/`short` vine counts, `maxLen`, `leaf` size).

## Behaviour worth knowing

- Moving the pointer through the foliage brushes it; dragging turns the planters on their cords.
- Sound is off until the visitor turns it on (top right).
- `prefers-reduced-motion` skips the growth animation and calms the sway.
- If a device cannot hold frame rate the glyph grid coarsens by a step instead of stuttering.
- `?grown` skips the growth animation; `?fixed` disables the automatic coarsening. Both are for development.
