/* SKRABLWEB reel engine — scroll drives a camera through a CSS-3D world; a canvas draws stars, wire shapes and gates with the same camera. */
(() => {
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = s => document.getElementById(s);
  const body = document.body, root = document.documentElement;
  const cv = $('bg'), cx = cv.getContext('2d');
  const world = $('world');
  const reels = [...document.querySelectorAll('.reel')];
  const flows = [...document.querySelectorAll('.flow')];
  const D = Math.PI / 180;
  let W = innerWidth, H = innerHeight, DPR = 1, P = 900, FAR = 2400, portrait = false, SC = 1;

  const num = (el, k, def) => { const v = el.dataset[k]; return v === undefined || v === '' ? def : parseFloat(v); };
  const objs = [...document.querySelectorAll('.obj')];
  const fxs = [...document.querySelectorAll('.fx')];
  let KF = [], CH = [], shots = [];

  /* ---------------- layout ---------------- */
  function layout() {
    W = innerWidth; H = innerHeight; portrait = W / H < 0.9 || W < 700;
    // short landscape phones: phone placement (centred, flat), camera a step back, caption beside the laptop
    const short = !portrait && H < 560, back = short ? 1.3 : 1;
    root.classList.toggle('short', short);
    // one composition per orientation, scaled as a whole to fit any screen (phone, tablet, laptop, 4K)
    SC = portrait ? Math.min(W / 390, H / 844) : Math.min(W / 1440, H / 900);
    SC = Math.max(0.4, Math.min(2.4, SC));
    root.style.setProperty('--k', portrait ? '0.26' : '0.96');
    P = portrait ? 700 : 900; FAR = portrait ? 1500 : 1900; // portrait: next scene stays hidden until it is close, so texts never stack
    // canvas resolution: at most ~4 million pixels, so very large screens are not slowed down by the star field
    DPR = Math.min(devicePixelRatio || 1, W < 700 ? 1.5 : 2, Math.sqrt(4.2e6 / (W * H)));
    cv.width = W * DPR; cv.height = H * DPR;
    $('stage').style.perspective = (P * SC) + 'px';

    for (const el of objs) {
      const m = portrait || short ? 'm' : '';
      const g = (a) => num(el, m + a, num(el, a, 0));
      el._p = [g('x'), g('y'), g('z')]; el._ry = g('ry'); el._far = num(el, m + 'far', num(el, 'far', FAR));
    }
    shots = objs.filter(el => 'shot' in el.dataset);
    const n = shots.length;
    KF = shots.map((el, i) => {
      const [x, y, z] = el._p;
      const d = portrait ? num(el, 'md', num(el, 'd', 700)) : num(el, 'd', 700) * back;
      const f = num(el, 'f', 0.3);
      const camx = x * f, camy = y * num(el, 'fy', 1);
      // CSS px per screen px when this shot is framed; CSS uses it to keep small text readable on every screen
      el.style.setProperty('--px', ((P + d) / (SC * P)).toFixed(3));
      return { p: n > 1 ? i / (n - 1) : 0, x: camx, y: camy, z: z + d,
        yaw: Math.atan2(x - camx, d) / D, pitch: -Math.atan2(y - camy, d) / D + num(el, 'pitch', 0), roll: num(el, 'roll', 0) };
    });
    // 3D reels are separate stretches of the page; ordinary sections (.flow) sit between them
    reels.forEach((r, ri) => {
      r._a = +r.dataset.a; r._b = +r.dataset.b; r._lead = r.previousElementSibling ? 1 : 0;
      r.style.height = (Math.max(r._lead ? 1.2 : 2, (r._b - r._a + 1) * 1.15)) * 100 + 'vh';
    });
    // chapters in page order: shots inside reels, and flow sections
    CH = [];
    for (const el of document.querySelectorAll('.reel, .flow[data-chapter]')) {
      if (el.classList.contains('reel')) {
        for (let i = el._a; i <= el._b; i++) if (shots[i].dataset.chapter) CH.push({ reel: el, i, t: shots[i].dataset.chapter, anchor: shots[i].dataset.anchor });
      } else CH.push({ flow: el, t: el.dataset.chapter });
    }
    CH.forEach((c, i) => c.n = String(i + 1).padStart(2, '0'));
    placeAnchors();
    buildGeo();
    lastKey = ''; // positions changed: rerun the scroll-driven effects on the next frame
  }

  // scroll position (within its reel) at which shot i is framed
  function shotScroll(r, i) {
    const pa = KF[r._a].p, pb = KF[r._b].p, loc = pb > pa ? (KF[i].p - pa) / (pb - pa) : 0;
    const T = r.offsetTop, Hr = r.offsetHeight, vh = innerHeight;
    return r._lead ? T - vh + loc * Hr : T + loc * (Hr - vh);
  }
  function placeAnchors() {
    document.querySelectorAll('.reel .anchor').forEach(a => a.remove());
    CH.forEach(c => {
      if (!c.reel || !c.anchor) return;
      const a = document.createElement('span');
      a.className = 'anchor'; a.id = c.anchor; a.style.top = (shotScroll(c.reel, c.i) - c.reel.offsetTop) + 'px';
      c.reel.appendChild(a);
    });
  }
  // camera progress for the current scroll position, and whether any reel is on screen
  const hero = document.querySelector('.hero-pin');
  function heroP() { if (!hero) return -1; const r = hero.getBoundingClientRect(); return Math.max(0, Math.min(1, -r.top / Math.max(1, r.height - innerHeight))); }
  function reelState() {
    const sy = scrollY, vh = innerHeight; let p = reels.length ? KF[reels[0]._a].p : 0, vis = false;
    if (hero) { const hr = hero.getBoundingClientRect(); if (hr.bottom > 0 && heroP() > 0.48) vis = true; }
    for (const r of reels) {
      const T = r.offsetTop, Hr = r.offsetHeight;
      if (T < sy + vh && T + Hr > sy) vis = true;
      const start = r._lead ? T - vh : T;
      if (sy < start) break;
      const loc = r._lead ? (sy - T + vh) / Hr : (sy - T) / Math.max(1, Hr - vh);
      p = KF[r._a].p + (KF[r._b].p - KF[r._a].p) * Math.max(0, Math.min(1, loc));
    }
    return { p, vis };
  }

  /* ---------------- canvas geometry ---------------- */
  let stars, starN, zMin = -20000;
  const ICO_V = (() => { const t = (1 + Math.sqrt(5)) / 2; return [[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]]; })();
  const ICO_E = []; for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) { const a = ICO_V[i], b = ICO_V[j]; if (Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]) < 2.1) ICO_E.push([i, j]); }
  function buildGeo() {
    zMin = Math.min(-8000, ...objs.map(o => o._p[2])) - 6000;
    starN = W < 700 ? 420 : 900;
    stars = new Float32Array(starN * 4);
    for (let i = 0; i < starN; i++) {
      const a = Math.random() * Math.PI * 2, r = 380 + Math.pow(Math.random(), 0.7) * 2600;
      stars[i * 4] = Math.cos(a) * r; stars[i * 4 + 1] = Math.sin(a) * r * 0.7;
      stars[i * 4 + 2] = 600 + Math.random() * (zMin - 600); stars[i * 4 + 3] = Math.random();
    }
  }

  /* ---------------- camera ---------------- */
  const C = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 };
  let cyw = 1, syw = 0, cp = 1, sp = 0, cr = 1, sr = 0, now = 0;
  const ease = t => 0.3 * t + 0.7 * (t * t * (3 - 2 * t));
  function camAt(p) {
    if (KF.length === 1) { Object.assign(C, KF[0]); } else {
      let i = 0; while (i < KF.length - 2 && p > KF[i + 1].p) i++;
      const a = KF[i], b = KF[i + 1];
      const t = ease(Math.min(1, Math.max(0, (p - a.p) / (b.p - a.p))));
      for (const k of ['x', 'y', 'z', 'yaw', 'pitch', 'roll']) C[k] = a[k] + (b[k] - a[k]) * t;
    }
    C.yaw *= D; C.pitch *= D; C.roll *= D;
    if (!RM) { const tm = now / 1000; C.x += Math.sin(tm * 0.5) * 8; C.y += Math.sin(tm * 0.37) * 6; C.roll += Math.sin(tm * 0.3) * 0.004; }
    cyw = Math.cos(C.yaw); syw = Math.sin(C.yaw); cp = Math.cos(C.pitch); sp = Math.sin(C.pitch); cr = Math.cos(C.roll); sr = Math.sin(C.roll);
  }
  const out = [0, 0, 0];
  function toCam(px, py, pz) { // identical maths to the CSS transform on #world
    const x = px - C.x, y = py - C.y, z = pz - C.z;
    const x1 = cyw * x + syw * z, z1 = -syw * x + cyw * z;
    const y2 = cp * y - sp * z1, z2 = sp * y + cp * z1;
    out[0] = cr * x1 - sr * y2; out[1] = sr * x1 + cr * y2; out[2] = z2; return out;
  }
  function line3(ax, ay, az, bx, by, bz) {
    toCam(ax, ay, az); let x1 = out[0], y1 = out[1], z1 = out[2];
    toCam(bx, by, bz); let x2 = out[0], y2 = out[1], z2 = out[2];
    const n = P - 40;
    if (z1 > n && z2 > n) return;
    if (z1 > n) { const t = (n - z2) / (z1 - z2); x1 = x2 + (x1 - x2) * t; y1 = y2 + (y1 - y2) * t; z1 = n; }
    else if (z2 > n) { const t = (n - z1) / (z2 - z1); x2 = x1 + (x2 - x1) * t; y2 = y1 + (y2 - y1) * t; z2 = n; }
    const s1 = SC * P / (P - z1), s2 = SC * P / (P - z2);
    cx.moveTo(W / 2 + x1 * s1, H / 2 + y1 * s1); cx.lineTo(W / 2 + x2 * s2, H / 2 + y2 * s2);
  }
  const fog = z => Math.max(0, Math.min(1, (z + 9000) / 6000));

  /* ---------------- canvas render ---------------- */
  let lastZ = 0;
  function draw() {
    cx.setTransform(DPR, 0, 0, DPR, 0, 0);
    cx.clearRect(0, 0, W, H);
    const dz = Math.abs(C.z - lastZ); lastZ = C.z;
    const streak = RM ? 0 : Math.min(900, dz * 7);
    cx.lineCap = 'round';
    // stars are grouped by colour, opacity and width (rounded) and drawn with one stroke per group instead of one each
    const groups = new Map();
    for (let i = 0; i < starN; i++) {
      const o = i * 4; toCam(stars[o], stars[o + 1], stars[o + 2]);
      const z = out[2]; if (z > P - 60 || z < -12000) continue;
      const s = SC * P / (P - z), X = W / 2 + out[0] * s, Y = H / 2 + out[1] * s;
      if (X < -50 || X > W + 50 || Y < -50 || Y > H + 50) continue;
      const a = Math.round(fog(z) * (0.35 + stars[o + 3] * 0.65) * 12) / 12;
      if (a <= 0) continue;
      const key = (stars[o + 3] > 0.85 ? 'g' : 'w') + a + '|' + Math.round(Math.max(0.6, s * 2.2) * 2) / 2;
      let seg = groups.get(key); if (!seg) groups.set(key, seg = []);
      if (streak > 4) { toCam(stars[o], stars[o + 1], stars[o + 2] + streak); const z2 = Math.min(out[2], P - 60), s2 = SC * P / (P - z2); seg.push(X, Y, W / 2 + out[0] * s2, H / 2 + out[1] * s2); }
      else seg.push(X, Y, X + 0.01, Y);
    }
    for (const [key, seg] of groups) {
      const [ca, w] = key.split('|');
      cx.strokeStyle = (ca[0] === 'g' ? 'rgba(255,170,80,' : 'rgba(241,237,230,') + ca.slice(1) + ')';
      cx.lineWidth = +w;
      cx.beginPath();
      for (let k = 0; k < seg.length; k += 4) { cx.moveTo(seg[k], seg[k + 1]); cx.lineTo(seg[k + 2], seg[k + 3]); }
      cx.stroke();
    }
    for (const el of fxs) {
      const type = el.dataset.type, m = portrait ? 'm' : '';
      const g = (a, d) => num(el, m + a, num(el, a, d));
      const fx = g('x', 0), fy = g('y', 0), fz = g('z', 0);
      toCam(fx, fy, fz); const a = fog(out[2]);
      if (a <= 0 || (type !== 'floor' && out[2] > P + 2000)) continue;
      if (type === 'ico') {
        const R = g('r', 420), t = now / 4000, n = R / 1.902;
        const ca = Math.cos(t), sa = Math.sin(t), cb = Math.cos(t * 0.7), sb = Math.sin(t * 0.7);
        const pts = ICO_V.map(([x, y, z]) => { x *= n; y *= n; z *= n; let x1 = x * ca + z * sa, z1 = -x * sa + z * ca; const y1 = y * cb - z1 * sb; z1 = y * sb + z1 * cb; return [x1 + fx, y1 + fy, z1 + fz]; });
        cx.lineWidth = 1.4; cx.strokeStyle = `rgba(240,112,48,${0.8 * a})`; cx.beginPath();
        for (const [i, j] of ICO_E) line3(...pts[i], ...pts[j]); cx.stroke();
        cx.strokeStyle = `rgba(255,170,80,${0.3 * a})`; cx.beginPath();
        const s = 0.55; for (const [i, j] of ICO_E) { const A = pts[i], B = pts[j]; line3(fx + (A[0]-fx)*s, fy + (A[1]-fy)*s, fz + (A[2]-fz)*s, fx + (B[0]-fx)*s, fy + (B[1]-fy)*s, fz + (B[2]-fz)*s); } cx.stroke();
      } else if (type === 'ring') {
        const R = g('r', 520), idx = num(el, 'i', 0), rot = now / 3000 * (idx % 2 ? -1 : 1);
        cx.lineWidth = 2; cx.strokeStyle = `rgba(240,112,48,${0.9 * a})`; cx.beginPath();
        for (let s = 0; s < 96; s++) { const a1 = s / 96 * Math.PI * 2, a2 = (s + 1) / 96 * Math.PI * 2; line3(fx + Math.cos(a1) * R, fy + Math.sin(a1) * R, fz, fx + Math.cos(a2) * R, fy + Math.sin(a2) * R, fz); }
        cx.stroke();
        cx.lineWidth = 1; cx.strokeStyle = `rgba(255,170,80,${0.45 * a})`; cx.beginPath();
        for (let s = 0; s < 48; s += 2) { const a1 = rot + s / 48 * Math.PI * 2, a2 = rot + (s + 1) / 48 * Math.PI * 2, r2 = R * 1.14; line3(fx + Math.cos(a1) * r2, fy + Math.sin(a1) * r2, fz - 60, fx + Math.cos(a2) * r2, fy + Math.sin(a2) * r2, fz - 60); }
        cx.stroke();
        cx.strokeStyle = `rgba(241,237,230,${0.3 * a})`; cx.beginPath();
        for (let s = 0; s < 60; s++) { const an = s / 60 * Math.PI * 2, l = s % 5 ? 20 : 45; line3(fx + Math.cos(an) * (R + 12), fy + Math.sin(an) * (R + 12), fz, fx + Math.cos(an) * (R + 12 + l), fy + Math.sin(an) * (R + 12 + l), fz); }
        cx.stroke();
      } else if (type === 'floor') {
        const y = g('y', 460), z0 = fz + 3000, z1 = fz - 7000;
        toCam(0, y, fz); if (out[2] < -6000) continue;
        cx.lineWidth = 1; cx.strokeStyle = 'rgba(127,184,255,.2)'; cx.beginPath();
        for (let x = -3200; x <= 3200; x += 320) line3(x, y, z0, x, y, z1);
        for (let z = z0; z >= z1; z -= 450) line3(-3200, y, z, 3200, y, z);
        cx.stroke();
      }
    }
  }

  function placeObjects() {
    world.style.transform = `scale3d(${SC},${SC},${SC}) rotateZ(${C.roll}rad) rotateX(${C.pitch}rad) rotateY(${C.yaw}rad) translate3d(${-C.x}px,${-C.y}px,${-C.z}px)`;
    for (const el of objs) {
      const [x, y, z] = el._p; toCam(x, y, z);
      const zc = out[2];
      const o = Math.max(0, Math.min(1, (P * 0.2 - zc) / (P * 0.35))) * Math.max(0, Math.min(1, (zc + el._far) / 600));
      if (o < 0.01) { if (el._vis !== false) { el.style.visibility = 'hidden'; el._vis = false; } continue; }
      if (el._vis !== true) { el.style.visibility = 'visible'; el._vis = true; }
      // write styles only when they change: unchanged writes still make the browser recalculate styles every frame
      const op = o.toFixed(2), pe = o > 0.6 ? 'auto' : 'none', tf = `translate3d(${x}px,${y}px,${z}px) rotateY(${el._ry}deg) translate(-50%,-50%)`;
      if (el._op !== op) el.style.opacity = el._op = op;
      if (el._pe !== pe) el.style.pointerEvents = el._pe = pe;
      if (el._tf !== tf) el.style.transform = el._tf = tf;
    }
  }

  /* ---------------- HUD ---------------- */
  const tc = $('tc'), TOTAL = num(body, 'dur', 90) * 25;
  let chapIdx = -1, lowerTimer;
  const pad = n => String(n).padStart(2, '0');
  if (tc) tc.lastElementChild.textContent = `/ 00:${pad(Math.floor(TOTAL / 1500))}:${pad(Math.floor(TOTAL / 25) % 60)}:00`;
  function hud(p) {
    const pg = Math.max(0, Math.min(1, scrollY / Math.max(1, root.scrollHeight - innerHeight)));
    const f = Math.round(pg * TOTAL);
    const tcs = `00:${pad(Math.floor(f / 1500))}:${pad(Math.floor(f / 25) % 60)}:${pad(f % 25)} `;
    if (tc && tc.firstChild.nodeValue !== tcs) tc.firstChild.nodeValue = tcs;
    let ci = 0, mid = scrollY + innerHeight * 0.5;
    CH.forEach((c, i) => {
      if (c.flow) { if (c.flow.offsetTop <= mid) ci = i; }
      else if (shotScroll(c.reel, c.i) - innerHeight * 0.35 <= scrollY) ci = i;
    });
    if (CH.length && ci !== chapIdx) {
      chapIdx = ci; const c = CH[ci];
      $('lowerN').textContent = 'Poglavje ' + c.n; $('lowerT').textContent = c.t;
      const lw = $('lower'); clearTimeout(lowerTimer); if (c.flow) { lw.classList.remove('on'); return; } lw.classList.add('on');
      lowerTimer = setTimeout(() => lw.classList.remove('on'), 2600);
    }
  }

  /* ---------------- ordinary sections: scroll animations ---------------- */
  const stage = $('stage'), credits = $('credits');
  // --- extra text / scroll details for the ordinary sections and the end credits
  const cred = $('credits');
  if (cred) {
    cred.querySelectorAll('h2').forEach(h => h.classList.add('wsplit'));
    cred.querySelectorAll('.kicker').forEach(k => k.classList.add('scr'));
    cred.querySelectorAll('.roll > div').forEach((d, i) => { d.classList.add('rv'); d.style.setProperty('--d', (i * 0.08) + 's'); });
    cred.querySelectorAll('form, .links, .cwrap > div > .btn').forEach(el => el.classList.add('rv'));
    cred.querySelectorAll('.links a, .chk').forEach((el, i) => { el.classList.add('rv'); el.style.setProperty('--d', (0.05 * (i % 6)) + 's'); });
  }
  for (const f of flows) {
    if (f.classList.contains('marquee')) continue;
    const line = document.createElement('i'); line.className = 'sline'; f.prepend(line);
    if (f.dataset.chapter) { const bw = document.createElement('div'); bw.className = 'bgword'; bw.dataset.dir = f.id === 'o_nas' ? 1 : -1; bw.setAttribute('aria-hidden', 'true'); bw.textContent = (f.dataset.chapter + ' · ').repeat(3); f.prepend(bw); }
  }
  document.querySelectorAll('.fh').forEach(h => { h.classList.remove('rv'); h.classList.add('wsplit'); });
  document.querySelectorAll('.kick').forEach(k => k.classList.add('scr'));
  // headings: every word slides up out of a mask
  for (const h of document.querySelectorAll('.wsplit')) {
    let i = 0;
    const wrap = node => {
      for (const n of [...node.childNodes]) {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(t => {
            if (!t) return;
            if (/^\s+$/.test(t)) { frag.append(' '); return; }
            const o = document.createElement('span'); o.className = 'w';
            const s = document.createElement('span'); s.textContent = t; s.style.setProperty('--i', i++);
            o.append(s); frag.append(o);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') wrap(n);
      }
    };
    wrap(h);
  }
  // small labels decode like a terminal when they appear
  const GLYPH = 'ABCDEFGHIJKLMNOPRSTUVZČŠŽ0123456789/#_';
  function scramble(el) {
    const txt = el.dataset.txt || (el.dataset.txt = el.textContent), n = txt.length, t0 = performance.now(), dur = 700 + n * 18;
    const st = t => {
      const k = Math.min(1, (t - t0) / dur), done = Math.floor(k * n);
      el.textContent = txt.slice(0, done) + [...txt.slice(done)].map(c => c === ' ' ? ' ' : GLYPH[(Math.random() * GLYPH.length) | 0]).join('');
      if (k < 1) requestAnimationFrame(st); else el.textContent = txt;
    };
    requestAnimationFrame(st);
  }
  // service cards: a light that follows the pointer and a slight tilt
  for (const c of document.querySelectorAll('.scard')) {
    c.addEventListener('pointermove', ev => {
      const r = c.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
      c.style.setProperty('--mx', (x * 100) + '%'); c.style.setProperty('--my', (y * 100) + '%');
      if (!RM) c.style.transform = `perspective(900px) rotateX(${((0.5 - y) * 8).toFixed(2)}deg) rotateY(${((x - 0.5) * 10).toFixed(2)}deg) translateY(-6px)`;
    });
    c.addEventListener('pointerleave', () => { c.style.transform = ''; });
  }
  const reveals = [...document.querySelectorAll('.rv, .clip, .wsplit, .scr')];
  if ('IntersectionObserver' in window && !RM) {
    const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); if (en.target.classList.contains('scr')) scramble(en.target); io.unobserve(en.target); } }), { rootMargin: '0px 0px -12% 0px' });
    reveals.forEach(el => io.observe(el));
  } else reveals.forEach(el => el.classList.add('in'));
  // counters
  for (const el of document.querySelectorAll('[data-count]')) {
    const to = +el.dataset.count, run = () => { const t0 = performance.now(); const st = t => { const k = Math.min(1, (t - t0) / 1400); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(st); }; requestAnimationFrame(st); };
    if (RM || !('IntersectionObserver' in window)) { el.textContent = to; continue; }
    el.textContent = '0';
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { run(); io.disconnect(); } }, { threshold: 0.6 }); io.observe(el);
  }
  // split text for word-by-word fill
  // text that changes from grey to colour word by word while you scroll (keeps <em> accents)
  for (const el of document.querySelectorAll('.fillwords')) {
    const wrapW = node => { for (const n of [...node.childNodes]) {
      if (n.nodeType === 3) { const fr = document.createDocumentFragment(); n.textContent.split(/(\s+)/).forEach(t => { if (!t) return; if (/^\s+$/.test(t)) fr.append(' '); else { const sp = document.createElement('span'); sp.className = 'fw'; sp.textContent = t; fr.append(sp); } }); n.replaceWith(fr); }
      else if (n.nodeType === 1) wrapW(n);
    } };
    wrapW(el); el._w = [...el.querySelectorAll('.fw')];
  }
  const clamp01 = v => Math.max(0, Math.min(1, v));
  function flowFx() {
    const vh = innerHeight;
    for (const f of flows) {
      const r = f.getBoundingClientRect();
      if (r.bottom < -vh * 0.2 || r.top > vh * 1.2) continue;
      f.style.setProperty('--sl', clamp01((vh - r.top) / (vh * 0.9)).toFixed(3));
      // horizontal marquee rows move with the page
      for (const row of f.querySelectorAll('[data-dir]')) row.style.transform = `translate3d(${(r.top * 0.45 * +row.dataset.dir - (+row.dataset.dir > 0 ? 900 : 300)).toFixed(1)}px,0,0)`;
      // parallax
      for (const el of f.querySelectorAll('[data-par]')) { const q = el.getBoundingClientRect(); el.style.transform = `translate3d(0,${(((q.top + q.height / 2) - vh / 2) * -+el.dataset.par).toFixed(1)}px,0)`; }
      // cards/images that tilt up out of 3D as they reach the middle
      for (const el of f.querySelectorAll('.tilt')) {
        const q = el.getBoundingClientRect(), t = Math.max(-1, Math.min(1, ((q.top + q.height / 2) - vh / 2) / vh));
        el.style.transform = RM ? '' : `perspective(1200px) rotateX(${(t * 26).toFixed(2)}deg) scale(${(1 - Math.abs(t) * 0.12).toFixed(3)})`;
      }
      // sticky process: line fills and steps light up
      const pr = f.querySelector('.ptrack');
      if (pr) {
        const q = pr.getBoundingClientRect(), k = clamp01((vh * 0.55 - q.top) / q.height);
        pr.style.setProperty('--fill', k.toFixed(3));
        for (const st of pr.querySelectorAll('.pstep')) { const b = st.getBoundingClientRect(); st.classList.toggle('on', b.top < vh * 0.6); }
      }
      // words fill in as the paragraph scrolls through
      for (const el of f.querySelectorAll('.fillwords')) {
        const q = el.getBoundingClientRect(), k = clamp01((vh * 0.8 - q.top) / (q.height + vh * 0.25)), sp = el._w, n = sp.length;
        for (let i = 0; i < n; i++) sp[i].classList.toggle('lit', i < k * n * 1.08);
      }
      // zoom: a small framed picture grows to fill the screen, then its title splits apart and new content appears
      for (const z of f.querySelectorAll('.zpin')) {
        const sec = z.parentElement, q = sec.getBoundingClientRect(), k = clamp01(-q.top / Math.max(1, q.height - vh));
        const ez = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        const a = ez(clamp01(k / 0.5)), b = ez(clamp01((k - 0.5) / 0.3));
        const small = innerWidth < 760 ? [30, 8] : [27, 31]; // inset in vh / vw at the start
        z.style.setProperty('--it', ((1 - a) * small[0]).toFixed(2) + 'vh');
        z.style.setProperty('--il', ((1 - a) * small[1]).toFixed(2) + 'vw');
        z.style.setProperty('--rad', ((1 - a) * 22).toFixed(1) + 'px');
        z.style.setProperty('--a', a.toFixed(3));
        z.style.setProperty('--b', b.toFixed(3));
        const rv = z.querySelector('.zreveal'); if (rv) rv.style.pointerEvents = b > 0.9 ? 'auto' : 'none';
      }
    }
  }

  /* ---------------- HERO · Š scene ---------------- */
  const seg = (p, a, b) => Math.max(0, Math.min(1, (p - a) / (b - a)));
  const eio = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  let hkRect = null;
  const hst = hero && hero.querySelector('.hstage'), hbig = hero && hero.querySelector('.hbig'), hhk = hero && hero.querySelector('.hhk path');
  if (hero) { if (RM) hero.classList.add('go'); else requestAnimationFrame(() => hero.classList.add('go')); }
  function heroRun() {
    if (!hero || RM) return;
    const r = hero.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return;
    const p = heroP(), vw = innerWidth, vh = innerHeight;
    hero.classList.toggle('scrolled', p > 0.002);
    const a = eio(seg(p, 0, .3)), b = eio(seg(p, .26, .5)), c = seg(p, .5, .97);
    hst.style.setProperty('--a', a.toFixed(4));
    if (b <= 0.001 || !hkRect) { const q = hhk.getBoundingClientRect(); if (q.width > 0) hkRect = { x: q.left, y: q.top, w: q.width }; }
    if (!hkRect) return;
    const tw = Math.min(vw * 0.46, 520), x = hkRect.x + ((vw - tw) / 2 - hkRect.x) * b, y = hkRect.y + ((vh / 2 - tw * 23 / 42 * 0.78) - hkRect.y) * b, w = hkRect.w + (tw - hkRect.w) * b;
    hst.style.setProperty('--bon', b > 0.001 ? 1 : 0);
    hbig.style.width = w + 'px'; hbig.style.height = (w * 23 / 42) + 'px';
    hbig.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
    // the solid háček hands over to a háček-shaped window that grows until the 3D reel fills the screen
    hbig.style.opacity = b > 0.001 ? (1 - seg(c, 0, .12)).toFixed(3) : 0;
    if (c > 0) {  // grow around the middle of the chevron's band (78% down its height), not its empty notch
      const hs = tw * Math.pow(70, eio(c));
      hst.classList.add('hole'); hst.style.setProperty('--hs', hs.toFixed(1) + 'px');
      hst.style.setProperty('--hp', `${(vw / 2 - hs / 2).toFixed(1)}px ${(vh / 2 - hs * 23 / 42 * 0.78).toFixed(1)}px`);
    }
    else hst.classList.remove('hole');
  }

  /* ---------------- menu ---------------- */
  const menu = $('menu'), openBtn = $('menuOpen'), closeBtn = $('menuClose');
  function setMenu(on) {
    body.classList.toggle('menu-open', on);
    openBtn.setAttribute('aria-expanded', on);
    menu.setAttribute('aria-hidden', !on);
    if (on) closeBtn.focus(); else openBtn.focus({ preventScroll: true });
  }
  openBtn.addEventListener('click', () => setMenu(true));
  closeBtn.addEventListener('click', () => setMenu(false));
  addEventListener('keydown', e => { if (e.key === 'Escape' && body.classList.contains('menu-open')) setMenu(false); });
  menu.addEventListener('click', e => { const a = e.target.closest('a'); if (a) body.classList.remove('menu-open'); });


  /* ---------------- form (optional) ---------------- */
  const form = $('form');
  // sends in the background to the Google Apps Script web app in the form action (it emails the message to the owner's
  // Gmail) and shows the result under the button; without JS/fetch the form still posts normally
  const fmsg = $('fmsg'), say = (t, ok) => { fmsg.textContent = t; fmsg.className = ok === undefined ? '' : ok ? 'ok' : 'err'; };
  const THANKS = 'Hvala! Sporočilo je poslano, odgovorim vam v najkrajšem možnem času.';
  if (form && window.fetch) form.addEventListener('submit', async e => {
    e.preventDefault();
    if (form.botcheck && form.botcheck.checked) return; // bot
    const btn = form.querySelector('button[type=submit]'), fd = new FormData(form), data = {};
    for (const [k, v] of fd) if (k !== 'storitve') data[k] = v;
    data.storitve = fd.getAll('storitve').join(', ') || '—'; // every ticked service, not only the last one
    data.paket = data.paket || '—';
    if (data.paket !== '—') data.sporocilo = 'IZBRANI PAKET: ' + data.paket + '\n\n' + (data.sporocilo || ''); // also in the message, so it shows in the e-mail whatever template the script uses
    btn.disabled = true; say('Pošiljam …');
    try {
      // plain-text body keeps this a "simple" request (no CORS preflight, which Apps Script does not answer)
      const r = await fetch(form.action, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.success === true) { form.reset(); say(THANKS, true); }
      else throw new Error(j.message || r.status);
    } catch (err) {
      console.warn('form:', err);
      say('Pošiljanje ni uspelo. Pišite mi na skrablrok1@gmail.com ali pokličite +386 30 239 005.', false);
    } finally { btn.disabled = false; }
  });
  if (fmsg && /[?&]poslano=1/.test(location.search)) say(THANKS, true);

  /* ---------------- cookie notice ---------------- */
  // the site sets no cookies: this only informs, links the privacy policy and remembers (localStorage) that it was closed
  (() => {
    try { if (localStorage.getItem('sw-cookies') === '1') return; } catch (e) {}
    const n = document.createElement('div');
    n.className = 'cookie'; n.setAttribute('role', 'region'); n.setAttribute('aria-label', 'Obvestilo o piškotkih');
    n.innerHTML = '<p><b>Piškotki</b>Ta stran ne uporablja piškotkov za sledenje ali oglaševanje. Več v <a href="zasebnost.html">politiki zasebnosti</a>.</p><button class="btn" type="button">V redu</button>';
    n.querySelector('button').addEventListener('click', () => {
      try { localStorage.setItem('sw-cookies', '1'); } catch (e) {}
      n.classList.remove('on'); setTimeout(() => n.remove(), 450);
    });
    body.appendChild(n);
    setTimeout(() => n.classList.add('on'), 900);
  })();

  /* ---------------- loop ---------------- */
  let last = performance.now(), frame = 0, moveTimer, prog = 0, vel = 0, lastAb = '', lastVis = null, lastKey = '';
  addEventListener('scroll', () => { body.classList.add('moving'); clearTimeout(moveTimer); moveTimer = setTimeout(() => body.classList.remove('moving'), 180); }, { passive: true });
  function tick(t) {
    const dt = Math.min(64, t - last); last = t; now = t;
    const st = reelState(), target = st.p;
    const prev = prog;
    prog = (RM || !st.vis) ? target : prog + (target - prog) * Math.min(1, dt / 1000 * 4.5);
    if (Math.abs(target - prog) < 1e-5) prog = target;
    vel = vel * 0.85 + (prog - prev) * 0.15;
    // chromatic edge on headings: the value lives on #world (only its headings use it) and is written only when it changes
    const ab = RM ? 0 : Math.max(-10, Math.min(10, vel * 9000)), abs = Math.abs(ab) > 0.4 ? ab.toFixed(1) : '0';
    if (abs !== lastAb) { world.style.setProperty('--ab', abs); body.classList.toggle('ab-on', abs !== '0'); lastAb = abs; }
    if (st.vis !== lastVis) { stage.style.visibility = st.vis ? 'visible' : 'hidden'; lastVis = st.vis; }
    // scroll-driven work only when the page actually scrolled or resized
    const key = scrollY + '|' + innerHeight + '|' + innerWidth, scrolled = key !== lastKey;
    // idle (nothing scrolled, camera settled): the slow background drift runs at 30 fps instead of 60
    frame++;
    if (st.vis && (scrolled || prog !== target || frame % 2 === 0)) { camAt(prog); draw(); placeObjects(); }
    if (scrolled) {
      lastKey = key;
      hud(prog); flowFx(); heroRun();
      body.classList.toggle('rolling', credits.getBoundingClientRect().top < innerHeight * 0.45);
    }
    requestAnimationFrame(tick);
  }

  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(layout, 120); });
  layout();
  // jump to a chapter anchor (e.g. index.html#reference) once markers exist
  if (location.hash) { const tgt = document.getElementById(location.hash.slice(1)); if (tgt) requestAnimationFrame(() => { tgt.scrollIntoView(); prog = reelState().p; }); }
  requestAnimationFrame(tick);
})();

