/* THE STORY, AS A PLAN YOU CAN ACT ON. David (25 Nov 2026): «Dreznik near Nova Gradiska: where would she start as a desktop activity, who could she email, what are
   the neighbouring towns, which cemeteries… are we really narrating an actionable story, or just reading?» The numbered method on the story page (story-engine.js `plan`)
   says HOW to research. This says WHERE and WHO, for THIS story: the registers to open first with what each costs, the archives to write to with the address the Atlas holds
   (and a draft in their language), the places next door, the cemeteries on the ground, what the place went through while the people were alive, and what each move left behind.

   WHAT IT WILL NOT DO. Everything here is computed on the device from files the Atlas already holds; nothing is sent anywhere. A line appears only when a file says it: an
   address only if Wikidata states one (data/provider-contacts.json), a cemetery only if OpenStreetMap or Wikidata lists one within reach, an event only if the place lies inside
   its mapped area in the years the story's people were alive. Where the Atlas holds nothing it SAYS SO (a "gap" line), because a silence we left unmarked reads as a silence
   in the record. Every item carries a one-line "why this one".

   THE ANCHOR. «They lived in X near Y»: the story reader takes the X nearest Y (story-engine.js nearResolve), and the plan starts there and says how sure that is. Only when
   the X shown is still more than 40 km from Y does the plan start from Y instead, and say so, rather than build a plan on the wrong village.

   THE REGION. A place can sit inside several rough region rings (Nova Gradiška is inside both Bosnia's and the Military Frontier's). The ring that names ANOTHER country is passed
   over when one that fits exists, because its era table would file a Slavonian family under the Bosnian state archive.

   Pure helpers, exported for the tests (module.exports); the page draws the result with textContent only. */
