// Shared behaviour for every page: star field, scroll reveal, topbar,
// mobile menu, copy buttons, contents-rail highlight, hero parallax.
(function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── Star Field ────────────────────────────────────────────
  const canvas = document.getElementById('starfield');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    const STAR_COUNT = 200;
    let stars = [];

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    function init() {
      resize();
      stars = [];
      for (let i = 0; i < STAR_COUNT; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          r: Math.random() * 1.2 + 0.3,
          a: Math.random() * 0.5 + 0.2,
          speed: Math.random() * 0.0008 + 0.0003,
          phase: Math.random() * Math.PI * 2
        });
      }
    }
    function draw(t) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const s of stars) {
        const flicker = reduceMotion ? 1 : 0.5 + 0.5 * Math.sin(t * s.speed * 1000 + s.phase);
        ctx.globalAlpha = s.a * flicker;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!reduceMotion) requestAnimationFrame(draw);
    }
    window.addEventListener('resize', () => { init(); if (reduceMotion) draw(0); });
    init();
    requestAnimationFrame(draw);
  }

  // ── Scroll Reveal ─────────────────────────────────────────
  const revealEls = document.querySelectorAll('.reveal, .reveal-left, .reveal-right');
  if ('IntersectionObserver' in window && !reduceMotion) {
    const revealObs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) entry.target.classList.add('visible');
      });
    }, { threshold: 0.1 });
    revealEls.forEach(el => revealObs.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('visible'));
  }

  // ── Topbar on scroll ──────────────────────────────────────
  const topbar = document.getElementById('topbar');
  if (topbar) {
    const onScroll = () => topbar.classList.toggle('scrolled', window.scrollY > 80);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ── Mobile menu ───────────────────────────────────────────
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.topbar-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? 'Close' : 'Menu';
      if (topbar) topbar.classList.toggle('scrolled', open || window.scrollY > 80);
    });
  }

  // ── Copy buttons ──────────────────────────────────────────
  document.querySelectorAll('[data-copy]').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.getAttribute('data-copy');
      const done = () => {
        const label = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = label; }, 1600);
      };
      const fallback = () => {
        const code = btn.parentElement.querySelector('code');
        if (!code) return;
        const range = document.createRange();
        range.selectNodeContents(code);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, fallback);
      } else {
        fallback();
      }
    });
  });

  // ── Cookie choice (Consent Mode v2; defaults are set in the page head) ──
  const consent = document.getElementById('consent');
  if (consent) {
    let stored = null;
    try { stored = localStorage.getItem('fg_consent'); } catch (e) { stored = null; }
    if (stored !== 'granted' && stored !== 'denied') consent.hidden = false;
    consent.querySelectorAll('[data-consent]').forEach(btn => {
      btn.addEventListener('click', () => {
        const c = btn.getAttribute('data-consent');
        try { localStorage.setItem('fg_consent', c); } catch (e) { /* choice applies to this page view only */ }
        if (typeof window.gtag === 'function') {
          window.gtag('consent', 'update', { ad_storage: c, ad_user_data: c, ad_personalization: c, analytics_storage: c });
        }
        consent.hidden = true;
      });
    });
    document.querySelectorAll('[data-consent-open]').forEach(btn => {
      btn.addEventListener('click', () => {
        consent.hidden = false;
        const first = consent.querySelector('[data-consent]');
        if (first) first.focus();
      });
    });
  }

  // ── Contents rail highlight ───────────────────────────────
  const tocLinks = document.querySelectorAll('.doc-toc a[href^="#"]');
  if (tocLinks.length && 'IntersectionObserver' in window) {
    const byId = new Map();
    tocLinks.forEach(a => byId.set(a.getAttribute('href').slice(1), a));
    const tocObs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        tocLinks.forEach(a => a.classList.remove('active'));
        const link = byId.get(entry.target.id);
        if (link) link.classList.add('active');
      });
    }, { rootMargin: '-30% 0px -60% 0px' });
    byId.forEach((_, id) => {
      const section = document.getElementById(id);
      if (section) tocObs.observe(section);
    });
  }

  // ── Hero parallax ─────────────────────────────────────────
  const heroBg = document.querySelector('.page-hero-bg, .hero-parallax-bg');
  if (heroBg && !reduceMotion) {
    window.addEventListener('scroll', () => {
      if (window.scrollY < window.innerHeight * 1.2) {
        heroBg.style.transform = `translateY(${window.scrollY * 0.3}px)`;
      }
    }, { passive: true });
  }
})();

/* Game-mode tabs (index.html #modes). Without JS every panel shows; with it, one at a time. */
(function () {
  document.querySelectorAll('[data-tabs]').forEach(function (root) {
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
    if (!tabs.length) return;
    root.classList.add('is-tabbed');
    function select(tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
      if (focus) tab.focus();
    }
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(tab, false); });
      tab.addEventListener('keydown', function (e) {
        var next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null;
        if (next === null) return;
        e.preventDefault();
        select(tabs[(next + tabs.length) % tabs.length], true);
      });
    });
    select(tabs.filter(function (t) { return t.getAttribute('aria-selected') === 'true'; })[0] || tabs[0], false);
  });
})();

