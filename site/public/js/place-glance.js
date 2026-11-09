/* The flag strip on a place page ("At a glance"). Either the era table of this very ground (data-own, written into the page) or, when the
   atlas has none, the flags of the country (country-flags.json, fetched once and cached). Nothing is claimed for the ground in the second case. */
(function () {
  var box = document.querySelector(".pg-flags");
  if (!box) return;
  var base = box.getAttribute("data-base") || "/", MAX = 8;
  function draw(rows, own, name, href) {
    if (!rows.length) return;
    var shown = rows.slice(0, MAX), more = rows.length - shown.length;
    var h = document.createElement("h3"); h.textContent = own ? "Flags that flew over this ground" : "Flags of " + name + " through time"; box.append(h);
    var ol = document.createElement("ol");
    shown.forEach(function (r) {
      var li = document.createElement("li"), im = document.createElement("img"), sp = document.createElement("span"), b = document.createElement("b"), sm = document.createElement("small");
      im.src = base + "fl/" + r[0] + ".svg"; im.width = 44; im.height = 29; im.alt = ""; im.loading = "lazy"; im.title = r[1];
      b.textContent = r[1]; sm.textContent = r[2]; sp.append(b, sm); li.append(im, sp); ol.append(li);
    });
    box.append(ol);
    var p = document.createElement("p"); p.className = "pg-more";
    if (href) { var a = document.createElement("a"); a.href = href; a.textContent = (more > 0 ? "and " + more + " more eras: " : "") + "all the flags of " + name + " →"; p.append(a); }
    if (!own) { var f = document.createElement("span"); f.className = "pg-fine"; f.textContent = " The atlas has not yet mapped who ruled this exact place by date, so these are the country’s flags, not a claim about this ground."; p.append(f); }
    box.append(p);
  }
  var name = box.getAttribute("data-name") || "", href = box.getAttribute("data-flags") || "", own = box.getAttribute("data-own");
  if (own) { try { draw(JSON.parse(own), true, name, href); } catch (e) { /* no strip */ } return; }
  var slug = box.getAttribute("data-slug"); if (!slug) return;
  fetch(base + "country-flags.json").then(function (r) { return r.json(); }).then(function (d) {
    draw((d[slug] || []).map(function (r) { return [slug + "--" + r[0], r[1], r[2]]; }), false, name, href);
  }).catch(function () { /* the links above still work */ });
})();
