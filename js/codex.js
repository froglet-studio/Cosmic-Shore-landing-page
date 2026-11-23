/* The Fleet Codex, drawn by the site itself (Vessels page, #codex).
 *
 * It reads /fleet-codex/fleet.json, the data the studio's Fleet Codex artifact is drawn from
 * (game repo Tools/Build/fleet_codex.py, copied here by tools/sync_fleet_codex.py), and draws it in the
 * HyperSea look: a vessel strip with search and the domain picker, the vessel's window (its hull in the
 * domain's livery, the briefing, its element games), its ability row with the picked ability in full,
 * then Abilities, Missions, Flight and controls, and Recent updates. Every colour is a site theme token,
 * except the parts the game paints in a domain's colours (ability icons, the hull), which take the
 * game's own palette from fleet.json.
 *
 * Links: #codex opens the fleet, #codex=<Key> one vessel (the old /fleet-codex/#<Key> redirects here).
 */
(function () {
  'use strict';
  var root = document.getElementById('cx');
  if (!root) return;
  var BASE = '/fleet-codex/';
  var D = null, list = [], cur = null, pick = null, lv5 = false, tab = 'abilities', filt = 'All', query = '';
  var dom = 'Jade';
  try { dom = localStorage.getItem('fg_domain') || 'Jade'; } catch (e) { /* private mode */ }

  var L5 = { wired: ['ok', 'Wired'], open: ['', 'Open slot'], off: ['warn', 'Switched off'], 'label-only': ['warn', 'Named, not gated'], 'gate-only': ['warn', 'Gated, not named'] };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M15 5l-7 7 7 7"/></svg>';
  var TICK = '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 8.5l3.2 3L13 4.5"/></svg>';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function u(p) { return p ? BASE + p : ''; }
  function num(v) { return v == null ? '&ndash;' : String(Math.round(v * 100) / 100); }
  function file(p) { return (p || '').split('/').pop(); }
  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function day(d) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); return m ? (+m[3]) + ' ' + MONTHS[+m[2] - 1] + ' ' + m[1] : d; }
  function img(src, alt, cls) { return src ? '<img src="' + esc(u(src)) + '" alt="' + esc(alt || '') + '"' + (cls ? ' class="' + cls + '"' : '') + ' loading="lazy" decoding="async">' : ''; }

  /* an ability icon as the HUD paints it: domain (d) and shielded (s) parts are masks filled with the domain */
  function ico(src, layers, alt, tint) {
    if (!layers) return src ? '<span class="cx-ico" role="img" aria-label="' + esc(alt) + '"><img src="' + esc(u(src)) + '" alt="" loading="lazy"></span>' : '';
    var fill = tint === 'omni' ? 'var(--cx-omni)' : 'var(--cx-dom)';
    function lay(p, bg) { return p ? '<i style="-webkit-mask-image:url(' + esc(u(p)) + ');mask-image:url(' + esc(u(p)) + ');background:' + bg + '"></i>' : ''; }
    return '<span class="cx-ico" role="img" aria-label="' + esc(alt || '') + '">' + lay(layers.d, fill) + lay(layers.s, 'var(--cx-sh)') +
      (layers.f ? '<img src="' + esc(u(layers.f)) + '" alt="" loading="lazy">' : '') + '</span>';
  }
  /* an element's flower, built like the HUD: its petal five times, turned 72 degrees each */
  function flower(el, lit, cls) {
    var p = D.ui['petal/' + el];
    if (!p) return el === 'Omni' ? '<span class="cx-fl ' + (cls || '') + '"><img src="' + esc(u(D.ui.omni)) + '" alt=""></span>' : '';
    var h = '<span class="cx-fl' + (cls ? ' ' + cls : '') + '" role="img" aria-label="' + esc(el) + '">';
    for (var i = 0; i < 5; i++) h += '<i class="' + (i < lit ? 'on' : '') + '" style="--r:' + (72 * i) + 'deg;--d:' + (i * 0.35).toFixed(2) + 's;-webkit-mask-image:url(' + esc(u(p)) + ');mask-image:url(' + esc(u(p)) + ')"></i>';
    return h + '</span>';
  }

  function isCrew(v) { return v.crew && v.crew.seats > 1; }
  function crewName(v) { return v.crew && v.crew.names && v.crew.names.length ? v.crew.names.join(' & ') : v.name; }
  function hull(v) { return (v.domainImages && v.domainImages[dom]) || v.image; }
  function isArcade(c) { return (c.rosters || []).indexOf('ArcadeGames') >= 0 || !(c.rosters || []).length; }
  function gameLabel(c) { var els = c.elements || []; return els.length ? els.join(' + ') + (isArcade(c) ? ' game' : ' arena') : 'Party game'; }
  function elementGames(v) {
    var by = {};
    D.elements.forEach(function (el) { by[el] = []; });
    v.cards.forEach(function (c) { var els = c.elements || []; if (els.length && isArcade(c) && by[els[0]]) by[els[0]].push(c); });
    return by;
  }
  function matches(v) {
    if (!query) return true;
    var hay = [v.name, crewName(v), v.key, v.description].concat(
      Object.keys(v.elements).map(function (n) { var e = v.elements[n]; return e.ability + ' ' + (e.upgrade.label || ''); }),
      v.cards.map(function (c) { return c.name; }), v.omni ? [v.omni.label, (v.omni.words || {}).ability] : []).join(' ').toLowerCase();
    return query.split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; });
  }
  function picks(v) {
    var out = [];
    if (v.seats) {
      v.seats.list.forEach(function (s, si) {
        s.abilities.forEach(function (a, ai) {
          if (a.linked && v.elements[a.element]) out.push({ key: 'el:' + a.element, el: a.element, e: v.elements[a.element], name: a.name, seat: si });
          else out.push({ key: 'doc:' + si + ':' + ai, el: a.element, doc: a, name: a.name, seat: si });
        });
      });
    } else {
      D.elements.forEach(function (el) { var e = v.elements[el]; if (e) out.push({ key: 'el:' + el, el: el, e: e, name: e.open ? 'Open slot' : e.ability }); });
    }
    if (v.omni) out.push({ key: 'omni', el: 'Omni', omni: v.omni, name: (v.omni.words && v.omni.words.ability) || v.omni.label || 'Omni crystal' });
    return out;
  }
  function hasL5(p) { return !!(p.e && p.e.upgrade && p.e.upgrade.icon); }
  function iconOf(p, five) {
    if (five && hasL5(p)) { var up = p.e.upgrade, t5 = (p.e.words && p.e.words.tint) || {}; return ico(up.icon, up.layers, p.name + ' at level 5', t5.rest); }
    if (p.omni) return p.omni.icon ? ico(p.omni.icon, p.omni.layers, p.name) : ico(p.omni.mark, null, p.name);
    if (p.doc) return flower(p.el, 5, 'big');
    var e = p.e, tint = (e.words && e.words.tint) || {};
    return e.icon ? ico(e.icon, e.layers, p.name, tint.rest) : flower(p.el, 5, 'big');
  }
  function trigOf(p) {
    if (p.doc) return 'Seat control';
    var w = p.e ? p.e.words || {} : p.omni.words || {};
    return w.trigger || (p.omni ? 'Fly into an omni crystal' : 'Passive');
  }
  function rowOf(v, el) { return v.controls ? v.controls.rows.filter(function (r) { return r.element === el; })[0] : null; }

  /* ---------- the domain the game paints the hull and the icons in ---------- */
  function applyDomain() {
    var d = D.palette.domains[dom] || D.palette.domains[D.palette.default];
    root.style.setProperty('--cx-dom', d.signal);
    root.style.setProperty('--cx-sh', d.shielded);
    root.style.setProperty('--cx-omni', D.palette.omni);
    root.style.setProperty('--cx-pg', D.palette.petal.grey);
    root.style.setProperty('--cx-pw', D.palette.petal.white);
  }

  /* ---------- the top bar: the strip of vessels, search, domain ---------- */
  function drawBar() {
    var shown = list.filter(matches);
    var i = list.indexOf(cur);
    var bar = root.querySelector('.cx-bar');
    bar.innerHTML =
      '<button type="button" class="cx-arr" data-step="-1" aria-label="Previous vessel: ' + esc(crewName(list[(i - 1 + list.length) % list.length])) + '">' + ARROW + '</button>' +
      '<div class="cx-strip" role="listbox" aria-label="Vessels">' + (shown.length ? shown.map(function (v) {
        return '<button type="button" role="option" class="cx-vs" data-key="' + esc(v.key) + '" aria-selected="' + (v === cur) + '" title="' + esc(crewName(v)) + '">' +
          '<span class="im">' + img(hull(v), '') + '</span><span class="nm">' + esc(v.name) + '</span></button>';
      }).join('') : '<p class="cx-none">No vessel matches &ldquo;' + esc(query) + '&rdquo;.</p>') + '</div>' +
      '<button type="button" class="cx-arr r" data-step="1" aria-label="Next vessel: ' + esc(crewName(list[(i + 1) % list.length])) + '">' + ARROW + '</button>';
    var on = bar.querySelector('[aria-selected="true"]');
    if (on) { var s = bar.querySelector('.cx-strip'); s.scrollLeft = on.offsetLeft - s.clientWidth / 2 + on.clientWidth / 2; }
  }
  function drawTools() {
    var t = root.querySelector('.cx-tools');
    t.innerHTML =
      '<label class="cx-q"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>' +
      '<input type="search" placeholder="Search vessels, abilities, games" aria-label="Search the fleet" value="' + esc(query) + '"></label>' +
      '<div class="cx-doms" role="radiogroup" aria-label="Domain livery">' + Object.keys(D.palette.domains).map(function (k) {
        return '<button type="button" role="radio" data-dom="' + k + '" aria-checked="' + (k === dom) + '" title="' + k + ' domain" style="--sw:' + D.palette.domains[k].signal + '"><i></i><span>' + k + '</span></button>';
      }).join('') + '</div>';
    t.querySelector('input').addEventListener('input', function (e) { query = e.target.value.trim().toLowerCase(); drawBar(); });
  }

  /* ---------- the vessel ---------- */
  function certBlock(c) {
    return '<div class="cx-cert"><div class="pc"><b>' + c.pct + '%</b><small>Flight certificate</small></div><ul>' + c.checks.map(function (k) {
      return '<li class="' + (k.done ? 'on' : '') + '"><span class="tk">' + (k.done ? TICK : '') + '</span><span>' + esc(k.name) + '</span><small>' + esc(k.detail || '') + '</small></li>';
    }).join('') + '</ul></div>';
  }
  function devices(v, p) {
    var r = p.e ? rowOf(v, p.el) : null;
    if (!r) return '';
    function cell(lab, art, txt) {
      var none = !txt || txt === 'no button';
      return '<div class="' + (none ? 'none' : '') + '"><small>' + lab + '</small>' + (art ? img(art, '') : '') + '<b>' + esc(none ? 'No press' : txt) + '</b></div>';
    }
    if ([r.pad, r.pc, r.touch].every(function (x) { return !x || x === 'no button'; }))
      return '<div class="cx-dev quiet"><div><small>No button</small><b>It works as you fly</b></div></div>';
    return '<div class="cx-dev">' + cell('Controller', r.padArt, r.pad) + cell('Keyboard', null, r.pc) + cell('Phone', r.touchArt, r.touch) + '</div>';
  }
  function detail(v, p) {
    var five = lv5 && hasL5(p);
    var body = '';
    if (p.doc) {
      body = '<p>' + esc(p.doc.text || 'A control of this seat.') + '</p>';
    } else if (p.omni) {
      var ow = p.omni.words || {};
      body = '<p>' + esc(ow.does || (p.omni.effects.length ? 'Its crystal effects: ' + p.omni.effects.join(', ') + '.' : 'No omni crystal effect of its own.')) + '</p>';
    } else {
      var e = p.e, w = e.words || {}, up = e.upgrade;
      body = five
        ? '<p class="l5w"><b>' + esc(up.label || 'Level 5') + '</b> ' + esc(up.description || '') + '</p>'
        : '<p>' + esc(w.does || e.description) + '</p>' + (w.scales ? '<p class="more"><span>More ' + esc(p.el) + '</span>' + esc(w.scales) + '</p>' : '');
    }
    var canFive = p.e && !p.e.open && p.e.upgrade && (p.e.upgrade.label || p.e.upgrade.description);
    return '<div class="cx-move" aria-live="polite">' +
      '<div class="ic' + (five ? ' five' : '') + '">' + iconOf(p, lv5) + '</div>' +
      '<div class="tx"><div class="hd">' + flower(p.el, 5) + '<span class="hs-lab">' + esc(p.el === 'Omni' ? 'Omni crystal' : p.el) + ' &middot; ' + esc(trigOf(p)) + '</span></div>' +
      '<h4>' + esc(five ? p.e.upgrade.label || p.name : p.name) + '</h4>' + body +
      (canFive ? '<button type="button" class="cx-l5" aria-pressed="' + lv5 + '">' + flower(p.el, lv5 ? 5 : 0, 'go') + '<span>Level 5' + (p.e.upgrade.label ? ': ' + esc(p.e.upgrade.label) : '') + '</span></button>' : '') +
      '</div>' + devices(v, p) + '</div>';
  }
  function abilityRow(v, p) {
    var mid, l5;
    if (p.doc) {
      mid = '<p>' + esc(p.doc.text || 'A control of this seat.') + '</p>';
      l5 = '<p class="dim">A seat control has no level 5 of its own.</p>';
    } else if (p.omni) {
      var ow = p.omni.words || {};
      mid = '<p>' + esc(ow.does || (p.omni.effects.length ? 'Its crystal effects: ' + p.omni.effects.join(', ') + '.' : 'No omni crystal effect of its own.')) + '</p>';
      l5 = '<p class="dim">Flown into, never pressed. The omni crystal has no level 5.</p>';
    } else {
      var e = p.e, w = e.words || {}, up = e.upgrade, st = L5[up.status] || L5.open;
      var dials = e.scaling.filter(function (x) { return x.field && x.min != null; }).map(function (x) {
        return '<span class="dial' + (x.on ? '' : ' off') + '">' + esc(x.field) + ' &times;' + num(x.min) + ' to &times;' + num(x.max) + (x.on ? '' : ' (switched off)') + '</span>';
      }).join('');
      mid = '<p>' + esc(w.does || e.description) + '</p>' + (w.scales ? '<p class="more"><span>More ' + esc(p.el) + '</span>' + esc(w.scales) + '</p>' : '') + (dials ? '<div class="dials">' + dials + '</div>' : '');
      l5 = (hasL5(p) ? '<span class="l5i">' + iconOf(p, true) + '</span>' : '') + '<div><span class="st ' + st[0] + '">' + st[1] + '</span><b>' + esc(up.label || (up.status === 'open' ? 'Not designed yet' : 'Unnamed')) + '</b><p>' + esc(up.description || '') + '</p></div>';
    }
    return '<article class="cx-row" data-pick="' + esc(p.key) + '">' +
      '<button type="button" class="who" data-pick="' + esc(p.key) + '" aria-label="Show ' + esc(p.name) + ' above"><span class="ic">' + iconOf(p) + '</span><span><small>' + esc(p.el) + '</small><b>' + esc(p.name) + '</b><em>' + esc(trigOf(p)) + '</em></span></button>' +
      '<div class="mid">' + mid + '</div><div class="l5">' + l5 + '</div></article>';
  }

  function panel(v) {
    if (tab === 'abilities') {
      var h = '', lastSeat = -1;
      picks(v).forEach(function (p) {
        if (v.seats && p.seat != null && p.seat !== lastSeat) {
          lastSeat = p.seat; var st = v.seats.list[p.seat];
          h += '<div class="cx-seat"><b>' + esc(st.name) + '</b><span class="hs-lab">' + (st.seats > 1 ? st.seats + ' seats' : 'Seat ' + (p.seat + 1)) + '</span><p>' + esc(st.role) + '</p></div>';
        } else if (v.seats && p.omni) { h += '<div class="cx-seat"><b>The hull</b><span class="hs-lab">Every seat</span></div>'; }
        h += abilityRow(v, p);
      });
      return h;
    }
    if (tab === 'missions') {
      var shown = v.cards.filter(function (c) {
        var els = c.elements || [];
        return filt === 'All' || (filt === 'Arcade' && isArcade(c)) || (filt === 'Arena' && !isArcade(c)) || els.indexOf(filt) >= 0;
      });
      shown.sort(function (a, b) { return (isArcade(b) - isArcade(a)) || D.elements.indexOf((a.elements || [])[0]) - D.elements.indexOf((b.elements || [])[0]); });
      return '<div class="cx-chips" role="group" aria-label="Filter the games">' + ['All'].concat(D.elements, ['Arcade', 'Arena']).map(function (x) {
        return '<button type="button" data-filt="' + x + '" aria-pressed="' + (x === filt) + '">' + (D.ui['petal/' + x] ? flower(x, 5) : '') + '<span>' + x + '</span></button>';
      }).join('') + '</div>' +
        (shown.length ? '<div class="cx-games">' + shown.map(function (c) {
          var els = c.elements || [];
          return '<article class="cx-gm"><div class="art">' + img(c.art, '') + '</div><div class="tx"><span class="hs-lab">' + (els.length ? flower(els[0], 5) : '') + esc(gameLabel(c)) +
            ' &middot; ' + (c.hullsOnCard > 1 ? c.hullsOnCard + ' hulls' : 'this hull only') + (c.intensity ? ' &middot; I' + c.intensity[0] + '&ndash;I' + c.intensity[1] : '') + '</span>' +
            '<h4>' + esc(c.name) + '</h4>' + (c.description && c.description.split(' ').length > 4 ? '<p>' + esc(c.description) + '</p>' : '') + '</div></article>';
        }).join('') + '</div>'
          : '<p class="cx-empty">' + (v.cards.length ? 'No ' + esc(filt) + ' game seats the ' + esc(crewName(v)) + ' yet.' : 'No game seats this vessel yet.') + '</p>');
    }
    if (tab === 'flight') {
      var f = v.flight, c = v.controls;
      return '<div class="cx-fc"><div class="cx-nums">' + (f ? [[num(f.cruise), 'Cruise, u/s'], [num(f.pitch) + ' / ' + num(f.yaw), 'Pitch / yaw, deg/s'], [num(f.minimum), 'Minimum speed'], ['&times;' + num(f.boost), 'Boost']].map(function (x) {
        return '<div><b>' + x[0] + '</b><small>' + x[1] + '</small></div>';
      }).join('') : '<p class="cx-empty">No flight numbers for this hull yet.</p>') + '</div>' +
        (c ? '<div class="cx-tbl" role="table" aria-label="Controls"><div class="th" role="row"><span role="columnheader">Action</span><span role="columnheader">Controller</span><span role="columnheader">Keyboard</span><span role="columnheader">Phone</span></div>' + c.rows.map(function (r) {
          return '<div class="tr" role="row"><span role="cell"><b>' + esc(r.action) + '</b>' + (r.element ? '<small>' + esc(r.element) + '</small>' : '') + '</span>' +
            '<span role="cell" data-l="Controller">' + (r.padArt ? img(r.padArt, '') : '') + esc(r.pad) + '</span>' +
            '<span role="cell" data-l="Keyboard">' + esc(r.pc) + '</span>' +
            '<span role="cell" data-l="Phone">' + (r.touchArt ? img(r.touchArt, '') : '') + esc(r.touch || '–') + '</span></div>';
        }).join('') + '</div>' + ((c.notes || []).length ? '<ul class="cx-notes">' + c.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>' : '')
          : '<p class="cx-empty">No controls yet: this vessel has no ability map.</p>') + '</div>';
    }
    var ups = (v.changes || []).filter(function (x) { return x.parts && (x.parts.length || x.games.length); }).slice(0, 8);
    return '<div class="cx-up"><ul>' + (ups.length ? ups.map(function (x) {
      var bits = [];
      if (x.parts.length) bits.push(cap(x.parts.join(', ')) + ' updated');
      if (x.games.length) bits.push((x.games.length > 1 ? 'Games updated: ' : 'Game updated: ') + x.games.join(', '));
      return '<li><time datetime="' + esc(x.date) + '">' + esc(day(x.date)) + '</time><span>' + esc(bits.join('. ')) + '.</span></li>';
    }).join('') : '<li><span>No recent update.</span></li>') + '</ul>' +
      ((v.docs || []).length ? '<div class="docs"><span class="hs-lab">Read more</span>' + v.docs.map(function (d) {
        return '<a href="' + esc(d.url) + '" target="_blank" rel="noopener">' + esc(file(d.path).replace(/\.md$/, '').replace(/_/g, ' ')) + '</a>';
      }).join('') + '</div>' : '') + '</div>';
  }

  function drawVessel(anim) {
    var v = cur, ps = picks(v);
    var sel = ps.filter(function (p) { return p.key === pick; })[0] || ps[0];
    pick = sel ? sel.key : null;
    var by = elementGames(v), s = v.status, f = v.flight;
    var idx = list.indexOf(v) + 1;
    var tag = 'Vessel ' + (idx < 10 ? '0' : '') + idx + (isCrew(v) ? ' &middot; Crew &middot; ' + v.crew.seats + ' seats' : v.controls ? (v.controls.oneStick ? ' &middot; One stick' : ' &middot; Two sticks') : '') + (s.inToybox ? ' &middot; In the Vessel Changer' : '');
    var stats = (f ? [[num(f.cruise), 'Cruise u/s'], [num(f.pitch), 'Turn deg/s']] : []).concat([[s.upgradesWired + '/4', 'Level 5 wired'], [v.cards.length, v.cards.length === 1 ? 'Game' : 'Games']]);
    var win = root.querySelector('.cx-win');
    win.innerHTML =
      '<div class="hull"><span class="glow"></span>' + img(hull(v), crewName(v) + ' in the ' + dom + ' livery', 'hv') + '<span class="no">' + (idx < 10 ? '0' : '') + idx + '</span></div>' +
      '<div class="brief"><span class="hs-lab kick">' + tag + '</span><h3>' + esc(crewName(v)) + '</h3>' + (v.description ? '<p>' + esc(v.description) + '</p>' : '') +
      '<div class="cx-stats">' + stats.map(function (x) { return '<div><b>' + x[0] + '</b><small>' + x[1] + '</small></div>'; }).join('') + '</div>' +
      (v.certificate ? certBlock(v.certificate) : '') + '</div>' +
      '<div class="egs"><span class="hs-lab">Its element games</span>' + D.elements.map(function (el) {
        var cs = by[el];
        return '<div class="eg' + (cs.length ? '' : ' none') + '">' + flower(el, cs.length ? 5 : 0) + '<span class="el">' + el + '</span><span class="gn">' + esc(cs.length ? cs.map(function (c) { return c.name; }).join(', ') : 'None yet') + '</span></div>';
      }).join('') +
      (v.cards.length ? '<button type="button" class="hs-cta hs-shine" data-tab-go="missions"><span>Every game it plays</span></button>' : '') + '</div>';
    if (anim) { win.classList.remove('in'); void win.offsetWidth; win.classList.add('in'); }

    root.querySelector('.cx-abrow').innerHTML = ps.map(function (p) {
      return '<button type="button" class="cx-ab" data-pick="' + esc(p.key) + '" aria-pressed="' + (p === sel) + '"><span class="ic">' + iconOf(p) + '</span><span class="nm"><small>' + esc(p.el) + '</small>' + esc(p.name) + '</span></button>';
    }).join('');
    drawMove();
    drawTabs();
  }
  function drawMove() {
    var p = picks(cur).filter(function (x) { return x.key === pick; })[0];
    root.querySelector('.cx-movew').innerHTML = p ? detail(cur, p) : '';
  }
  function drawTabs() {
    var tabs = [['abilities', 'Abilities'], ['missions', 'Missions'], ['flight', 'Flight and controls'], ['updates', 'Recent updates']];
    root.querySelector('.cx-tabs').innerHTML = tabs.map(function (t) {
      return '<button type="button" role="tab" id="cxt-' + t[0] + '" aria-controls="cx-panel" data-tab="' + t[0] + '" aria-selected="' + (t[0] === tab) + '" tabindex="' + (t[0] === tab ? 0 : -1) + '">' + t[1] +
        (t[0] === 'missions' ? ' <em>' + cur.cards.length + '</em>' : '') + '</button>';
    }).join('');
    var pn = root.querySelector('.cx-panel');
    pn.setAttribute('aria-labelledby', 'cxt-' + tab);
    pn.innerHTML = panel(cur);
    pn.classList.remove('in'); void pn.offsetWidth; pn.classList.add('in');
  }

  function go(key, opts) {
    var v = list.filter(function (x) { return x.key === key; })[0] || list[0];
    var changed = v !== cur;
    cur = v;
    if (changed) { pick = null; lv5 = false; filt = 'All'; }
    drawBar();
    drawVessel(changed);
    if (history.replaceState && !(opts && opts.quiet)) history.replaceState(null, '', '#codex=' + encodeURIComponent(cur.key));
  }
  function step(d) { var i = list.indexOf(cur); go(list[(i + d + list.length) % list.length].key); }

  function bind() {
    root.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b || !root.contains(b)) return;
      if (b.dataset.step) return step(+b.dataset.step);
      if (b.dataset.key) return go(b.dataset.key);
      if (b.dataset.dom) {
        dom = b.dataset.dom;
        try { localStorage.setItem('fg_domain', dom); } catch (x) { /* private mode */ }
        applyDomain(); drawTools(); drawBar(); drawVessel(false);
        var nb = root.querySelector('[data-dom="' + dom + '"]'); if (nb) nb.focus();
        return;
      }
      if (b.dataset.pick) {
        pick = b.dataset.pick; lv5 = false;
        Array.prototype.forEach.call(root.querySelectorAll('.cx-ab'), function (x) { x.setAttribute('aria-pressed', String(x.dataset.pick === pick)); });
        drawMove();
        if (b.classList.contains('who')) { var w = root.querySelector('.cx-abrow'); if (w && w.getBoundingClientRect().top < 0) w.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        return;
      }
      if (b.classList.contains('cx-l5')) { lv5 = !lv5; drawMove(); var n = root.querySelector('.cx-l5'); if (n) n.focus(); return; }
      if (b.dataset.tab || b.dataset.tabGo) {
        tab = b.dataset.tab || b.dataset.tabGo; drawTabs();
        if (b.dataset.tabGo) root.querySelector('.cx-tabs').scrollIntoView({ behavior: 'smooth', block: 'start' });
        else root.querySelector('[data-tab="' + tab + '"]').focus();
        return;
      }
      if (b.dataset.filt) { filt = b.dataset.filt; drawTabs(); var fb = root.querySelector('[data-filt="' + filt + '"]'); if (fb) fb.focus(); }
    });
    root.addEventListener('keydown', function (e) {
      var t = e.target;
      if (t.getAttribute && t.getAttribute('role') === 'tab' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]')), i = tabs.indexOf(t);
        tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length].click();
        e.preventDefault();
      }
    });
    /* swipe the hull to change vessel, like the strip's arrows */
    var sx = null;
    root.querySelector('.cx-win').addEventListener('pointerdown', function (e) { if (e.target.closest('.hull')) sx = e.clientX; });
    window.addEventListener('pointerup', function (e) { if (sx == null) return; var dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 60) step(dx < 0 ? 1 : -1); });
    /* any link or button that names a vessel opens it here */
    Array.prototype.forEach.call(document.querySelectorAll('[data-codex]'), function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        var k = b.getAttribute('data-codex');
        if (k) go(k);
        document.getElementById('codex').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    window.addEventListener('hashchange', route);
  }
  function route() {
    var m = location.hash.match(/^#codex(?:=(.*))?$/);
    if (!m) return false;
    if (m[1]) go(decodeURIComponent(m[1]), { quiet: true });
    var sec = document.getElementById('codex');
    if (sec) setTimeout(function () { sec.scrollIntoView({ block: 'start' }); }, 0);
    return true;
  }

  fetch(BASE + 'fleet.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (data) {
    D = data;
    list = D.vessels.filter(function (v) { return v.status.hasMap; });
    list.sort(function (a, b) { return (isCrew(a) - isCrew(b)) || a.id - b.id; });
    if (!D.palette.domains[dom]) dom = D.palette.default;
    root.innerHTML = '<div class="cx-top"><div class="cx-bar"></div><div class="cx-tools"></div></div>' +
      '<div class="cx-win"></div><div class="cx-abrow" role="group" aria-label="Abilities"></div><div class="cx-movew"></div>' +
      '<div class="cx-tabs" role="tablist" aria-label="About this vessel"></div><div class="cx-panel" id="cx-panel" role="tabpanel"></div>';
    root.classList.add('ready');
    applyDomain();
    drawTools();
    bind();
    var m = location.hash.match(/^#codex=(.*)$/);
    go(m ? decodeURIComponent(m[1]) : list[0].key, { quiet: true });
    route();
  }).catch(function () {
    root.innerHTML = '<p class="cx-empty">The Fleet Codex could not load. Refresh the page to try again.</p>';
  });
})();
