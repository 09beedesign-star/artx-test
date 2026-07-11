(function () {
  var currentScript = document.currentScript;
  var entrySrc = currentScript && currentScript.getAttribute("data-entry");
  if (!entrySrc) return;

  var script = document.createElement("script");
  script.type = "module";
  script.async = true;
  script.crossOrigin = "anonymous";
  script.src = entrySrc;
  document.head.appendChild(script);
})();