/* ---------- SOFT SCROLL — mouse wheel / trackpad and in-page links glide instead of jumping (desktop only;
   touch screens keep their native scrolling, reduced-motion users keep normal scrolling) ---------- */
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !matchMedia('(hover:hover) and (pointer:fine)').matches) return;
  const root = document.scrollingElement || document.documentElement;
  let target = scrollY, cur = scrollY, raf = 0, last = 0;
  const maxY = () => root.scrollHeight - innerHeight, clampY = v => Math.max(0, Math.min(maxY(), v));
  function step(t) {
    const dt = last ? Math.min(64, t - last) : 16.67; last = t;
    cur += (target - cur) * (1 - Math.pow(0.9, dt / 16.67));      // ease towards the target, same feel at any refresh rate
    if (Math.abs(target - cur) < 0.4) cur = target;
    window.scrollTo({ top: cur, behavior: 'instant' });
    if (cur !== target) raf = requestAnimationFrame(step); else { raf = 0; last = 0; }
  }
  function glide(y) { if (!raf) cur = scrollY; target = clampY(y); if (!raf) raf = requestAnimationFrame(step); }
  function innerScroller(el) {
    for (; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
      const s = getComputedStyle(el);
      if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1) return el;
    }
    return null;
  }
  addEventListener('wheel', e => {
    if (e.ctrlKey || e.defaultPrevented || document.body.classList.contains('menu-open')) return;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || innerScroller(e.target)) return;
    e.preventDefault();
    const d = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY;
    glide((raf ? target : scrollY) + d);
  }, { passive: false });
  // keyboard, scrollbar dragging and find-in-page still scroll natively; keep in sync with them
  addEventListener('scroll', () => { if (!raf) target = cur = scrollY; }, { passive: true });
  addEventListener('resize', () => { target = clampY(target); });
  document.addEventListener('click', e => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const a = e.target.closest && e.target.closest('a[href*="#"]'); if (!a) return;
    const u = new URL(a.getAttribute('href'), location.href);
    if (u.pathname !== location.pathname || u.search !== location.search || !u.hash || u.hash === '#') return;
    const el = document.getElementById(decodeURIComponent(u.hash.slice(1))); if (!el) return;
    e.preventDefault(); history.pushState(null, '', u.hash);
    glide(el.getBoundingClientRect().top + scrollY);
  });
})();

/* ---------- CENIK · "Izberi paket" selects that package in the contact form (it is sent with the e-mail) ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-paket]'); if (!b) return;
  const r = [...document.querySelectorAll('input[name="paket"]')].find(x => x.value === b.dataset.paket); if (r) r.checked = true;
  const sv = b.dataset.sv && document.getElementById(b.dataset.sv); if (sv) sv.checked = true;
  const fs = document.getElementById('paket');
  if (fs) { fs.classList.remove('flash'); void fs.offsetWidth; fs.classList.add('flash'); }
});
