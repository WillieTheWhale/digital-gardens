/* Digital Gardens — flora.js
 *
 * A hanging planter: cord, ceramic pot and a trailing pothos. Vines arc over
 * the rim and fall under their own weight; heart-shaped leaves alternate down
 * each one. Everything grows from nothing, sways, and reacts to the pointer.
 */
(function () {
  'use strict';
  const DG = window.DG;
  const { M, sat, smooth, lerp } = DG;
  const NEAR = 0.05;

  const hash2 = (a, b) => {
    let h = Math.imul((a * 73856093) ^ (b * 19349663), 0x9e3779b1);
    h ^= h >>> 15;
    return ((h >>> 0) & 1023) / 1023;
  };

  /* ---------- leaf blade templates (unit leaf, base at origin, tip at z = 1) ---------- */
  function leafTemplate(nu, nv) {
    const n = (nu + 1) * (nv + 1);
    const X = new Float32Array(n), Z = new Float32Array(n), F = new Float32Array(n), C = new Float32Array(n);
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      // half-width profile: cordate base, widest a third of the way up, pointed tip
      const hw = Math.pow(Math.sin(Math.PI * (0.13 + 0.87 * Math.pow(u, 0.72))), 0.9);
      for (let j = 0; j <= nv; j++) {
        const v = (j / nv) * 2 - 1;
        const k = i * (nv + 1) + j;
        X[k] = v * hw * 0.5;
        Z[k] = u - 0.17 * v * v * Math.pow(1 - u, 3); // lobes sweep back behind the petiole
        F[k] = Math.abs(v) * hw * 0.5;                 // lift when folded along the midrib
        C[k] = -u * u;                                 // droop towards the tip
      }
    }
    return { nu, nv, n, X, Z, F, C };
  }
  const T_XHI = leafTemplate(12, 8);
  const T_HI = leafTemplate(7, 6);
  const T_MID = leafTemplate(4, 2);

  const VX = new Float32Array(128), VY = new Float32Array(128), VZ = new Float32Array(128);
  const SX = new Float32Array(128), SY = new Float32Array(128);
  const NV = new Float32Array(64 * 3), NS = new Float32Array(64 * 2); // vine nodes: view xyz, screen xy

  function drawBlade(g, cam, T, Bx, By, Bz, ax, ay, az, bx, by, bz, nx, ny, nz, L, W, fold, curl, tint, ao, seed, vari, id, lv, vein) {
    const nu = T.nu, nv = T.nv, cnt = T.n, w1 = nv + 1;
    const fl = cam.fl, cx = cam.cx, cy = cam.cy;
    const TX = T.X, TZ = T.Z, TF = T.F, TC = T.C;
    for (let k = 0; k < cnt; k++) {
      const lx = TX[k] * W, lz = TZ[k] * L, ly = TF[k] * fold * W + TC[k] * curl * L;
      const X = Bx + ax * lz + bx * lx + nx * ly;
      const Y = By + ay * lz + by * lx + ny * ly;
      const Z = Bz + az * lz + bz * lx + nz * ly;
      if (Z < NEAR) return;
      const s = fl / Z;
      VX[k] = X; VY[k] = Y; VZ[k] = Z;
      SX[k] = cx + X * s; SY[k] = cy - Y * s;
    }
    const lx0 = lv[0], ly0 = lv[1], lz0 = lv[2];
    const mid = nv >> 1, fine = nv >= 6;
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const k00 = i * w1 + j, k01 = k00 + 1, k10 = k00 + w1, k11 = k10 + 1;
        const d1x = VX[k11] - VX[k00], d1y = VY[k11] - VY[k00], d1z = VZ[k11] - VZ[k00];
        const d2x = VX[k10] - VX[k01], d2y = VY[k10] - VY[k01], d2z = VZ[k10] - VZ[k01];
        // view space is left-handed, so d1 × d2 points out of the leaf's upper surface
        let Nx = d1y * d2z - d1z * d2y, Ny = d1z * d2x - d1x * d2z, Nz = d1x * d2y - d1y * d2x;
        const nl = 1 / (Math.sqrt(Nx * Nx + Ny * Ny + Nz * Nz) + 1e-12);
        Nx *= nl; Ny *= nl; Nz *= nl;
        const seen = -(Nx * VX[k00] + Ny * VY[k00] + Nz * VZ[k00]);
        const lam = Nx * lx0 + Ny * ly0 + Nz * lz0;
        const lit = lam > 0 ? lam : 0;
        const hq = hash2(seed, i * 8 + j);
        // the margin is inked darker so each blade outlines itself; the midrib catches light
        let shape = 0;
        if (fine) shape = (j === 0 || j === nv - 1 ? 0.2 : 0) + (i === nu - 1 ? 0.1 : 0) - (j === mid || j === mid - 1 ? 0.1 : 0);
        let mat, d;
        if (seen >= 0) {
          d = 0.5 - 0.5 * lit + ao + tint + shape;
          mat = M.LEAF;
          if (hq < vari && shape < 0.1) { mat = M.LEAFV; d *= 0.8; }
        } else {
          // underside: light from above shines through it
          d = 0.56 - 0.42 * lit + ao * 0.8 + tint * 0.5 + shape;
          mat = M.LEAFB;
        }
        d = d < 0.03 ? 0.03 : d > 0.97 ? 0.97 : d;
        let ink = 0.3 + 0.7 * d + (hq - 0.5) * 0.22;
        ink = ink < 0.02 ? 0.02 : ink > 0.99 ? 0.99 : ink;
        const tone = (d * 255) | 0, ik = (ink * 255) | 0;
        g.tri(SX[k00], SY[k00], VZ[k00], SX[k10], SY[k10], VZ[k10], SX[k11], SY[k11], VZ[k11], mat, ik, tone, id);
        g.tri(SX[k00], SY[k00], VZ[k00], SX[k11], SY[k11], VZ[k11], SX[k01], SY[k01], VZ[k01], mat, ik, tone, id);
      }
    }
    if (vein) {
      const vt = sat(0.2 + tint + ao) * 255;
      for (let i = 0; i < nu - 1; i++) {
        const a = i * w1 + mid, b = a + w1;
        g.line(SX[a], SY[a], VZ[a], SX[b], SY[b], VZ[b], M.VEIN, vt, id, 0.006);
      }
    }
  }

  /* ---------- the planter ---------- */
  let LEAF_ID = 1;

  class Plant {
    constructor(o) {
      Object.assign(this, {
        x: 0, y: 3, z: 0,        // ceiling anchor
        cord: 0.5,               // anchor → knot
        R: 0.15, H: 0.2,         // pot radius / height
        long: 7, short: 9,       // trailing vines / crown vines
        minLen: 0.6, maxLen: 1.5,
        leaf: 0.135,             // largest leaf length (m)
        seed: 1, grown: true,
      }, o);
      this.hang = 0.4; // knot above the rim
      const rnd = (this.rnd = DG.rng(this.seed * 7919 + 13));
      this.yaw0 = rnd() * 6.283; this.yaw = this.yaw0; this.yawV = 0; this.spin = 0; this.yph = rnd() * 6.283;
      this.px = 0; this.pz = 0; this.pvx = 0; this.pvz = 0; this.kx = 0; this.kz = 0;
      this.t = this.grown ? 1e4 : 0;
      this.vines = [];
      this.leaves = [];
      const off = rnd() * 6.283;
      for (let i = 0; i < this.long; i++) {
        const az = off + (i / this.long) * 6.283 + (rnd() - 0.5) * 0.7;
        // lengths fall away steeply: one or two long trailers, the rest shorter
        const f = this.long > 1 ? i / (this.long - 1) : 0;
        const L = lerp(this.maxLen, this.minLen, Math.pow(f, 0.75)) * (0.9 + 0.2 * rnd());
        this._vine(az, Math.min(this.maxLen, L), false, 1.9 + rnd() * 1.6);
      }
      for (let i = 0; i < this.short; i++) {
        const az = off + 0.4 + (i / this.short) * 6.283 + (rnd() - 0.5) * 0.6;
        this._vine(az, 0.14 + 0.2 * rnd(), true, 1.5 + rnd() * 1.4);
      }
      // pot profile (radius, height) from the lip down
      this.prof = [[1.0, 0.0], [1.04, -0.014], [1.0, -0.034], [0.95, -0.07], [0.87, -0.115], [0.77, -0.16], [0.62, -0.19], [0.0, -0.2]];
      this.segs = 18;
      // where the growing end is on screen, for the numbers that trail it
      this.sTip = [0, 0]; this.sCordEnd = [0, 0];
      this.onScreen = false;
    }

    _vine(az, L, short, delay) {
      const rnd = this.rnd, ds = 0.04, n = Math.max(3, Math.round(L / ds));
      const P = new Float32Array((n + 1) * 3);
      const a0 = short ? 0.15 + 0.85 * rnd() : 0.15 + 0.4 * rnd();          // launch angle from vertical
      const lam = short ? 0.07 + 0.09 * rnd() : 0.05 + 0.04 * rnd();        // how quickly it gives in to gravity
      const aEnd = short ? 1.2 + 1.5 * rnd() : Math.PI * 0.99;
      const curl = short ? 0 : 0.3 + 0.6 * rnd();                           // tips reach back up for light
      const wig = 0.55 * (rnd() - 0.5), fw = 2.5 + 4 * rnd(), ph = rnd() * 6.283, ph2 = rnd() * 6.283;
      const twist = (rnd() - 0.5) * 0.7, wave = 0.012 + 0.022 * rnd();
      const angle = (s) => {
        let al = a0 + (aEnd - a0) * (1 - Math.exp(-s / lam));
        if (curl) { const e = sat((s - (L - 0.2)) / 0.2); al -= curl * e * e; }
        return al;
      };
      // first pass: how far out does it travel before hanging? start it so it just clears the pot
      let out = 0;
      for (let k = 0; k < n && k * ds < 0.5; k++) out += Math.sin(angle(k * ds)) * ds;
      const clear = short ? this.R * (0.5 + 0.7 * rnd()) : this.R * 1.06 + 0.012 + 0.085 * rnd() * rnd();
      let r = Math.max(0.012, clear - out), y = -0.02;
      for (let k = 0; k <= n; k++) {
        const s = k * ds;
        const azs = az + wig * Math.sin(s * fw + ph) * Math.min(1, s * 2.5) + twist * s;
        const rr = r + wave * Math.sin(s * 7 + ph2) * Math.min(1, s * 3);
        P[k * 3] = Math.cos(azs) * rr; P[k * 3 + 1] = y; P[k * 3 + 2] = Math.sin(azs) * rr;
        const al = angle(s);
        r += Math.sin(al) * ds; y += Math.cos(al) * ds;
      }
      const v = {
        P, n, L, ds, az, short, delay, rate: (short ? 0.12 : 0.19) + rnd() * 0.08,
        sx: 0, sz: 0, vx: 0, vz: 0, gx: 0, gz: 0, ph: rnd() * 6.283, ph2: rnd() * 6.283, k: 0.75 + rnd() * 0.5,
        leaves: [],
      };
      // leaves alternate down the vine, overlapping like shingles
      const scale = this.leaf / 0.16;
      let s = short ? 0.025 + 0.03 * rnd() : 0.04 + 0.04 * rnd();
      let side = rnd() < 0.5 ? 1 : -1;
      while (s < L - 0.01) {
        const kf = s / ds, k0 = Math.min(n - 1, Math.floor(kf)), fr = kf - k0;
        const a = k0 * 3, b = a + 3;
        let tx = P[b] - P[a], ty = P[b + 1] - P[a + 1], tz = P[b + 2] - P[a + 2];
        const tl = 1 / Math.hypot(tx, ty, tz); tx *= tl; ty *= tl; tz *= tl;
        const Nx = lerp(P[a], P[b], fr), Nz = lerp(P[a + 2], P[b + 2], fr);
        let ox = Nx, oz = Nz; const rl = Math.hypot(ox, oz);
        if (rl < 0.02) { ox = Math.cos(az); oz = Math.sin(az); } else { ox /= rl; oz /= rl; }
        // sideways = horizontal, at right angles to "outward"
        const sx = -oz * side, sz = ox * side;
        const hg = smooth(0.03, 0.26, s); // 0 in the crown → 1 once the vine hangs
        // petiole: a short stalk out and to one side
        let px = ox * (0.5 + 0.4 * rnd()) + sx * (0.5 + 0.5 * rnd()), py = 0.55 - 0.75 * hg + 0.3 * (rnd() - 0.5), pz = oz * (0.5 + 0.4 * rnd()) + sz * (0.5 + 0.5 * rnd());
        const pl = 1 / Math.hypot(px, py, pz); px *= pl; py *= pl; pz *= pl;
        const pet = (0.03 + 0.04 * rnd()) * scale;
        // blade axis. crown leaves reach out and up; hanging leaves point down the vine
        const sp = 0.45 + 0.75 * rnd(), ot = 0.25 + 0.55 * rnd();
        let ax = lerp(px * 0.8 + ox * 0.5, ox * ot + sx * sp, hg);
        let ay = lerp(py * 0.8 + 0.15, -1, hg);
        let az2 = lerp(pz * 0.8 + oz * 0.5, oz * ot + sz * sp, hg);
        const al = 1 / Math.hypot(ax, ay, az2); ax *= al; ay *= al; az2 *= al;
        // face: up in the crown, outward once hanging
        let nx = ox * lerp(0.35, 1, hg) + sx * 0.25 * (rnd() - 0.3), ny = lerp(1, 0.38, hg), nz = oz * lerp(0.35, 1, hg) + sz * 0.25 * (rnd() - 0.3);
        const dt = nx * ax + ny * ay + nz * az2;
        nx -= ax * dt; ny -= ay * dt; nz -= az2 * dt;
        const nl = 1 / (Math.hypot(nx, ny, nz) + 1e-9); nx *= nl; ny *= nl; nz *= nl;
        let bx = ny * az2 - nz * ay, by = nz * ax - nx * az2, bz = nx * ay - ny * ax;
        // a random roll about the axis so no two leaves sit alike
        const roll = (rnd() - 0.5) * 1.0, cr = Math.cos(roll), sr = Math.sin(roll);
        const n2x = nx * cr + bx * sr, n2y = ny * cr + by * sr, n2z = nz * cr + bz * sr;
        bx = bx * cr - nx * sr; by = by * cr - ny * sr; bz = bz * cr - nz * sr;
        const young = s > L - 0.09;
        const len = this.leaf * lerp(1.0, 0.62, Math.pow(s / L, 1.4)) * (0.78 + 0.44 * rnd()) * (young ? 0.6 : 1) * (short ? 0.9 : 1);
        const leaf = {
          s, kf, px: px * pet, py: py * pet, pz: pz * pet,
          ax, ay, az: az2, nx: n2x, ny: n2y, nz: n2z, bx, by, bz,
          len, asp: 0.76 + 0.14 * rnd(), curl: 0.08 + 0.22 * rnd(), fold: 0.35 + 0.5 * rnd(),
          tint: (rnd() - 0.5) * 0.3 - (young ? 0.2 : 0), vari: rnd() < 0.5 ? 0.06 + rnd() * 0.3 : 0,
          seed: (rnd() * 65535) | 0, ph: rnd() * 6.283,
          ao: sat((rl - this.R * 0.3) / (this.R * 1.5)) * 0.7 + 0.3 * hg,
          fl: 0, flv: 0, kick: 0, open: 0, was: 0, sx: 0, sy: 0, vis: false,
          id: LEAF_ID++,
        };
        v.leaves.push(leaf);
        this.leaves.push(leaf);
        s += (short ? 0.045 + 0.04 * rnd() : 0.085 + 0.06 * rnd()) * scale;
        side = -side;
      }
      this.vines.push(v);
    }

    update(dt, t, env) {
      this.t += dt;
      const calm = env.calm;
      // pendulum
      const wx = env.windX, wz = env.windZ;
      this.pvx += (-this.px * 11 - this.pvx * 0.7 + wx * 0.05 + this.kx) * dt; this.px += this.pvx * dt;
      this.pvz += (-this.pz * 11 - this.pvz * 0.7 + wz * 0.05 + this.kz) * dt; this.pz += this.pvz * dt;
      this.kx = 0; this.kz = 0;
      // slow turn on the cord
      const rest = this.yaw0 + 0.42 * Math.sin(t * 0.085 + this.yph) * calm;
      this.yawV += ((rest - this.yaw) * 0.55 - this.yawV * 1.3 + this.spin) * dt;
      this.yaw += this.yawV * dt;
      this.yaw0 += this.spinCarry || 0; this.spinCarry = 0;
      this.spin = 0;
      const w = this.yawV;
      for (const v of this.vines) {
        const azw = v.az + this.yaw;
        const fx = (wx * (0.7 + 0.5 * Math.sin(t * 0.61 * v.k + v.ph)) + 0.12 * Math.sin(t * 1.3 * v.k + v.ph2)) * calm + v.gx + w * Math.sin(azw) * 1.1;
        const fz = (wz * (0.7 + 0.5 * Math.sin(t * 0.53 * v.k + v.ph2)) + 0.12 * Math.sin(t * 1.1 * v.k + v.ph)) * calm + v.gz - w * Math.cos(azw) * 1.1;
        const kk = 7.5 * v.k;
        v.vx += (-v.sx * kk - v.vx * 1.05 + fx) * dt; v.sx += v.vx * dt;
        v.vz += (-v.sz * kk - v.vz * 1.05 + fz) * dt; v.sz += v.vz * dt;
        v.gx = 0; v.gz = 0;
      }
      const gust = (Math.abs(wx) + Math.abs(wz)) * calm;
      for (const l of this.leaves) {
        const drive = Math.sin(t * 2.3 + l.ph) * (0.8 + 3.5 * gust) * calm + l.kick;
        l.flv += (-l.fl * 42 - l.flv * 3.2 + drive) * dt;
        l.fl += l.flv * dt;
        l.kick = 0;
      }
    }

    draw(g, cam, env) {
      const t = this.t;
      const D = this.cord + this.hang;
      // pot frame: hangs from the anchor, tilts with the pendulum, turns on the cord
      let dx = this.px, dy = -1, dz = this.pz;
      const dl = 1 / Math.hypot(dx, dy, dz); dx *= dl; dy *= dl; dz *= dl;
      const Ox = this.x + dx * D, Oy = this.y + dy * D, Oz = this.z + dz * D;
      const Yx = -dx, Yy = -dy, Yz = -dz;
      const cyw = Math.cos(this.yaw), syw = Math.sin(this.yaw);
      let Xx = cyw, Xy = 0, Xz = -syw;
      const xd = Xx * Yx + Xy * Yy + Xz * Yz;
      Xx -= Yx * xd; Xy -= Yy * xd; Xz -= Yz * xd;
      const xl = 1 / Math.hypot(Xx, Xy, Xz); Xx *= xl; Xy *= xl; Xz *= xl;
      const Zx = Xy * Yz - Xz * Yy, Zy = Xz * Yx - Xx * Yz, Zz = Xx * Yy - Xy * Yx;

      // quick reject: is the whole planter off-screen or behind fog?
      cam.view(Ox, Oy - 0.4, Oz);
      const bz = cam.Z;
      this.onScreen = false;
      if (bz < 0.3) return;
      {
        const s = cam.fl / bz, rad = (this.maxLen + 1.2) * s;
        const sx = cam.cx + cam.X * s, sy = cam.cy - cam.Y * s;
        if (sx + rad < 0 || sx - rad > g.cols || sy + rad < 0 || sy - rad > g.rows) return;
      }
      // things fade with distance from whatever the camera is attending to
      const fo = env.focus;
      const fa = 1 - smooth(fo.r0, fo.r1, Math.hypot(Ox - fo.x, Oz - fo.z));
      if (fa < 0.03) return;
      g.A = (fa * 255) | 0;
      this.onScreen = true;

      // local → view: v = VO + VXv*lx + VYv*ly + VZv*lz
      const { rx, ry, rz, ux, uy, uz, fx, fy, fz, ex, ey, ez, fl, cx, cy } = cam;
      const ox = Ox - ex, oy = Oy - ey, oz = Oz - ez;
      const VOx = ox * rx + oy * ry + oz * rz, VOy = ox * ux + oy * uy + oz * uz, VOz = ox * fx + oy * fy + oz * fz;
      const VXx = Xx * rx + Xy * ry + Xz * rz, VXy = Xx * ux + Xy * uy + Xz * uz, VXz = Xx * fx + Xy * fy + Xz * fz;
      const VYx = Yx * rx + Yy * ry + Yz * rz, VYy = Yx * ux + Yy * uy + Yz * uz, VYz = Yx * fx + Yy * fy + Yz * fz;
      const VZx = Zx * rx + Zy * ry + Zz * rz, VZy = Zx * ux + Zy * uy + Zz * uz, VZz = Zx * fx + Zy * fy + Zz * fz;
      // world X / Z axes in view space (for sway offsets, which stay horizontal)
      const WXx = rx, WXy = ux, WXz = fx, WZx = rz, WZy = uz, WZz = fz;
      const L0 = DG.LIGHT;
      const lv = [L0[0] * rx + L0[1] * ry + L0[2] * rz, L0[0] * ux + L0[1] * uy + L0[2] * uz, L0[0] * fx + L0[1] * fy + L0[2] * fz];

      const R = this.R, hs = this.H / 0.2;
      const scalePx = fl / bz;         // cells per metre at the pot
      const id = 40000 + this.index;

      // --- cord: drops from the ceiling first
      const cordR = sat(t / 1.15);
      cam.project(this.x, this.y, this.z);
      const aSX = cam.sx, aSY = cam.sy, aZ = cam.Z;
      const kx = VOx + VYx * this.hang, ky = VOy + VYy * this.hang, kz = VOz + VYz * this.hang;
      if (kz > NEAR && aZ > NEAR) {
        const ks = fl / kz, kSX = cx + kx * ks, kSY = cy - ky * ks;
        const ce = cordR * cordR * (3 - 2 * cordR);
        const eX = lerp(aSX, kSX, ce), eY = lerp(aSY, kSY, ce);
        this.sCordEnd[0] = eX; this.sCordEnd[1] = eY;
        g.line(aSX, aSY, aZ, eX, eY, lerp(aZ, kz, ce), M.CORD, 150, id, 0.002);
        // three hanger cords down to the rim
        const hr = sat((t - 0.85) / 0.6);
        if (hr > 0) {
          for (let i = 0; i < 3; i++) {
            const a = (i / 3) * 6.283 + 0.5, lx = Math.cos(a) * R * 1.02, lz = Math.sin(a) * R * 1.02;
            const X = VOx + VXx * lx + VZx * lz, Y = VOy + VXy * lx + VZy * lz, Z = VOz + VXz * lx + VZz * lz;
            if (Z < NEAR) continue;
            const s = fl / Z, sx = cx + X * s, sy = cy - Y * s;
            g.line(kSX, kSY, kz, lerp(kSX, sx, hr), lerp(kSY, sy, hr), lerp(kz, Z, hr), M.CORD, 110, id, 0.002);
          }
        }
      }

      // --- pot: printed ring by ring
      const potR = sat((t - 1.15) / 0.8);
      if (potR > 0) {
        const prof = this.prof, segs = this.segs, rings = prof.length;
        const shown = Math.max(1, Math.ceil(potR * (rings - 1)));
        const far = scalePx * R * 2 < 5;
        const sg = far ? 8 : segs;
        // ring vertices
        let pXs = null, pYs = null, pZs = null, pVx = null, pVy = null, pVz = null;
        for (let r = 0; r <= shown; r++) {
          const rr = prof[r][0] * R, yy = prof[r][1] * hs;
          const cXs = new Float32Array(sg), cYs = new Float32Array(sg), cZs = new Float32Array(sg);
          const cVx = new Float32Array(sg), cVy = new Float32Array(sg), cVz = new Float32Array(sg);
          let ok = true;
          for (let i = 0; i < sg; i++) {
            const a = (i / sg) * 6.283, lx = Math.cos(a) * rr, lz = Math.sin(a) * rr;
            const X = VOx + VXx * lx + VYx * yy + VZx * lz, Y = VOy + VXy * lx + VYy * yy + VZy * lz, Z = VOz + VXz * lx + VYz * yy + VZz * lz;
            if (Z < NEAR) { ok = false; break; }
            const s = fl / Z;
            cVx[i] = X; cVy[i] = Y; cVz[i] = Z; cXs[i] = cx + X * s; cYs[i] = cy - Y * s; cZs[i] = Z;
          }
          if (!ok) break;
          if (r > 0) {
            for (let i = 0; i < sg; i++) {
              const i2 = (i + 1) % sg;
              // normal from the quad's diagonals
              const d1x = cVx[i2] - pVx[i], d1y = cVy[i2] - pVy[i], d1z = cVz[i2] - pVz[i];
              const d2x = cVx[i] - pVx[i2], d2y = cVy[i] - pVy[i2], d2z = cVz[i] - pVz[i2];
              let Nx = d1y * d2z - d1z * d2y, Ny = d1z * d2x - d1x * d2z, Nz = d1x * d2y - d1y * d2x;
              const nl = 1 / (Math.hypot(Nx, Ny, Nz) + 1e-12); Nx *= nl; Ny *= nl; Nz *= nl;
              if (Nx * pVx[i] + Ny * pVy[i] + Nz * pVz[i] > 0) { Nx = -Nx; Ny = -Ny; Nz = -Nz; }
              const lam = Nx * lv[0] + Ny * lv[1] + Nz * lv[2];
              const d = sat(0.72 - 0.75 * (lam > 0 ? lam : lam * 0.25));
              const tn = (d * 255) | 0;
              g.tri(pXs[i], pYs[i], pZs[i], cXs[i], cYs[i], cZs[i], cXs[i2], cYs[i2], cZs[i2], M.POT, tn, tn, id);
              g.tri(pXs[i], pYs[i], pZs[i], cXs[i2], cYs[i2], cZs[i2], pXs[i2], pYs[i2], pZs[i2], M.POT, tn, tn, id);
            }
          }
          if (r <= 1 && !far) {
            // the lip, drawn as a stroke
            for (let i = 0; i < sg; i++) {
              const i2 = (i + 1) % sg;
              g.line(cXs[i], cYs[i], cZs[i], cXs[i2], cYs[i2], cZs[i2], M.POTEDGE, r ? 200 : 120, id, 0.003);
            }
          }
          if (r === 0) {
            // soil
            const yy2 = -0.022 * hs;
            const X = VOx + VYx * yy2, Y = VOy + VYy * yy2, Z = VOz + VYz * yy2;
            if (Z > NEAR) {
              const s = fl / Z, mx = cx + X * s, my = cy - Y * s;
              for (let i = 0; i < sg; i++) {
                const i2 = (i + 1) % sg;
                g.tri(mx, my, Z + 0.004, cXs[i], cYs[i], cZs[i] + 0.004, cXs[i2], cYs[i2], cZs[i2] + 0.004, M.SOIL, 170, 200, id);
              }
            }
          }
          pXs = cXs; pYs = cYs; pZs = cZs; pVx = cVx; pVy = cVy; pVz = cVz;
        }
      }

      // --- vines and leaves
      const ptr = env.ptr;
      const pr = ptr && ptr.on ? ptr.r : 0, pr2 = pr * pr;
      let tipY = -1e9, tipX = 0;
      for (let vi = 0; vi < this.vines.length; vi++) {
        const v = this.vines[vi];
        const gl = Math.min(v.L, Math.max(0, (t - v.delay) * v.rate));
        if (gl <= 0) continue;
        const P = v.P, n = v.n, ds = v.ds;
        const last = Math.min(n, Math.ceil(gl / ds));
        const offX = v.sx, offZ = v.sz;
        let ok = true;
        for (let k = 0; k <= last; k++) {
          const s = k * ds, a = k * 3;
          const hgw = s > 0.1 ? Math.pow((s - 0.1) / v.L, 1.3) * v.L * 0.9 : 0;
          const wx = offX * hgw, wz = offZ * hgw;
          const lx = P[a], ly = P[a + 1], lz = P[a + 2];
          const X = VOx + VXx * lx + VYx * ly + VZx * lz + WXx * wx + WZx * wz;
          const Y = VOy + VXy * lx + VYy * ly + VZy * lz + WXy * wx + WZy * wz;
          const Z = VOz + VXz * lx + VYz * ly + VZz * lz + WXz * wx + WZz * wz;
          if (Z < NEAR) { ok = false; break; }
          const sc = fl / Z;
          NV[a] = X; NV[a + 1] = Y; NV[a + 2] = Z;
          NS[k * 2] = cx + X * sc; NS[k * 2 + 1] = cy - Y * sc;
        }
        if (!ok) continue;
        // stem
        const fe = gl / ds;
        for (let k = 0; k < last; k++) {
          let x1 = NS[k * 2 + 2], y1 = NS[k * 2 + 3], z1 = NV[k * 3 + 5];
          if (k + 1 > fe) {
            const f = fe - k;
            x1 = lerp(NS[k * 2], x1, f); y1 = lerp(NS[k * 2 + 1], y1, f); z1 = lerp(NV[k * 3 + 2], z1, f);
          }
          g.line(NS[k * 2], NS[k * 2 + 1], NV[k * 3 + 2], x1, y1, z1, M.STEM, 150 + ((k * 37) & 63), id, 0.002);
          if (y1 > tipY && !v.short) { tipY = y1; tipX = x1; }
        }
        // pointer brushing the vine
        if (pr) {
          const km = Math.min(last, n) >> 1;
          for (let q = 0; q < 2; q++) {
            const k = q ? Math.min(last, n) : km;
            const ddx = NS[k * 2] - ptr.x, ddy = NS[k * 2 + 1] - ptr.y, d2 = ddx * ddx + ddy * ddy;
            if (d2 < pr2 * 2.2) {
              const w = (1 - d2 / (pr2 * 2.2)) * 0.045;
              v.gx += (ptr.vx * rx - ptr.vy * ux * 0.3) * w; v.gz += (ptr.vx * rz - ptr.vy * uz * 0.3) * w;
            }
          }
        }
        // leaves
        const lvs = v.leaves;
        for (let li = 0; li < lvs.length; li++) {
          const l = lvs[li];
          const age = (gl - l.s) / 0.2;
          if (age <= 0) { l.open = 0; l.vis = false; continue; }
          const o = age >= 1 ? 1 : age * age * (3 - 2 * age);
          if (l.was === 0 && env.onLeaf && t < 1e3) env.onLeaf(l, this);
          l.was = 1; l.open = o;
          const k0 = Math.min(last - 1, Math.floor(l.kf)), fr = Math.min(1, l.kf - k0), a = k0 * 3;
          const nX = lerp(NV[a], NV[a + 3], fr), nY = lerp(NV[a + 1], NV[a + 4], fr), nZ = lerp(NV[a + 2], NV[a + 5], fr);
          // petiole
          const Bx = nX + (VXx * l.px + VYx * l.py + VZx * l.pz) * o;
          const By = nY + (VXy * l.px + VYy * l.py + VZy * l.pz) * o;
          const Bz = nZ + (VXz * l.px + VYz * l.py + VZz * l.pz) * o;
          if (Bz < NEAR || nZ < NEAR) { l.vis = false; continue; }
          const bs = fl / Bz, bSX = cx + Bx * bs, bSY = cy - By * bs;
          const len = l.len * (0.25 + 0.75 * o);
          const lpx = len * bs;
          if (bSX < -lpx || bSX > g.cols + lpx || bSY < -lpx || bSY > g.rows + lpx) { l.vis = false; continue; }
          // frame in view space
          let ax = VXx * l.ax + VYx * l.ay + VZx * l.az, ay = VXy * l.ax + VYy * l.ay + VZy * l.az, az = VXz * l.ax + VYz * l.ay + VZz * l.az;
          let nx = VXx * l.nx + VYx * l.ny + VZx * l.nz, ny = VXy * l.nx + VYy * l.ny + VZy * l.nz, nz = VXz * l.nx + VYz * l.ny + VZz * l.nz;
          let bx = VXx * l.bx + VYx * l.by + VZx * l.bz, by = VXy * l.bx + VYy * l.by + VZy * l.bz, bz2 = VXz * l.bx + VYz * l.by + VZz * l.bz;
          // flutter: roll about the blade axis
          const ca = Math.cos(l.fl), sa = Math.sin(l.fl);
          const n2x = nx * ca + bx * sa, n2y = ny * ca + by * sa, n2z = nz * ca + bz2 * sa;
          bx = bx * ca - nx * sa; by = by * ca - ny * sa; bz2 = bz2 * ca - nz * sa;
          nx = n2x; ny = n2y; nz = n2z;
          const W = len * l.asp;
          const fold = l.fold + (1 - o) * 1.7, curl = l.curl + (1 - o) * 0.5;
          const cX = bSX + ax * lpx * 0.5, cY = bSY - ay * lpx * 0.5;
          l.sx = cX; l.sy = cY; l.vis = true;
          if (pr) {
            const ddx = cX - ptr.x, ddy = cY - ptr.y, d2 = ddx * ddx + ddy * ddy;
            if (d2 < pr2) {
              const w = 1 - d2 / pr2;
              l.kick += (ptr.vx * 0.9 + ptr.vy * 0.6) * w * (l.id & 1 ? 1 : -1);
              if (env.onBrush && Math.abs(ptr.vx) + Math.abs(ptr.vy) > 6) env.onBrush(l, w);
            }
          }
          // leaves deeper in the plant, and further from the eye, sit in shade
          // deep inside the plant is darker; the far side recedes towards the paper
          const dz = (Bz - VOz) * 1.1;
          const shade = (1 - l.ao) * 0.2 - (dz < -0.08 ? -0.08 : dz > 0.34 ? 0.34 : dz);
          if (lpx > 2.2) g.line(NS[k0 * 2] + (NS[k0 * 2 + 2] - NS[k0 * 2]) * fr, NS[k0 * 2 + 1] + (NS[k0 * 2 + 3] - NS[k0 * 2 + 1]) * fr, nZ, bSX, bSY, Bz, M.STEM, 110, l.id, 0.002);
          if (lpx > 19) drawBlade(g, cam, T_XHI, Bx, By, Bz, ax, ay, az, bx, by, bz2, nx, ny, nz, len, W, fold, curl, l.tint, shade, l.seed, l.vari, l.id, lv, true);
          else if (lpx > 7.5) drawBlade(g, cam, T_HI, Bx, By, Bz, ax, ay, az, bx, by, bz2, nx, ny, nz, len, W, fold, curl, l.tint, shade, l.seed, l.vari, l.id, lv, false);
          else if (lpx > 3) drawBlade(g, cam, T_MID, Bx, By, Bz, ax, ay, az, bx, by, bz2, nx, ny, nz, len, W, fold, curl, l.tint, shade, l.seed, l.vari, l.id, lv, false);
          else {
            // far away: a leaf is a fleck or two
            const lam = nx * lv[0] + ny * lv[1] + nz * lv[2];
            const front = -(nx * Bx + ny * By + nz * Bz) >= 0;
            let d = sat((front ? 0.5 - 0.5 * Math.max(0, lam) : 0.56 - 0.4 * Math.max(0, lam)) + shade + l.tint);
            const mat = front ? (l.vari > 0.22 ? M.LEAFV : M.LEAF) : M.LEAFB;
            const tn = (d * 255) | 0;
            if (lpx > 1.5) {
              const tX = bSX + ax * lpx, tY = bSY - ay * lpx, hx = bx * lpx * l.asp * 0.5, hy = -by * lpx * l.asp * 0.5;
              const mX = bSX + ax * lpx * 0.36, mY = bSY - ay * lpx * 0.36;
              g.tri(bSX, bSY, Bz, mX + hx, mY + hy, Bz, tX, tY, Bz, mat, tn, tn, l.id);
              g.tri(bSX, bSY, Bz, tX, tY, Bz, mX - hx, mY - hy, Bz, mat, tn, tn, l.id);
            } else {
              g.point(cX, cY, Bz, mat, tn, tn, 0, l.id);
            }
          }
        }
      }
      this.sTip[0] = tipX; this.sTip[1] = tipY;
    }
  }

  DG.Plant = Plant;
})();
