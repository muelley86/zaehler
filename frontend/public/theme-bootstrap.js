// Theme-Bootstrap vor React-Mount, um FOUC zu vermeiden.
// Folgt System-Setting; ein expliziter User-Toggle kann 'theme' im
// localStorage auf 'light' / 'dark' setzen, dann gewinnt das.
//
// Externalisiert (statt inline im HTML), damit die CSP ohne
// `script-src 'unsafe-inline'` auskommt.
(function () {
  var stored = null;
  try {
    stored = window.localStorage.getItem('theme');
  } catch (e) {
    /* private mode */
  }
  var isDark =
    stored === 'dark' ||
    (stored !== 'light' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.add(isDark ? 'dark' : 'light');
})();
