/* Digital Gardens — engine.js
 *
 * A tiny software rasteriser. Instead of pixels it fills a grid of character
 * cells: every triangle, line and point lands in a cell with a depth, a
 * material, an "ink" amount (how heavy a glyph) and a "tone" (how dark a
 * colour). The grid is then printed with a pre-rendered glyph atlas.
 */
(function () {
  'use strict';
  const DG = (window.DG = window.DG || {});

  DG.MONO = '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';

  /* ---------- registries ---------- */
  const PAL = [];
  const GLY = [' '];
  const pal = (hex) => { let i = PAL.indexOf(hex); if (i < 0) i = PAL.push(hex) - 1; return i; };
  const gly = (ch) => { let i = GLY.indexOf(ch); if (i < 0) i = GLY.push(ch) - 1; return i; };

  const MATS = [null];
  /* ramp : glyphs from lightest to heaviest (a space prints nothing but still occludes)
   * dirs : glyphs for strokes running  |  /  -  \
   * cols : colours from lightest to darkest
   * wash : strength of the soft colour bleed printed underneath
   * fill : a flat colour painted behind the glyph, so the form reads as solid
   * jit  : how much per-cell noise perturbs the glyph choice            */
  function material(def) {
    const m = {
      ramp: Uint16Array.from([...def.ramp].map(gly)),
      dirs: Uint16Array.from([...(def.dirs || '|/-\\')].map(gly)),
      cols: Uint16Array.from(def.cols.map(pal)),
      wash: def.wash || 0,
      jit: def.jit === undefined ? 1 : def.jit,
      fill: def.fill ? [parseInt(def.fill.slice(1, 3), 16), parseInt(def.fill.slice(3, 5), 16), parseInt(def.fill.slice(5, 7), 16)] : null,
    };
    MATS.push(m);
    return MATS.length - 1;
  }

  /* ---------- theme: every ink on the page ---------- */
  // Paper is a cool light grey. Built things are white card with graphite edges; living things are green ink.
  const CARD = '#f6f7f8';
  const M = (DG.M = {
    LEAF: material({
      ramp: ':;=+coceao0O0698@8#',
      cols: ['#9fd44c', '#7fc74f', '#5bb851', '#3da552', '#27914f', '#177a49', '#0f6341', '#0a4c36'],
      wash: 0.6,
    }),
    LEAFB: material({
      ramp: ':;~=+=caeoao0O69@',
      cols: ['#9bd397', '#74c383', '#51ad74', '#349367', '#217b5b', '#15644f', '#0d4f44'],
      wash: 0.5,
    }),
    LEAFV: material({ ramp: ':;~+=coeo0', cols: ['#cfe04f', '#b7d844', '#9bcd49'], wash: 0.45 }),
    VEIN: material({ ramp: '|', cols: ['#a9dc72', '#86cb5f', '#66b856'] }),
    STEM: material({ ramp: '|', cols: ['#86b566', '#5b964d', '#3f7a43'] }),
    CORD: material({ ramp: '|', cols: ['#a9b0b5', '#8a9299', '#6d757c'] }),
    POT: material({ ramp: '    ·.·:-:-==~=+', cols: ['#c9ced2', '#b2b8bd', '#99a0a6', '#80888e', '#687077', '#51595f'], jit: 0.5, fill: CARD }),
    POTEDGE: material({ ramp: '-', dirs: '|/=\\', cols: ['#99a0a6', '#737b82', '#565e65'], fill: CARD }),
    SOIL: material({ ramp: ':;+x%#', cols: ['#737b82', '#565e65', '#3c4349'], fill: CARD }),
    FACE: material({ ramp: '          ··:', cols: ['#d2d6da', '#c0c5ca', '#abb1b7'], jit: 0.8, fill: CARD }),
    FEDGE: material({ ramp: '|', cols: ['#a7aeb4', '#868e95', '#666e76', '#474f56'], fill: CARD }),
    FSEEN: material({ ramp: '|', cols: ['#5bb851', '#27914f', '#177a49', '#0f6341'], fill: CARD, wash: 0.35 }),
    FLINE: material({ ramp: '|', dirs: '|/=\\', cols: ['#c9ced2', '#adb3b9', '#8f979e'], fill: CARD }),
    SCREEN: material({ ramp: ' .-=+<>/[]01a#', cols: ['#74c383', '#3da552', '#177a49'], wash: 0.3, fill: CARD }),
    KEYS: material({ ramp: '::', cols: ['#adb3b9', '#8f979e'], fill: CARD }),
    LED: material({ ramp: '·•*', cols: ['#b9c0c5', '#3da552', '#0f6341'], wash: 0.5, fill: CARD }),
    FLOOR: material({ ramp: '·', cols: ['#cdd1d5', '#b9bfc4'] }),
  });

  const PALRGB = () => PAL.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);

  /* ---------- the grid ---------- */
  class Grid {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.cols = this.rows = 0;
      this.atlas = document.createElement('canvas');
      this.washC = document.createElement('canvas');
      this.washS = document.createElement('canvas');
      this.fillC = document.createElement('canvas');
      this.A = 255; // opacity given to everything drawn until changed
      this.rgb = PALRGB();
      this.holes = [];
      this.drawn = 0;
    }

    resize(wCss, hCss, dpr, cellCss) {
      const cs = Math.max(4, Math.round(cellCss * dpr));
      this.cs = cs;
      this.dpr = dpr;
      this.cell = cs / dpr;
      const c = this.canvas;
      c.width = Math.round(wCss * dpr);
      c.height = Math.round(hCss * dpr);
      const cols = (this.cols = Math.ceil(c.width / cs));
      const rows = (this.rows = Math.ceil(c.height / cs));
      const n = cols * rows;
      this.n = n;
      this.z = new Float32Array(n);
      this.mat = new Uint8Array(n);
      this.ink = new Uint8Array(n);
      this.tone = new Uint8Array(n);
      this.dir = new Uint8Array(n);
      this.aux = new Uint16Array(n);
      this.al = new Uint8Array(n);
      this.outA = new Uint8Array(n);
      this.hole = new Uint8Array(n);
      this.outG = new Uint16Array(n);
      this.outC = new Uint16Array(n);
      this.hash = new Uint8Array(n);
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          let h = (i * 374761393 + j * 668265263) | 0;
          h = Math.imul(h ^ (h >>> 13), 1274126177);
          this.hash[j * cols + i] = (h ^ (h >>> 16)) & 255;
        }
      }
      this.washC.width = cols;
      this.washC.height = rows;
      this.washX = this.washC.getContext('2d');
      this.washD = this.washX.createImageData(cols, rows);
      this.washS.width = Math.max(1, cols >> 1);
      this.washS.height = Math.max(1, rows >> 1);
      this.washSX = this.washS.getContext('2d');
      this.fillC.width = cols;
      this.fillC.height = rows;
      this.fillX = this.fillC.getContext('2d');
      this.fillD = this.fillX.createImageData(cols, rows);
      this.buildAtlas();
    }

    buildAtlas() {
      const cs = this.cs;
      const a = this.atlas;
      a.width = GLY.length * cs;
      a.height = PAL.length * cs;
      const c = a.getContext('2d');
      const fpx = Math.round(cs * 1.2);
      c.font = `500 ${fpx}px ${DG.MONO}`;
      c.textAlign = 'center';
      c.textBaseline = 'alphabetic';
      const base = Math.round(cs * 0.5 + fpx * 0.34);
      for (let p = 0; p < PAL.length; p++) {
        c.fillStyle = PAL[p];
        for (let g = 1; g < GLY.length; g++) {
          const ch = GLY[g];
          // a monospace glyph is narrower than a square cell: widen it, and stretch dashes until they meet
          const wide = ch === '-' || ch === '=' || ch === '~' || ch === '_' ? 1.72 : ch === '/' || ch === '\\' ? 1.3 : 1.14;
          c.save();
          c.beginPath();
          c.rect(g * cs, p * cs, cs, cs);
          c.clip();
          c.translate(g * cs + cs / 2, p * cs + base);
          c.scale(wide, 1);
          c.fillText(ch, 0, 0);
          c.restore();
        }
      }
    }

    clear() {
      this.z.fill(Infinity);
      this.mat.fill(0);
      this.dir.fill(0);
      this.A = 255;
    }

    point(x, y, z, mat, ink, tone, dir, aux) {
      const i = x | 0, j = y | 0;
      if (x < 0 || y < 0 || i >= this.cols || j >= this.rows) return;
      const k = j * this.cols + i;
      if (z < this.z[k]) {
        this.z[k] = z; this.mat[k] = mat; this.ink[k] = ink; this.tone[k] = tone; this.dir[k] = dir; this.aux[k] = aux; this.al[k] = this.A;
      }
    }

    tri(x0, y0, z0, x1, y1, z1, x2, y2, z2, mat, ink, tone, aux) {
      const cols = this.cols, rows = this.rows;
      const minX = x0 < x1 ? (x0 < x2 ? x0 : x2) : (x1 < x2 ? x1 : x2);
      const maxX = x0 > x1 ? (x0 > x2 ? x0 : x2) : (x1 > x2 ? x1 : x2);
      const minY = y0 < y1 ? (y0 < y2 ? y0 : y2) : (y1 < y2 ? y1 : y2);
      const maxY = y0 > y1 ? (y0 > y2 ? y0 : y2) : (y1 > y2 ? y1 : y2);
      if (maxX < 0 || maxY < 0 || minX >= cols || minY >= rows) return;
      let ix0 = Math.ceil(minX - 0.5), ix1 = Math.floor(maxX - 0.5);
      let iy0 = Math.ceil(minY - 0.5), iy1 = Math.floor(maxY - 0.5);
      const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
      if (ix0 > ix1 || iy0 > iy1 || (area < 1e-5 && area > -1e-5)) {
        // covers no cell centre — keep small geometry alive as a single cell
        if (maxX - minX < 1.6 && maxY - minY < 1.6) {
          this.point((x0 + x1 + x2) / 3, (y0 + y1 + y2) / 3, (z0 + z1 + z2) / 3, mat, ink, tone, 0, aux);
        }
        return;
      }
      if (ix0 < 0) ix0 = 0;
      if (iy0 < 0) iy0 = 0;
      if (ix1 >= cols) ix1 = cols - 1;
      if (iy1 >= rows) iy1 = rows - 1;
      const inv = 1 / area;
      const zb = this.z, mb = this.mat, ib = this.ink, tb = this.tone, db = this.dir, ab = this.aux, lb = this.al, A = this.A;
      for (let j = iy0; j <= iy1; j++) {
        const py = j + 0.5;
        const row = j * cols;
        for (let i = ix0; i <= ix1; i++) {
          const px = i + 0.5;
          const w0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) * inv;
          if (w0 < -0.002) continue;
          const w1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) * inv;
          if (w1 < -0.002) continue;
          const w2 = 1 - w0 - w1;
          if (w2 < -0.002) continue;
          const z = w0 * z0 + w1 * z1 + w2 * z2;
          const k = row + i;
          if (z < zb[k]) {
            zb[k] = z; mb[k] = mat; ib[k] = ink; tb[k] = tone; db[k] = 0; ab[k] = aux; lb[k] = A;
          }
        }
      }
    }

    /* A stroke. `bias` pulls it towards the eye so it wins over its own surface.
     * dA/dB/duty give an optional dash pattern measured along the stroke. */
    line(x0, y0, z0, x1, y1, z1, mat, tone, aux, bias, dA, dB, duty) {
      const cols = this.cols, rows = this.rows;
      const dx = x1 - x0, dy = y1 - y0;
      // Liang–Barsky clip to the grid
      let t0 = 0, t1 = 1;
      const p = [-dx, dx, -dy, dy];
      const q = [x0, cols - 0.001 - x0, y0, rows - 0.001 - y0];
      for (let e = 0; e < 4; e++) {
        if (p[e] === 0) { if (q[e] < 0) return; }
        else {
          const r = q[e] / p[e];
          if (p[e] < 0) { if (r > t1) return; if (r > t0) t0 = r; }
          else { if (r < t0) return; if (r < t1) t1 = r; }
        }
      }
      const adx = dx < 0 ? -dx : dx, ady = dy < 0 ? -dy : dy;
      const len = adx > ady ? adx : ady;
      const n = Math.ceil(len * (t1 - t0));
      const s = ady / (adx + 1e-9);
      const dir = s > 2.2 ? 1 : s < 0.45 ? 3 : (dx * dy < 0 ? 2 : 4);
      const zb = this.z, mb = this.mat, tb = this.tone, db = this.dir, ab = this.aux, ib = this.ink, lb = this.al, A = this.A;
      const dash = duty !== undefined;
      const b = bias || 0;
      for (let k = 0; k <= n; k++) {
        const t = n ? t0 + ((t1 - t0) * k) / n : t0;
        if (dash) {
          const d = dA + (dB - dA) * t;
          if (d - Math.floor(d) > duty) continue;
        }
        const x = x0 + dx * t, y = y0 + dy * t;
        const i = x | 0, j = y | 0;
        if (i < 0 || j < 0 || i >= cols || j >= rows) continue;
        const z = z0 + (z1 - z0) * t - b;
        const c = j * cols + i;
        if (z < zb[c]) {
          zb[c] = z; mb[c] = mat; tb[c] = tone; db[c] = dir; ab[c] = aux; ib[c] = 255; lb[c] = A;
        }
      }
    }

    /* Rectangles (in cells) where the drawing dissolves so type can sit on it. */
    setHoles(rects) {
      const h = this.hole;
      h.fill(0);
      const cols = this.cols, rows = this.rows;
      for (const r of rects) {
        const f = r.f || 6;
        const i0 = Math.max(0, Math.floor(r.x0 - f)), i1 = Math.min(cols - 1, Math.ceil(r.x1 + f));
        const j0 = Math.max(0, Math.floor(r.y0 - f)), j1 = Math.min(rows - 1, Math.ceil(r.y1 + f));
        for (let j = j0; j <= j1; j++) {
          const dy = j < r.y0 ? r.y0 - j : j > r.y1 ? j - r.y1 : 0;
          for (let i = i0; i <= i1; i++) {
            const dx = i < r.x0 ? r.x0 - i : i > r.x1 ? i - r.x1 : 0;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d >= f) continue;
            const v = (1 - d / f) * (r.s === undefined ? 1 : r.s) * 255;
            const k = j * cols + i;
            if (v > h[k]) h[k] = v;
          }
        }
      }
    }

    pick(x, y) {
      const i = x | 0, j = y | 0;
      if (i < 0 || j < 0 || i >= this.cols || j >= this.rows) return null;
      const k = j * this.cols + i;
      if (!this.mat[k] || !this.outG[k]) return null;
      return { mat: this.mat[k], aux: this.aux[k], ink: this.ink[k], tone: this.tone[k], z: this.z[k] };
    }

    print(env) {
      const { cols, rows, cs, ctx, n } = this;
      const mb = this.mat, ib = this.ink, tb = this.tone, db = this.dir, lb = this.al;
      const hs = this.hash, hole = this.hole, outG = this.outG, outC = this.outC, outA = this.outA;
      const wd = this.washD.data, fd = this.fillD.data, rgb = this.rgb;
      wd.fill(0);
      fd.fill(0);
      let anyWash = false, anyFill = false;
      for (let k = 0; k < n; k++) {
        const m = mb[k];
        if (!m) { outG[k] = 0; continue; }
        const mt = MATS[m];
        const h = hs[k];
        let a = lb[k];
        const hv = hole[k];
        if (hv) a = (a * (255 - hv)) >> 8;
        if (a < 10) { outG[k] = 0; continue; }
        if (mt.fill) {
          const o = k * 4, f = mt.fill;
          fd[o] = f[0]; fd[o + 1] = f[1]; fd[o + 2] = f[2]; fd[o + 3] = a;
          anyFill = true;
        }
        let g;
        const d = db[k];
        if (d) g = mt.dirs[d - 1];
        else {
          let qv = ib[k] + ((h & 63) - 32) * mt.jit;
          if (qv < 0) qv = 0; else if (qv > 255) qv = 255;
          g = mt.ramp[(qv * mt.ramp.length) >> 8];
        }
        if (!g) { outG[k] = 0; continue; }
        const c = mt.cols[(tb[k] * mt.cols.length) >> 8];
        outG[k] = g;
        outC[k] = c;
        outA[k] = a;
        if (mt.wash) {
          const o = k * 4, cc = rgb[c];
          wd[o] = cc[0]; wd[o + 1] = cc[1]; wd[o + 2] = cc[2];
          wd[o + 3] = mt.wash * a;
          anyWash = true;
        }
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      // solid forms: one flat block of card per cell
      if (anyFill) {
        this.fillX.putImageData(this.fillD, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this.fillC, 0, 0, cols * cs, rows * cs);
      }

      // soft colour bleed under the ink — the paper equivalent of glow
      if (anyWash && env.wash > 0) {
        this.washX.putImageData(this.washD, 0, 0);
        const sx = this.washSX;
        sx.clearRect(0, 0, this.washS.width, this.washS.height);
        sx.imageSmoothingEnabled = true;
        sx.drawImage(this.washC, 0, 0, this.washS.width, this.washS.height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.globalAlpha = env.wash;
        ctx.drawImage(this.washS, 0, 0, cols * cs, rows * cs);
        ctx.globalAlpha = env.wash * 0.55;
        ctx.drawImage(this.washC, 0, 0, cols * cs, rows * cs);
        ctx.globalAlpha = 1;
      }

      ctx.imageSmoothingEnabled = false;
      const atlas = this.atlas;
      let drawn = 0, la = 255;
      for (let j = 0, k = 0; j < rows; j++) {
        const y = j * cs;
        for (let i = 0; i < cols; i++, k++) {
          const g = outG[k];
          if (!g) continue;
          const a = outA[k] | 15; // 16 opacity steps keep state changes rare
          if (a !== la) { ctx.globalAlpha = a / 255; la = a; }
          ctx.drawImage(atlas, g * cs, outC[k] * cs, cs, cs, i * cs, y, cs, cs);
          drawn++;
        }
      }
      ctx.globalAlpha = 1;
      this.drawn = drawn;
    }
  }

  /* ---------- camera ---------- */
  class Camera {
    constructor() {
      this.ex = 0; this.ey = 0; this.ez = 5;
      this.rx = 1; this.ry = 0; this.rz = 0;
      this.ux = 0; this.uy = 1; this.uz = 0;
      this.fx = 0; this.fy = 0; this.fz = -1;
      this.fl = 100; this.cx = 0; this.cy = 0; this.dist = 5;
      this.X = 0; this.Y = 0; this.Z = 0; // scratch: last view-space point
      this.sx = 0; this.sy = 0;           // scratch: last screen point (cells)
    }
    /* Orbit around (tx,ty,tz). `span` is how many metres fit top-to-bottom. */
    set(tx, ty, tz, span, yaw, pitch, cols, rows, ox, oy) {
      const K = Camera.K;
      const dist = (this.dist = span * K);
      const cp = Math.cos(pitch), sp = Math.sin(pitch), cw = Math.cos(yaw), sw = Math.sin(yaw);
      this.ex = tx + dist * sw * cp; this.ey = ty + dist * sp; this.ez = tz + dist * cw * cp;
      this.fx = -sw * cp; this.fy = -sp; this.fz = -cw * cp;
      this.rx = cw; this.ry = 0; this.rz = -sw;
      this.ux = this.ry * this.fz - this.rz * this.fy;
      this.uy = this.rz * this.fx - this.rx * this.fz;
      this.uz = this.rx * this.fy - this.ry * this.fx;
      this.fl = rows * K;
      this.cx = cols * ox; this.cy = rows * oy;
    }
    /* world → view. Result in this.X/Y/Z (Z is depth, forward positive). */
    view(x, y, z) {
      const dx = x - this.ex, dy = y - this.ey, dz = z - this.ez;
      this.X = dx * this.rx + dy * this.ry + dz * this.rz;
      this.Y = dx * this.ux + dy * this.uy + dz * this.uz;
      this.Z = dx * this.fx + dy * this.fy + dz * this.fz;
    }
    /* world → screen cells. Returns false when behind the eye. */
    project(x, y, z) {
      this.view(x, y, z);
      if (this.Z < 0.05) return false;
      const s = this.fl / this.Z;
      this.sx = this.cx + this.X * s;
      this.sy = this.cy - this.Y * s;
      return true;
    }
  }
  Camera.K = 2.3;
  Camera.NEAR = 0.05;

  DG.Grid = Grid;
  DG.Camera = Camera;

  /* ---------- small shared helpers ---------- */
  DG.rng = function (a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  DG.sat = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  DG.smooth = (a, b, x) => { const t = DG.sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  DG.lerp = (a, b, t) => a + (b - a) * t;
  DG.LIGHT = (() => { const v = [-0.5, 0.78, 0.45]; const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; })();
})();
