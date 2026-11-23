// The HyperSea look's behaviour, on every page (css/hypersea.css draws it):
// the theme pill and motion setting, the mobile menu, reveal on scroll, the Fleet Codex full screen,
// the Arcade filter and sort, the Voyages galaxy map, the Pilot Codex, and the Start button under the Toybox.
// The theme and motion are applied before first paint by the inline script in _includes/hs-head.html.
(function () {
  'use strict';
  var root = document.documentElement;
  root.classList.add('hs-js');
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function $$(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function press(list, on) { list.forEach(function (b) { b.setAttribute('aria-pressed', b === on ? 'true' : 'false'); }); }

  // ── theme and motion ──────────────────────────────────────
  var pill = document.querySelector('[data-theme-open]');
  var pop = document.getElementById('hs-theme');
  if (pill && pop) {
    var themeBtns = $$('[data-theme]', pop), moBtns = $$('[data-motion]', pop);
    var nameEl = pill.querySelector('.nm');
    function curTheme() { var m = root.className.match(/\bth-([a-z]+)/); return m ? m[1] : 'photic'; }
    function curMotion() { return root.classList.contains('mo-off') ? 'off' : root.classList.contains('mo-calm') ? 'calm' : 'full'; }
    function sync() {
      var t = curTheme();
      press(themeBtns, themeBtns.filter(function (b) { return b.dataset.theme === t; })[0]);
      press(moBtns, moBtns.filter(function (b) { return b.dataset.motion === curMotion(); })[0]);
      var on = themeBtns.filter(function (b) { return b.dataset.theme === t; })[0];
      if (nameEl && on) nameEl.textContent = on.dataset.name;
    }
    function open(v) {
      pop.hidden = !v;
      pill.setAttribute('aria-expanded', String(v));
      if (v) { sync(); (themeBtns.filter(function (b) { return b.getAttribute('aria-pressed') === 'true'; })[0] || themeBtns[0]).focus(); }
    }
    pill.addEventListener('click', function (e) { e.stopPropagation(); open(pop.hidden); });
    $$('[data-theme-close]', pop).forEach(function (b) { b.addEventListener('click', function () { open(false); pill.focus(); }); });
    themeBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        root.className = root.className.replace(/\bth-[a-z]+/g, '').trim() + ' th-' + b.dataset.theme;
        store('fg_theme', b.dataset.theme); sync();
      });
    });
    moBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        root.classList.remove('mo-full', 'mo-calm', 'mo-off');
        root.classList.add('mo-' + b.dataset.motion);
        store('fg_motion', b.dataset.motion); sync();
      });
    });
    document.addEventListener('click', function (e) { if (!pop.hidden && !pop.contains(e.target)) open(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !pop.hidden) { open(false); pill.focus(); } });
    sync();
  }

  // ── mobile menu ───────────────────────────────────────────
  var menu = document.querySelector('.hs-menu'), nav = document.getElementById('hs-nav');
  if (menu && nav) {
    menu.addEventListener('click', function () {
      var o = nav.classList.toggle('open');
      menu.setAttribute('aria-expanded', String(o));
      menu.textContent = o ? 'Close' : 'Menu';
    });
  }

  // ── reveal on scroll ──────────────────────────────────────
  var rv = $$('.rv, .hs-gc');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add(e.target.classList.contains('hs-gc') ? 'in-view' : 'in'); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    rv.forEach(function (el) { io.observe(el); });
  } else {
    rv.forEach(function (el) { el.classList.add('in'); });
  }

  // ── Arcade: filter by element, sort ───────────────────────
  var ag = document.getElementById('hs-games');
  if (ag) {
    var cards = $$('.hs-gc', ag), elBtns = $$('[data-el]'), soBtns = $$('[data-sort]'), elx = document.getElementById('hs-elx');
    var ORDER = ['Time', 'Charge', 'Mass', 'Space', 'Party'];
    var state = { el: 'all', so: 'el' };
    function apply() {
      var list = cards.slice();
      list.sort(function (a, b) {
        var an = a.dataset.name, bn = b.dataset.name;
        if (state.so === 'az') return an.localeCompare(bn);
        if (state.so === 'vs') return a.dataset.hull.localeCompare(b.dataset.hull) || an.localeCompare(bn);
        return ORDER.indexOf(a.dataset.el) - ORDER.indexOf(b.dataset.el) || an.localeCompare(bn);
      });
      var shown = 0;
      list.forEach(function (c) {
        var on = state.el === 'all' || c.dataset.el === state.el;
        c.hidden = !on;
        if (on) { c.style.setProperty('--i', Math.min(shown++, 24)); c.classList.remove('in-view'); void c.offsetWidth; c.classList.add('in-view'); }
        ag.appendChild(c);
      });
      press(elBtns, elBtns.filter(function (b) { return b.dataset.el === state.el; })[0]);
      press(soBtns, soBtns.filter(function (b) { return b.dataset.sort === state.so; })[0]);
      if (elx) {
        var src = elBtns.filter(function (b) { return b.dataset.el === state.el; })[0];
        elx.hidden = state.el === 'all';
        if (src && state.el !== 'all') {
          elx.querySelector('b').textContent = src.dataset.title;
          elx.querySelector('span:not(.hs-pe)').textContent = src.dataset.line;
          elx.querySelector('.hs-pe').style.backgroundImage = 'url(' + src.dataset.icon + ')';
        }
      }
    }
    elBtns.forEach(function (b) { b.addEventListener('click', function () { state.el = b.dataset.el; apply(); }); });
    soBtns.forEach(function (b) { b.addEventListener('click', function () { state.so = b.dataset.sort; apply(); }); });
    var h = location.hash.slice(1);
    if (ORDER.indexOf(h) >= 0) { state.el = h; apply(); }
  }

  // ── Voyages: the galaxy map, five zoom levels, dragged and zoomed like the game's chart ──
  // Each level is one picture. Drag to pan; the wheel, a pinch, a double-click or + and − zoom it.
  // Zooming past a level's closest view dives into the next level; zooming out past its widest view
  // climbs back out, so the five pictures read as one continuous chart.
  var mapv = document.getElementById('hs-mapv');
  if (mapv) {
    var tiers = $$('[data-tier]'), imgs = $$('img', mapv), ti = 0;
    var cap = mapv.querySelector('.cap'), sc = mapv.querySelector('.sc');
    var MAXS = 3.2, vw = 0, vh = 0, s = 1, x = 0, y = 0, busy = false;
    function size() { vw = mapv.clientWidth; vh = mapv.clientHeight; }
    function clamp() {
      s = Math.max(1, Math.min(MAXS, s));
      x = Math.min(0, Math.max(vw - vw * s, x));
      y = Math.min(0, Math.max(vh - vh * s, y));
    }
    function paint() {
      clamp();
      imgs[ti].style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')';
      var w = tiers[ti].dataset.width, n = parseFloat(w.replace(/,/g, ''));
      sc.firstChild.nodeValue = s > 1.05 ? '≈ ' + Math.round(n / s).toLocaleString('en-GB') + ' ly' : w;
    }
    function label() {
      var t = tiers[ti];
      press(tiers, t);
      cap.querySelector('b').textContent = t.dataset.name;
      cap.querySelector('span').textContent = t.dataset.what;
    }
    // go to level i; dir +1 dives in (the new picture grows out of the middle), -1 climbs out
    function tier(i, dir) {
      i = Math.max(0, Math.min(tiers.length - 1, i));
      if (i === ti) { s = 1; x = 0; y = 0; paint(); return; }
      var old = imgs[ti];
      old.classList.remove('on');
      old.classList.toggle('out', i > ti);
      old.style.transform = '';
      ti = i;
      var im = imgs[ti];
      im.classList.remove('out');
      if (dir < 0) { s = MAXS * 0.8; x = (vw - vw * s) / 2; y = (vh - vh * s) / 2; } else { s = 1; x = 0; y = 0; }
      im.classList.add('on');
      label(); paint();
      busy = !root.classList.contains('mo-off');
      setTimeout(function () { busy = false; }, 450);
    }
    function zoomAt(f, px, py) {
      if (busy) return;
      var ns = s * f;
      if (ns > MAXS && ti < tiers.length - 1 && s >= MAXS - 0.01) return tier(ti + 1, 1);
      if (ns < 1 && ti > 0 && s <= 1.01) return tier(ti - 1, -1);
      ns = Math.max(1, Math.min(MAXS, ns));
      x = px - (px - x) * (ns / s); y = py - (py - y) * (ns / s); s = ns;
      paint();
    }
    function local(e) { var r = mapv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    mapv.addEventListener('wheel', function (e) {
      e.preventDefault();
      var p = local(e), d = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      zoomAt(Math.exp(-d * 0.0016), p[0], p[1]);
    }, { passive: false });
    var pts = new Map(), pinch = null;
    mapv.addEventListener('pointerdown', function (e) {
      if (e.target.closest('button, a')) return;
      if (mapv.setPointerCapture) mapv.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, local(e));
      mapv.classList.add('drag');
    });
    mapv.addEventListener('pointermove', function (e) {
      if (!pts.has(e.pointerId)) return;
      var p = local(e);
      if (pts.size >= 2) {
        pts.set(e.pointerId, p);
        var two = Array.from(pts.values()), a = two[0], b = two[1];
        var dist = Math.hypot(a[0] - b[0], a[1] - b[1]), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (pinch) { x += mid[0] - pinch.m[0]; y += mid[1] - pinch.m[1]; zoomAt(dist / pinch.d, mid[0], mid[1]); }
        pinch = { d: dist, m: mid };
        return;
      }
      var q = pts.get(e.pointerId);
      x += p[0] - q[0]; y += p[1] - q[1];
      pts.set(e.pointerId, p);
      paint();
    });
    function up(e) { pts.delete(e.pointerId); pinch = null; if (!pts.size) mapv.classList.remove('drag'); }
    mapv.addEventListener('pointerup', up);
    mapv.addEventListener('pointercancel', up);
    mapv.addEventListener('dblclick', function (e) { var p = local(e); zoomAt(1.8, p[0], p[1]); });
    mapv.addEventListener('keydown', function (e) {
      var k = e.key, st = 60;
      if (k === '+' || k === '=') zoomAt(1.4, vw / 2, vh / 2);
      else if (k === '-' || k === '_') zoomAt(1 / 1.4, vw / 2, vh / 2);
      else if (k === 'ArrowLeft') { x += st; paint(); } else if (k === 'ArrowRight') { x -= st; paint(); }
      else if (k === 'ArrowUp') { y += st; paint(); } else if (k === 'ArrowDown') { y -= st; paint(); }
      else return;
      e.preventDefault();
    });
    tiers.forEach(function (b, i) { b.addEventListener('click', function () { tier(i, i > ti ? 1 : -1); }); });
    $$('[data-zoom]').forEach(function (b) { b.addEventListener('click', function () { zoomAt(Number(b.dataset.zoom) > 0 ? 1.6 : 1 / 1.6, vw / 2, vh / 2); }); });
    window.addEventListener('resize', function () { size(); paint(); });
    size(); label(); paint();
  }

  // ── Pilots: the Pilot Codex ───────────────────────────────
  var pf = document.getElementById('hs-pilot');
  if (pf) {
    var pbtns = $$('[data-pilot]'), gbtns = $$('[data-pgroup]');
    function pick(b) {
      press(pbtns, b);
      var d = b.dataset, img = pf.querySelector('img');
      img.src = d.img; img.alt = d.pilot + ', a pilot';
      img.style.animation = 'none'; void img.offsetWidth; img.style.animation = '';
      pf.querySelector('[data-f="kick"]').textContent = 'Callsign ' + d.no + ' · ' + d.group;
      pf.querySelector('h3').textContent = d.pilot;
      pf.querySelector('[data-f="sees"]').textContent = d.sees;
    }
    pbtns.forEach(function (b) { b.addEventListener('click', function () { pick(b); }); });
    gbtns.forEach(function (g) {
      g.addEventListener('click', function () {
        press(gbtns, g);
        var first = null;
        pbtns.forEach(function (b) { var on = g.dataset.pgroup === 'All' || b.dataset.group === g.dataset.pgroup; b.hidden = !on; if (on && !first) first = b; });
        if (first) pick(first);
      });
    });
    var hp = location.hash.slice(1).toLowerCase();
    var deep = hp && pbtns.filter(function (b) { return b.id === hp; })[0];
    if (deep) { pick(deep); if (deep.scrollIntoView) deep.scrollIntoView({ block: 'center' }); }
  }

  // ── the Start button under the Toybox screen ──────────────
  var start = document.getElementById('hs-start');
  var launch = document.getElementById('launch');
  if (start && launch) {
    start.addEventListener('click', function () { start.hidden = true; launch.click(); });
    var gate = document.getElementById('stateGate');
    if (gate) gate.addEventListener('click', function (e) { if (!e.target.closest('#launch')) { start.hidden = true; launch.click(); } });
    if (gate && 'MutationObserver' in window) {
      new MutationObserver(function () { start.hidden = gate.hidden; }).observe(gate, { attributes: true, attributeFilter: ['hidden'] });
    }
  } else if (start) {
    start.hidden = true;
  }
})();
