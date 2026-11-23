/* Pilots page: every pilot full screen. Opened from the featured pilot (its picture or its Full screen button);
 * drag or swipe sideways to go from pilot to pilot, or use the arrows, the arrow keys or the strip of faces.
 * Esc or the close button returns to the page on the pilot last shown. Reads the pilots from the page's own
 * [data-pilot] buttons (the current group filter decides who is in the deck).
 */
(function () {
  'use strict';
  var feat = document.getElementById('hs-pilot'), pv = document.getElementById('hs-pv');
  if (!feat || !pv) return;
  var root = document.documentElement;
  document.body.appendChild(pv); // out of <main>, whose stacking context sits under the top bar
  var track = pv.querySelector('.trk'), rail = pv.querySelector('.rail'), count = pv.querySelector('.ct');
  var deck = [], i = 0, w = 0, from = null;
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function build() {
    deck = Array.prototype.filter.call(document.querySelectorAll('[data-pilot]'), function (b) { return !b.hidden; });
    track.innerHTML = deck.map(function (b, n) {
      var d = b.dataset;
      return '<figure class="sl" aria-roledescription="slide" aria-label="' + (n + 1) + ' of ' + deck.length + ': ' + esc(d.pilot) + '">' +
        '<img class="bg" src="' + esc(d.img) + '" alt="" ' + (Math.abs(n - i) > 1 ? 'loading="lazy" ' : '') + 'decoding="async">' +
        '<img class="im" src="' + esc(d.img) + '" alt="' + esc(d.pilot) + ', a pilot" ' + (Math.abs(n - i) > 1 ? 'loading="lazy" ' : '') + 'decoding="async" draggable="false">' +
        '<figcaption><span class="hs-lab">Callsign ' + esc(d.no) + ' &middot; ' + esc(d.group) + '</span><b>' + esc(d.pilot) + '</b><small>Hold LB to see</small><span class="sees">' + esc(d.sees) + '</span></figcaption></figure>';
    }).join('');
    rail.innerHTML = deck.map(function (b, n) {
      return '<button type="button" data-n="' + n + '" aria-label="' + esc(b.dataset.pilot) + '"><img src="' + esc(b.dataset.img) + '" alt="" loading="lazy"><span>' + esc(b.dataset.pilot) + '</span></button>';
    }).join('');
  }
  function place(dx, anim) {
    track.style.transition = anim ? '' : 'none';
    track.style.transform = 'translate3d(' + (-i * w + (dx || 0)) + 'px,0,0)';
  }
  function show(n, anim) {
    i = (n + deck.length) % deck.length;
    place(0, anim !== false);
    count.textContent = (i + 1) + ' / ' + deck.length;
    Array.prototype.forEach.call(rail.children, function (b, k) { b.setAttribute('aria-current', k === i ? 'true' : 'false'); });
    var on = rail.children[i];
    if (on) rail.scrollTo({ left: on.offsetLeft - rail.clientWidth / 2 + on.clientWidth / 2, behavior: anim === false ? 'auto' : 'smooth' });
    Array.prototype.forEach.call(track.children, function (f, k) { f.classList.toggle('on', k === i); if (Math.abs(k - i) <= 1) f.querySelectorAll('img').forEach(function (im) { im.loading = 'eager'; }); });
    if (history.replaceState) history.replaceState(null, '', '#' + deck[i].id);
  }
  function open(at) {
    from = document.activeElement;
    build();
    var cur = deck.filter(function (b) { return b.getAttribute('aria-pressed') === 'true'; })[0];
    pv.hidden = false;
    root.classList.add('hs-lock');
    w = pv.clientWidth;
    show(at != null ? at : Math.max(0, deck.indexOf(cur)), false);
    pv.querySelector('.cls').focus();
  }
  function close() {
    pv.hidden = true;
    root.classList.remove('hs-lock');
    var b = deck[i];
    if (b) b.click();
    if (from && from.focus) from.focus();
  }

  /* drag or swipe */
  var sx = null, sy = 0, dx = 0, lock = null;
  track.addEventListener('pointerdown', function (e) {
    if (e.button && e.button !== 0) return;
    sx = e.clientX; sy = e.clientY; dx = 0; lock = null;
    if (track.setPointerCapture) track.setPointerCapture(e.pointerId);
    pv.classList.add('drag');
  });
  track.addEventListener('pointermove', function (e) {
    if (sx == null) return;
    dx = e.clientX - sx;
    if (lock == null && (Math.abs(dx) > 6 || Math.abs(e.clientY - sy) > 6)) lock = Math.abs(dx) > Math.abs(e.clientY - sy) ? 'x' : 'y';
    if (lock === 'x') place(dx * ((i === 0 && dx > 0) || (i === deck.length - 1 && dx < 0) ? 0.35 : 1), false);
  });
  function end() {
    if (sx == null) return;
    sx = null; pv.classList.remove('drag');
    if (lock === 'x' && Math.abs(dx) > Math.min(120, w * 0.18)) {
      var n = i + (dx < 0 ? 1 : -1);
      if (n >= 0 && n < deck.length) return show(n);
    }
    place(0, true);
  }
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', end);
  pv.addEventListener('wheel', function (e) {
    if (Math.abs(e.deltaX) > 30 && Math.abs(e.deltaX) > Math.abs(e.deltaY) && !pv.dataset.wheel) {
      pv.dataset.wheel = '1'; setTimeout(function () { delete pv.dataset.wheel; }, 500);
      show(i + (e.deltaX > 0 ? 1 : -1));
    }
  }, { passive: true });

  pv.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.classList.contains('cls')) close();
    else if (b.classList.contains('prev')) show(i - 1);
    else if (b.classList.contains('next')) show(i + 1);
    else if (b.dataset.n) show(+b.dataset.n);
  });
  document.addEventListener('keydown', function (e) {
    if (pv.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') show(i + 1);
    else if (e.key === 'ArrowLeft') show(i - 1);
    else if (e.key === 'Home') show(0);
    else if (e.key === 'End') show(deck.length - 1);
    else if (e.key === 'Tab') {
      var f = Array.prototype.filter.call(pv.querySelectorAll('button'), function (b) { return b.offsetParent; });
      if (e.shiftKey && document.activeElement === f[0]) { f[f.length - 1].focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { f[0].focus(); e.preventDefault(); }
    }
  });
  window.addEventListener('resize', function () { if (!pv.hidden) { w = pv.clientWidth; place(0, false); } });

  feat.querySelector('img').addEventListener('click', function () { open(); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-pv-open]'), function (b) { b.addEventListener('click', function () { open(); }); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-pilot]'), function (b) { b.addEventListener('dblclick', function () { open(); }); });
})();
