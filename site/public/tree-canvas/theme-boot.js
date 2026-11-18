/* Runs before the page paints: puts the saved Look on <html data-theme> so the page around the canvas is not the device's colour for a moment before the page's own script
   wears it (app.js wearLook). The same rule as shellScheme() in settings.js, written for a classic script (no import); test/tree-canvas-theme.test.js checks the two agree.
   Storage may be blocked: then nothing is set and the device decides. */
(function () {
  try {
    var LOOKS = ['sticker', 'paper', 'ground', 'lanes', 'countries', 'names'], look = null, rec = null;
    try { rec = JSON.parse(localStorage.getItem('ra-settings-v1') || 'null'); } catch (e) { rec = null; }
    if (rec && rec.v === 1 && typeof rec.look === 'string') look = rec.look;
    if (!look) look = localStorage.getItem('loamTheme');
    if (LOOKS.indexOf(look) >= 0) document.documentElement.setAttribute('data-theme', look === 'ground' ? 'dark' : 'light');
  } catch (e) { /* storage blocked: the device decides */ }
})();
