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

Live at https://williethewhale.github.io/digital-gardens/ and republished on
every push to `main`. Who does the publishing depends on
Settings → Pages → Source:

- **Deploy from a branch** (current): GitHub's own Pages build publishes the
  repository as it is. `.nojekyll` tells it to serve the files untouched.
- **GitHub Actions**: `.github/workflows/deploy.yml` takes over and publishes
  only `index.html`, `css/`, `js/` and `assets/`.

Either way that workflow runs on each push and checks that the scripts parse.

## Layout

| File | What it holds |
| --- | --- |
| `index.html` | Markup and all the copy |
| `css/style.css` | Type, layout, colours of the page itself |
| `js/engine.js` | The glyph renderer, camera, and every ink colour used in the drawing |
| `js/flora.js` | The hanging planter: how vines and leaves are generated, grow and move |
| `js/room.js` | Desks, screens, chairs and racks |
| `js/main.js` | Scene contents, the scroll-driven camera path, pointer and sound |
| `assets/icons/` | The logo: `favicon-32.png` and `favicon-64.png` for the browser tab, `logo.png` beside the name in the header |
| `assets/fonts/` | Redaction (MCKL, from redaction.us) for all text, and Departure Mono (Helena Zhang, from departuremono.com) for the nav, footer and the drawing. Both SIL OFL, licences alongside |

## Things you are likely to change

- **Copy** — edit `index.html`. Each `<section data-stage="n">` pairs with entry `n` of `KEYS` in `js/main.js`.
- **Contact address** — the "Get in touch" link in `index.html` (`hello@digitalgardens.space`).
- **Logo** — replace the three PNGs in `assets/icons/` (same names and sizes). It appears only in the tab and the header.
- **Fonts** — the `@font-face` rules and `--serif` / `--mono` in `css/style.css`, plus `DG.MONO` in `js/engine.js` for the drawing. Departure Mono is drawn on an 11px pixel grid, so keep it at multiples of 5.5px (16.5px, 11px). Redaction also comes in grades that break down into pixels (Redaction 10 to 100); they're in the download from redaction.us if you want one as an accent.
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
