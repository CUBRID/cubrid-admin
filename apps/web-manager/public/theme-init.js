// Sets the light or dark theme before the page draws, so it does not flash.
// Loaded by index.html as a file (no inline script under the CSP).
(function() {
  try {
    var theme = localStorage.getItem('theme');
    var supportDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches === true;
    if (!theme && supportDarkMode) theme = 'dark';
    if (!theme) theme = 'light';
    document.documentElement.className = theme;
  } catch (_e) {
    // No storage or media query: the page keeps its default theme.
  }
})();
