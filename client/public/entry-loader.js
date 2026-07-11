(function () {
  var currentScript = document.currentScript;
  var entrySrc = currentScript && currentScript.getAttribute("data-entry");
  if (!entrySrc) return;

  function loadEntry() {
    if (window.__ARTX_ENTRY_IMPORT_STARTED__) return;
    window.__ARTX_ENTRY_IMPORT_STARTED__ = true;
    import(entrySrc).catch(function (error) {
      console.error("[ArtX] Failed to load entry module", error);
    });
  }

  var stylesheets = Array.prototype.slice.call(document.querySelectorAll('link[rel="stylesheet"]'));
  var pending = stylesheets.length;
  if (!pending) {
    loadEntry();
    return;
  }

  var fallback = window.setTimeout(loadEntry, 45000);
  stylesheets.forEach(function (link) {
    if (link.sheet) {
      pending -= 1;
      if (pending === 0) {
        window.clearTimeout(fallback);
        loadEntry();
      }
      return;
    }
    link.addEventListener("load", function () {
      pending -= 1;
      if (pending === 0) {
        window.clearTimeout(fallback);
        loadEntry();
      }
    }, { once: true });
    link.addEventListener("error", function () {
      pending -= 1;
      if (pending === 0) {
        window.clearTimeout(fallback);
        loadEntry();
      }
    }, { once: true });
  });
})();