/* Pickers (home: vessels, and each game-mode tab). Clicking an item, or the arrows, shows it in the big
   view; the data lives on each item's data-* attributes. A vessel with data-trailer gets a Watch the
   trailer button that swaps the image for the YouTube player (youtube-nocookie, loaded only on press). */
(function () {
  document.querySelectorAll('[data-picker]').forEach(function (root) {
    var items = Array.prototype.slice.call(root.querySelectorAll('.picker-item'));
    if (!items.length) return;
    var list = root.querySelector('.picker-list');
    var media = root.querySelector('[data-media]');
    var img = media.querySelector('img');
    var trailerBtn = root.querySelector('[data-trailer-play]');
    var cur = Math.max(0, items.findIndex(function (b) { return b.getAttribute('aria-pressed') === 'true'; }));
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    function field(name) { return root.querySelector('[data-f="' + name + '"]'); }
    function setText(name, text) {
      var el = field(name);
      if (!el) return;
      el.textContent = text;
      el.hidden = !text;
    }
    function stopTrailer() {
      var frame = media.querySelector('iframe');
      if (frame) { frame.remove(); img.hidden = false; }
    }
    function keepInView(b) {          // scroll the picker's own box, never the page
      var li = b.parentNode;
      if (list.scrollHeight > list.clientHeight + 1) {
        if (li.offsetTop < list.scrollTop) list.scrollTop = li.offsetTop;
        else if (li.offsetTop + li.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = li.offsetTop + li.offsetHeight - list.clientHeight;
      }
      if (list.scrollWidth > list.clientWidth + 1) {
        if (li.offsetLeft < list.scrollLeft) list.scrollLeft = li.offsetLeft;
        else if (li.offsetLeft + li.offsetWidth > list.scrollLeft + list.clientWidth) list.scrollLeft = li.offsetLeft + li.offsetWidth - list.clientWidth;
      }
    }
    function show(i, fromArrow) {
      cur = (i + items.length) % items.length;
      var b = items[cur], d = b.dataset;
      items.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      stopTrailer();
      img.src = d.img;
      img.alt = d.alt || '';
      setText('name', d.name);
      setText('blurb', d.blurb);
      setText('chip', d.chip || '');
      setText('count', pad(cur + 1) + ' / ' + pad(items.length));
      var vessels = field('vessels');
      if (vessels) { vessels.textContent = d.vessels || ''; field('vessels-row').hidden = !d.vessels; }
      if (trailerBtn) trailerBtn.hidden = !d.trailer;
      if (fromArrow) keepInView(b);
    }
    items.forEach(function (b, i) {
      b.addEventListener('click', function () { show(i, false); });
      // Warm the large image before the click lands.
      b.addEventListener('pointerenter', function () { if (b.dataset.img) new Image().src = b.dataset.img; }, { once: true });
    });
    root.querySelectorAll('[data-dir]').forEach(function (a) {
      a.addEventListener('click', function () { show(cur + Number(a.getAttribute('data-dir')), true); });
    });
    if (trailerBtn) trailerBtn.addEventListener('click', function () {
      var id = items[cur].dataset.trailer;
      if (!id || media.querySelector('iframe')) return;
      var frame = document.createElement('iframe');
      frame.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?autoplay=1&rel=0';
      frame.title = items[cur].dataset.name + ' trailer';
      frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      frame.allowFullscreen = true;
      img.hidden = true;
      media.appendChild(frame);
    });
  });
})();

/* Test sign-up (_includes/tester-signup.html). Any [data-tester-platform] button opens it with that
   platform chosen. Posts to the Apps Script endpoint (_data/forms.yml, tools/site-forms/) as a simple
   text/plain request, so no CORS preflight. Nothing opens the visitor's email app. */
(function () {
  var dialog = document.getElementById('tester-dialog');
  if (!dialog || typeof dialog.showModal !== 'function') return;
  var form = document.getElementById('tester-form');
  var errorEl = form.querySelector('.tester-error');
  var otherWrap = form.querySelector('[data-heard-other]');
  var submit = form.querySelector('button[type="submit"]');
  var endpoint = dialog.getAttribute('data-endpoint') || '';

  function step(name) {
    form.querySelectorAll('.tester-step').forEach(function (s) { s.hidden = s.getAttribute('data-step') !== name; });
  }
  function showError(msg) { errorEl.textContent = msg; errorEl.hidden = !msg; }
  function track(event, extra) {
    try { (window.dataLayer = window.dataLayer || []).push(Object.assign({ event: event }, extra || {})); } catch (e) {}
  }

  document.addEventListener('click', function (e) {
    var opener = e.target.closest('[data-tester-platform]');
    if (!opener) return;
    var radio = form.querySelector('input[name="platform"][value="' + opener.getAttribute('data-tester-platform') + '"]');
    if (radio) radio.checked = true;
    step('form'); showError('');
    dialog.showModal();
    var email = form.querySelector('input[name="email"]');
    if (email) email.focus();
    track('tester_signup_open', { tester_platform: opener.getAttribute('data-tester-platform') });
  });
  dialog.querySelectorAll('[data-tester-close]').forEach(function (b) {
    b.addEventListener('click', function () { dialog.close(); });
  });
  dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });   // backdrop
  form.heard.addEventListener('change', function () {
    otherWrap.hidden = form.heard.value !== 'Other';
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var data = {
      platform: (form.querySelector('input[name="platform"]:checked') || {}).value || '',
      email: form.email.value.trim(),
      heard: form.heard.value,
      heard_other: form.heard.value === 'Other' ? form.heard_other.value.trim() : '',
      website: form.website.value
    };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) { showError('Please enter a valid email address.'); form.email.focus(); return; }
    if (!data.heard) { showError('Please tell us how you heard about us.'); form.heard.focus(); return; }
    showError('');
    var label = (form.querySelector('input[name="platform"]:checked + span') || {}).textContent || data.platform;

    if (!endpoint) { showError('Sorry, test sign-ups aren\u2019t open yet. Please try again soon.'); return; }

    submit.disabled = true;
    fetch(endpoint, { method: 'POST', body: JSON.stringify(data) })
      .then(function (r) { return r.json().catch(function () { return { ok: r.ok }; }); })
      .then(function (res) {
        if (!res || !res.ok) throw new Error(res && res.error === 'email' ? 'email' : 'failed');
        form.querySelector('[data-tester-email]').textContent = data.email;
        step('done');
        track('tester_signup_submit', { tester_platform: data.platform, tester_heard: data.heard, tester_via: 'form' });
        form.reset();
        otherWrap.hidden = true;
      })
      .catch(function (err) {
        showError(err.message === 'email' ? 'Please enter a valid email address.'
                                          : 'That didn’t go through. Please try again in a moment.');
      })
      .then(function () { submit.disabled = false; });
  });
})();

