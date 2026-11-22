// Applies the visitor's saved theme and motion before the page draws (js/hypersea.js changes them).
(function () {
  var r = document.documentElement, t = 'photic', m = '';
  try { t = localStorage.getItem('fg_theme') || t; m = localStorage.getItem('fg_motion') || ''; } catch (e) {}
  if (!/^[a-z]+$/.test(t)) t = 'photic';
  r.classList.add('th-' + t);
  if (m === 'full' || m === 'calm' || m === 'off') r.classList.add('mo-' + m);
})();
