/* The Ark in 3D (Voyages page): the game's own hull, ArkReverse.fbx, exported to /assets/hypersea/ark.glb
 * (decimated to 30 %, the rig and its takes left out). A small WebGL viewer with no library: drag to turn it,
 * scroll or pinch to bring it closer, and it turns slowly by itself while nobody holds it.
 * Its four materials are the model's own: Body, Window, Engine and Domain. The Domain seams wear the picked
 * domain's signal colour and the engines the omni lime, both from the game's palette (fleet-codex/fleet.json).
 */
(function () {
  'use strict';
  var box = document.getElementById('hs-ark');
  if (!box) return;
  var cv = box.querySelector('canvas');
  var gl = cv.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true });
  if (!gl) { box.classList.add('no3d'); return; }
  var u32 = gl.getExtension('OES_element_index_uint');

  var VS = 'attribute vec3 p;attribute vec3 n;uniform mat4 mvp;uniform mat4 m;varying vec3 vn;varying vec3 vp;' +
    'void main(){vn=mat3(m)*n;vp=(m*vec4(p,1.)).xyz;gl_Position=mvp*vec4(p,1.);}';
  var FS = 'precision mediump float;varying vec3 vn;varying vec3 vp;uniform vec3 col;uniform float glow;uniform vec3 eye;uniform vec3 rimc;' +
    'void main(){vec3 N=normalize(vn);if(!gl_FrontFacing)N=-N;vec3 V=normalize(eye-vp);' +
    'vec3 L1=normalize(vec3(.4,.9,.5));vec3 L2=normalize(vec3(-.7,.2,-.6));' +
    'float d=max(dot(N,L1),0.)*.85+max(dot(N,L2),0.)*.3+.18;' +
    'float sp=pow(max(dot(reflect(-L1,N),V),0.),28.)*.35;' +
    'float rim=pow(1.-max(dot(N,V),0.),3.)*.55;' +
    'vec3 c=col*d+sp+rimc*rim;c=mix(c,col*1.6,glow);gl_FragColor=vec4(c,1.);}';
  function sh(t, src) { var s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); return s; }
  var pr = gl.createProgram();
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
  gl.useProgram(pr);
  var A = { p: gl.getAttribLocation(pr, 'p'), n: gl.getAttribLocation(pr, 'n') };
  var U = {}; ['mvp', 'm', 'col', 'glow', 'eye', 'rimc'].forEach(function (k) { U[k] = gl.getUniformLocation(pr, k); });

  var parts = [], radius = 150, center = [0, 0, 0];
  var hex = function (h) { h = h.replace('#', ''); return [parseInt(h.substr(0, 2), 16) / 255, parseInt(h.substr(2, 2), 16) / 255, parseInt(h.substr(4, 2), 16) / 255]; };
  var colours = { Domain: hex('#2cfffb'), Engine: hex('#96eb29') }, domains = null;

  function load(buf) {
    var dv = new DataView(buf), jl = dv.getUint32(12, true);
    var J = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jl)));
    var bin = 20 + jl + 8;
    function acc(i, T) {
      var a = J.accessors[i], bv = J.bufferViews[a.bufferView], n = { VEC3: 3, SCALAR: 1 }[a.type];
      return new T(buf, bin + (bv.byteOffset || 0) + (a.byteOffset || 0), a.count * n);
    }
    var lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    J.meshes[0].primitives.forEach(function (pm) {
      var a = J.accessors[pm.attributes.POSITION];
      for (var k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], a.min[k]); hi[k] = Math.max(hi[k], a.max[k]); }
      var ia = J.accessors[pm.indices], it = ia.componentType === 5125 ? Uint32Array : Uint16Array;
      if (it === Uint32Array && !u32) return;
      var mat = J.materials[pm.material] || { name: 'Body' }, base = (mat.pbrMetallicRoughness || {}).baseColorFactor || [.2, .2, .22];
      var pb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, pb); gl.bufferData(gl.ARRAY_BUFFER, acc(pm.attributes.POSITION, Float32Array), gl.STATIC_DRAW);
      var nb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, nb); gl.bufferData(gl.ARRAY_BUFFER, acc(pm.attributes.NORMAL, Float32Array), gl.STATIC_DRAW);
      var ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, acc(pm.indices, it), gl.STATIC_DRAW);
      parts.push({ name: mat.name, base: base.slice(0, 3), pb: pb, nb: nb, ib: ib, count: ia.count, type: it === Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT });
    });
    center = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    radius = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2;
    box.classList.add('ready');
    frame();
  }

  /* ---------- camera and input ---------- */
  var yaw = 0.7, pitch = 0.42, dist = 2.1, idle = 0, last = 0, held = false;
  var calm = function () { return document.documentElement.classList.contains('mo-off') || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches && !document.documentElement.classList.contains('mo-full')); };
  function mul(a, b) { var o = new Float32Array(16); for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) { var s = 0; for (var k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; }
  function persp(f, asp, n, fr) { var t = 1 / Math.tan(f / 2); return new Float32Array([t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (fr + n) / (n - fr), -1, 0, 0, 2 * fr * n / (n - fr), 0]); }
  function look(e, c) {
    var z = norm([e[0] - c[0], e[1] - c[1], e[2] - c[2]]), x = norm(cross([0, 1, 0], z)), y = cross(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]);
  }
  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  var visible = true, raf = 0;
  function frame(t) {
    raf = 0;
    t = t || 0;
    var dt = last ? Math.min(0.05, (t - last) / 1000) : 0; last = t;
    if (!held) { idle += dt; if (idle > 1.2 && !calm()) yaw += dt * 0.25; }
    var w = cv.clientWidth, h = cv.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    gl.viewport(0, 0, cv.width, cv.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST);
    var r = radius * dist;
    var eye = [center[0] + r * Math.cos(pitch) * Math.sin(yaw), center[1] + r * Math.sin(pitch), center[2] + r * Math.cos(pitch) * Math.cos(yaw)];
    var M = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    var mvp = mul(persp(0.62, w / Math.max(1, h), radius * 0.05, radius * 10), look(eye, center));
    gl.uniformMatrix4fv(U.mvp, false, mvp); gl.uniformMatrix4fv(U.m, false, M); gl.uniform3fv(U.eye, eye);
    gl.uniform3fv(U.rimc, colours.Domain.map(function (c) { return c * 0.6; }));
    parts.forEach(function (p) {
      var c = colours[p.name] || p.base, g = p.name === 'Domain' ? 0.75 : p.name === 'Engine' ? 0.7 : p.name === 'Window' ? 0.45 : 0;
      if (p.name === 'Body') c = [0.16, 0.16, 0.2];
      gl.uniform3fv(U.col, c); gl.uniform1f(U.glow, g);
      gl.bindBuffer(gl.ARRAY_BUFFER, p.pb); gl.enableVertexAttribArray(A.p); gl.vertexAttribPointer(A.p, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, p.nb); gl.enableVertexAttribArray(A.n); gl.vertexAttribPointer(A.n, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, p.ib); gl.drawElements(gl.TRIANGLES, p.count, p.type, 0);
    });
    if (visible && (!calm() || held)) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && parts.length) raf = requestAnimationFrame(frame); }

  var pts = new Map(), pd = 0;
  cv.addEventListener('pointerdown', function (e) { if (cv.setPointerCapture) cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); held = true; idle = 0; box.classList.add('drag'); kick(); });
  cv.addEventListener('pointermove', function (e) {
    if (!pts.has(e.pointerId)) return;
    var q = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size >= 2) {
      var v = Array.from(pts.values()), d = Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]);
      if (pd) dist = Math.max(1.2, Math.min(5, dist * pd / d)); pd = d; kick(); return;
    }
    yaw -= (e.clientX - q[0]) * 0.008; pitch = Math.max(-1.2, Math.min(1.3, pitch + (e.clientY - q[1]) * 0.006)); kick();
  });
  function up(e) { pts.delete(e.pointerId); pd = 0; if (!pts.size) { held = false; idle = 0; box.classList.remove('drag'); kick(); } }
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', function (e) { e.preventDefault(); dist = Math.max(1.2, Math.min(5, dist * Math.exp(e.deltaY * 0.0012))); idle = 0; kick(); }, { passive: false });
  cv.addEventListener('keydown', function (e) {
    var k = e.key;
    if (k === 'ArrowLeft') yaw += 0.15; else if (k === 'ArrowRight') yaw -= 0.15; else if (k === 'ArrowUp') pitch = Math.min(1.3, pitch + 0.1);
    else if (k === 'ArrowDown') pitch = Math.max(-1.2, pitch - 0.1); else if (k === '+' || k === '=') dist = Math.max(1.2, dist / 1.15);
    else if (k === '-') dist = Math.min(5, dist * 1.15); else return;
    e.preventDefault(); idle = 0; kick();
  });
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) { last = 0; kick(); } }).observe(cv);
  new MutationObserver(kick).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  /* the domain the seams wear */
  function domain(k) {
    if (!domains || !domains[k]) return;
    colours.Domain = hex(domains[k].signal);
    Array.prototype.forEach.call(box.querySelectorAll('[data-adom]'), function (b) { b.setAttribute('aria-checked', String(b.dataset.adom === k)); });
    kick();
  }
  box.addEventListener('click', function (e) { var b = e.target.closest('[data-adom]'); if (b) domain(b.dataset.adom); });
  fetch('/fleet-codex/fleet.json').then(function (r) { return r.json(); }).then(function (d) {
    domains = d.palette.domains; colours.Engine = hex(d.palette.omni);
    var pick = box.querySelector('.doms');
    if (pick) pick.innerHTML = Object.keys(domains).map(function (k) {
      return '<button type="button" role="radio" data-adom="' + k + '" aria-checked="false" style="--sw:' + domains[k].signal + '"><i></i><span>' + k + '</span></button>';
    }).join('');
    domain(d.palette.default);
  }).catch(function () { /* keeps the Jade default */ });

  var src = box.getAttribute('data-src');
  var go = function () { fetch(src).then(function (r) { return r.arrayBuffer(); }).then(load).catch(function () { box.classList.add('no3d'); }); };
  if ('IntersectionObserver' in window) {
    var lio = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { lio.disconnect(); go(); } }, { rootMargin: '400px' });
    lio.observe(box);
  } else go();
})();