/* Contact form (_includes/contact-form.html). Any [data-contact-topic] button opens it on that topic.
   Posts to the same Apps Script endpoint as the test sign-up, which emails the team; the visitor's
   email app is never involved. */
(function () {
  var dialog = document.getElementById('contact-dialog');
  if (!dialog || typeof dialog.showModal !== 'function') return;
  var form = document.getElementById('contact-form');
  var errorEl = form.querySelector('.tester-error');
  var submit = form.querySelector('button[type="submit"]');
  var endpoint = dialog.getAttribute('data-endpoint') || '';
  var support = dialog.getAttribute('data-support') || '';

  function step(name) {
    form.querySelectorAll('.tester-step').forEach(function (s) { s.hidden = s.getAttribute('data-step') !== name; });
  }
  function showError(msg) { errorEl.textContent = msg; errorEl.hidden = !msg; }
  function hint() {
    form.querySelectorAll('[data-topic-hint]').forEach(function (h) { h.hidden = h.getAttribute('data-topic-hint') !== form.topic.value; });
  }
  function track(event, extra) {
    try { (window.dataLayer = window.dataLayer || []).push(Object.assign({ event: event }, extra || {})); } catch (e) {}
  }
  var failed = 'That didn’t send. Please try again in a moment' + (support ? ', or write to ' + support + '.' : '.');

  document.addEventListener('click', function (e) {
    var opener = e.target.closest('[data-contact-topic]');
    if (!opener) return;
    form.topic.value = opener.getAttribute('data-contact-topic');
    hint(); step('form'); showError('');
    dialog.showModal();
    form.email.focus();
    track('contact_open', { contact_topic: form.topic.value });
  });
  dialog.querySelectorAll('[data-contact-close]').forEach(function (b) {
    b.addEventListener('click', function () { dialog.close(); });
  });
  dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });   // backdrop
  form.topic.addEventListener('change', hint);

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var data = {
      kind: 'contact',
      email: form.email.value.trim(),
      topic: form.topic.value,
      message: form.message.value.trim(),
      page: location.pathname,
      website: form.website.value
    };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) { showError('Please enter a valid email address.'); form.email.focus(); return; }
    if (data.message.length < 10) { showError('Please write a little more, so we can help.'); form.message.focus(); return; }
    showError('');
    if (!endpoint) { showError(failed); return; }

    submit.disabled = true;
    fetch(endpoint, { method: 'POST', body: JSON.stringify(data) })
      .then(function (r) { return r.json().catch(function () { return { ok: r.ok }; }); })
      .then(function (res) {
        if (!res || !res.ok) throw new Error(res && res.error || 'failed');
        form.querySelector('[data-contact-email]').textContent = data.email;
        step('done');
        track('contact_submit', { contact_topic: data.topic });
        form.reset();
      })
      .catch(function (err) {
        showError(err.message === 'email' ? 'Please enter a valid email address.'
                : err.message === 'message' ? 'Please write a little more, so we can help.' : failed);
      })
      .then(function () { submit.disabled = false; });
  });
})();
