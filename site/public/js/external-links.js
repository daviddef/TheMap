/* Links that leave this site open in a new tab (the same rule the family archives use: TheArchiveKit kit/lib/externallinks.js).
 * Every <a href> to another host gets target="_blank" rel="noopener", on load and again at click time (so a link drawn later is covered).
 * Links to this site, a link that already has a target, a download, and mailto:/tel:/javascript: links are never touched.
 * No request, nothing kept. */
(function () {
  function opensElsewhere(href, here, target, download) {
    if (!href || download) return false;
    if (target && target !== "_self") return false;
    var u, h;
    try { u = new URL(href, here); h = new URL(here); } catch (e) { return false; }
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return u.host !== h.host;
  }
  function mark(a) {
    if (!opensElsewhere(a.href, location.href, a.getAttribute("target"), a.hasAttribute("download"))) return;
    a.setAttribute("target", "_blank");
    var r = (a.getAttribute("rel") || "").split(/\s+/).filter(Boolean);
    if (r.indexOf("noopener") < 0) r.push("noopener");
    a.setAttribute("rel", r.join(" "));
  }
  [].forEach.call(document.querySelectorAll("a[href]"), mark);
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (a) mark(a);
  }, true);
})();
