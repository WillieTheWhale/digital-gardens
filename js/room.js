/* Digital Gardens — room.js
 *
 * The workspace the gardens hang over: desks, screens, chairs and a hall of
 * compute racks. Built things are drawn as white card with graphite edges,
 * so the plants stay the only colour on the page.
 */
(function () {
  'use strict';
  const DG = window.DG;
  const { M, sat, smooth } = DG;
  const NEAR = 0.05;
  const L = DG.LIGHT;

  // faces: four corners + outward normal.  edges: two corners + the two faces they join.
  const FACES = [
    [0, 1, 3, 2, -1, 0, 0], [4, 6, 7, 5, 1, 0, 0],
    [0, 4, 5, 1, 0, -1, 0], [2, 3, 7, 6, 0, 1, 0],
    [0, 2, 6, 4, 0, 0, -1], [1, 5, 7, 3, 0, 0, 1],
  ];
  const EDGES = [
    [0, 1, 0, 2], [2, 3, 0, 3], [4, 5, 1, 2], [6, 7, 1, 3],
    [0, 2, 0, 4], [1, 3, 0, 5], [4, 6, 1, 4], [5, 7, 1, 5],
    [0, 4, 2, 4], [1, 5, 2, 5], [2, 6, 3, 4], [3, 7, 3, 5],
  ];

  /* An oriented box: centre, size, turn about Y. Corner index bits are x=4, y=2, z=1. */
  function box(cx, cy, cz, sx, sy, sz, yaw, o) {
    const c = Math.cos(yaw || 0), s = Math.sin(yaw || 0);
    const P = new Float32Array(24);
    for (let i = 0; i < 8; i++) {
      const lx = (i & 4 ? 0.5 : -0.5) * sx, ly = (i & 2 ? 0.5 : -0.5) * sy, lz = (i & 1 ? 0.5 : -0.5) * sz;
      P[i * 3] = cx + lx * c + lz * s; P[i * 3 + 1] = cy + ly; P[i * 3 + 2] = cz - lx * s + lz * c;
    }
    const tones = FACES.map((f) => {
      const nx = f[4] * c + f[6] * s, ny = f[5], nz = -f[4] * s + f[6] * c;
      const lam = nx * L[0] + ny * L[1] + nz * L[2];
      return { nx, ny, nz, tone: sat(0.86 - 0.8 * Math.max(0, lam)) * 255 };
    });
    return Object.assign({ P, tones, et: 200, id: 0, faces: null }, o || {});
  }

  const SXs = new Float32Array(8), SYs = new Float32Array(8), SZs = new Float32Array(8), VIS = new Uint8Array(6);
  const BB = [0, 0, 0, 0]; // running screen bounds of whatever is being drawn

  function drawBox(g, cam, b, edgeMat) {
    const P = b.P, fl = cam.fl, cx = cam.cx, cy = cam.cy;
    for (let i = 0; i < 8; i++) {
      cam.view(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      if (cam.Z < NEAR) return;
      const s = fl / cam.Z;
      const x = (SXs[i] = cx + cam.X * s), y = (SYs[i] = cy - cam.Y * s);
      SZs[i] = cam.Z;
      if (x < BB[0]) BB[0] = x; if (x > BB[2]) BB[2] = x;
      if (y < BB[1]) BB[1] = y; if (y > BB[3]) BB[3] = y;
    }
    for (let f = 0; f < 6; f++) {
      const F = FACES[f], t = b.tones[f], a = F[0] * 3;
      const vis = (P[a] - cam.ex) * t.nx + (P[a + 1] - cam.ey) * t.ny + (P[a + 2] - cam.ez) * t.nz < 0;
      VIS[f] = vis ? 1 : 0;
      if (!vis) continue;
      const mat = (b.faces && b.faces[f]) || M.FACE;
      const i0 = F[0], i1 = F[1], i2 = F[2], i3 = F[3];
      g.tri(SXs[i0], SYs[i0], SZs[i0], SXs[i1], SYs[i1], SZs[i1], SXs[i2], SYs[i2], SZs[i2], mat, t.tone, t.tone, b.id);
      g.tri(SXs[i0], SYs[i0], SZs[i0], SXs[i2], SYs[i2], SZs[i2], SXs[i3], SYs[i3], SZs[i3], mat, t.tone, t.tone, b.id);
    }
    for (let e = 0; e < 12; e++) {
      const E = EDGES[e];
      if (!VIS[E[2]] && !VIS[E[3]]) continue;
      const outline = VIS[E[2]] !== VIS[E[3]];
      // lift each edge clear of its own faces by about a cell's worth of depth, or steep faces swallow it
      const bias = (1.5 * (SZs[E[0]] + SZs[E[1]])) / (2 * fl);
      g.line(SXs[E[0]], SYs[E[0]], SZs[E[0]], SXs[E[1]], SYs[E[1]], SZs[E[1]], edgeMat, outline ? b.et : b.et * 0.55, b.id, bias);
    }
  }

  /* A world-space stroke, clipped against the near plane. */
  function seg(g, cam, ax, ay, az, bx, by, bz, mat, tone, id, bias) {
    cam.view(ax, ay, az);
    let X0 = cam.X, Y0 = cam.Y, Z0 = cam.Z;
    cam.view(bx, by, bz);
    let X1 = cam.X, Y1 = cam.Y, Z1 = cam.Z;
    if (Z0 < NEAR && Z1 < NEAR) return;
    if (Z0 < NEAR) { const t = (NEAR - Z0) / (Z1 - Z0); X0 += (X1 - X0) * t; Y0 += (Y1 - Y0) * t; Z0 = NEAR; }
    else if (Z1 < NEAR) { const t = (NEAR - Z1) / (Z0 - Z1); X1 += (X0 - X1) * t; Y1 += (Y0 - Y1) * t; Z1 = NEAR; }
    const s0 = cam.fl / Z0, s1 = cam.fl / Z1;
    g.line(cam.cx + X0 * s0, cam.cy - Y0 * s0, Z0, cam.cx + X1 * s1, cam.cy - Y1 * s1, Z1, mat, tone, id, bias || 0);
  }

  const rot = (x, z, yaw) => { const c = Math.cos(yaw), s = Math.sin(yaw); return [x * c + z * s, -x * s + z * c]; };

  /* ---------- a desk with a screen, a keyboard and a chair ---------- */
  function Station(x, z, i, rnd) {
    const id = 50000 + i;
    const boxes = [], lines = [];
    const top = 0.75;
    boxes.push(box(x, top - 0.02, z, 1.5, 0.04, 0.72, 0, { id, et: 225 }));
    for (const sx of [-0.7, 0.7]) for (const sz of [-0.31, 0.31]) lines.push([x + sx, top - 0.04, z + sz, x + sx, 0, z + sz, 190]);
    // screen
    const myaw = (rnd() - 0.5) * 0.24, mx = x + 0.16 + (rnd() - 0.5) * 0.12, mz = z - 0.16;
    const mw = 0.64, mh = 0.38, mcy = top + 0.34;
    boxes.push(box(mx, mcy, mz, mw, mh, 0.024, myaw, { id: id + 100, et: 240 }));
    lines.push([mx, mcy - mh / 2, mz - 0.02, mx, top + 0.012, mz - 0.02, 215]);
    boxes.push(box(mx, top + 0.007, mz - 0.01, 0.24, 0.014, 0.17, myaw, { id: id + 100 }));
    // keyboard + pointer
    boxes.push(box(x + 0.06, top + 0.009, z + 0.17, 0.38, 0.018, 0.13, 0.02, { id: id + 200, faces: { 3: M.KEYS } }));
    boxes.push(box(x + 0.37, top + 0.012, z + 0.18, 0.06, 0.024, 0.1, -0.15, { id: id + 200 }));
    // chair: pushed back and turned, as if someone has just stood up
    const cyaw = -0.55 + (rnd() - 0.5) * 0.9, ccx = x - 0.3 + (rnd() - 0.5) * 0.25, ccz = z + 0.92 + rnd() * 0.14;
    boxes.push(box(ccx, 0.46, ccz, 0.46, 0.055, 0.44, cyaw, { id: id + 300, et: 215 }));
    const bo = rot(0, 0.23, cyaw);
    boxes.push(box(ccx + bo[0], 0.82, ccz + bo[1], 0.42, 0.46, 0.04, cyaw, { id: id + 300, et: 215 }));
    lines.push([ccx + bo[0], 0.487, ccz + bo[1], ccx + bo[0], 0.59, ccz + bo[1], 190]);
    lines.push([ccx, 0.432, ccz, ccx, 0.09, ccz, 205]);
    for (let k = 0; k < 5; k++) {
      const a = cyaw + (k / 5) * 6.283;
      lines.push([ccx, 0.09, ccz, ccx + Math.cos(a) * 0.3, 0.02, ccz + Math.sin(a) * 0.3, 170]);
    }
    return {
      id, x, z, boxes, lines, seen: 0, bb: [0, 0, 0, 0], alpha: 0,
      screen: { x: mx, y: mcy, z: mz, w: mw - 0.06, h: mh - 0.06, yaw: myaw, seed: (rnd() * 9999) | 0, rate: 5 + rnd() * 9 },
    };
  }

  /* Text streaming down a screen: small quads on the panel's face, so the lines
   * stay mapped to the monitor however the camera moves. */
  const QX = new Float32Array(4), QY = new Float32Array(4), QZ = new Float32Array(4);
  function drawScreen(g, cam, s, t, id) {
    const c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
    if ((s.x - cam.ex) * sn + (s.z - cam.ez) * c > 0) return; // seen from behind
    cam.view(s.x, s.y, s.z);
    if (cam.Z < NEAR) return;
    const px = (s.w * cam.fl) / cam.Z;
    if (px < 2.5) return;
    const colsN = px > 44 ? 26 : px > 24 ? 18 : px > 12 ? 12 : 7;
    const rowsN = Math.max(3, Math.round(colsN * 0.52));
    const cw = s.w / colsN, rh = s.h / rowsN;
    const scroll = t * s.rate * 0.12;
    const line0 = Math.floor(scroll), typing = scroll - line0;
    for (let r = 0; r < rowsN; r++) {
      const ln = line0 - (rowsN - 1 - r); // the newest line sits at the bottom, still being typed
      let hh = Math.imul((ln + s.seed) * 2654435761, 0x9e3779b1); hh ^= hh >>> 15;
      const indent = hh & 3, lenN = 3 + ((hh >>> 3) % Math.max(2, colsN - 4 - indent));
      if (((hh >>> 9) & 7) === 0) continue;
      const shown = r === rowsN - 1 ? Math.floor(typing * (lenN + 4)) : lenN;
      const y1 = s.y + s.h / 2 - r * rh - rh * 0.12, y0 = y1 - rh * 0.76;
      for (let q = 0; q < Math.min(lenN, shown); q++) {
        const col = indent + q;
        if (col >= colsN) break;
        let h2 = Math.imul((hh + q * 7919) | 0, 0x85ebca6b); h2 ^= h2 >>> 13;
        if ((h2 & 7) === 0) continue; // word gaps
        const lx0 = -s.w / 2 + col * cw + cw * 0.08, lx1 = lx0 + cw * 0.84, zb = 0.0135;
        const ax = s.x + lx0 * c + zb * sn, az = s.z - lx0 * sn + zb * c;
        const bx = s.x + lx1 * c + zb * sn, bz = s.z - lx1 * sn + zb * c;
        let ok = true;
        for (let k = 0; k < 4; k++) {
          cam.view(k === 0 || k === 3 ? ax : bx, k < 2 ? y0 : y1, k === 0 || k === 3 ? az : bz);
          if (cam.Z < NEAR) { ok = false; break; }
          const sc = cam.fl / cam.Z;
          QX[k] = cam.cx + cam.X * sc; QY[k] = cam.cy - cam.Y * sc; QZ[k] = cam.Z - 0.004;
        }
        if (!ok) continue;
        const ink = 90 + ((h2 >>> 4) & 127), tone = r === rowsN - 1 ? 235 : 70 + ((h2 >>> 11) & 127);
        g.tri(QX[0], QY[0], QZ[0], QX[1], QY[1], QZ[1], QX[2], QY[2], QZ[2], M.SCREEN, ink, tone, id);
        g.tri(QX[0], QY[0], QZ[0], QX[2], QY[2], QZ[2], QX[3], QY[3], QZ[3], M.SCREEN, ink, tone, id);
      }
    }
  }

  /* ---------- a compute rack ---------- */
  function Rack(x, z, i) {
    const id = 60000 + i;
    const W = 0.6, H = 2.0, D = 1.05;
    const b = box(x, H / 2, z, W, H, D, 0, { id, et: 235 });
    const lines = [], leds = [];
    const fz = z + D / 2 + 0.004;
    const units = 16;
    for (let u = 0; u <= units; u++) {
      const y = 0.1 + (u / units) * (H - 0.2);
      lines.push([x - W / 2 + 0.06, y, fz, x + W / 2 - 0.06, y, fz, 110 + ((u * 53 + i * 17) & 127)]);
    }
    for (let u = 0; u < units; u++) {
      const y = 0.1 + ((u + 0.5) / units) * (H - 0.2);
      leds.push([x - W / 2 + 0.11, y, fz, (i * 31 + u * 17) % 97]);
      if ((u + i) % 3) leds.push([x - W / 2 + 0.19, y, fz, (i * 13 + u * 29) % 89]);
    }
    return { id, x, z, box: b, lines, leds, alpha: 0, seen: 0 };
  }

  class Room {
    constructor() {
      const rnd = DG.rng(4242);
      this.x0 = -7.2; this.x1 = 8.4; this.z0 = -9.2; this.z1 = 3.2;
      this.stations = [];
      let i = 0;
      for (const z of [0, -3.0, -6.0]) for (const x of [0, -3.3]) this.stations.push(Station(x, z, i++, rnd));
      this.racks = [];
      i = 0;
      for (let k = 0; k < 6; k++) this.racks.push(Rack(2.75 + k * 0.64, -1.15, i++));
    }

    draw(g, cam, t, st) {
      const fo = st.focus;
      const fade = (x, z) => 1 - smooth(fo.r0, fo.r1, Math.hypot(x - fo.x, z - fo.z));

      // floor: a field of points, one every 40 cm, pooling around the subject
      const step = cam.dist > 14 ? 0.8 : 0.4;
      const fr0 = fo.r0 * 0.75, fr1 = fo.r1 * 1.05;
      for (let x = this.x0; x <= this.x1 + 0.01; x += step) {
        for (let z = this.z0; z <= this.z1 + 0.01; z += step) {
          const a = 1 - smooth(fr0, fr1, Math.hypot(x - fo.x, z - fo.z));
          if (a < 0.04) continue;
          cam.view(x, 0, z);
          if (cam.Z < NEAR) continue;
          const s = cam.fl / cam.Z;
          g.A = (a * 255) | 0;
          g.point(cam.cx + cam.X * s, cam.cy - cam.Y * s, cam.Z, M.FLOOR, 255, 200, 0, 0);
        }
      }

      // attention: a slow wave crosses the floor on the diagonal; whatever it touches is taken into context
      const wave = -9 + ((t * 1.2) % 19);
      const seenAt = (x, z) => { const d = (x * 0.75 - z * 0.66 - wave) / 1.4; return st.sense * Math.exp(-d * d); };

      for (const s of this.stations) {
        const a = (s.alpha = fade(s.x, s.z + 0.3));
        if (a < 0.03) continue;
        g.A = (a * 255) | 0;
        s.seen = seenAt(s.x, s.z);
        const em = s.seen > 0.3 ? M.FSEEN : M.FEDGE;
        BB[0] = BB[1] = 1e9; BB[2] = BB[3] = -1e9;
        for (const b of s.boxes) drawBox(g, cam, b, em);
        for (const l of s.lines) seg(g, cam, l[0], l[1], l[2], l[3], l[4], l[5], em, l[6], s.id, 0.02);
        drawScreen(g, cam, s.screen, t, s.id + 100);
        s.bb[0] = BB[0]; s.bb[1] = BB[1]; s.bb[2] = BB[2]; s.bb[3] = BB[3];
      }

      for (const r of this.racks) {
        const a = (r.alpha = fade(r.x, r.z));
        if (a < 0.03) continue;
        g.A = (a * 255) | 0;
        r.seen = seenAt(r.x, r.z);
        cam.view(r.x, 1.0, r.z);
        const sc = cam.fl / Math.max(0.5, cam.Z);
        drawBox(g, cam, r.box, r.seen > 0.3 ? M.FSEEN : M.FEDGE);
        if (sc * 0.12 > 1.1) for (const l of r.lines) seg(g, cam, l[0], l[1], l[2], l[3], l[4], l[5], M.FLINE, l[6], r.id, 1.2 / sc);
        const load = st.load;
        for (const d of r.leds) {
          // every LED blinks to its own clock; a busier hall blinks more
          const ph = t * (1.2 + (d[3] % 7) * 0.5) + d[3];
          const on = Math.sin(ph) + Math.sin(ph * 2.7 + d[3]) > 0.9 - load * 1.5;
          if (!on && sc * 0.12 < 1.6) continue;
          cam.view(d[0], d[1], d[2]);
          if (cam.Z < NEAR) continue;
          const s2 = cam.fl / cam.Z;
          g.point(cam.cx + cam.X * s2, cam.cy - cam.Y * s2, cam.Z - 2.2 / sc, M.LED, on ? 255 : 20, on ? 200 : 30, 0, r.id);
        }
      }
      g.A = 255;
    }
  }

  DG.Room = Room;
})();
