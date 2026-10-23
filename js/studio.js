/* Froglet Studio (/admin/): developers edit their own profile (_team/<slug>.md) and write blog posts
   (_posts/). There is no server of ours: every save is a commit made through the GitHub API with the
   developer's own sign-in, and GitHub Pages rebuilds the site about a minute later.

   - Sign-in: "Sign in with GitHub" through the Cloudflare Worker in tools/studio-auth/ (when
     _data/studio.yml has auth_url; the tab goes to GitHub and back, the token arriving in the
     address's #fragment), or a fine-grained GitHub token pasted on the sign-in screen.
     The token is kept in sessionStorage (or localStorage when "Remember" is ticked) and is sent only
     to api.github.com.
   - Who may edit what: the signed-in GitHub account must be the `github` of a file in _team/, and the
     Studio only ever opens and writes that person's profile and posts with `author: <their slug>`.
   - Drafts: unpublished profile edits and post drafts are kept in this browser only. Pictures added
     to a draft upload when it is published, so nothing reaches the public repo before then.
   - Everything a developer types reaches the page through .value / .textContent; the only HTML set
     from content is the Markdown preview, sanitised by DOMPurify. */
(function () {
  'use strict';

  var TOKEN_KEY = 'froglet-studio-token';
  var DRAFT_PREFIX = 'froglet-studio:';
  var API = 'https://api.github.com';
  var ACCENTS = [
    { key: 'cyan', hex: '#00e5ff', label: 'Cyan' },
    { key: 'magenta', hex: '#e86cfc', label: 'Magenta' },
    { key: 'lime', hex: '#7fff00', label: 'Lime' },
    { key: 'orange', hex: '#ffaa40', label: 'Orange' },
    { key: 'pink', hex: '#ff4f8b', label: 'Pink' }
  ];
  var CATEGORIES = ['Dev Log', 'Design', 'Patch Notes'];
  var PIN_KINDS = ['Post', 'Code', 'Video', 'Link'];
  var MAX_LINKS = 5, MAX_PINS = 6;
  var PROFILE_NOTE = "'s profile at /team/{slug}/. Edit it in Froglet Studio (www.froglet.games/admin/), or here.";

  var CFG = null;      // /admin/data.json
  var ME = null;       // the GitHub user
  var DEV = null;      // their entry in CFG.team
  var authOrigin = '';

  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') e.className = attrs[k];
      else if (k in e && typeof attrs[k] !== 'string') e[k] = attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    if (text != null) e.textContent = text;
    return e;
  }
  function show(node, on) { node.hidden = !on; }

  /* ── Storage (may be blocked: private windows, cleared site data) ───────── */
  function storage(kind) { try { var s = window[kind]; s.getItem('x'); return s; } catch (e) { return null; } }
  var SS = storage('sessionStorage'), LS = storage('localStorage');
  function getToken() { return (SS && SS.getItem(TOKEN_KEY)) || (LS && LS.getItem(TOKEN_KEY)) || ''; }
  function setToken(t, remember) {
    clearToken();
    var s = remember ? LS : SS;
    if (s) s.setItem(TOKEN_KEY, t); else memoryToken = t;
  }
  var memoryToken = '';
  function token() { return getToken() || memoryToken; }
  function clearToken() { memoryToken = ''; if (SS) SS.removeItem(TOKEN_KEY); if (LS) LS.removeItem(TOKEN_KEY); }
  function readDraft(key) { try { return LS ? JSON.parse(LS.getItem(DRAFT_PREFIX + key) || 'null') : null; } catch (e) { return null; } }
  function writeDraft(key, value) { try { if (LS) LS.setItem(DRAFT_PREFIX + key, JSON.stringify(value)); } catch (e) {} }
  function dropDraft(key) { try { if (LS) LS.removeItem(DRAFT_PREFIX + key); } catch (e) {} }
  function draftKeys(prefix) {
    var out = [];
    if (!LS) return out;
    for (var i = 0; i < LS.length; i++) { var k = LS.key(i); if (k && k.indexOf(DRAFT_PREFIX + prefix) === 0) out.push(k.slice(DRAFT_PREFIX.length)); }
    return out;
  }

  /* ── Text and images ───────────────────────────────────────────────────── */
  function b64encodeText(str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64decodeText(b64) {
    var bin = atob(String(b64).replace(/\s/g, '')), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function blobB64(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result).split(',')[1]); };
      r.onerror = function () { rej(new Error('Could not read that picture.')); };
      r.readAsDataURL(blob);
    });
  }
  function readImage(file) {
    return new Promise(function (res, rej) {
      if (!file || !/^image\//.test(file.type)) { rej(new Error('Please choose a picture file.')); return; }
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () { URL.revokeObjectURL(url); res(img); };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('That picture could not be opened.')); };
      img.src = url;
    });
  }
  // fit "cover": crop to exactly w x h; fit "width": scale down to at most w wide.
  function resizeImage(img, w, h, fit) {
    var c = document.createElement('canvas'), sw = img.naturalWidth, sh = img.naturalHeight, ctx;
    if (fit === 'width') {
      var k = Math.min(1, w / sw);
      c.width = Math.round(sw * k); c.height = Math.round(sh * k);
      ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, c.width, c.height);
    } else {
      c.width = w; c.height = h;
      var s = Math.max(w / sw, h / sh), dw = sw * s, dh = sh * s;
      ctx = c.getContext('2d'); ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    }
    return new Promise(function (res, rej) {
      c.toBlob(function (b) { b ? res(b) : rej(new Error('Could not prepare that picture.')); }, 'image/webp', 0.85);
    });
  }
  function extFor(blob) { return blob.type === 'image/webp' ? 'webp' : blob.type === 'image/jpeg' ? 'jpg' : 'png'; }
  function stamp() { return Date.now().toString(36); }
  function slugify(s) {
    return String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'post';
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  // A link may be an http(s) address or a path on this site. Anything else (javascript:, data:) is refused.
  function safeUrl(u) {
    u = String(u || '').trim();
    if (/^https?:\/\/[^\s]+$/i.test(u)) return u;
    if (/^\/(?!\/)[^\s]*$/.test(u)) return u;
    return '';
  }

  /* ── Front matter ──────────────────────────────────────────────────────── */
  function splitFrontMatter(text) {
    var m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/.exec(text);
    if (!m) return { data: {}, body: text };
    var data = jsyaml.load(m[1], { schema: jsyaml.JSON_SCHEMA }) || {};
    return { data: data, body: m[2] };
  }
  function joinFrontMatter(note, data, body) {
    body = String(body || '').replace(/^\s*\n/, '');
    return '---\n' + (note ? '# ' + note + '\n' : '') +
      jsyaml.dump(data, { lineWidth: -1, noRefs: true, schema: jsyaml.JSON_SCHEMA }) + '---\n' +
      (body ? body.replace(/\s*$/, '\n') : '');
  }

  /* ── GitHub ────────────────────────────────────────────────────────────── */
  function gh(method, path, body) {
    var headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', Authorization: 'Bearer ' + token() };
    if (body) headers['Content-Type'] = 'application/json';
    return fetch(API + path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
      .then(function (r) {
        if (r.status === 204) return null;
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) { var e = new Error(j.message || ('GitHub answered ' + r.status)); e.status = r.status; throw e; }
          return j;
        });
      });
  }
  function contents(path) { return '/repos/' + CFG.repo + '/contents/' + path.split('/').map(encodeURIComponent).join('/'); }
  function getFile(path) {
    return gh('GET', contents(path) + '?ref=' + encodeURIComponent(CFG.branch))
      .then(function (j) { return { sha: j.sha, text: b64decodeText(j.content || '') }; });
  }
  function fileSha(path) {
    return gh('GET', contents(path) + '?ref=' + encodeURIComponent(CFG.branch))
      .then(function (j) { return j.sha; }, function (e) { if (e.status === 404) return null; throw e; });
  }
  function putFile(path, b64, message, sha) {
    var body = { message: message, content: b64, branch: CFG.branch };
    if (sha) body.sha = sha;
    return gh('PUT', contents(path), body);
  }
  function deleteFile(path, message) {
    return fileSha(path).then(function (sha) { if (sha) return gh('DELETE', contents(path), { message: message, sha: sha, branch: CFG.branch }); });
  }
  function explain(e) {
    if (e.status === 401) return 'Your sign-in has expired or the token is wrong. Sign out and sign in again.';
    if (e.status === 403 || e.status === 404) return 'GitHub refused that. Check your sign-in can write to ' + CFG.repo + ' (Contents: Read and write).';
    if (e.status === 409) return 'This file changed on GitHub since you opened it. Reload the Studio to get the latest, then publish again.';
    if (e.status === 422) return 'GitHub refused that: ' + e.message;
    return e.message || 'Something went wrong. Please try again.';
  }

  /* ── Toast and status ──────────────────────────────────────────────────── */
  var toastTimer;
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 6000);
  }
  function setError(id, msg) { var e = $(id); e.textContent = msg || ''; e.hidden = !msg; }
  function setStatus(id, msg, tone) { var s = $(id); s.textContent = msg || ''; s.dataset.tone = tone || ''; }

  /* ── Markdown editors (About, and the post body) ────────────────────────
     Pictures added here are kept in `pending` (path -> blob) and upload when the owner publishes. */
  var previewUrls = {};   // planned site path -> blob: URL, so previews show pictures before they upload
  function renderMarkdown(text) {
    var html = DOMPurify.sanitize(marked.parse(String(text || ''), { mangle: false, headerIds: false }));
    var box = document.createElement('div'); box.innerHTML = html;
    box.querySelectorAll('img').forEach(function (img) {
      var src = img.getAttribute('src') || '';
      if (previewUrls[src]) img.src = previewUrls[src];
    });
    box.querySelectorAll('a').forEach(function (a) { a.target = '_blank'; a.rel = 'noopener noreferrer'; });
    return box;
  }
  function setupMarkdown(root, opts) {
    var ta = root.querySelector('textarea'), pv = root.querySelector('.st-md-preview');
    function tab(name) {
      root.querySelectorAll('[data-md-tab]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.mdTab === name ? 'true' : 'false'); });
      var preview = name === 'preview';
      if (preview) { pv.replaceChildren.apply(pv, Array.prototype.slice.call(renderMarkdown(ta.value).childNodes)); }
      ta.hidden = preview; pv.hidden = !preview;
    }
    function insert(before, after, placeholder) {
      var s = ta.selectionStart, e = ta.selectionEnd, sel = ta.value.slice(s, e) || placeholder || '';
      ta.setRangeText(before + sel + (after || ''), s, e, 'end');
      ta.focus(); ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
    root.querySelectorAll('[data-md-tab]').forEach(function (b) { b.addEventListener('click', function () { tab(b.dataset.mdTab); }); });
    root.querySelectorAll('[data-md-wrap]').forEach(function (b) {
      b.addEventListener('click', function () { var w = b.dataset.mdWrap; insert(w, w, 'text'); });
    });
    root.querySelectorAll('[data-md-line]').forEach(function (b) {
      b.addEventListener('click', function () {
        var s = ta.selectionStart, lineStart = ta.value.lastIndexOf('\n', s - 1) + 1;
        ta.setRangeText(b.dataset.mdLine, lineStart, lineStart, 'end'); ta.focus();
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
    root.querySelector('[data-md-link]').addEventListener('click', function () {
      var url = safeUrl(window.prompt('Link address (https://…)', 'https://'));
      if (!url) return;
      insert('[', '](' + url + ')', 'link text');
    });
    root.querySelector('[data-md-image]').addEventListener('change', function (ev) {
      var file = ev.target.files[0]; ev.target.value = '';
      if (!file) return;
      readImage(file).then(function (img) { return resizeImage(img, 1600, 0, 'width'); }).then(function (blob) {
        var path = opts.imagePath(extFor(blob));
        opts.pending[path] = blob;
        previewUrls['/' + path] = URL.createObjectURL(blob);
        insert('![', '](/' + path + ')\n', file.name.replace(/\.[^.]+$/, '') || 'picture');
      }).catch(function (e) { toast(e.message); });
    });
    return { tab: tab, textarea: ta };
  }
  // Upload every pending picture the text still refers to; forget the rest.
  function uploadPending(pending, text, who) {
    var paths = Object.keys(pending).filter(function (p) { return text.indexOf('/' + p) !== -1; });
    return paths.reduce(function (chain, p) {
      return chain.then(function () { return blobB64(pending[p]); })
        .then(function (b64) { return putFile(p, b64, 'studio(' + who + '): add picture'); })
        .then(function () { delete pending[p]; });
    }, Promise.resolve()).then(function () { Object.keys(pending).forEach(function (p) { delete pending[p]; }); });
  }

  /* ── Sign-in ───────────────────────────────────────────────────────────── */
  function showOnly(id) {
    ['view-signin', 'view-denied', 'view-app'].forEach(function (v) { show($(v), v === id); });
  }
  function signIn() {
    if (!token()) { showOnly('view-signin'); return Promise.resolve(); }
    setError('signin-error', '');
    return gh('GET', '/user').then(function (user) {
      ME = user;
      var login = String(user.login || '').toLowerCase();
      DEV = CFG.team.filter(function (t) { return String(t.github || '').toLowerCase() === login; })[0] || null;
      if (!DEV) { $('denied-login').textContent = user.login; showOnly('view-denied'); return; }
      return gh('GET', '/repos/' + CFG.repo).then(function (repo) {
        if (repo.permissions && repo.permissions.push === false) throw Object.assign(new Error('This sign-in can read ' + CFG.repo + ' but not write to it. Give the token Contents: Read and write.'), { status: 0 });
      }).then(startApp);
    }).catch(function (e) {
      if (e.status === 401) clearToken();
      showOnly('view-signin');
      setError('signin-error', e.status === 401 ? 'GitHub didn’t accept that sign-in. Check the token and try again.' : explain(e));
    });
  }
  // Back from "Sign in with GitHub": take the token (or the reason it failed) out of the address at once.
  function takeSignInFromAddress() {
    if (!location.hash) return '';
    var h = new URLSearchParams(location.hash.slice(1)), t = h.get('studio_token'), err = h.get('studio_error');
    if (!t && !err) return '';
    history.replaceState(null, '', location.pathname + location.search);
    if (t) setToken(t, false);
    return err || '';
  }
  function wireSignIn() {
    if (CFG.authUrl) {
      try { authOrigin = new URL(CFG.authUrl).origin; } catch (e) { authOrigin = ''; }
    }
    if (authOrigin) {
      var btn = $('signin-github'); btn.hidden = false;
      // The whole tab goes to GitHub and comes back here, with the sign-in in the address's #fragment
      // (browsers never send a fragment to any server). No popup: popup blockers and GitHub's window
      // isolation both break a popup's hand-back.
      btn.addEventListener('click', function () {
        var back = location.origin + location.pathname + location.search;
        location.assign(CFG.authUrl.replace(/\/$/, '') + '/auth?return=' + encodeURIComponent(back));
      });
    } else {
      $('token-box').open = true;
    }
    $('token-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var t = $('token-input').value.trim();
      if (!t) return;
      setToken(t, $('token-remember').checked);
      $('token-input').value = '';
      signIn();
    });
    document.querySelectorAll('[data-signout]').forEach(function (b) {
      b.addEventListener('click', function () { clearToken(); location.replace('/admin/'); });
    });
  }

  /* ── The app shell ─────────────────────────────────────────────────────── */
  var views = ['profile', 'posts', 'write'];
  function go(name, keep) {
    views.forEach(function (v) { show($('view-' + v), v === name); });
    document.querySelectorAll('.st-nav [data-go]').forEach(function (b) {
      if (b.dataset.go === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (name === 'posts') renderPosts();
    if (name === 'write' && !keep && (!W.loaded || W.path)) newPost();
    window.scrollTo(0, 0);
  }
  function startApp() {
    showOnly('view-app');
    $('me-name').textContent = DEV.name;
    $('me-login').textContent = '@' + ME.login;
    $('me-avatar').textContent = DEV.name.charAt(0);
    var who = CFG.team.filter(function (t) { return t.slug === DEV.slug; })[0];
    if (who && who.accent) { var a0 = ACCENTS.filter(function (a) { return a.key === who.accent; })[0]; if (a0) document.body.style.setProperty('--studio-accent', a0.hex); }
    $('nav-mypage').href = DEV.url;
    $('pcard-link').href = DEV.url; $('pcard-link').textContent = 'www.froglet.games' + DEV.url;
    document.querySelectorAll('[data-go]').forEach(function (b) { b.addEventListener('click', function () { go(b.dataset.go); }); });
    setupProfileForm();
    setupPostForm();
    go('profile');
    return loadProfile();
  }

  /* ── Profile ───────────────────────────────────────────────────────────── */
  var P = { sha: null, data: null, body: '', original: null, pending: {}, photo: null, banner: null, loaded: false };
  var aboutEditor;

  function normalizeProfile(d) {
    d = Object.assign({}, d);
    ['name', 'github', 'title', 'bio', 'location', 'accent', 'photo', 'banner', 'favourite_vessel'].forEach(function (k) { d[k] = d[k] == null ? '' : String(d[k]); });
    d.links = Array.isArray(d.links) ? d.links.map(function (l) { return { label: String((l && l.label) || ''), url: String((l && l.url) || '') }; }) : [];
    d.pins = Array.isArray(d.pins) ? d.pins.map(function (p) {
      return { kind: String((p && p.kind) || ''), title: String((p && p.title) || ''), text: String((p && p.text) || ''), url: String((p && p.url) || '') };
    }) : [];
    if (!ACCENTS.some(function (a) { return a.key === d.accent; })) d.accent = 'cyan';
    return d;
  }
  function loadProfile() {
    setStatus('profile-status', 'Loading your profile…');
    return getFile(DEV.path).then(function (f) {
      var fm = splitFrontMatter(f.text);
      P.sha = f.sha; P.original = fm.data;
      P.data = normalizeProfile(fm.data); P.body = fm.body;
      var draft = readDraft('profile:' + DEV.slug);
      if (draft && draft.base === f.sha) {
        // A photo or banner picked before a reload never uploaded: fall back to the published one.
        var orig = normalizeProfile(fm.data);
        ['photo', 'banner'].forEach(function (k) {
          var v = draft.data && draft.data[k];
          if (v && v !== orig[k] && v.indexOf('/assets/team/') === 0) draft.data[k] = orig[k];
        });
        P.data = normalizeProfile(draft.data); P.body = draft.body;
        markProfileDirty(true);
      } else {
        if (draft) dropDraft('profile:' + DEV.slug);   // the published file moved on: the old draft is stale
        markProfileDirty(false);
      }
      P.loaded = true;
      fillProfileForm();
    }).catch(function (e) {
      setStatus('profile-status', '');
      if (e.status !== 404) { setError('profile-error', explain(e)); return; }
      // Not found: say whether the branch or the file is missing, rather than "refused".
      gh('GET', '/repos/' + CFG.repo + '/branches/' + encodeURIComponent(CFG.branch)).then(function () {
        setError('profile-error', 'Your profile file (' + DEV.path + ') isn’t on the branch “' + CFG.branch + '” yet.' +
          (CFG.branch === 'main' ? ' If the developer pages haven’t been merged yet, test on a preview with ?branch=<the pull request’s branch> in the address.' : ''));
      }, function (e2) {
        setError('profile-error', e2.status === 404
          ? 'There’s no branch called “' + CFG.branch + '”. Check the ?branch= part of the address.'
          : explain(e2));
      });
    });
  }
  function markProfileDirty(dirty) {
    P.dirty = dirty;
    setStatus('profile-status', dirty ? 'Unpublished changes, saved in this browser' : 'Published', dirty ? 'warn' : 'ok');
    $('profile-discard').hidden = !dirty;
  }
  function radioGroup(container, name, items, current, onPick) {
    container.replaceChildren();
    items.forEach(function (it) {
      var label = el('label', { class: it.cls || '' });
      var input = el('input', { type: 'radio', name: name, value: it.value });
      input.checked = it.value === current;
      input.addEventListener('change', function () { if (input.checked) onPick(it.value); });
      label.appendChild(input);
      it.render(label);
      container.appendChild(label);
    });
  }
  function fillProfileForm() {
    var d = P.data;
    $('f-name').value = d.name; $('f-title').value = d.title; $('f-bio').value = d.bio; $('f-location').value = d.location;
    aboutEditor.textarea.value = P.body.trim();
    aboutEditor.tab('write');
    renderAccents(); renderBanners(); renderVessels(); renderLinks(); renderPins(); renderPhoto(); updateProfilePreview();
  }
  function renderAccents() {
    radioGroup($('accent-list'), 'accent', ACCENTS.map(function (a) {
      return { value: a.key, cls: 'st-swatch', render: function (l) { l.style.setProperty('--sw', a.hex); l.title = a.label; l.appendChild(el('span', { class: 'st-sr' }, a.label)); } };
    }), P.data.accent, function (v) { P.data.accent = v; profileChanged(); });
  }
  function artItems(withNone) {
    var items = CFG.art.map(function (a) {
      return { value: a.image, cls: 'st-art-item', render: function (l) { l.title = a.name; l.appendChild(el('img', { src: a.thumb || a.image, alt: a.name, loading: 'lazy' })); } };
    });
    if (withNone) items.unshift({ value: '', cls: 'st-art-item st-art-none', render: function (l) { l.appendChild(el('span', null, 'None')); } });
    return items;
  }
  function renderBanners() {
    var items = artItems(true);
    var own = P.banner ? P.banner.url : (P.data.banner && !CFG.art.some(function (a) { return a.image === P.data.banner; }) ? P.data.banner : '');
    if (own) items.push({ value: P.data.banner, cls: 'st-art-item', render: function (l) { l.title = 'Your upload'; l.appendChild(el('img', { src: own, alt: 'Your upload' })); } });
    radioGroup($('banner-list'), 'banner', items, P.data.banner, function (v) { P.data.banner = v; profileChanged(); });
  }
  function renderVessels() {
    var items = [{ value: '', cls: 'st-vessel st-vessel-none', render: function (l) { l.appendChild(el('span', null, 'None')); } }]
      .concat(CFG.vessels.map(function (v) {
        return { value: v.name, cls: 'st-vessel', render: function (l) { l.appendChild(el('img', { src: v.thumb, alt: '', loading: 'lazy' })); l.appendChild(el('span', null, v.name)); } };
      }));
    radioGroup($('vessel-list'), 'vessel', items, P.data.favourite_vessel, function (v) { P.data.favourite_vessel = v; profileChanged(); });
  }
  function renderPhoto() {
    var box = $('photo-preview'); box.replaceChildren();
    var src = P.photo ? P.photo.url : (previewUrls[P.data.photo] || P.data.photo);
    if (src) box.appendChild(el('img', { src: src, alt: 'Your photo' }));
    else box.appendChild(el('span', null, (P.data.name || DEV.name).charAt(0)));
    $('photo-remove').hidden = !src;
  }
  function listRow(fields, values, onChange, onRemove, onMove) {
    var row = el('div', { class: 'st-list-row' });
    fields.forEach(function (f) {
      var input;
      if (f.options) {
        input = el('select', { class: 'st-input', 'aria-label': f.label });
        f.options.forEach(function (o) { var opt = el('option', { value: o }, o); input.appendChild(opt); });
      } else {
        input = el('input', { class: 'st-input', 'aria-label': f.label, placeholder: f.placeholder || '', maxlength: String(f.max || 200) });
      }
      input.value = values[f.key] || (f.options ? f.options[0] : '');
      input.style.flex = f.flex || '1';
      input.addEventListener('input', function () { onChange(f.key, input.value); });
      input.addEventListener('change', function () { onChange(f.key, input.value); });
      row.appendChild(input);
    });
    if (onMove) {
      row.appendChild(el('button', { type: 'button', class: 'st-icon', 'aria-label': 'Move up', onclick: function () { onMove(-1); } }, '↑'));
      row.appendChild(el('button', { type: 'button', class: 'st-icon', 'aria-label': 'Move down', onclick: function () { onMove(1); } }, '↓'));
    }
    row.appendChild(el('button', { type: 'button', class: 'st-icon', 'aria-label': 'Remove', onclick: onRemove }, '×'));
    return row;
  }
  function renderLinks() {
    var box = $('link-list'); box.replaceChildren();
    P.data.links.forEach(function (l, i) {
      box.appendChild(listRow(
        [{ key: 'label', label: 'Link name', placeholder: 'Name, e.g. LinkedIn', max: 40, flex: '0 1 34%' }, { key: 'url', label: 'Address', placeholder: 'https://…', max: 300 }],
        l, function (k, v) { l[k] = v; profileChanged(true); },
        function () { P.data.links.splice(i, 1); renderLinks(); profileChanged(); }));
    });
    $('link-add').hidden = P.data.links.length >= MAX_LINKS;
  }
  function renderPins() {
    var box = $('pin-list'); box.replaceChildren();
    P.data.pins.forEach(function (p, i) {
      var wrap = el('div', { class: 'st-pin' });
      wrap.appendChild(listRow(
        [{ key: 'kind', label: 'Kind', options: PIN_KINDS, flex: '0 0 110px' }, { key: 'title', label: 'Title', placeholder: 'Title', max: 80 }],
        p, function (k, v) { p[k] = v; profileChanged(true); },
        function () { P.data.pins.splice(i, 1); renderPins(); profileChanged(); },
        function (dir) {
          var j = i + dir; if (j < 0 || j >= P.data.pins.length) return;
          P.data.pins.splice(j, 0, P.data.pins.splice(i, 1)[0]); renderPins(); profileChanged();
        }));
      wrap.appendChild(listRow(
        [{ key: 'text', label: 'One line', placeholder: 'One line (optional)', max: 140 }, { key: 'url', label: 'Address', placeholder: 'https://… or /blog/…', max: 300 }],
        p, function (k, v) { p[k] = v; profileChanged(true); }, null));
      wrap.lastChild.lastChild.remove();   // the second row has no remove button of its own
      box.appendChild(wrap);
    });
    $('pin-add').hidden = P.data.pins.length >= MAX_PINS;
  }
  function readProfileFields() {
    P.data.name = $('f-name').value.trim();
    P.data.title = $('f-title').value.trim();
    P.data.bio = $('f-bio').value.trim();
    P.data.location = $('f-location').value.trim();
    P.body = aboutEditor.textarea.value;
  }
  function profileChanged(skipRender) {
    readProfileFields();
    writeDraft('profile:' + DEV.slug, { base: P.sha, data: P.data, body: P.body });
    markProfileDirty(true);
    if (!skipRender) renderPhoto();
    updateProfilePreview();
  }
  function updateProfilePreview() {
    var d = P.data, acc = ACCENTS.filter(function (a) { return a.key === d.accent; })[0] || ACCENTS[0];
    var card = $('pcard'); card.style.setProperty('--accent', acc.hex);
    document.body.style.setProperty('--studio-accent', acc.hex);
    var bannerSrc = P.banner && d.banner === P.banner.path ? P.banner.url : (previewUrls[d.banner] || d.banner);
    $('pcard-banner').src = bannerSrc || ''; $('pcard-banner').hidden = !bannerSrc;
    var ph = $('pcard-photo'); ph.replaceChildren();
    var photo = P.photo ? P.photo.url : (previewUrls[d.photo] || d.photo);
    if (photo) ph.appendChild(el('img', { src: photo, alt: '' })); else ph.appendChild(el('span', null, (d.name || DEV.name).charAt(0)));
    $('pcard-name').textContent = d.name || DEV.name;
    $('pcard-title').textContent = d.title; $('pcard-title').hidden = !d.title;
    $('pcard-bio').textContent = d.bio;
    var fav = CFG.vessels.filter(function (v) { return v.name === d.favourite_vessel; })[0];
    $('pcard-fav').hidden = !fav;
    if (fav) { $('pcard-fav-img').src = fav.thumb; $('pcard-fav-name').textContent = fav.name; }
  }
  function setupProfileForm() {
    aboutEditor = setupMarkdown(document.querySelector('#view-profile [data-md]'), {
      pending: P.pending,
      imagePath: function (ext) { return 'assets/team/' + DEV.slug + '/about-' + stamp() + '.' + ext; }
    });
    ['f-name', 'f-title', 'f-bio', 'f-location'].forEach(function (id) { $(id).addEventListener('input', function () { profileChanged(true); }); });
    aboutEditor.textarea.addEventListener('input', function () { profileChanged(true); });
    $('link-add').addEventListener('click', function () { P.data.links.push({ label: '', url: '' }); renderLinks(); profileChanged(true); });
    $('pin-add').addEventListener('click', function () { P.data.pins.push({ kind: 'Link', title: '', text: '', url: '' }); renderPins(); profileChanged(true); });
    $('photo-file').addEventListener('change', function (ev) {
      var file = ev.target.files[0]; ev.target.value = '';
      readImage(file).then(function (img) { return resizeImage(img, 600, 600, 'cover'); }).then(function (blob) {
        var path = 'assets/team/' + DEV.slug + '/photo-' + stamp() + '.' + extFor(blob);
        P.photo = { blob: blob, path: path, url: URL.createObjectURL(blob) };
        P.data.photo = '/' + path; profileChanged();
      }).catch(function (e) { toast(e.message); });
    });
    $('photo-remove').addEventListener('click', function () { P.photo = null; P.data.photo = ''; profileChanged(); });
    $('banner-file').addEventListener('change', function (ev) {
      var file = ev.target.files[0]; ev.target.value = '';
      readImage(file).then(function (img) { return resizeImage(img, 1800, 540, 'cover'); }).then(function (blob) {
        var path = 'assets/team/' + DEV.slug + '/banner-' + stamp() + '.' + extFor(blob);
        P.banner = { blob: blob, path: '/' + path, file: path, url: URL.createObjectURL(blob) };
        P.data.banner = '/' + path; renderBanners(); profileChanged();
      }).catch(function (e) { toast(e.message); });
    });
    $('profile-discard').addEventListener('click', function () {
      if (!window.confirm('Throw away your unpublished changes?')) return;
      dropDraft('profile:' + DEV.slug); P.photo = null; P.banner = null; loadProfile();
    });
    $('profile-publish').addEventListener('click', publishProfile);
  }
  function validateProfile() {
    var d = P.data;
    if (!d.name) return 'Please give your name.';
    for (var i = 0; i < d.links.length; i++) {
      if (!d.links[i].url.trim()) continue;
      if (!safeUrl(d.links[i].url)) return 'Link ' + (i + 1) + ' needs an address starting with https://.';
    }
    for (var j = 0; j < d.pins.length; j++) {
      if (!d.pins[j].title.trim()) return 'Pin ' + (j + 1) + ' needs a title.';
      if (d.pins[j].url.trim() && !safeUrl(d.pins[j].url)) return 'Pin ' + (j + 1) + ' needs an address starting with https:// or /.';
    }
    return '';
  }
  function cleanProfileData() {
    var d = P.data, out = Object.assign({}, P.original || {});
    ['name', 'github', 'title', 'bio', 'location', 'accent', 'photo', 'banner', 'favourite_vessel'].forEach(function (k) { out[k] = d[k]; });
    out.github = (P.original && P.original.github) || DEV.github;   // the Studio never changes who owns a profile
    out.links = d.links.filter(function (l) { return safeUrl(l.url); }).map(function (l) { return { label: l.label.trim(), url: safeUrl(l.url) }; }).slice(0, MAX_LINKS);
    out.pins = d.pins.filter(function (p) { return p.title.trim(); }).map(function (p) {
      return { kind: p.kind, title: p.title.trim(), text: p.text.trim(), url: safeUrl(p.url) };
    }).slice(0, MAX_PINS);
    return out;
  }
  function publishProfile() {
    readProfileFields();
    var problem = validateProfile();
    setError('profile-error', problem);
    if (problem) return;
    var btn = $('profile-publish'); btn.disabled = true;
    setStatus('profile-status', 'Publishing…');
    var who = DEV.slug, oldPhoto = (P.original && P.original.photo) || '', oldBanner = (P.original && P.original.banner) || '';
    var mine = function (p) { return p && p.indexOf('/assets/team/' + who + '/') === 0; };
    var steps = Promise.resolve();
    if (P.photo && P.data.photo === '/' + P.photo.path) {
      var photo = P.photo;
      steps = steps.then(function () { return blobB64(photo.blob); }).then(function (b64) { return putFile(photo.path, b64, 'studio(' + who + '): new photo'); });
    }
    if (P.banner && P.data.banner === P.banner.path) {
      var banner = P.banner;
      steps = steps.then(function () { return blobB64(banner.blob); }).then(function (b64) { return putFile(banner.file, b64, 'studio(' + who + '): new banner'); });
    }
    steps.then(function () { return uploadPending(P.pending, P.body, who); })
      .then(function () {
        var data = cleanProfileData();
        var note = DEV.name + PROFILE_NOTE.replace('{slug}', who);
        return putFile(DEV.path, b64encodeText(joinFrontMatter(note, data, P.body)), 'studio(' + who + '): update profile', P.sha)
          .then(function (j) { P.sha = j.content.sha; P.original = data; });
      })
      .then(function () {
        // Tidy pictures this profile no longer uses (only ever inside assets/team/<slug>/).
        var gone = [];
        if (mine(oldPhoto) && oldPhoto !== P.data.photo) gone.push(oldPhoto);
        if (mine(oldBanner) && oldBanner !== P.data.banner) gone.push(oldBanner);
        return gone.reduce(function (c, p) { return c.then(function () { return deleteFile(p.slice(1), 'studio(' + who + '): remove old picture').catch(function () {}); }); }, Promise.resolve());
      })
      .then(function () {
        // Until GitHub Pages rebuilds (about a minute) the new pictures aren't on the site yet: keep showing ours.
        if (P.photo) previewUrls['/' + P.photo.path] = P.photo.url;
        if (P.banner) previewUrls[P.banner.path] = P.banner.url;
        P.photo = null; P.banner = null;
        dropDraft('profile:' + who);
        markProfileDirty(false);
        toast('Published. Your page updates in about a minute.');
      })
      .catch(function (e) { setError('profile-error', explain(e)); setStatus('profile-status', 'Not published', 'warn'); })
      .then(function () { btn.disabled = false; });
  }

  /* ── Posts ─────────────────────────────────────────────────────────────── */
  var W = { loaded: false };
  var bodyEditor;

  function renderPosts() {
    var list = $('post-list'); list.replaceChildren();
    var mine = CFG.posts.filter(function (p) { return p.author === DEV.slug; });
    mine.forEach(function (p) {
      var li = el('li');
      li.appendChild(el('span', { class: 'st-post-date' }, p.date));
      li.appendChild(el('b', null, p.title));
      var actions = el('span', { class: 'st-inline' });
      actions.appendChild(el('a', { class: 'st-btn st-btn-small', href: p.url, target: '_blank', rel: 'noopener' }, 'View'));
      actions.appendChild(el('button', { type: 'button', class: 'st-btn st-btn-small', onclick: function () { editPost(p.path); } }, 'Edit'));
      li.appendChild(actions);
      list.appendChild(li);
    });
    $('post-empty').hidden = mine.length > 0;
    var drafts = draftKeys('post:' + DEV.slug + ':'), dl = $('draft-list'); dl.replaceChildren();
    drafts.forEach(function (k) {
      var d = readDraft(k); if (!d) return;
      var li = el('li');
      li.appendChild(el('span', { class: 'st-post-date' }, d.path ? 'Edit' : 'Draft'));
      li.appendChild(el('b', null, (d.data && d.data.title) || 'Untitled'));
      var actions = el('span', { class: 'st-inline' });
      actions.appendChild(el('button', { type: 'button', class: 'st-btn st-btn-small', onclick: function () { openDraft(k); } }, 'Open'));
      actions.appendChild(el('button', { type: 'button', class: 'st-btn st-btn-small', onclick: function () {
        if (window.confirm('Delete this draft?')) { dropDraft(k); renderPosts(); }
      } }, 'Delete'));
      li.appendChild(actions);
      dl.appendChild(li);
    });
    $('draft-box').hidden = drafts.length === 0;
  }
  function blankPost() {
    return { title: '', description: '', category: CATEGORIES[0], author: DEV.slug, image: '', image_alt: '' };
  }
  function newPost() {
    W = { loaded: true, key: 'post:' + DEV.slug + ':' + stamp(), path: null, sha: null, data: blankPost(), body: '', pin: true, cover: null, pending: W.pending || {} };
    fillPostForm();
  }
  function openDraft(key) {
    var d = readDraft(key); if (!d) return;
    W = { loaded: true, key: key, path: d.path || null, sha: d.sha || null, data: Object.assign(blankPost(), d.data), body: d.body || '', pin: d.pin !== false, cover: null, pending: W.pending || {} };
    fillPostForm(); go('write', true);
  }
  function editPost(path) {
    var key = 'post:' + DEV.slug + ':' + slugify(path);
    var d = readDraft(key);
    if (d) { openDraft(key); return; }
    setError('post-error', '');
    getFile(path).then(function (f) {
      var fm = splitFrontMatter(f.text);
      if (fm.data.author !== DEV.slug) { toast('That post isn’t yours to edit.'); return; }
      W = { loaded: true, key: key, path: path, sha: f.sha, data: Object.assign(blankPost(), fm.data), body: fm.body, pin: false, cover: null, pending: W.pending || {} };
      fillPostForm(); go('write', true);
    }).catch(function (e) { toast(explain(e)); });
  }
  function fillPostForm() {
    $('p-title').value = W.data.title || '';
    $('p-desc').value = W.data.description || '';
    $('p-alt').value = W.data.image_alt || '';
    $('p-pin').checked = !!W.pin;
    bodyEditor.textarea.value = (W.body || '').trim();
    bodyEditor.tab('write');
    renderCategories(); renderCover();
    $('cover-list').hidden = true;
    setError('post-error', '');
    setStatus('post-status', W.path ? 'Editing a published post' : 'New post, saved only in this browser', W.path ? 'ok' : 'warn');
    $('post-publish').textContent = W.path ? 'Publish changes' : 'Publish';
  }
  function renderCategories() {
    radioGroup($('cat-list'), 'category', CATEGORIES.map(function (c) {
      return { value: c, cls: 'st-chip', render: function (l) { l.appendChild(el('span', null, c)); } };
    }), W.data.category || CATEGORIES[0], function (v) { W.data.category = v; postChanged(); });
  }
  function renderCover() {
    var box = $('cover-preview'); box.replaceChildren();
    var src = W.cover ? W.cover.url : W.data.image;
    if (src) box.appendChild(el('img', { src: src, alt: '' })); else box.appendChild(el('span', null, 'No cover yet'));
  }
  function postChanged() {
    W.data.title = $('p-title').value; W.data.description = $('p-desc').value; W.data.image_alt = $('p-alt').value;
    W.body = bodyEditor.textarea.value; W.pin = $('p-pin').checked;
    var keepImage = W.cover ? '' : W.data.image;   // an un-uploaded cover can't be kept in a draft
    writeDraft(W.key, { path: W.path, sha: W.sha, data: Object.assign({}, W.data, { image: keepImage }), body: W.body, pin: W.pin });
    var pendingPics = Object.keys(W.pending).length > 0 || W.cover;
    setStatus('post-status', (W.path ? 'Unpublished edits' : 'Draft') + ', saved only in this browser' + (pendingPics ? ' (new pictures upload when you publish; keep this tab open)' : ''), 'warn');
  }
  function setupPostForm() {
    W.pending = {};
    bodyEditor = setupMarkdown(document.querySelector('#view-write [data-md]'), {
      pending: W.pending,
      imagePath: function (ext) { return 'assets/blog/' + today() + '-' + stamp() + '.' + ext; }
    });
    ['p-title', 'p-desc', 'p-alt'].forEach(function (id) { $(id).addEventListener('input', postChanged); });
    bodyEditor.textarea.addEventListener('input', postChanged);
    $('p-pin').addEventListener('change', postChanged);
    $('cover-pick').addEventListener('click', function () {
      var list = $('cover-list'); list.hidden = !list.hidden;
      if (!list.hidden) radioGroup(list, 'cover', artItems(false), W.data.image, function (v) { W.cover = null; W.data.image = v; renderCover(); postChanged(); });
    });
    $('cover-file').addEventListener('change', function (ev) {
      var file = ev.target.files[0]; ev.target.value = '';
      readImage(file).then(function (img) { return resizeImage(img, 1600, 900, 'cover'); }).then(function (blob) {
        W.cover = { blob: blob, url: URL.createObjectURL(blob), ext: extFor(blob) };
        renderCover(); postChanged();
      }).catch(function (e) { toast(e.message); });
    });
    $('post-discard').addEventListener('click', function () {
      if (!window.confirm(W.path ? 'Throw away your unpublished edits to this post?' : 'Throw away this draft?')) return;
      dropDraft(W.key); W.loaded = false; go('posts');
    });
    $('post-publish').addEventListener('click', publishPost);
  }
  function publishPost() {
    postChanged();
    var d = W.data, who = DEV.slug;
    if (!d.title.trim()) { setError('post-error', 'Please give the post a title.'); return; }
    if (!W.body.trim()) { setError('post-error', 'The post is empty.'); return; }
    setError('post-error', '');
    var btn = $('post-publish'); btn.disabled = true;
    setStatus('post-status', 'Publishing…');
    var date = W.path ? (/_posts\/(\d{4}-\d{2}-\d{2})-/.exec(W.path) || [])[1] || today() : today();
    var slug = W.path ? W.path.replace(/^_posts\/\d{4}-\d{2}-\d{2}-/, '').replace(/\.(md|markdown)$/, '') : slugify(d.title);
    var path = W.path || '_posts/' + date + '-' + slug + '.md';
    var url = '/blog/' + slug + '/';
    var check = W.path ? Promise.resolve() : fileSha(path).then(function (sha) {
      if (sha) throw new Error('You already published a post with this title today. Change the title a little.');
    });
    check
      .then(function () {
        if (!W.cover) return;
        var coverPath = 'assets/blog/' + date + '-' + slug + '-cover-' + stamp() + '.' + W.cover.ext;
        return blobB64(W.cover.blob).then(function (b64) { return putFile(coverPath, b64, 'studio(' + who + '): cover for "' + d.title.trim() + '"'); })
          .then(function () { d.image = '/' + coverPath; });
      })
      .then(function () { return uploadPending(W.pending, W.body, who); })
      .then(function () {
        var data = Object.assign({}, d, { title: d.title.trim(), description: d.description.trim(), author: who, image_alt: d.image_alt.trim() });
        if (!data.image) delete data.image;
        if (!data.image_alt) delete data.image_alt;
        if (!data.description) delete data.description;
        var msg = 'studio(' + who + '): ' + (W.path ? 'update' : 'publish') + ' "' + data.title + '"';
        return putFile(path, b64encodeText(joinFrontMatter('', data, W.body)), msg, W.sha).then(function (j) { W.sha = j.content.sha; return data; });
      })
      .then(function (data) {
        if (!W.pin) return;
        return pinPost(data.title, data.description || '', url);
      })
      .then(function () {
        dropDraft(W.key);
        var wasNew = !W.path;
        W.path = path; W.cover = null;
        W.key = 'post:' + who + ':' + slugify(path);
        if (wasNew) CFG.posts.unshift({ title: d.title.trim(), url: url, path: path, author: who, date: date });
        fillPostForm();
        toast('Published. It appears at www.froglet.games' + url + ' in about a minute.');
      })
      .catch(function (e) { setError('post-error', explain(e)); setStatus('post-status', 'Not published', 'warn'); })
      .then(function () { btn.disabled = false; });
  }
  // Add the post to the owner's pins (first place), from the profile as it is on GitHub now.
  function pinPost(title, text, url) {
    return getFile(DEV.path).then(function (f) {
      var fm = splitFrontMatter(f.text), data = fm.data || {};
      var pins = Array.isArray(data.pins) ? data.pins : [];
      if (pins.some(function (p) { return p && p.url === url; })) return;
      pins.unshift({ kind: 'Post', title: title, text: text, url: url });
      data.pins = pins.slice(0, MAX_PINS);
      var note = DEV.name + PROFILE_NOTE.replace('{slug}', DEV.slug);
      return putFile(DEV.path, b64encodeText(joinFrontMatter(note, data, fm.body)), 'studio(' + DEV.slug + '): pin "' + title + '"', f.sha)
        .then(function (j) {
          if (P.loaded && !P.dirty) { P.sha = j.content.sha; P.original = data; P.data = normalizeProfile(data); fillProfileForm(); }
          else if (P.loaded) { P.sha = j.content.sha; P.original = data; P.data.pins = normalizeProfile(data).pins; renderPins(); }
        });
    });
  }

  /* ── Start ─────────────────────────────────────────────────────────────── */
  window.addEventListener('beforeunload', function (e) {
    if ((P.dirty && (P.photo || P.banner || Object.keys(P.pending).length)) || (W.pending && Object.keys(W.pending).length) || W.cover) {
      e.preventDefault(); e.returnValue = '';
    }
  });
  fetch('/admin/data.json', { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error('Could not load the Studio’s settings.'); return r.json(); })
    .then(function (cfg) {
      CFG = cfg;
      // Test mode: /admin/?branch=<name> saves to that branch (e.g. a pull request's, seen on a preview
      // build) instead of the live site's. Shown in a bar on every screen so it is never mistaken.
      var testBranch = new URLSearchParams(location.search).get('branch');
      if (testBranch && /^[A-Za-z0-9._\/-]{1,200}$/.test(testBranch) && testBranch !== CFG.branch) {
        CFG.branch = testBranch;
        var bar = $('testbar');
        bar.textContent = 'Test mode: saving to the branch “' + testBranch + '”, not the live site.';
        bar.hidden = false;
      }
      var signInError = takeSignInFromAddress();
      wireSignIn();
      return signIn().then(function () { if (signInError) { showOnly('view-signin'); setError('signin-error', signInError); } });
    })
    .catch(function (e) { showOnly('view-signin'); setError('signin-error', e.message); });
})();
