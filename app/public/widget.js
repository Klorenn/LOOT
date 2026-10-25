/**
 * ChestZK embed — redirige al cofre.
 * Uso: <script src="…/widget.js" data-chest="2"></script>
 */
(function () {
  var s = document.currentScript;
  if (!s) return;
  var id = s.getAttribute("data-chest");
  if (!id) return;
  var base = s.src.replace(/\/widget\.js(\?.*)?$/, "");
  var a = document.createElement("a");
  a.href = base + "/chest/" + id;
  a.textContent = "Abrir cofre #" + id + " · ChestZK";
  a.rel = "noopener";
  a.style.cssText =
    "display:inline-flex;align-items:center;gap:.5rem;padding:.75rem 1.25rem;" +
    "border-radius:9999px;background:#0a0a0a;color:#f5f5f5;font:600 14px/1 system-ui,sans-serif;" +
    "text-decoration:none";
  s.parentNode.insertBefore(a, s.nextSibling);
})();
