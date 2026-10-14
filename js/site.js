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
