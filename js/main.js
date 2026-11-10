/* Digital Gardens — main.js
 *
 * Builds the scene and moves the camera through it as the page scrolls.
 */
(function () {
  'use strict';
  const DG = window.DG;
  const { sat, lerp, smooth } = DG;

  const canvas = document.getElementById('garden');
  if (!canvas || !canvas.getContext) return;
  const grid = new DG.Grid(canvas);
  const ctx = grid.ctx;
  const cam = new DG.Camera();
  const params = new URLSearchParams(location.search);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const grownAtStart = reduce || params.has('grown');

  const INK = '#11161a', GREEN = '#177a49';

  /* ---------- the scene ---------- */
  const room = new DG.Room();
  const plants = [];
  // the first planter hangs over the back corner of the first desk, its longest vines stopping short of the desktop
  const hero = new DG.Plant({ x: -0.55, z: -0.32, cord: 0.66, R: 0.15, long: 7, short: 9, minLen: 0.38, maxLen: 1.1, leaf: 0.175, seed: 7, grown: grownAtStart });
  plants.push(hero);
  {
    const rnd = DG.rng(99);
    // one over every other desk…
    room.stations.forEach((s, i) => {
      if (i === 0) return;
      plants.push(new DG.Plant({
        x: s.x - 0.55, z: s.z - 0.32, cord: 0.3 + rnd() * 0.45, R: 0.13, H: 0.18,
        long: 7, short: 8, minLen: 0.35, maxLen: 0.75 + rnd() * 0.3, leaf: 0.16, seed: 20 + i,
      }));
    });
    // …and two in front of the compute hall
    plants.push(new DG.Plant({ x: 2.5, z: -0.2, cord: 0.6, R: 0.14, long: 7, short: 8, minLen: 0.45, maxLen: 1.3, leaf: 0.165, seed: 41 }));
    plants.push(new DG.Plant({ x: 6.0, z: -0.25, cord: 0.36, R: 0.13, long: 6, short: 7, minLen: 0.4, maxLen: 0.95, leaf: 0.155, seed: 43 }));
  }
  plants.forEach((p, i) => { p.index = i; });

  /* ---------- camera path: one key per section ---------- */
  //  t      what the camera looks at            span   metres visible top-to-bottom
  //  w      metres that must fit side-to-side   ox/oy  where on screen the target sits
  //  r      [full, gone] — things further than this from the target fade out (rp: same, on tall screens)
  //  sense  how strongly the "attention" wave shows   load  how busy the racks are
  const KEYS = [
    { t: [-0.55, 1.62, -0.32], span: 1.5, w: 1.0, yaw: -0.3, pitch: 0.035, ox: 0.66, oy: 0.5, r: [1.0, 1.5], rp: [0.4, 0.72], sense: 0, load: 0.3 },
    { t: [-0.05, 1.2, 0.15], span: 3.35, w: 3.2, yaw: 0.36, pitch: 0.26, ox: 0.67, oy: 0.5, r: [1.7, 2.4], sense: 0, load: 0.4 },
    { t: [4.35, 1.08, -1.0], span: 5.0, w: 5.0, yaw: -0.46, pitch: 0.17, ox: 0.3, oy: 0.5, r: [2.9, 3.6], sense: 0, load: 1 },
    { t: [0.9, 0.4, -2.8], span: 8.6, w: 12.2, yaw: 0.62, pitch: 0.58, ox: 0.675, oy: 0.5, r: [14, 20], sense: 1, load: 0.6 },
    { t: [-0.55, 1.5, -0.32], span: 1.7, w: 1.1, yaw: -1.0, pitch: 0.02, ox: 0.5, oy: 0.36, r: [0.5, 0.85], sense: 0, load: 0.3 },
  ];

  const stages = Array.from(document.querySelectorAll('[data-stage]'));
  let centres = [0];
  let W = 0, H = 0, portrait = false, cellBump = 0;
  let stage = 0; // continuous position along KEYS
  const st = { focus: { x: 0, z: 0, r0: 1, r1: 2 }, sense: 0, load: 0.3 };

  function measure() {
    centres = stages.map((el, i) => (i === 0 ? 0 : el.offsetTop + el.offsetHeight / 2 - innerHeight / 2));
  }

  function resize(force) {
    const w = innerWidth, h = Math.max(innerHeight, canvas.clientHeight || 0);
    // mobile browsers resize constantly as their chrome hides; only rebuild when it matters
    if (!force && w === W && Math.abs(h - H) < 140) { measure(); return; }
    W = w; H = h;
    portrait = W < H * 0.95;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cell = (W < 560 ? 6 : W < 1100 ? 7 : W < 1900 ? 8 : W < 2600 ? 9 : 10) + cellBump;
    grid.resize(W, H, dpr, cell);
    measure();
  }

  function stageAt(y) {
    const n = centres.length;
    if (y <= centres[0]) return 0;
    for (let i = 0; i < n - 1; i++) {
      if (y < centres[i + 1]) return i + smooth(0.1, 0.9, (y - centres[i]) / (centres[i + 1] - centres[i]));
    }
    return n - 1;
  }

  function keyAt(s) {
    const i = Math.max(0, Math.min(KEYS.length - 2, Math.floor(s))), f = sat(s - i);
    const a = KEYS[i], b = KEYS[i + 1];
    const m = (k) => lerp(a[k], b[k], f);
    const g = (x, y) => Math.exp(lerp(Math.log(x), Math.log(y), f)); // zoom eases geometrically
    const ra = (portrait && a.rp) || a.r, rb = (portrait && b.rp) || b.r; // tall screens can ask for a tighter focus
    return {
      tx: lerp(a.t[0], b.t[0], f), ty: lerp(a.t[1], b.t[1], f), tz: lerp(a.t[2], b.t[2], f),
      span: g(a.span, b.span), w: g(a.w, b.w), yaw: m('yaw'), pitch: m('pitch'), ox: m('ox'), oy: m('oy'),
      r0: g(ra[0], rb[0]), r1: g(ra[1], rb[1]), sense: m('sense'), load: m('load'),
    };
  }

  /* ---------- pointer ---------- */
  const ptr = { x: -99, y: -99, vx: 0, vy: 0, on: false, r: 8, px: 0.5, py: 0.5, lastX: 0, lastT: 0, down: false, fine: false };
  const par = { x: 0, y: 0 };
  addEventListener('pointermove', (e) => {
    const now = performance.now();
    const c = grid.cell || 8;
    const x = e.clientX / c, y = e.clientY / c;
    if (ptr.on) {
      const dt = Math.max(8, now - ptr.lastT) / 1000;
      ptr.vx = lerp(ptr.vx, (x - ptr.x) / dt, 0.5); ptr.vy = lerp(ptr.vy, (y - ptr.y) / dt, 0.5);
      if (ptr.down) {
        // dragging turns the planters on their cords
        const d = (e.clientX - ptr.lastX) * 0.02;
        for (const p of plants) if (p.onScreen) { p.spin += d * 22; p.spinCarry = (p.spinCarry || 0) + d * 0.5; }
      }
    }
    ptr.x = x; ptr.y = y; ptr.lastT = now; ptr.lastX = e.clientX;
    ptr.on = true; ptr.fine = e.pointerType === 'mouse' || e.pointerType === 'pen';
    ptr.px = e.clientX / innerWidth; ptr.py = e.clientY / innerHeight;
  }, { passive: true });
  addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if (e.target.closest && e.target.closest('a,button,input,textarea')) return;
    ptr.down = true; ptr.lastX = e.clientX;
    document.documentElement.classList.add('turning');
  });
  const release = () => { ptr.down = false; document.documentElement.classList.remove('turning'); };
  addEventListener('pointerup', release);
  addEventListener('pointercancel', release);
  document.addEventListener('pointerleave', () => { ptr.on = false; release(); });
  addEventListener('blur', () => { ptr.on = false; release(); });

  /* ---------- sound (silent until asked for) ---------- */
  const Sound = {
    ac: null, on: false, out: null, last: 0,
    scale: [0, 2, 4, 7, 9],
    start() {
      if (!this.ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        const ac = (this.ac = new AC());
        const out = (this.out = ac.createGain()); out.gain.value = 0;
        const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
        const dl = ac.createDelay(1.5); dl.delayTime.value = 0.37;
        const fb = ac.createGain(); fb.gain.value = 0.42;
        const wet = ac.createGain(); wet.gain.value = 0.5;
        out.connect(lp); lp.connect(ac.destination);
        out.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(lp);
      }
      this.ac.resume();
      this.out.gain.setTargetAtTime(0.5, this.ac.currentTime, 0.4);
      this.on = true;
      return true;
    },
    stop() { if (this.ac) this.out.gain.setTargetAtTime(0, this.ac.currentTime, 0.2); this.on = false; },
    /* height 0..1 picks the note, vel 0..1 its loudness */
    pluck(height, vel) {
      if (!this.on) return;
      const ac = this.ac, now = ac.currentTime;
      if (now - this.last < 0.055) return;
      this.last = now;
      const step = Math.floor(sat(height) * 14.99);
      const f = 174.61 * Math.pow(2, (this.scale[step % 5] + 12 * Math.floor(step / 5)) / 12);
      const g = ac.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.16 * vel, now + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0008, now + 1.5);
      const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const o2 = ac.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 2.005;
      const g2 = ac.createGain(); g2.gain.value = 0.18;
      o.connect(g); o2.connect(g2); g2.connect(g); g.connect(this.out);
      o.start(now); o2.start(now); o.stop(now + 1.6); o2.stop(now + 1.6);
    },
  };
  const soundBtn = document.getElementById('sound');
  if (soundBtn) {
    soundBtn.addEventListener('click', () => {
      const on = !Sound.on;
      if (on) { if (!Sound.start()) return; Sound.pluck(0.4, 0.8); setTimeout(() => Sound.pluck(0.7, 0.6), 160); }
      else Sound.stop();
      soundBtn.setAttribute('aria-pressed', String(on));
    });
  }

  /* ---------- environment shared with the plants ---------- */
  const env = {
    ptr, windX: 0, windZ: 0, calm: reduce ? 0.15 : 1, focus: st.focus,
    onLeaf(l) { Sound.pluck(1 - l.s / 1.5, 0.35 + Math.random() * 0.3); },
    onBrush(l, w) { Sound.pluck(sat(1 - l.sy / grid.rows), 0.25 + 0.5 * w); },
  };

  /* ---------- type sits in clearings in the drawing ---------- */
  const carved = Array.from(document.querySelectorAll('[data-carve]')).map((el) => ({ el, copy: el.closest('.copy'), s: 0 }));
  function holes(dt) {
    const c = grid.cell, rects = [];
    for (const k of carved) {
      const target = k.copy && k.copy.classList.contains('in') ? 1 : 0;
      k.s = lerp(k.s, target, 1 - Math.exp(-dt * 3));
      if (k.s < 0.02) continue;
      const rs = k.el.getClientRects();
      for (let i = 0; i < rs.length; i++) {
        const r = rs[i];
        if (r.bottom < -40 || r.top > H + 40 || r.width < 4) continue;
        rects.push({ x0: r.left / c - 1.5, x1: r.right / c + 0.5, y0: r.top / c - 0.5, y1: r.bottom / c - 0.5, f: 6, s: k.s });
      }
    }
    grid.setHoles(rects);
  }

  /* ---------- the few marks that sit over the drawing ---------- */
  let cs = 8, dpr = 1;
  function text(s, x, y, a, col) {
    if (a <= 0.01) return;
    ctx.globalAlpha = a > 1 ? 1 : a; ctx.fillStyle = col || INK;
    ctx.fillText(s, Math.round(x * cs), Math.round(y * cs));
  }
  /* corner ticks around a box given in cells */
  function bracket(x0, y0, x1, y1, a, col) {
    if (a <= 0.01) return;
    x0 = Math.round(x0 * cs) + 0.5; y0 = Math.round(y0 * cs) + 0.5; x1 = Math.round(x1 * cs) - 0.5; y1 = Math.round(y1 * cs) - 0.5;
    const L = Math.max(3 * dpr, Math.min(x1 - x0, y1 - y0) * 0.2);
    ctx.globalAlpha = a > 1 ? 1 : a; ctx.strokeStyle = col || INK; ctx.lineWidth = dpr;
    ctx.beginPath();
    ctx.moveTo(x0, y0 + L); ctx.lineTo(x0, y0); ctx.lineTo(x0 + L, y0);
    ctx.moveTo(x1 - L, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + L);
    ctx.moveTo(x1, y1 - L); ctx.lineTo(x1, y1); ctx.lineTo(x1 - L, y1);
    ctx.moveTo(x0 + L, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - L);
    ctx.stroke();
  }

  const ticks = [];
  let tickY = -1e9;
  function marks(t) {
    cs = grid.cs; dpr = grid.dpr;
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.font = `500 ${10 * dpr}px ${DG.MONO}`;

    // while the plant grows, numbers trail the tip — the way a plotter annotates its own line
    const w0 = sat(1 - stage * 2.5);
    if (hero.t < 13 && hero.onScreen && w0 > 0) {
      const cord = hero.t < 1.3;
      const gx = cord ? hero.sCordEnd[0] : hero.sTip[0], gy = cord ? hero.sCordEnd[1] : hero.sTip[1];
      if (gy - tickY > 2.4 && gy > 0) { tickY = gy; ticks.push({ x: gx + 1.8, y: gy, v: sat(hero.t / 9.5), born: t }); }
    }
    for (let i = ticks.length - 1; i >= 0; i--) {
      const k = ticks[i], age = t - k.born;
      if (age > 1.9) { ticks.splice(i, 1); continue; }
      text(k.v.toFixed(2), k.x, k.y + 0.4, (1 - age / 1.9) * 0.85 * w0, GREEN);
    }

    // long term: whatever the wave of attention is crossing gets framed
    if (st.sense > 0.05) {
      for (const s of room.stations) {
        const a = st.sense * s.seen * s.alpha;
        if (a > 0.03 && s.bb[2] > s.bb[0]) bracket(Math.floor(s.bb[0]) - 1, Math.floor(s.bb[1]) - 1, Math.ceil(s.bb[2]) + 1, Math.ceil(s.bb[3]) + 1, a * 0.9, GREEN);
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- copy fades up as each section arrives ---------- */
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => {
      for (const e of es) {
        if (e.isIntersecting) e.target.classList.add('in');
        else if (e.boundingClientRect.top > 0) e.target.classList.remove('in');
      }
    }, { threshold: 0.25 });
    document.querySelectorAll('.copy').forEach((el) => io.observe(el));
  } else document.querySelectorAll('.copy').forEach((el) => el.classList.add('in'));

  /* ---------- the loop ---------- */
  let last = 0, T = 0, started = false, slow = 0, frames = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (!started || document.hidden) { last = now; return; }
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.05) dt = 0.05;
    T += dt;
    const t = T;

    // where are we?
    const target = stageAt(scrollY);
    stage = lerp(stage, target, 1 - Math.exp(-dt * 5.5));
    if (Math.abs(stage - target) < 0.0005) stage = target;
    const k = keyAt(stage);

    // the scene leans a little towards the pointer
    const fine = ptr.on && ptr.fine && !reduce;
    par.x = lerp(par.x, fine ? ptr.px - 0.5 : 0, 1 - Math.exp(-dt * 2.5));
    par.y = lerp(par.y, fine ? ptr.py - 0.5 : 0, 1 - Math.exp(-dt * 2.5));

    // fit the subject to the screen: on tall screens it sits centred above the words
    let span = k.span, ox = k.ox, oy = k.oy;
    const aspect = grid.cols / grid.rows;
    if (portrait) { ox = 0.5; oy = lerp(k.oy, 0.36, 0.85); }
    const share = portrait ? 1 : Math.max(0.3, Math.min(ox, 1 - ox) * 2); // fraction of the width the subject can use
    span = Math.max(span, k.w / aspect / share * (portrait ? 1 : 0.9));
    const drift = reduce ? 0 : Math.sin(t * 0.11) * 0.05;
    cam.set(k.tx, k.ty, k.tz, span, k.yaw + par.x * 0.3 + drift, k.pitch + par.y * 0.07, grid.cols, grid.rows, ox, oy);

    const fo = st.focus;
    fo.x = k.tx; fo.z = k.tz; fo.r0 = k.r0; fo.r1 = k.r1;
    st.sense = k.sense; st.load = k.load;

    // air
    env.windX = 0.3 * Math.sin(t * 0.31) + 0.2 * Math.sin(t * 0.83 + 1.3);
    env.windZ = 0.26 * Math.sin(t * 0.27 + 2.1) + 0.16 * Math.sin(t * 0.71 + 0.4);
    ptr.vx *= Math.exp(-dt * 6); ptr.vy *= Math.exp(-dt * 6);
    for (const p of plants) p.update(dt, t, env);

    holes(dt);
    grid.clear();
    room.draw(grid, cam, t, st);
    for (const p of plants) p.draw(grid, cam, env);
    grid.print({ wash: 0.22 });
    marks(t);

    // if a device can't keep up, coarsen the grid a step rather than stutter
    frames++;
    if (frames > 40 && !params.has('fixed')) {
      slow = dt > 0.03 ? slow + 1 : Math.max(0, slow - 1);
      if (slow > 45 && cellBump < 3) { cellBump++; slow = 0; frames = 0; resize(true); }
    }
  }

  function start() {
    if (started) return;
    resize(true);
    started = true;
    document.documentElement.classList.add('ready');
    const hc = document.querySelector('.hero .copy');
    if (hc) setTimeout(() => hc.classList.add('in'), 250);
    stage = stageAt(scrollY);
    if (stage > 0.5) hero.t = 1e4; // arriving mid-page: the plant has had time to grow
  }

  addEventListener('resize', () => resize(false));
  addEventListener('orientationchange', () => setTimeout(() => resize(true), 200));
  addEventListener('load', measure);

  const fonts = document.fonts;
  if (fonts && fonts.load) {
    Promise.race([fonts.load('500 16px "IBM Plex Mono"'), new Promise((r) => setTimeout(r, 1800))]).then(start, start);
    fonts.ready.then(() => { if (started) { grid.buildAtlas(); measure(); } });
  } else start();
  requestAnimationFrame(frame);

  DG.debug = { grid, cam, plants, room, hero, get stage() { return stage; }, get T() { return T; } };
})();
