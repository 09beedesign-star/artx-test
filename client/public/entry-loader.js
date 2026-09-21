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

  loadEntry();
})();
