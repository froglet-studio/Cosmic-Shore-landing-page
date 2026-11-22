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

  // ── the Fleet Codex, full screen ──────────────────────────
  // Any [data-codex] opens it: the value is a vessel's codex key, or "" for the fleet. The codex itself is the
  // page at /fleet-codex/ (tools/sync_fleet_codex.py), shown in a frame so it stays exactly what the studio publishes.
  var cxo = document.getElementById('hs-codex');
  if (cxo) {
    var frame = cxo.querySelector('iframe'), vsBtns = $$('[data-cx-key]', cxo), ext = cxo.querySelector('.ext');
    var keys = vsBtns.map(function (b) { return b.dataset.cxKey; });
    var last = null, cur = '';
    function go(key) {
      cur = key || '';
      var url = '/fleet-codex/' + (cur ? '#' + encodeURIComponent(cur) : '');
      if (frame.getAttribute('src') !== url) frame.setAttribute('src', url);
      if (ext) ext.href = url;
      press(vsBtns, vsBtns.filter(function (b) { return b.dataset.cxKey === cur; })[0]);
      var on = cxo.querySelector('[aria-pressed="true"]');
      if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
    function openCx(key, from) {
      last = from || null;
      go(key);
      cxo.hidden = false;
      root.classList.add('hs-lock');
      if (history.replaceState) history.replaceState(null, '', '#codex' + (cur ? '=' + encodeURIComponent(cur) : ''));
      cxo.querySelector('.cls').focus();
    }
    function closeCx() {
      cxo.hidden = true;
      root.classList.remove('hs-lock');
      if (history.replaceState) history.replaceState(null, '', location.pathname + location.search);
      if (last) last.focus();
    }
    function step(d) {
      var i = keys.indexOf(cur);
      go(keys[((i < 0 ? (d > 0 ? -1 : 0) : i) + d + keys.length) % keys.length]);
    }
    $$('[data-codex]').forEach(function (b) {
      b.addEventListener('click', function (e) { e.preventDefault(); openCx(b.getAttribute('data-codex'), b); });
    });
    vsBtns.forEach(function (b) { b.addEventListener('click', function () { go(b.dataset.cxKey); }); });
    cxo.querySelector('.cls').addEventListener('click', closeCx);
    $$('.arr', cxo).forEach(function (b) { b.addEventListener('click', function () { step(b.classList.contains('l') ? -1 : 1); }); });
    document.addEventListener('keydown', function (e) { if (!cxo.hidden && e.key === 'Escape') closeCx(); });
    var m = location.hash.match(/^#codex(?:=(.*))?$/);
    if (m) openCx(m[1] ? decodeURIComponent(m[1]) : '', null);
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

  // ── Voyages: the galaxy map, five zoom levels ─────────────
  var mapv = document.getElementById('hs-mapv');
  if (mapv) {
    var tiers = $$('[data-tier]'), imgs = $$('img', mapv), ti = 0;
    var cap = mapv.querySelector('.cap'), sc = mapv.querySelector('.sc');
    function tier(i) {
      ti = Math.max(0, Math.min(tiers.length - 1, i));
      imgs.forEach(function (im, j) { im.classList.toggle('on', j === ti); im.classList.toggle('out', j < ti); });
      press(tiers, tiers[ti]);
      var t = tiers[ti];
      cap.querySelector('b').textContent = t.dataset.name;
      cap.querySelector('span').textContent = t.dataset.what;
      sc.firstChild.nodeValue = t.dataset.width;
    }
    tiers.forEach(function (b, i) { b.addEventListener('click', function () { tier(i); }); });
    $$('[data-zoom]').forEach(function (b) { b.addEventListener('click', function () { tier(ti + Number(b.dataset.zoom)); }); });
    mapv.addEventListener('dblclick', function () { tier(ti + 1 >= tiers.length ? 0 : ti + 1); });
    tier(0);
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
