/* THE VOLUMES PILL, ON EVERY PAGE. Moves between the brand and the Researching group by width, pulses when there is something new,
   and (on every page but the home page, which prints the whole inventory itself) fills its popover from /inventory.json the first time it is
   opened. Loaded by the Base layout. */
(function () {
  var pill = document.getElementById("ra-inv"), mq = window.matchMedia && window.matchMedia("(min-width: 1181px)");
  if (!pill || !mq) return;
  var home = pill.parentNode, next = pill.nextSibling;
  function place() {
    var live = document.querySelector("nav .ra-live-grp");
    if (mq.matches && live) { live.parentNode.insertBefore(pill, live); pill.classList.add("in-nav"); }
    else { home.insertBefore(pill, next); pill.classList.remove("in-nav"); }
  }
  place(); if (mq.addEventListener) mq.addEventListener("change", place);
  /* IT PULSES WHEN THERE IS SOMETHING NEW. Two things count: a What's new line this browser has not looked at (the same test as the
     About dot: newer than ra-news-seen, written in the last fortnight), and a larger volume count than the last time the inventory was
     opened here (ra-vols-seen). Opening the inventory takes the volume pulse off; visiting What's new takes the other off. Both are
     per-browser conveniences, so blocked storage just means no pulse. */
  var vols = Number(pill.getAttribute("data-volumes")) || 0, sum = pill.querySelector("summary"), note = pill.querySelector(".ra-inv-new");
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { /* storage blocked */ } }
  var nav = document.querySelector("nav.topnav"), latest = (nav && nav.getAttribute("data-latest")) || "", seen = get("ra-news-seen") || "";
  var stamp = Date.parse(latest + "T23:59:59"), news = !!stamp && latest > seen && Date.now() - stamp < 14 * 864e5 && !/\/whats-new\/?$/.test(location.pathname);
  var before = Number(get("ra-vols-seen")), grew = before > 0 && vols > before ? vols - before : 0;
  if (!before) put("ra-vols-seen", vols);
  var why = [];
  if (grew) why.push("the Atlas has " + grew.toLocaleString() + " more volumes than when you last looked");
  if (news) why.push("there is something new in What's new");
  if (why.length) {
    pill.classList.add("fresh");
    if (sum) sum.title = (vols / 1e6).toFixed(2) + "M volumes. New: " + why.join("; ") + ".";
    if (note) { note.textContent = " \u00b7 new: " + why.join("; "); note.hidden = false; }
  }
  pill.addEventListener("toggle", function () { if (pill.open && vols) { put("ra-vols-seen", vols); if (!news) pill.classList.remove("fresh"); } });
})();

/* LAZY FILL: the pill ships with only its count; the rows and the latest What's new lines arrive when it is first opened. */
(function () {
  var pill = document.getElementById("ra-inv"), url = pill && pill.getAttribute("data-lazy");
  if (!pill || !url) return;
  var done = false;
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function fill(d) {
    var grid = pill.querySelector(".ra-inv-grid"); if (!grid) return;
    var top = el("div", "ra-inv-top");
    var count = grid.querySelector(".ra-inv-count"); if (count) top.appendChild(count);
    var all = el("a", "ra-inv-all", "What\u2019s new: all updates \u2192"); all.href = d.allNews; top.appendChild(all);
    var ul = el("ul", "ra-inv-news"); ul.setAttribute("aria-label", "The latest updates");
    (d.news || []).forEach(function (e) {
      var li = el("li"), a = el("a"); a.href = e.href; a.title = e.headline;
      a.appendChild(el("span", "ra-inv-kind " + e.kind, e.label)); a.appendChild(el("span", "ra-inv-line", e.headline));
      var t = el("time", null, e.day); t.setAttribute("datetime", e.date); a.appendChild(t); li.appendChild(a); ul.appendChild(li);
    });
    top.appendChild(ul);
    grid.textContent = ""; grid.appendChild(top);
    (d.rows || []).forEach(function (r) {
      grid.appendChild(el("p", "ra-inv-h", r[0]));
      var row = el("ul", "ra-inv-row");
      r[1].forEach(function (c) {
        var li = el("li"), a = el("a"); a.href = c[2];
        a.appendChild(el("b", null, Number(c[0]).toLocaleString())); a.appendChild(document.createTextNode(" ")); a.appendChild(el("span", null, c[1]));
        a.appendChild(el("small", null, c[3])); a.appendChild(el("em", "eg", "e.g. " + c[4]));
        li.appendChild(a); row.appendChild(li);
      });
      grid.appendChild(row);
    });
  }
  pill.addEventListener("toggle", function () {
    if (!pill.open || done) return; done = true;
    fetch(url).then(function (r) { return r.json(); }).then(fill).catch(function () { done = false; });
  });
})();