(function (root) {
  "use strict";
  var ACC = { free: 0, account: 1, index: 2, mixed: 3, paid: 4, catalogue: 5, onsite: 6, unsurveyed: 7 };
  var ACC_SAY = { free: "images you can read now, free", account: "images, free, once you have an account", index: "an index: it shows a record exists, not the page", mixed: "partly free, partly paid",
    paid: "behind a paywall", catalogue: "a catalogue card: you write for the paper", onsite: "on paper, in the building", unsurveyed: "what it costs has not been checked" };
  var TRAP = /filed under|trap|another|not (in|the)|elsewhere|nothing |no (parish |civil )?regist|destroyed|lost|never |instead of|rather than|registry|matični|gathered/i;
  var VICTIMS = /zrtv|žrtv|genocid|yadvashem|arolsen|jewishgen|shoah|victim/i;
  var BIRTHISH = /^(born|origin|lived|father-from|mother-from|family)$/;

  function hav(a, b, c, d) { var r = Math.PI / 180, dl = (c - a) * r, dn = (d - b) * r, x = Math.sin(dl / 2) * Math.sin(dl / 2) + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dn / 2) * Math.sin(dn / 2); return 12742 * Math.asin(Math.sqrt(x)); }
  function clip(s, n) { s = String(s == null ? "" : s).replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  function has(v) { return v != null && v !== ""; }
  function inRing(pt, ring) { var c = false; for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) { var yi = ring[i][0], xi = ring[i][1], yj = ring[j][0], xj = ring[j][1]; if ((yi > pt[0]) !== (yj > pt[0]) && pt[1] < (xj - xi) * (pt[0] - yi) / (yj - yi) + xi) c = !c; } return c; }

  /* ---- burial grounds: only the one-degree squares around a place --------------------------------------------------------------------------------
     scripts/build-cemetery-cells.py cuts every ground the Atlas holds into public/cem/{osm|wd}/{lat}_{lon}.json (rows [lat, lon, name|null, id]) and lists the squares in
     cem/index.json. A square the index does not list holds nothing; a listed square that does not arrive is MISSING, and the plan then never says «there is none». */
  var CEM_KM = 15, CEM_NAMED = 10;
  function cellsFor(lat, lon, index) {
    var dLat = CEM_KM / 110.5, dLon = CEM_KM / (111.2 * Math.max(0.01, Math.cos(Math.min(89.9, Math.abs(lat) + dLat) * Math.PI / 180))), out = [];
    Object.keys((index && index.sources) || {}).forEach(function (src) {
      var s = index.sources[src], seen = Object.create(null);
      for (var y = Math.floor(lat - dLat); y <= Math.floor(lat + dLat); y++) for (var x = Math.floor(lon - dLon); x <= Math.floor(lon + dLon); x++) {
        var key = y + "_" + (((x + 180) % 360 + 360) % 360 - 180);   /* across the date line */
        if (seen[key] || !(s.cells || {})[key]) continue;
        seen[key] = 1;
        for (var i = 0, n = (s.parts || {})[key] || 1; i < n; i++) out.push({ src: src, path: "cem/" + src + "/" + key + (i ? "-" + i : "") + ".json" });
      }
    });
    return out;
  }
  /* `get(path)` resolves to the parsed file, or null when it did not arrive. */
  function cemeteriesFrom(index, files, docs) {
    var o = { osm: [], wd: [], missing: 0, regions: (((index.sources || {}).osm) || {}).regions || 0 };
    files.forEach(function (f, i) {
      var d = docs[i];
      if (!d || !d.rows) { o.missing++; return; }
      d.rows.forEach(function (r) { var c = { y: r[0], x: r[1], n: r[2] || "" }; c[f.src === "wd" ? "q" : "id"] = r[3]; (o[f.src] || (o[f.src] = [])).push(c); });
    });
    return o;
  }
  function loadCemeteries(lat, lon, get) {
    return Promise.resolve(get("cem/index.json")).then(function (index) {
      if (!index || !index.sources) return { failed: true };
      var files = cellsFor(lat, lon, index);
      return Promise.all(files.map(function (f) { return get(f.path); })).then(function (docs) { return cemeteriesFrom(index, files, docs); });
    });
  }

  /* ---- the years the story's people were alive ----------------------------------------------------------------------------------------------- */
  function yearsOf(g) {
    var f = (g && g.facts) || {}, ys = [];
    function add(y) { if (typeof y === "number" && y > 1000 && y < 2100) ys.push(y); }
    add(f.born); add(f.endYear);
    (f.route || []).forEach(function (r) { add(r.year); });
    (f.kin || []).forEach(function (k) { (k.stops || []).forEach(function (s) { add(s.year); }); });
    ((g && g.people) || []).forEach(function (p) { (p.events || []).forEach(function (e) { add(e.year); }); add(p.born); });
    if (!ys.length) return null;
    var lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
    if (hi - lo < 1 && typeof f.born === "number") hi = lo + 75;
    return { lo: lo, hi: hi, from: lo - 30 };   /* a generation before the earliest year: the parents' marriage, the grandparents' births */
  }

  /* ---- which place the plan starts from ------------------------------------------------------------------------------------------------------ */
  function anchorOf(g) {
    var f = (g && g.facts) || {}, route = (f.route || []).filter(function (x) { return x && x.info; }), home = null;
    for (var i = 0; i < route.length; i++) if (BIRTHISH.test(route[i].role || "")) { home = route[i]; break; }
    if (!home) home = route[0] || null;
    if (!home) { (f.kin || []).forEach(function (k) { if (!home) (k.stops || []).forEach(function (s) { if (!home && s.info && BIRTHISH.test(s.role || "")) home = s; }); }); }
    if (!home) { (f.kin || []).forEach(function (k) { if (!home) (k.stops || []).forEach(function (s) { if (!home && s.info) home = s; }); }); }
    if (!home) return null;
    var info = home.info, note = null, told = null, village = null;
    /* the engine's own record of an «X near Y» choice, when it made one (several places of the name, or none close) */
    var nd = (f.near || []).filter(function (n) { return info.row && n.pick === info.row.i; })[0], by = home.nearInfo || (nd && nd.anchor);
    if (by && by.lat != null && info.lat != null) {
      var d = hav(info.lat, info.lon, by.lat, by.lon), km = Math.max(1, Math.round(d)) + " km";
      var unsure = nd && nd.level !== "clear" ? " Not certain which " + bare(info.name) + " is meant: check the others on its place card before you write to anyone." : "";
      if (nd && nd.byReader) note = "You chose " + info.name + ", " + km + " from " + by.name + ", so the plan starts there.";
      else if (d > 40) { told = info; info = by; note = "The story puts " + told.name + " near " + info.name + ", but the " + told.name + " shown is " + km + " away, so the plan starts from " + info.name + ". Check the parish before you trust either."; }
      /* a village the Atlas places beside the town but holds no books for: the desk work starts from the town, the burial grounds from the village */
      else if (!(info.cols || []).length && (by.cols || []).length) { village = info; info = by; note = bare(village.name) + " is " + km + " from " + info.name + ". The Atlas lists no books for " + bare(village.name) + " itself, so the plan starts from " + info.name + ": ask which parish and which registry office served " + bare(village.name) + "." + unsure; }
      else if (nd) note = nd.level === "clear" ? "The plan starts from the " + bare(info.name) + " that is " + km + " from " + by.name + ", because the story says near. The others are set aside on its place card."
        : "The plan starts from the " + bare(info.name) + " " + km + " from " + by.name + "." + unsure;
    }
    /* the namesakes are of the place first told: once «near» has settled it, or the plan starts elsewhere, they say nothing about the starting place */
    return { info: info, stop: home, note: note, told: told, village: village, alts: told || village || home.nearInfo || nd ? [] : (home.alts || []).filter(function (a) { return a && a.n; }) };
  }

  /* «Drežnik (Nova Gradiška)» without the shelf's bracket, for a sentence that already names the town */
  function bare(n) { return String(n || "").replace(/\s*\([^)]*\)\s*$/, ""); }

  function pickRegion(info, regionsDoc, countries) {
    var cur = info && info.region || null;
    if (!info || info.lat == null || !regionsDoc || !regionsDoc.regions) return cur;
    var cn = String((countries || {})[info.cc] || info.countryName || "").toLowerCase(), others = Object.keys(countries || {}).filter(function (k) { return k !== info.cc; })
      .map(function (k) { return String(countries[k]).toLowerCase().replace(/\./g, ""); }).filter(function (n) { return n.length > 3 && n !== cn; });
    function score(r) { var l = (r.label + " " + (r.sub || "")).toLowerCase(); return cn && l.indexOf(cn) > -1 ? 2 : others.some(function (o) { return l.indexOf(o) > -1; }) ? -3 : 0; }
    var cands = regionsDoc.regions.filter(function (r) { return r.ring && inRing([info.lat, info.lon], r.ring); });
    if (cur && cands.every(function (r) { return r.id !== cur.id; })) cands.push(regionsDoc.regions.filter(function (r) { return r.id === cur.id; })[0] || cur);
    if (!cands.length) return cur;
    var best = cands.slice().sort(function (a, b) { return score(b) - score(a) || (cur && b.id === cur.id ? 1 : 0) - (cur && a.id === cur.id ? 1 : 0); })[0];
    return cur && score(cur) >= score(best) ? cur : best;
  }

  /* ---- who held the paper, in the year ------------------------------------------------------------------------------------------------------- */
  function erasFor(region, win) {
    if (!region || !region.eras) return [];
    return region.eras.filter(function (e) { return win ? (e.to > win.from && e.from <= win.hi) : false; });
  }

  var LANG = { HR: "hr", BA: "hr", SI: "sl", IT: "it", AT: "de", DE: "de", CH: "de", ES: "es", AR: "es", UY: "es", CL: "es", MX: "es", PL: "pl", CZ: "cs", HU: "hu", FR: "fr", PT: "pt", BR: "pt" };
  var LNAME = { en: "English", hr: "Croatian", sl: "Slovenian", it: "Italian", de: "German", es: "Spanish", pl: "Polish", cs: "Czech", hu: "Hungarian", fr: "French", pt: "Portuguese" };
  /* One plain request, in the archive's language: what the writer is looking for, the place and the years, and the two questions an archive can answer in a line. */
  var DRAFT = {
    en: function (p, s, y) { return "Dear Sir or Madam, I am researching my family from " + p + ". I am looking for records of the " + (s || "family") + " family" + (y ? " around " + y : "") + ". Could you tell me whether you hold the parish or civil registers for " + p + " for those years, and how I can consult them or ask for a search? Thank you."; },
    hr: function (p, s, y) { return "Poštovani, istražujem svoju obitelj iz mjesta " + p + ". Tražim zapise o obitelji " + (s || "") + (y ? " oko " + y + ". godine" : "") + ". Možete li mi reći čuvate li matične knjige za " + p + " za te godine i kako ih mogu pregledati ili zatražiti pretragu? Hvala unaprijed."; },
    sl: function (p, s, y) { return "Spoštovani, raziskujem svojo družino iz kraja " + p + ". Iščem zapise o družini " + (s || "") + (y ? " okoli leta " + y : "") + ". Ali hranite matične knjige za " + p + " za ta leta in kako jih lahko pregledam ali naročim iskanje? Hvala."; },
    it: function (p, s, y) { return "Gentili Signori, sto ricostruendo la storia della mia famiglia di " + p + ". Cerco atti della famiglia " + (s || "") + (y ? " intorno al " + y : "") + ". Potete dirmi se conservate i registri parrocchiali o di stato civile di " + p + " per quegli anni e come posso consultarli o richiedere una ricerca? Grazie."; },
    de: function (p, s, y) { return "Sehr geehrte Damen und Herren, ich erforsche meine Familie aus " + p + ". Ich suche Einträge zur Familie " + (s || "") + (y ? " um das Jahr " + y : "") + ". Können Sie mir mitteilen, ob Sie die Kirchenbücher oder Standesregister für " + p + " aus diesen Jahren verwahren und wie ich sie einsehen oder eine Recherche beauftragen kann? Vielen Dank."; },
    es: function (p, s, y) { return "Estimados señores: estoy investigando a mi familia de " + p + ". Busco registros de la familia " + (s || "") + (y ? " hacia el año " + y : "") + ". ¿Podrían decirme si conservan los registros parroquiales o civiles de " + p + " de esos años y cómo puedo consultarlos o solicitar una búsqueda? Muchas gracias."; },
    pl: function (p, s, y) { return "Szanowni Państwo, badam historię mojej rodziny z miejscowości " + p + ". Szukam zapisów dotyczących rodziny " + (s || "") + (y ? " około roku " + y : "") + ". Czy przechowują Państwo księgi metrykalne dla " + p + " z tych lat i jak mogę je przejrzeć lub zlecić kwerendę? Dziękuję."; },
    cs: function (p, s, y) { return "Vážení, zkoumám historii své rodiny z obce " + p + ". Hledám zápisy o rodině " + (s || "") + (y ? " kolem roku " + y : "") + ". Uchováváte matriky obce " + p + " z těchto let a jak do nich mohu nahlédnout nebo požádat o rešerši? Děkuji."; },
    hu: function (p, s, y) { return "Tisztelt Hölgyem/Uram! A családom történetét kutatom, " + p + " településről. A " + (s || "") + " család bejegyzéseit keresem" + (y ? " " + y + " körül" : "") + ". Meg tudják mondani, őrzik-e " + p + " anyakönyveit ezekből az évekből, és hogyan tekinthetem meg őket, vagy kérhetek kutatást? Köszönöm."; },
    fr: function (p, s, y) { return "Madame, Monsieur, je recherche l'histoire de ma famille de " + p + ". Je cherche des actes de la famille " + (s || "") + (y ? " vers " + y : "") + ". Pourriez-vous m'indiquer si vous conservez les registres paroissiaux ou d'état civil de " + p + " pour ces années et comment les consulter ou demander une recherche ? Merci."; },
    pt: function (p, s, y) { return "Prezados senhores, estou pesquisando a história da minha família de " + p + ". Procuro registros da família " + (s || "") + (y ? " por volta de " + y : "") + ". Poderiam informar se guardam os registros paroquiais ou civis de " + p + " desses anos e como posso consultá-los ou solicitar uma busca? Obrigado(a)."; }
  };
  function draft(cc, place, surname, year) { var l = LANG[cc] || "en"; return { lang: l, language: LNAME[l], text: DRAFT[l](place, surname, year) }; }

  /* What each kind of move leaves on paper, by where it ends. General knowledge of the kinds of record, never a claim that one exists for this family. */
  var MOVE_RECORDS = {
    US: ["a ship or border arrival record", "naturalisation papers", "the US census (every ten years)"], CA: ["an arrival or border-crossing record", "naturalisation papers", "the Canadian census"],
    AU: ["an inward passenger list", "naturalisation papers (National Archives of Australia)"], NZ: ["an inward passenger list", "naturalisation papers"],
    AR: ["an arrival register at the port (Buenos Aires)", "the civil registry where they settled"], UY: ["an arrival register at the port", "the civil registry where they settled"],
    BR: ["an immigrant hostel or arrival register", "the civil registry where they settled"], CL: ["an arrival record", "the civil registry where they settled"],
    GB: ["an alien registration or naturalisation file", "the census"], IE: ["the census", "civil registration"], ZA: ["an arrival record", "the civil registry"]
  };
  var MOVE_DEFAULT = ["a marriage or birth record in the new place, which usually names birthplace and parents", "residence registration, where the country kept one"];

  /* the archive or index to open first for a country: a national archive before a catalogue before an index; never a memorial or a victims' database */
  var KINDRANK = { "national-archive": 0, catalogue: 1, index: 2, "regional-archive": 3 };
  function destSource(info) {
    return (info.provs || []).filter(function (p) { return p && p.url && KINDRANK[p.kind] != null && !VICTIMS.test(p.id + " " + p.name); })
      .sort(function (a, b) { return KINDRANK[a.kind] - KINDRANK[b.kind] || (ACC[a.access] != null ? ACC[a.access] : 8) - (ACC[b.access] != null ? ACC[b.access] : 8); })[0] || null;
  }

  /* the burial grounds within reach: the named ones nearest first, then one line for those with no name. `cem` is {osm, wd, missing, regions}, {pending} or {failed}. */
  function ground(cem, info, item) {
    var graves = "Graves are found through the parish and the municipality that runs the ground; volunteer indexes such as Find a Grave and BillionGraves may list names.", find = "https://www.findagrave.com/cemetery";
    if (!cem || cem.pending) return [item("Looking for burial grounds near " + info.name, "The cemetery lists for this part of the map are still loading.", { gap: true })];
    if (cem.failed || info.lat == null) return [item("The cemetery lists were not loaded", "So the plan cannot say what lies near " + info.name + ". Reload the page to try again.", { gap: true, detail: graves, href: find })];
    var all = (cem.osm || []).map(function (c) { return { n: c.n, y: c.y, x: c.x, src: "OpenStreetMap", href: "https://www.openstreetmap.org/" + (String(c.id).charAt(0) === "w" ? "way/" : String(c.id).charAt(0) === "r" ? "relation/" : "node/") + String(c.id).slice(1) }; })
      .concat((cem.wd || []).map(function (c) { return { n: c.n, y: c.y, x: c.x, src: "Wikidata", href: "https://www.wikidata.org/wiki/" + c.q }; }))
      .map(function (c) { c.km = hav(info.lat, info.lon, c.y, c.x); return c; }).filter(function (c) { return c.km <= CEM_KM; }).sort(function (a, b) { return a.km - b.km; });
    function far(km) { return km < 1 ? "less than 1 km" : Math.round(km) + " km"; }
    var named = [], bare = [];
    all.forEach(function (c) { if (c.n && !named.some(function (s) { return s.n.toLowerCase() === c.n.toLowerCase() && hav(s.y, s.x, c.y, c.x) < 1; })) named.push(c); });
    /* every unnamed ground the map holds is counted; only the other source's point on the same spot is the same ground */
    all.forEach(function (c) { if (!c.n && !all.some(function (o) { return o.src === "OpenStreetMap" && c.src !== o.src && hav(o.y, o.x, c.y, c.x) < 0.15; })) bare.push(c); });
    var gr = named.slice(0, CEM_NAMED).map(function (c) {
      return item(c.n, "A named burial ground " + far(c.km) + " from " + info.name + ", listed by " + c.src + ".", { href: c.href, tag: (c.km < 1 ? "<1" : Math.round(c.km)) + " km" });
    });
    var map = "https://www.openstreetmap.org/#map=12/" + info.lat.toFixed(4) + "/" + info.lon.toFixed(4);
    if (named.length > CEM_NAMED) gr.push(item((named.length - CEM_NAMED) + " more named burial grounds within " + CEM_KM + " km", "Only the " + CEM_NAMED + " nearest are listed here; the map shows the ground around " + info.name + ".", { href: map }));
    if (bare.length) gr.push(item(bare.length + (named.length ? " more" : "") + " burial ground" + (bare.length === 1 ? "" : "s") + " with no name on the map, nearest " + far(bare[0].km),
      "Within " + CEM_KM + " km of " + info.name + ". A small village ground is often mapped without a name; the link opens the nearest one.", { href: bare[0].href }));
    var covers = "The Atlas gathered burial grounds only inside " + (cem.regions ? cem.regions + " of its record regions" : "some of its record regions");
    if (cem.missing) gr.push(item("Some of the cemetery lists did not load", gr.length ? "This list may be short. Reload the page to try again." : "So the plan cannot say what lies near " + info.name + ". Reload the page to try again.", { gap: true, detail: graves, href: find }));
    else if (!gr.length) gr.push(item("The Atlas lists no burial ground within " + CEM_KM + " km of " + info.name, covers + ", from OpenStreetMap and Wikidata, so this is not proof there is none.", { gap: true, detail: graves, href: find }));
    if (all.length) gr.push(item("What these lists cannot tell you", covers + "; positions are unchecked, and nothing here says who is buried where.", { gap: true, detail: graves }));
    return gr;
  }

  /* How far an address is checked, said beside it. */
  var STATE_SAY = { answered: "has replied before", delivered: "a letter has reached it", listed: "published by the institution", unverified: "unconfirmed: check its own page first", wikidata: "from Wikidata: check it is current" };
  function contactLinks(a) {
    var l = [];
    if (/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(a.email || "")) l.push({ t: "Email", href: "mailto:" + a.email });
    if (/^https?:\/\//.test(a.form || "")) l.push({ t: "Contact form", href: a.form });
    var tel = String(a.tel || "").replace(/\(0\)/, "").replace(/[^\d+]/g, "");
    if (/^\+\d{7,}$/.test(tel)) l.push({ t: "Call", href: "tel:" + tel });
    return l;
  }
  function fold(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }

  /* ---- what to look for next, person by person ------------------------------------------------------------------------------------------------
     David: the page should draw complete recommendations by itself. For each person the story names: the record to look for, the years (estimated from what is told),
     the place, the book the Atlas lists for it or a plain «none», ordered by what is most likely to answer the question. Nothing about access or holdings is said
     beyond what is cited: Croatia's church registers (State Archives in Varaždin), the marriage note in a baptism register (decree Ne temere, 1907, IX), the later
     notes in Croatia's birth registers (State Registers Act, art. 9) and who may inspect them (art. 44, as amended). */
  var HR_ACT_NOW = "https://www.zakon.hr/z/603/zakon-o-drzavnim-maticama";   /* the consolidated text: art. 44 was amended in 2013 */
  var NE_TEMERE = "https://www.ewtn.com/catholicism/library/decree-on-betrothal-and-marriage-29493", HR_ACT = "https://narodne-novine.nn.hr/clanci/sluzbeni/1993_10_96_1878.html", HR_CHURCH = "https://dav.hr/gradanske-maticne-knjige/";
  var KIND_WORD = { b: "birth or baptism", m: "marriage", d: "death or burial" };
  var NO_LIVING = "Do not post the names or details of anyone who may be alive.";

  function spansPlain(c, kind) { return (c.kinds || []).indexOf(kind) > -1 && typeof c.from === "number" ? [[c.from, c.to || c.from]] : []; }
  function covering(info, kind, w, spansOf) {
    return ((info && info.cols) || []).filter(Boolean).map(function (c) {
      var lo = null, hi = null, over = 0;
      (spansOf || spansPlain)(c, kind).forEach(function (x) { var a = Math.max(w[0], x[0]), b = Math.min(w[1], x[1]); if (b >= a) { over += b - a + 1; lo = lo == null ? a : Math.min(lo, a); hi = hi == null ? b : Math.max(hi, b); } });
      return { c: c, over: over, lo: lo, hi: hi };
    }).filter(function (x) { return x.over > 0; }).sort(function (a, b) { return b.over - a.over || a.lo - b.lo; });
  }
  function yrs(w) { return w[0] === w[1] ? String(w[0]) : w[0] + "–" + w[1]; }
  /* The book for one kind and window at the place, else the plain «none», where its books stop, and the neighbouring places that have one. */
  function bookSay(info, kind, w, spansOf, neighbours) {
    var hit = covering(info, kind, w, spansOf);
    if (hit.length) {
      var h = hit[0];
      return { found: true, href: h.c.url || info.href, text: "The Atlas lists " + (h.c.title ? "the book “" + String(h.c.title).replace(/\s+/g, " ").trim() + "”" : "a register") + (h.lo > w[0] || h.hi < w[1] ? " (it has only " + yrs([h.lo, h.hi]) + " of those years)" : "") + (hit.length > 1 ? ", and " + (hit.length - 1) + " more" : "") + "." };
    }
    var all = covering(info, kind, [0, 2100], spansOf), last = all.length ? Math.max.apply(null, all.map(function (x) { return x.hi; })) : null, first = all.length ? Math.min.apply(null, all.map(function (x) { return x.lo; })) : null;
    var near = (neighbours || (info && info.neigh) || []).filter(function (n) { return covering(n.info, kind, w, spansOf).length; }).slice(0, 3).map(function (n) { return n.info.name + " (" + Math.max(1, Math.round(n.km)) + " km)"; });
    return { found: false, href: "", near: near, text: "The Atlas lists no " + KIND_WORD[kind] + " book of " + info.name + " for " + yrs(w) + (last != null && last < w[0] ? " (they stop in " + last + ")" : first != null && first > w[1] ? " (they begin in " + first + ")" : "") + ". " +
      (near.length ? "Neighbouring places with one for those years: " + near.join(", ") + ". A neighbour’s book is a lead, not proof the family used it." : "It lists none for the neighbouring places either.") };
  }

  function recommend(g, deps, an) {
    var f = (g && g.facts) || {}, people = (g && g.people) || [], info = an.info, spans = deps.spansOf, now = deps.year || new Date().getFullYear(), HR = info.cc === "HR";
    var one = function (role) { return people.filter(function (x) { return x.role === role; })[0]; };
    var self = one("self"), fa = one("father"), mo = one("mother"), parents = people.filter(function (x) { return x.role === "parent"; });
    if (!self) return { people: [], home: [], open: [] };
    var told = /\b(1[6-9]\d\d|20[0-2]\d)\b/.exec(self.bornText || "");
    var r0 = (f.route || [])[0], born = f.born || (r0 && r0.role === "born" && r0.year) || (told ? Number(told[1]) : null);
    var place = bare(an.village ? an.village.name : info.name), served = an.village ? "the parish that served " + place : "the parish of " + place;
    /* a village beside the town: its own neighbours first, then the town's, each once */
    var seenNear = {}, nearby = [].concat((an.village && an.village.neigh) || [], info.neigh || []).filter(function (n) {
      var name = n && n.info && n.info.name; if (!name || seenNear[name] || name === info.name) return false; seenNear[name] = 1; return true; });
    var sibs = (f.siblings || []).filter(function (x) { return /^(brother|sister)$/.test(x.rel || ""); });
    var ev = function (p, type) { return ((p && p.events) || []).filter(function (e) { return e.type === type; })[0]; };
    var named = function (p, fallback) { return (p && (p.maiden && p.given ? ((p.given.typed || p.given) + " " + p.maiden) : p.name)) || fallback; };
    var whose = self.me ? "your" : self.rel ? "your " + (self.parentSide ? (self.parentSide === "mother" ? "maternal " : "paternal ") : "") + String(self.rel).replace(/-/g, " ") : "the person in the story";
    var me = self.name || whose.replace(/^./, function (c) { return c.toUpperCase(); });
    function step(title, why, o) { o = o || {}; return { title: clip(title, 140), why: clip(why, 300), detail: o.detail ? clip(o.detail, 800) : "", href: o.href || "", links: o.links || [] }; }
    function record(title, kind, w, why, extra, links) {
      var b = bookSay(info, kind, w, spans, nearby), after = !b.found && HR && w[1] >= 1890 && w[0] < 1946 ? " In Croatia the church registers served as the official registers until May 1946, so ask which registry office or archive now holds the volume." : "";
      var l = (links || []).slice(); if (after) l.push({ t: "Source: State Archives in Varaždin", href: HR_CHURCH });
      return step(title + (w && !w.shown ? " · " + (w.est ? "about " : "") + yrs(w) : ""), why, { detail: b.text + after + (extra ? " " + extra : ""), href: b.href, links: l });
    }
    function est(a, b) { var w = [a, Math.min(b, now)]; w.est = true; return w; }
    var GOD = "Note the godparents and witnesses, who are often relatives, and compare them across the brothers’ and sisters’ entries.";
    function margin(y) {
      var out = { say: "", links: [] };
      if (y >= 1885 && y < 1975) { out.say = "In a Catholic baptism register read the margin and remarks: from 1908 the parish priest was to note a later marriage there."; out.links.push({ t: "Source: decree Ne temere (1907), IX", href: NE_TEMERE }); }
      if (HR && y >= 1946) { out.say = "In Croatia’s state birth registers a later marriage or death is entered as a note."; out.links = [{ t: "Source: State Registers Act, art. 9", href: HR_ACT }]; }
      return out;
    }
    var cards = [];
    /* the person the story is about */
    var own = [];
    if (born) {
      var mg = margin(born);
      var bw = f.bornApprox ? est(born - 2, born + 2) : [born, born]; if (self.bornText && !f.bornApprox) bw.shown = true;
      own.push(record("Birth or baptism entry" + (bw.shown ? " · " + self.bornText : ""), "b", bw, "In " + served + ". It should name the parents, so it tests every other name in the story.", [mg.say, GOD].filter(Boolean).join(" "), mg.links));
    } else own.push(step("Birth or baptism entry", "No birth year is told. A rough one (“born in the 1920s”) lets the plan name the book.", {}));
    var spouse = one("spouse"), married = ev(self, "married"), kids = people.filter(function (x) { return x.role === "child"; });
    if (born && (spouse || married || kids.length)) own.push(record("Marriage", "m", married && married.year ? [married.year, married.year] : est(born + 17, born + 45), "It names the other family; the witnesses are often relatives.", ""));
    var died = ev(self, "died");
    if (died && died.year) own.push(record("Death or burial", "d", [died.year, died.year], "The entry or certificate and the grave.", ""));
    else if (born && born > now - 105) own.push(step("Whether they are alive", "The story tells no death. Treat them as possibly living: ask the family. " + NO_LIVING, {}));
    else if (born) own.push(record("Death or burial", "d", est(born, born + 90), "No death is told.", ""));
    var lead = [born ? "born " + (self.bornText || born) : "", self.place ? "in " + bare(self.place) : ""].filter(Boolean).join(" ");
    if (an.village) lead = (lead ? lead + ". " : "") + "The Atlas lists no books for " + place + " itself, so the books named below are those it lists under " + info.name + " and its neighbours.";
    cards.push({ title: me + (self.name ? " (" + whose + ")" : ""), why: lead, steps: own });
    /* the parents: their marriage first, since it is the entry most likely to give both families */
    var folks = [fa, mo].concat(parents).filter(Boolean);
    if (folks.length && born) {
      var pair = folks.map(function (p) { return named(p, p.role); }).join(" and ");
      cards.push({ title: "The parents’ marriage: " + pair, why: "Before their first known child (" + born + "), and earlier if there were older children.", steps: [
        record("Marriage entry", "m", est(born - 25, born), "In " + served + (mo && !mo.place ? ", and in the mother’s own parish: the story does not say where she came from" : "") + ".", "Read it for both places of origin, both sets of parents and the witnesses.")] });
    }
    folks.forEach(function (p) {
      var isMo = p.role === "mother", who = named(p, p.role), steps = [], w = born ? est(born - 45, born - (isMo ? 17 : 18)) : null;
      if (w) { var mg = margin(w[1]); steps.push(record("Birth or baptism entry", "b", w, isMo ? "She may come from another parish, so finding nothing in this one says little." : p.place ? "In the parish of " + bare(p.place) + "." : "In " + served + " first: the story does not say where " + (p.role === "parent" ? "this parent" : "he") + " was born.", mg.say, mg.links)); }
      else steps.push(step("Birth or baptism entry", "The child’s birth year would set the years to search.", {}));
      if (p.maiden) steps.push(step("Search the birth name " + p.maiden + " on its own", "Registers file her under it. Search the same books and the neighbouring parishes, with its other spellings. A shared surname is a lead, not proof of descent.", {}));
      var alive = ev(p, "alive"), gone = ev(p, "died");
      if (gone && gone.year) steps.push(record("Death or burial", "d", [gone.year, gone.year], "The entry or certificate and the grave.", ""));
      else if (alive && alive.year) {
        var paper = alive.year < 1945 && (info.provs || []).filter(function (x) { return /^(anno|nsk-stare-novine|nsk-digitalna)$/.test(x.id); })[0];
        steps.push(record("Death, after " + alive.year, "d", est(alive.year, alive.year + 30), "The story has them alive " + (alive.approx ? "about " : "in ") + alive.year + ". Start with the gravestone: see the burial grounds below.", paper ? "Old newspapers may carry a notice: " + paper.name + "." : "", paper ? [{ t: paper.name, href: paper.url }] : []));
      } else if (born) steps.push(record("Death or burial", "d", est(born, born + 60), "No death is told; the child’s papers and the gravestone may give it.", ""));
      cards.push({ title: who + " (" + (self.me ? "your " + p.role : p.role + " of " + me) + ")", why: "", steps: steps });
    });
    if (sibs.length && born) {
      var names = sibs.map(function (x) { return x.name; }).filter(Boolean), kinds = sibs.every(function (x) { return x.rel === "sister"; }) ? "sister" : sibs.every(function (x) { return x.rel === "brother"; }) ? "brother" : "brother or sister";
      cards.push({ title: (sibs.length === 1 ? "The " + kinds : "The " + sibs.length + " " + kinds.replace("brother or sister", "brothers and sisters").replace(/^(brother|sister)$/, "$1s")) + (names.length ? ": " + names.join(", ") : ", not named"), why: "", steps: [
        record("Their birth or baptism entries", "b", est(born - 15, born + 15), "In " + served + ", under the same parents." + (names.length < sibs.length ? " This is where the missing names should be." : ""), GOD),
        step("Their descendants, as living relatives", "Ask relatives and local groups. A DNA test can also connect cousins; it is a personal choice. " + NO_LIVING, {})] });
    }
    [spouse].concat(kids.filter(function (k) { return !k.unnamed && k.name; })).filter(Boolean).forEach(function (p) {
      var child = p.role === "child", b = ev(p, "born"), w = b && b.year ? [b.year, b.year] : born ? (child ? est(born + 17, born + 45) : est(born - 15, born + 15)) : null;
      if (!w || !p.name) return;
      cards.push({ title: p.name + " (" + (child ? p.label || "child" : p.label || "husband or wife") + ")", why: "", steps: [w[1] > now - 105 ? step("Ask the family first", "They may be alive, or their children are. " + NO_LIVING, {}) : record("Birth or baptism entry", "b", w, child ? "Their entry names both parents." : "It names the other family.", GOD)] });
    });
    /* at home, before writing to anyone */
    var home = [], photo = /\bphoto(?:graph)?s?\b/i.test(deps.text || "");
    var py = photo && /\bphoto(?:graph)?\b[^.!?\n]{0,60}?\b(?:around|about|circa|c\.|in|from)\s+(1[89]\d\d|20[0-2]\d)\b/i.exec(deps.text || "");
    if (photo) home.push({ title: "The photograph" + (py ? " from about " + py[1] : "") + " in the story", why: "Ask who holds the original and what is written on its back. List who is who, left to right, on a separate sheet while someone still knows.", detail: "Scan both sides. " + NO_LIVING });
    home.push({ title: "Certificates and extracts", why: "A birth, marriage or death certificate kept by a relative can name parents, a place and a register to ask for.", detail: "" });
    home.push({ title: "Graves, memorial cards and the backs of photographs", why: "Photograph the stones with their names and years; look for death notices, memorial cards and letters.", detail: photo ? "" : "Write down who holds each original." });
    /* what the story leaves open, each with the record that would answer it */
    var open = [], q = function (a, b) { open.push({ title: a, why: "What would answer it: " + b }); };
    if (!born) q("When was " + me + " born?", "their own birth or baptism entry, or a certificate at home.");
    if (!folks.length) q("Who were the parents of " + me + "?", "their own birth or baptism entry.");
    if (mo && !mo.maiden) q("What was the mother’s birth name?", "her child’s baptism entry or the parents’ marriage entry.");
    if (mo && !mo.place) q("Where did " + named(mo, "the mother") + " come from?", "the parents’ marriage entry, then her own baptism.");
    if (folks.length) q("When and where did the parents marry?", "the marriage register of her parish or his, before " + (born || "the first child") + ".");
    var unnamed = sibs.filter(function (x) { return !x.name; });
    if (unnamed.length) q("What were the " + (unnamed.length > 1 ? unnamed.length + " " : "") + (unnamed.every(function (x) { return x.rel === "sister"; }) ? "sister" : unnamed.every(function (x) { return x.rel === "brother"; }) ? "brother" : "sibling") + (unnamed.length > 1 ? "s" : "") + " called?", "baptisms under the same parents, or a relative who knows.");
    folks.forEach(function (p) { var a = ev(p, "alive"); if (a && !ev(p, "died")) q("When did " + named(p, p.role) + " die?", "a gravestone or the death register after " + a.year + "."); });
    return { people: cards, home: home, open: open };
  }

  /* ---- build ------------------------------------------------------------------------------------------------------------------------------- */
  function build(g, deps) {
    deps = deps || {};
    var base = deps.base || "/", countries = {}, f = (g && g.facts) || {}, win = yearsOf(g), an = anchorOf(g);
    Object.keys(deps.countries || {}).forEach(function (k) { var v = deps.countries[k]; countries[k] = typeof v === "string" ? v : (v && (v.name || v.n)) || k; });
    deps.countries = countries;
    var out = { anchor: null, notes: [], sections: [], today: [], gaps: [] };
    if (!an) { out.notes.push("The plan needs a place the Atlas knows. Add where it happened, with the country (for example “Gallignana, Croatia”)."); return out; }
    var info = an.info, cname = countries[info.cc] || info.countryName || "", where = info.name + (cname ? ", " + cname : "");
    var region = pickRegion(info, deps.regions, countries), eras = erasFor(region, win);
    var surname = (function () { var n = String(f.name || "").trim().split(/\s+/); return n.length > 1 ? n[n.length - 1] : ""; })();
    var mid = win ? Math.round((win.lo + win.hi) / 2) : null;
    out.anchor = { name: info.name, cc: info.cc, where: where, ground: an.village ? { name: an.village.name, lat: an.village.lat, lon: an.village.lon } : null, href: info.href || (base + "place/" + (info.row && info.row.i) + "/"), lat: info.lat, lon: info.lon, region: region ? region.label : "", years: win };
    if (an.note) out.notes.push(an.note);
    var altSay = []; (an.alts || []).forEach(function (a) { var t = a.n + (countries[a.cc] ? ", " + countries[a.cc] : ""); if (t !== where && altSay.indexOf(t) < 0) altSay.push(t); });
    if (altSay.length) out.notes.push("“" + info.name + "” could also be " + altSay.slice(0, 2).join(" or ") + ". If you meant one of those, change the place in your story.");

    function item(title, why, o) { o = o || {}; return { title: clip(title, 140), why: clip(why, 220), detail: o.detail ? clip(o.detail, 360) : "", href: o.href || "", tag: o.tag || "", gap: !!o.gap, draft: o.draft || null, _a: o._a }; }
    function section(key, title, items) { if (items.length) out.sections.push({ key: key, title: title, items: items }); }

    /* 1 · AT YOUR DESK */
    var desk = [];
    desk.push(item("The Atlas's page for " + info.name, "Every register the Atlas lists for it, who holds it and what it costs, in one place.", { href: out.anchor.href, tag: "start here" }));
    var cols = (info.cols || []).filter(function (c) { return c; });
    var scored = cols.map(function (c) { var known = typeof c.from === "number", ov = win && known ? (Math.min(c.to || c.from, win.hi) - Math.max(c.from, win.from)) : win ? -0.5 : 0; return { c: c, ov: ov, known: known }; })
      .filter(function (x) { return !win || x.ov >= 0 || !x.known; })
      .sort(function (a, b) { return (a.known ? 0 : 1) - (b.known ? 0 : 1) || (ACC[a.c.access] != null ? ACC[a.c.access] : 8) - (ACC[b.c.access] != null ? ACC[b.c.access] : 8) || b.ov - a.ov; });
    scored.slice(0, 4).forEach(function (x) {
      var c = x.c, kinds = (c.kinds || []).map(function (k) { return k === "b" ? "births" : k === "m" ? "marriages" : k === "d" ? "deaths" : k; }).join(", ");
      var vt = (c.title || "Register").replace(/\s+/g, " ").trim(), vr = c.from ? c.from + (c.to && c.to !== c.from ? "–" + c.to : "") : "";
      desk.push(item(clip(vt, 80) + (vr && vt.indexOf(String(c.from)) < 0 ? " (" + vr + ")" : ""),
        !x.known ? "The Atlas does not state this volume's years: open it to see if it holds yours." : win ? "Covers " + Math.max(c.from, win.from) + (Math.min(c.to || c.from, win.hi) > Math.max(c.from, win.from) ? "–" + Math.min(c.to || c.from, win.hi) : "") + ", inside the years of your story." : "A register the Atlas lists for this place.",
        { detail: (kinds ? kinds + ": " : "") + (ACC_SAY[c.access] || ACC_SAY.unsurveyed) + (c.provider ? ", at " + ((deps.provById && deps.provById[c.provider] && deps.provById[c.provider].name) || c.provider) : ""), href: c.url || "", tag: c.access === "free" ? "free" : c.access === "account" ? "free account" : "" }));
    });
    if (!cols.length) {
      desk.push(item("The Atlas lists no register volume for " + info.name, "That is a gap in the Atlas, not proof the books do not exist: the place's own page names the region's archive.", { gap: true, href: out.anchor.href }));
    } else if (win && !scored.length && cols.some(function (c) { return typeof c.from === "number"; })) {
      var known = cols.filter(function (c) { return typeof c.from === "number"; }), lastTo = Math.max.apply(null, known.map(function (c) { return c.to || c.from; })), firstFrom = Math.min.apply(null, known.map(function (c) { return c.from; }));
      desk.push(item("None of the listed volumes cover your years", "The volumes the Atlas lists for " + info.name + " run " + firstFrom + "–" + lastTo + "; your story's years are " + win.lo + (win.hi > win.lo ? "–" + win.hi : "") + ". Records after that are on paper: see Write to.", { gap: true, href: out.anchor.href }));
    } else if (win && scored.length && (function () { var k = cols.filter(function (c) { return typeof c.from === "number"; }); return k.length && Math.max.apply(null, k.map(function (c) { return c.to || c.from; })) < win.hi; })()) {
      desk.push(item("The listed volumes stop at " + Math.max.apply(null, cols.filter(function (c) { return typeof c.from === "number"; }).map(function (c) { return c.to || c.from; })), "Later records exist on paper, at the registry office or the archive, not online: see Write to.", { gap: true }));
    }
    var idx = (info.provs || []).filter(function (p) { return p && /index|aggregator|catalogue/.test(p.kind || "") && ACC[p.access] != null && ACC[p.access] <= 3 && p.url && !VICTIMS.test(p.id + " " + p.name); })
      .sort(function (a, b) { return ACC[a.access] - ACC[b.access]; }).slice(0, 2);
    idx.forEach(function (p) { desk.push(item(p.name, "A searchable " + (p.kind === "catalogue" ? "catalogue" : "index") + " for " + (cname || "the country") + ": it can show a record exists before you write anywhere.", { detail: (ACC_SAY[p.access] || ""), href: p.url })); });
    section("desk", "Start at your desk", desk);

    /* 2 · THE PAPER AND THE ERA: whose archive held it, in which years */
    if (win && eras.length) {
      var ev = eras.slice(0, 4).map(function (e) {
        var names = (e.filedUnder || []).map(function (id) { return (deps.provById && deps.provById[id] && deps.provById[id].name) || (info.pname && info.pname[id]) || id; });
        return item(e.from + "–" + e.to + ": " + e.polity, "Records follow the state of the year, so these are the years to look for in " + (names[0] || "its archive") + ", not today's country.",
          { detail: (names.length ? "Filed under " + names.join(", ") + ". " : "") + (e.note && TRAP.test(e.note) ? clip(e.note, 240) : ""), tag: e.note && /THE TRAP/.test(e.note) ? "the trap" : "" });
      });
      section("era", "Whose paper it was, and when", ev);
    } else if (!win) {
      section("era", "Whose paper it was, and when", [item("Give a year, even a rough one", "The plan can then say who held " + info.name + " then and where its records are filed. A decade is enough: “born in the 1910s”.", { gap: true })]);
    }

    /* 3 · WRITE TO */
    var wr = [], ar = deps.archives || [], seen = Object.create(null);
    function contactLine(a) {
      var bits = [];
      if (a.email) bits.push(a.email + (STATE_SAY[a.state] ? " (" + STATE_SAY[a.state] + ")" : ""));
      if (a.form) bits.push("contact form on its website");
      if (a.tel) bits.push(a.tel);
      if (a.post) bits.push(a.post);
      (a.branches || []).forEach(function (b) { bits.push(b.name + " " + b.tel); });
      return bits.length ? "The Atlas holds: " + bits.join(" · ") : "The Atlas holds no address or email for it: use the website to find the contact.";
    }
    function addArch(a, why, km) {
      if (!a || seen[a.id]) return; seen[a.id] = 1;
      var it = item(a.name, why, { detail: (km != null ? km + " km away. " : "") + contactLine(a), href: a.url, tag: a.email ? "has an email" : a.form ? "has a contact form" : "", draft: null, _a: a });
      it.links = contactLinks(a); it._km = km; wr.push(it);
    }
    /* an archive that keeps this very ground (the village's, where there is one) comes before the nearest of the rest; one that keeps other ground is left out */
    var here = an.village || info, keeps = function (a) { return !a.serves || !!deps.serves && deps.serves(a, here); };
    ar = ar.filter(keeps);
    ar.filter(function (a) { return a.serves; }).forEach(function (a) { addArch(a, a.serves.say || "The Atlas lists it for this ground.", info.lat != null && a.lat != null ? Math.round(hav(info.lat, info.lon, a.lat, a.lon)) : null); });
    var eraIds = {}; eras.forEach(function (e) { (e.filedUnder || []).forEach(function (id) { eraIds[id] = 1; }); });
    var byId = {}; ar.forEach(function (a) { byId[a.id] = a; });
    Object.keys(eraIds).forEach(function (id) { var a = byId[id]; if (a && a.cc === info.cc) addArch(a, "The Atlas files " + info.name + "'s records under this archive for the years of your story.", info.lat != null && a.lat != null ? Math.round(hav(info.lat, info.lon, a.lat, a.lon)) : null); });
    if (info.lat != null) ar.map(function (a) { return { a: a, km: hav(info.lat, info.lon, a.lat, a.lon) }; })
      .filter(function (x) { return x.km <= 120 && x.a.cc === info.cc && /archive|diocesan/.test(x.a.kind); }).sort(function (x, y) { return x.km - y.km; }).slice(0, 3)
      .forEach(function (x) { addArch(x.a, x.a.kind === "diocesan" ? "The diocese keeps its parishes' registers, and often copies from the year before the state took over." : "The nearest " + (x.a.kind === "national-archive" ? "national" : "state/regional") + " archive: it holds or can say who holds the registers.", Math.round(x.km)); });
    wr = wr.slice(0, 4);
    var kept = !win || win.lo < 1946 ? wr.filter(function (i) { return i._a && i._a.serves; })[0] : null;   /* church registers: the books asked for were written before state registration */
    var dTo = wr.filter(function (i) { return i._a && i._a.kind === "regional-archive"; })[0] || wr[0];
    [kept, dTo].forEach(function (i) { if (i) i.draft = draft(info.cc, an.village ? bare(an.village.name) + " (" + info.name + ")" : info.name, surname, mid); });
    if (wr.length) wr.push(item("The registry office (matični ured / registrar / comune) of today's municipality", "Civil registers from the 1800s on are usually kept by the office of the municipality where the event happened, until they pass to an archive.", { gap: true, detail: "The Atlas does not list municipal registry offices: search for the name of the municipality with the word for registry office." }));
    section("write", "Write to", wr);

    /* 3b · ASK THE VILLAGE, and what the online books cannot show: only where the story's years are within living memory */
    var vg = [], nowY = deps.year || new Date().getFullYear(), ground2 = an.village || info, adm = (ground2.p && ground2.p.admin) || {}, vn = bare(ground2.name);
    var townSeat = !an.village && (adm.adm2 === "Grad " + vn || adm.adm1 === vn);
    if (win && win.hi >= nowY - 100 && !ground2.isCountry) {
      var q = function (words) { return "https://duckduckgo.com/?q=" + encodeURIComponent(words); }, muni = String(adm.adm2 || "").replace(/^Grad /, ""), ctx = vn + (muni && muni !== vn ? " " + muni : muni ? "" : cname ? " " + cname : ""), hr = ground2.cc === "HR";
      if (!townSeat) {
        var add = function (title, why, links) { var it = item(title, why, {}); it.links = links; vg.push(it); };
        if (hr) add("A folklore and culture society (KUD) for " + vn, "If there is one, its older members may know the families. The Atlas does not know whether there is: search, and check the official register of associations.", [{ t: "Search “KUD " + ctx + "”", href: q("KUD " + ctx) }, { t: "Official registers of associations", href: "https://registri-npo-mpu.gov.hr/" }]);
        add("Local history and heritage groups for " + vn, "People who collect a place’s history may know which families lived there.", [{ t: "Search for heritage groups", href: q(hr ? ctx + " udruga povijest baština" : ctx + " local history heritage society") }]);
        add("Village groups on social media", "Ask whether anyone remembers the family. " + NO_LIVING, [{ t: "Search Facebook groups for " + vn, href: "https://www.facebook.com/search/groups/?q=" + encodeURIComponent(vn) }]);
      }
      var lastBook = Math.max.apply(null, [0].concat([].concat(info.cols || [], (an.village && an.village.cols) || []).map(function (c) { return c && typeof c.from === "number" ? c.to || c.from : 0; })));
      var rec2 = item("Recent records and living relatives", (lastBook ? "The books the Atlas lists for " + bare(info.name) + " stop in " + lastBook + ". " : "The Atlas lists no dated books for " + bare(info.name) + ". ") + "FamilySearch does not hold everything: finding nothing there is not proof.",
        { detail: hr ? "State registers are with the registry office (matični ured). The registrar lets the person concerned, close family, an adoptive parent or guardian inspect them; anyone else needs a legal interest. Local people are often the way to living relatives." : "Recent civil entries are usually with the registry office of the place, which may limit who can see them. Local people are often the way to living relatives." });
      if (hr) rec2.links = [{ t: "Source: State Registers Act, art. 44", href: HR_ACT_NOW }];
      vg.push(rec2);
    }
    section("village", townSeat ? "Recent records" : "Ask the village", vg);

    /* 4 · LOOK NEARBY */
    var nb = [], years = win ? [win.lo, win.hi] : null;
    /* the same neighbours the place card shows (atlas-summary.js `neighbours`), each with the registers that meet the story's years */
    ((an.village || info).neigh || []).forEach(function (x) {
      var km = Math.max(1, Math.round(x.km)), vs = deps.pickVolumes ? deps.pickVolumes(x.info, years, 3) : [];
      var it = item(x.info.name, "A place " + km + " km away" + (x.books ? " with " + x.books + " volume" + (x.books === 1 ? "" : "s") + " in the Atlas" : " (the Atlas lists no volumes for it)") + ": families often married, baptised or were buried in the next parish." + (x.doubt ? " Position doubtful: the name says " + x.doubt.of + ", " + x.doubt.km + " km from this point." : ""),
        { href: x.info.href, tag: km + " km", detail: vs.length && years && !vs[0].fits ? "None of its FamilySearch registers meets your years; the nearest in time:" : "" });
      it.regs = vs.map(function (v) { var yr = v.from ? v.from + (v.to && v.to !== v.from ? "\u2013" + v.to : "") : ""; return { text: clip(v.t, 70) + (yr && v.t.indexOf(String(v.from)) < 0 ? " (" + yr + ")" : ""), href: v.url }; });
      nb.push(it);
    });
    /* today's administrative home, only where the Atlas holds it, and always saying WHICH place: a village beside the told town may be in another municipality */
    var adOf = function (i) { var a = i && i.p && i.p.admin; return a && (a.adm1 || a.adm2) ? a : null; }, adPlace = an.village && adOf(an.village) ? an.village : info, ad = adOf(adPlace);
    if (ad) nb.unshift(item("Today " + bare(adPlace.name) + " is in " + [ad.adm2, ad.adm1].filter(Boolean).join(", "), "The modern district and county: the offices and local archives that exist now are named for these." + (an.village && adPlace === info ? " The Atlas holds none for " + bare(an.village.name) + " itself, which may be in another municipality." : ""), {}));
    /* today's parish, only where a diocese's own list names the village: never read back into the story's years */
    var parish = null; (deps.archives || []).forEach(function (a) { ((a.serves && a.serves.parishes) || []).forEach(function (x) { var g2 = an.village || info, ad2 = g2.p && g2.p.admin; if (!parish && ad2 && ad2.adm1 === x.county && x.villages.indexOf(bare(g2.name)) > -1) parish = x; }); });
    if (parish) nb.push(item("Today’s parish for " + bare((an.village || info).name) + ": " + parish.name, "The diocese lists the village among this parish’s villages today.", { detail: parish.note, href: parish.url }));
    nb.push(item("The district and court seats of the time, and the parish next door", parish ? "The Atlas does not hold the district (kotar / Bezirk / contea) or court seats of past states, nor which parish served a village in a past year." : "The Atlas does not hold the district (kotar / Bezirk / contea) or court seats of past states, nor a list of parishes.", { gap: true, detail: "Ask the archive in Write to which parish the village belonged to in your years: it is usually one line." }));
    section("near", "Look nearby", nb);

    /* 4b · WHERE THE FAMILY NAMES ARE MOST COMMON (Croatia, 2021 census: ranks only; see censusWhere in story-engine.js) */
    var cen = g.names && g.names.census, nm = [];
    if (cen && cen.rows) {
      var nth = function (n) { return n + (["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] || "th"); };
      var look = function (name) { var out2 = [], seen = {}; ((g.people) || []).forEach(function (pe) { var sn = pe.surname; if (sn && pe.surnameTyped === name) (sn.links || []).forEach(function (l) { if (!seen[l.url]) { seen[l.url] = 1; out2.push({ t: "Look up on " + l.name, href: l.url }); } }); }); return out2.slice(0, 2); };
      cen.rows.forEach(function (r) {
        var link = function (a) { return a && a.place ? base + "place/" + encodeURIComponent(a.place) + "/" : ""; }, it;
        if (r.areas.length) {
          var top = r.areas.slice(0, 3).map(function (a) { return a.n + " (" + nth(a.rank) + ")"; }), near = r.areas.filter(function (a) { return a.km != null; }).sort(function (a, b) { return a.km - b.km; })[0];
          it = item((r.as || r.name) + ": ranks highest in " + top.join(", "), "Its rank among each place's surnames in the 2021 census" + (near && cen.home ? ". Nearest to " + cen.home.name + ": " + near.n + ", " + near.km + " km, where it is " + nth(near.rank) : "") + ".",
            { detail: "Where a name is common is a good place to ask about it and to read the parish. It does not show that anyone there is your family.", href: link(near || r.areas[0]), tag: r.areas.length + (r.areas.length === 1 ? " place" : " places") });
        } else {
          it = item((r.as || r.name) + ": in no town's ten most common surnames", (r.counted != null ? "The 2011 census counted " + r.counted + " people with it in all of Croatia." : r.below ? "In 2011 fewer than ten people had it, or none." : "The 2021 lists do not hold it, which is not proof nobody there has it.") + " A rare name is worth searching everywhere you look.", { gap: true });
        }
        it.links = look(r.name); nm.push(it);
      });
      if (cen.around.length && cen.home) nm.push(item("The common surnames around " + cen.home.name + " today", cen.around.map(function (a) { return a.n + " " + a.km + " km"; }).join(", ") + ": compare them with the godparents and witnesses in the registers. They are today's names, not those of your years.",
        { detail: cen.around[0].n + ": " + cen.around[0].names.join(", ") + ".", href: cen.around[0].place ? base + "place/" + encodeURIComponent(cen.around[0].place) + "/" : "" }));
      if (nm.length) nm[nm.length - 1].detail = (nm[nm.length - 1].detail ? nm[nm.length - 1].detail + " " : "") + "Source: Croatian Bureau of Statistics (DZS), Census 2021.";
    }
    section("names", "Where the family names are most common", nm);

    /* 5 · ON THE GROUND: burial grounds */
    var gr = ground(deps.cemeteries, an.village || info, item);
    section("ground", "Where it would be on the ground", gr);

    /* 6 · WHAT WAS HAPPENING: events whose mapped area holds the place, in the years the people were alive */
    var hp = [], evs = (deps.mort && deps.mort.events) || [];
    if (win && info.lat != null) {
      var stops = [{ n: info.name, y: info.lat, x: info.lon }]; (f.kin || []).concat([{ stops: f.route || [] }]).forEach(function (k) { (k.stops || []).forEach(function (s) { if (s.info && s.info.lat != null && s.info !== info && stops.length < 6 && s.info.cc === info.cc) stops.push({ n: s.info.name, y: s.info.lat, x: s.info.lon }); }); });
      evs.filter(function (e) { return e.poly && e.t >= win.lo && e.f <= win.hi; }).forEach(function (e) {
        var s = stops.filter(function (p) { return (e.poly || []).some(function (ring) { return inRing([p.y, p.x], ring); }); })[0];
        if (s && hp.length < 5) hp.push(item(e.n + " (" + e.f + (e.t !== e.f ? "–" + e.t : "") + ")", s.n + " lies inside the area mapped for this event, in years your story's people were alive.", { href: base + "history/", detail: "The atlas can say the place was in the area; it cannot say anyone in your family was harmed." }));
      });
    }
    if (!hp.length) hp.push(item(win ? "No mapped mass-mortality event covers " + info.name + " in your years" : "Give a year to see what the place went through", win ? "The Atlas maps 75 such events; none has " + info.name + " inside its area while the people in your story were alive. That says nothing about ordinary hard years." : "Events are matched to the years of the story.", { gap: true }));
    section("happening", "What was happening", hp);

    /* 7 · THEIR MOVES */
    var mv = [], lines = [];
    var main = (f.route || []).filter(function (r) { return r && r.info; });
    if (main.length > 1) lines.push({ label: "The person in the story", stops: main });
    (f.kin || []).forEach(function (k) { var ss = (k.stops || []).filter(function (s) { return s.info && s.role !== "mention"; }); if (ss.length && k.label !== "also named in the story") lines.push({ label: k.label.replace(/^./, function (c) { return c.toUpperCase(); }), stops: ss }); });
    var homeCc = info.cc;
    lines = lines.filter(function (ln) { return ln.stops.some(function (s) { return s.info.cc !== homeCc; }); });
    lines.forEach(function (ln) {
      /* where the story puts the family in a village beside the town the plan starts from, their moves start in the village */
      var st = ln.stops.map(function (s) { return an.village && s.info === info ? { info: an.village, year: s.year, role: s.role } : s; });
      if (st[0].info.cc !== homeCc) st.unshift({ info: an.village || info, role: "origin" });
      var desc = st.map(function (s) { return s.info.name + (s.year ? " " + s.year : ""); }).join(" → ");
      var dest = st[st.length - 1].info, dcc = dest.cc, recs = MOVE_RECORDS[dcc] || MOVE_DEFAULT;
      var legs = st.slice(1).map(function (s) { var p = destSource(s.info); return p ? s.info.name + ": " + p.name : ""; }).filter(Boolean), last = destSource(dest);
      mv.push(item(ln.label + ": " + desc, "Each move leaves paper in the place they arrived: " + recs.join("; ") + ".", { detail: legs.length ? "Start with " + legs.join(" · ") + "." : "", href: last ? last.url : "", tag: st.length - 1 + (st.length - 1 === 1 ? " move" : " moves") }));
    });
    section("moves", "Their moves, and the paper each leaves", mv);

    /* WHAT TO LOOK FOR NEXT: at home first, then each person, and at the end what the story leaves open */
    var rec = recommend(g, deps, an), first = [];
    var hm = rec.home.map(function (x) { return item(x.title, x.why, { detail: x.detail }); });
    var pp = rec.people.map(function (x) { var it = item(x.title, x.why, {}); it.steps = x.steps; return it; });
    if (hm.length) first.push({ key: "home", title: "Check at home before you write", items: hm });
    if (pp.length) first.push({ key: "people", title: "What to look for next, person by person", wide: true, items: pp });
    out.sections = first.concat(out.sections);
    section("open", "What your story leaves open", rec.open.map(function (x) { return item(x.title, x.why, {}); }));

    /* TODAY */
    var d0 = out.sections.filter(function (s) { return s.key === "desk"; })[0], w0 = out.sections.filter(function (s) { return s.key === "write"; })[0], g0 = out.sections.filter(function (s) { return s.key === "ground"; })[0];
    var firstOpen = d0 && d0.items.filter(function (i) { return (i.tag === "free" || i.tag === "free account"); })[0] || d0 && d0.items[0];
    out.today.push({ n: 1, title: "At your desk", text: firstOpen ? firstOpen.title : "Open the Atlas's page for " + info.name, href: firstOpen && firstOpen.href || "" });
    var drafted = w0 && w0.items.filter(function (i) { return i.draft && i._a && (i._a.email || i._a.form || i._a.serves); })[0]; /* the nearest regional archive leads over a capital's inbox */
    var mailTo = w0 && (drafted || w0.items.filter(function (i) { return i._a && i._a.email; })[0] || w0.items.filter(function (i) { return i._a && /regional|diocesan/.test(i._a.kind); })[0] || w0.items.filter(function (i) { return !i.gap; })[0]);
    if (mailTo) {
      var to = mailTo._a || {};
      out.today.push({ n: 2, title: to.email ? "Email" : "Write", text: mailTo.title + (to.email ? " (" + to.email + ")" : to.form ? " (use its contact form" + (to.tel ? ", or call " + to.tel : "") + ")" : to.tel ? " (call " + to.tel + ")" : " (the Atlas holds no address: use its site)"), href: !to.email && to.form ? to.form : mailTo.href });
    }
    var vol = (deps.archives || []).filter(function (a) { return a.kind === "volunteer" && a.cc === info.cc; })[0];
    out.today.push({ n: 3, title: "Ask people", text: vol ? "A volunteer group for " + (cname || "the country") + ": " + vol.name : "Ask the older relatives who still have the photographs, letters and documents: a name or a village on the back of a photo is a lead." + (vg.length && !townSeat ? " Then ask people in " + vn + " (see Ask the village)." : ""), href: vol ? vol.url : "" });
    var near = w0 && w0.items.filter(function (i) { return i._a && i._km != null; }).sort(function (a, b) { return a._km - b._km; })[0];
    /* a branch in the very town beats the head office down the road; what it holds is not stated, so the plan says to ask */
    var local = null; (w0 ? w0.items : []).forEach(function (i) { ((i._a && i._a.branches) || []).forEach(function (b) { if (!local && fold(b.name).indexOf(fold(info.name)) > -1) local = { b: b, i: i }; }); });
    out.today.push({ n: 4, title: "If you can go", text: local ? "Call the " + local.b.name.replace(/^./, function (c) { return c.toLowerCase(); }) + " (" + local.b.tel + "), a branch of " + local.i.title + ", and ask what it holds before you visit." : near ? "Visit or call " + near.title + " (" + near._km + " km away" + (near._a.tel ? ", " + near._a.tel : "") + ")" : "Visit the parish office in " + info.name + ".", href: local ? local.i.href : near ? near.href : "" });
    out.sections.forEach(function (s) { s.items.forEach(function (i) { delete i._a; delete i._km; }); });
    return out;
  }

  function asText(plan) {
    if (!plan || !plan.sections) return "";
    var L = ["PLAN FOR " + ((plan.anchor && plan.anchor.where) || "")];
    (plan.notes || []).forEach(function (n) { L.push("Note: " + n); });
    (plan.today || []).forEach(function (t) { L.push(t.n + ". " + t.title + ": " + t.text); });
    plan.sections.forEach(function (s) { L.push("", s.title.toUpperCase()); s.items.forEach(function (i) { L.push("- " + i.title + (i.why ? " — " + i.why : "") + (i.detail ? " [" + i.detail + "]" : "") + (i.regs || []).map(function (r) { return " <" + r.text + " " + r.href + ">"; }).join("") + (i.href ? " (" + i.href + ")" : "")); (i.steps || []).forEach(function (x) { L.push("  * " + x.title + (x.why ? " — " + x.why : "") + (x.detail ? " [" + x.detail + "]" : "") + (x.href ? " (" + x.href + ")" : "")); }); if (i.draft) L.push("  Draft (" + i.draft.language + "): " + i.draft.text); }); });
    return L.join("\n").slice(0, 9000);
  }

  /* ---- draw ---------------------------------------------------------------------------------------------------------------------------------- */
  function el(tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
  /* one person: folded, the first open; each thing to find with its years, book and sources */
  function linkTo(text, href, cls) { var a = el("a", text, cls); a.href = href; if (/^https?:/.test(href)) { a.target = "_blank"; a.rel = "noopener"; } return a; }
  function personRow(i, open) {
    var li = el("li"), d = el("details", null, "sp-todo-person"), sm = el("summary"); if (open) d.open = true;
    sm.append(el("b", i.title), el("span", " \u00b7 " + i.steps.length + (i.steps.length === 1 ? " thing to find" : " things to find"), "sp-todo-why")); d.append(sm);
    if (i.why) d.append(el("span", i.why, "sp-todo-why"));
    var ol = el("ol", null, "sp-todo-steps");
    i.steps.forEach(function (x) {
      var s = el("li"), t = el("span", null, "sp-todo-t"), b = el("b");
      if (x.href && /^(https?:\/\/|\/)/.test(x.href)) b.append(linkTo(x.title, x.href)); else b.textContent = x.title;
      t.append(b); s.append(t);
      if (x.why) s.append(el("span", x.why, "sp-todo-why"));
      if (x.detail) s.append(el("span", x.detail, "sp-todo-det"));
      if (x.links && x.links.length) { var row = el("span", null, "sp-todo-links"); x.links.forEach(function (l) { row.append(linkTo(l.t, l.href, "k-pill sp-todo-link")); }); s.append(row); }
      ol.append(s);
    });
    d.append(ol); li.append(d); return li;
  }
  function render(plan, mount) {
    mount.textContent = "";
    if (!plan || !plan.sections || !plan.sections.length) { mount.append(el("p", (plan && plan.notes && plan.notes[0]) || "Add a place to the story and the plan fills in.", "sp-fine")); return; }
    (plan.notes || []).forEach(function (n) { mount.append(el("p", n, "sp-todo-note")); });
    var ol = el("ol", null, "sp-today");
    plan.today.forEach(function (t) { var li = el("li"), b = el("b", t.title); li.append(el("span", String(t.n), "sp-today-n"), b, document.createTextNode(" ")); if (t.href && /^(https?:\/\/|\/)/.test(t.href)) { var a = el("a", t.text); a.href = t.href; if (/^https?:/.test(t.href)) { a.target = "_blank"; a.rel = "noopener"; } li.append(a); } else li.append(document.createTextNode(t.text)); ol.append(li); });
    mount.append(el("h3", "Do these first", "sp-todo-h"), ol);
    var grid = el("div", null, "sp-todo-grid k-grid");
    plan.sections.forEach(function (s) {
      var card = el("section", null, "sp-todo-card k-card" + (s.wide ? " sp-todo-wide" : "")); card.append(el("h3", s.title));
      var ul = el("ul");
      s.items.forEach(function (i) {
        if (i.steps) { ul.append(personRow(i, s.items.indexOf(i) === 0)); return; }
        var li = el("li", null, i.gap ? "is-gap" : ""), t = el("span", null, "sp-todo-t");
        if (i.href && /^(https?:\/\/|\/)/.test(i.href)) { var a = el("a", i.title); a.href = i.href; if (/^https?:/.test(i.href)) { a.target = "_blank"; a.rel = "noopener"; } var b = el("b"); b.append(a); t.append(b); } else t.append(el("b", i.title));
        if (i.tag) t.append(document.createTextNode(" "), el("span", i.tag, "k-pill is-plain sp-todo-tag"));
        li.append(t);
        if (i.why) li.append(el("span", i.why, "sp-todo-why"));
        if (i.detail) li.append(el("span", i.detail, "sp-todo-det"));
        if (i.links && i.links.length) {
          var row = el("span", null, "sp-todo-links");
          i.links.forEach(function (l) { var a = el("a", l.t, "k-pill sp-todo-link"); a.href = l.href; if (/^https?:/.test(l.href)) { a.target = "_blank"; a.rel = "noopener"; } row.append(a); });
          li.append(row);
        }
        if (i.regs && i.regs.length) { var lk = el("ul", null, "sp-todo-regs"); i.regs.forEach(function (x) { if (!/^https?:\/\//.test(x.href)) return; var l = el("li"), a2 = el("a", x.text); a2.href = x.href; a2.target = "_blank"; a2.rel = "noopener"; l.append(a2); lk.append(l); }); li.append(lk); }
        if (i.draft) { var d = el("details", null, "sp-todo-draft"), sm = el("summary", "A draft in " + i.draft.language + " — check the wording before you send"); var pre = el("p", i.draft.text, "sp-todo-draft-t"); pre.lang = ({ Croatian: "hr", Slovenian: "sl", Italian: "it", German: "de", Spanish: "es", Polish: "pl", Czech: "cs", Hungarian: "hu", French: "fr", Portuguese: "pt" })[i.draft.language] || "en"; d.append(sm, pre);
          var mail = (i.links || []).filter(function (l) { return /^mailto:/.test(l.href); })[0];
          if (mail) { var send = el("a", "Open this draft in your email", "k-pill sp-todo-link"); send.href = mail.href + "?subject=" + encodeURIComponent((plan.anchor && plan.anchor.name) || "") + "&body=" + encodeURIComponent(i.draft.text); d.append(send); }
          li.append(d); }
        ul.append(li);
      });
      card.append(ul); grid.append(card);
    });
    mount.append(grid);
    mount.append(el("p", "Worked out on this device from the Atlas's own files; nothing is sent anywhere. A line only appears where a file says it. Grey lines say what the Atlas does not hold. Cemetery positions: OpenStreetMap contributors (ODbL) and Wikidata (CC0).", "sp-fine"));
  }

  var api = { build: build, cellsFor: cellsFor, cemeteriesFrom: cemeteriesFrom, loadCemeteries: loadCemeteries, render: render, asText: asText, anchorOf: anchorOf, pickRegion: pickRegion, recommend: recommend, bookSay: bookSay, yearsOf: yearsOf, erasFor: erasFor, draft: draft, hav: hav, inRing: inRing };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.raStoryTodo = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
