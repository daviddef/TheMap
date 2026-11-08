/* THE HANDOVER ON /read/: after the pictures and lines are read, bring it all together as one document a person or another AI can pick up.

   One structured document (a list of blocks: heading, paragraph, list, preformatted text) is built from what is in the box, what Claude drafted for
   each entry, and, if the Atlas card is showing, the place facts. It is drawn three ways: a page to print or save as PDF, a plain-text (Markdown)
   file, and a prompt. NOTHING IS SENT ANYWHERE: this builds files in the browser from what is already on the page. The pictures go into the saved
   PDF and text file only while the reader leaves "Include the pictures" ticked (shrunk copies, as the reader shrank them; never into the prompt,
   which cannot carry them), and the document says whether they are there, because a reading can be wrong and whoever picks it up should look at the image.

   Pure builders are exported for the tests (module.exports); the page code is in boot(). Text goes in with textContent, never as HTML. */
(function () {
  "use strict";

  var SEP = /^[ \t]*[-—–=]+[ \t]*picture[ \t]*\d*[ \t]*[-—–=]+[ \t]*$/gim;
  function sections(t) { return String(t || "").split(SEP).map(function (x) { return x.trim(); }).filter(Boolean); }
  function res(e) { return (e && e.res && (e.res.result || e.res)) || null; }
  function years(t) { var o = [], re = /(^|[^0-9])(1[0-9]{3}|20[0-3][0-9])(?![0-9])/g, m; while ((m = re.exec(String(t || "")))) o.push(+m[2]); return o; }

  /* What the handover is made of. `box` is the text in the reading box, `done` maps an entry's exact text to {res, lang}, `facts` is what the Atlas card
     last drew (or null), `where` is what the reader typed in the place box. An entry the reader has edited since Claude read it has no draft: the
     draft belonged to the old words. */
  function model(box, done, facts, where, today, extra) {
    var parts = sections(box), all = [];
    var entries = parts.map(function (txt, i) {
      var d = done && done[txt] || null; all = all.concat(years(txt));
      return { n: i + 1, text: txt, res: d ? d.res : null, lang: d ? d.lang : "" };
    });
    var people = {}, order = [], doubt = [];
    entries.forEach(function (e) {
      var r = res(e); if (!r) return;
      (r.roles || []).forEach(function (x) {
        var k = String(x.w || "").toLowerCase().replace(/\s+/g, " ").trim(); if (!k) return;
        if (!people[k]) { people[k] = { w: x.w, roles: [], inn: [] }; order.push(k); }
        people[k].roles.push("entry " + e.n + ": " + x.role); if (people[k].inn.indexOf(e.n) < 0) people[k].inn.push(e.n);
      });
      (r.words || []).forEach(function (w) { if (w.doubt) doubt.push({ w: w.w, why: w.why || "", n: e.n }); });
    });
    return {
      today: today || new Date().toISOString().slice(0, 10), where: String(where || "").trim(), facts: facts || null, entries: entries,
      years: all.length ? [Math.min.apply(null, all), Math.max.apply(null, all)] : null,
      names: order.map(function (k) { return people[k]; }), doubt: doubt,
      many: entries.length > 1,
      docs: (extra && extra.docs) || [], cf: (extra && extra.cf) || null,
      pics: (extra && extra.pics) || {}, withPics: !!(extra && extra.withPics), layer: (extra && extra.layer) || null
    };
  }

  /* ---- the document, as blocks ---------------------------------------------------------------------------------- */
  function entryBlocks(m, lvl) {
    var b = [];
    m.entries.forEach(function (e) {
      var r = res(e), tag = m.many ? "Entry " + e.n : "The entry";
      b.push({ h: lvl, t: tag });
      if (m.withPics && m.pics[e.n]) b.push({ img: m.pics[e.n], cap: "Picture " + e.n });
      b.push({ lab: "Transcript, as read" }, { pre: e.text });
      if (!r) { b.push({ p: "No draft reading was made for this text (or it was edited after the draft). Transcript only." }); return; }
      if (e.lang) b.push({ p: "Written in: " + e.lang });
      b.push({ lab: "Draft reading (made by an AI, not checked)" }, { p: r.draft || "" });
      if (r.note) b.push({ p: r.note });
      if ((r.words || []).length) b.push({ lab: "Word by word" }, { ul: r.words.map(function (w) {
        return w.w + " = " + (w.gloss || "") + " [" + (w.from === "card" ? "from a Record Atlas card" : "the model's own knowledge") + (w.doubt ? "; DOUBTFUL" + (w.why ? ": " + w.why : "") : "") + "]";
      }) });
      if ((r.roles || []).length) b.push({ lab: "Who is named, and in what role (as the draft reads it)" }, { ul: r.roles.map(function (x) { return x.w + " — " + x.role; }) });
      if ((r.not_said || []).length) b.push({ lab: "What the entry does not say" }, { ul: r.not_said.slice() });
    });
    return b;
  }
  function contextBlocks(m) {
    var ul = [], f = m.facts;
    if (m.where) ul.push("Where it is from (as typed): " + m.where);
    if (m.years) ul.push("Years written in the text: " + (m.years[0] === m.years[1] ? m.years[0] : m.years[0] + "–" + m.years[1]));
    if (f) {
      ul.push("Place in the Atlas: " + f.place + (f.country ? ", " + f.country : "") + (f.older && f.older.length ? " (older forms: " + f.older.join(", ") + ")" : ""));
      if (f.polity) ul.push("Whose ground it was in " + f.year + ": " + f.polity + (f.regime ? " (" + f.regime + ")" : ""));
      if (f.language) ul.push("Language of the register words: " + f.language);
      if (f.volumes && f.volumes.length) ul.push("Register volumes the Atlas lists for it: " + f.volumes.map(function (v) { return v.title + " (" + v.from + "–" + v.to + ")"; }).join("; "));
      if (f.page) ul.push("Atlas page: " + f.page);
    }
    return ul.length ? [{ h: 2, t: "Context" }, { ul: ul }] : [];
  }
  function summaryBlocks(m) {
    if (!m.many) return [];
    var b = [{ h: 2, t: "All " + m.entries.length + " entries together" }];
    b.push({ ul: m.entries.map(function (e) { var r = res(e); return "Entry " + e.n + ": " + (r && r.draft ? r.draft : e.text.split("\n")[0].slice(0, 120)); }) });
    if (m.names.length) b.push({ lab: "People named" }, { ul: m.names.map(function (p) { return p.w + " — " + p.roles.join("; "); }) });
    var rec = m.names.filter(function (p) { return p.inn.length > 1; });
    if (rec.length) b.push({ p: "Written in more than one entry: " + rec.map(function (p) { return p.w; }).join(", ") + ". The same spelling is a lead, not proof of one person." });
    if (m.doubt.length) b.push({ p: "Readings the AI doubted: " + m.doubt.map(function (d) { return d.w + " (entry " + d.n + ")"; }).join(", ") + "." });
    return b;
  }


  /* ---- documents read whole (census sheets, petitions, certificates) and the case file made from them ------------------- */
  function list(a) { return (a || []).filter(function (x) { return x != null && String(x).trim() !== ""; }); }
  function docBlocks(m, lvl) {
    var b = [];
    m.docs.forEach(function (x) {
      var d = x.doc || {};
      b.push({ h: lvl, t: "Document " + x.n + (d.doc_type ? ": " + d.doc_type : "") });
      if (m.withPics && x.pic) b.push({ img: x.pic, cap: "Document " + x.n + (x.name ? " (" + x.name + ")" : "") });
      if (d.unparsed) { b.push({ p: String(d.draft || "") }); return; }
      var meta = list([d.title_as_printed && "Printed title: " + d.title_as_printed, d.issuer && "Issued by: " + d.issuer, d.date_on_document && "Date on it: " + d.date_on_document,
        (d.places_named || []).length && "Places written on it: " + d.places_named.join("; ")]);
      if (meta.length) b.push({ ul: meta });
      if (d.what_it_is) b.push({ p: d.what_it_is });
      if ((d.persons || []).length) b.push({ lab: "People on it, as written" }, { ul: d.persons.map(function (p) {
        var det = p.details || {}, bits = list(["age " + (det.age || ""), det.born && "born " + det.born, det.birthplace && "birthplace " + det.birthplace, det.residence && "residence " + det.residence, det.occupation && "occupation " + det.occupation, det.other]);
        return (p.name_as_written || "") + (p.role ? " (" + p.role + ")" : "") + (bits.length ? ": " + bits.filter(function (t) { return t !== "age "; }).join("; ") : "");
      }) });
      if ((d.fields || []).length) b.push({ lab: "Fields, as written" }, { ul: d.fields.map(function (f) { return (f.label || "") + ": " + (f.value || "") + (f.doubt ? " [DOUBTFUL]" : ""); }) });
      if ((d.ids || []).length) b.push({ lab: "Numbers on it" }, { ul: d.ids.map(function (i) { return (i.kind || "") + ": " + (i.value || ""); }) });
      if ((d.not_legible || []).length) b.push({ lab: "Not readable" }, { ul: d.not_legible.slice() });
    });
    return b;
  }
  function caseBlocks(m) {
    var c = m.cf; if (!c || c.unparsed) return [];
    var b = [{ h: 2, t: "Case file: what the documents show together" }, { p: "Made by an AI from the documents below. A draft to check against the pictures, not a finding." }];
    if (c.headline) b.push({ p: c.headline });
    (c.groups || []).forEach(function (g) {
      b.push({ lab: "One person across document" + ((g.docs || []).length === 1 ? "" : "s") + " " + (g.docs || []).join(", ") + "?" }, { p: "Verdict: " + (g.verdict || "not given") + ". This is a hypothesis, not proof." });
      if ((g.because || []).length) b.push({ lab: "What points the same way" }, { ul: g.because.slice() });
      if ((g.against || []).length) b.push({ lab: "What does not fit" }, { ul: g.against.slice() });
    });
    if ((c.profile || []).length) b.push({ lab: "What the documents say about them" }, { ul: c.profile.map(function (f) { return f.fact + " [" + (f.status || "") + "; " + (f.evidence || "") + "]"; }) });
    if ((c.timeline || []).length) b.push({ lab: "Timeline" }, { ul: c.timeline.map(function (t) { return (t.date || "?") + ": " + (t.event || "") + (t.place ? " (" + t.place + ")" : "") + " [" + (t.source || "") + (t.status ? "; " + t.status : "") + "]"; }) });
    if ((c.names_and_places || []).length) b.push({ lab: "Names and places, and why they vary" }, { ul: c.names_and_places.map(function (n) { return (n.as_written || []).join(" / ") + " = " + (n.reading || "") + (n.why_it_varies ? ". " + n.why_it_varies : ""); }) });
    if ((c.conflicts || []).length) b.push({ lab: "Conflicts and gaps" }, { ul: c.conflicts.map(function (x) { return x.issue + ": " + (x.detail || "") + (x.how_to_settle ? " To settle: " + x.how_to_settle : ""); }) });
    if ((c.adds || []).length) b.push({ lab: "What the set adds" }, { ul: c.adds.slice() });
    if ((c.next_steps || []).length) b.push({ lab: "What to look for next" }, { ul: c.next_steps.map(function (x) { return x.look_for + (x.where ? " — where: " + x.where : "") + (x.search_with ? " — search with: " + x.search_with : "") + (x.could_settle ? " — could settle: " + x.could_settle : ""); }) });
    if ((c.cautions || []).length) b.push({ lab: "Cautions" }, { ul: c.cautions.slice() });
    return b;
  }

  /* The Atlas page for the documents (case-atlas.js), as blocks: the journey and who held each place, the registers and sources, the people as leads,
     and the names with their variants. It is plain data from the Atlas's catalogue, so it goes into the saved file and the prompt as it is. */
  function atlasBlocks(m) {
    var L = m.layer; if (!L || !(L.stops || []).length) return [];
    var b = [{ h: 2, t: "Where it happened, who held the ground, and where to look" },
      { p: "Drawn from Record Atlas's own catalogue files, not by an AI. The places, dates and names are what the documents gave, so they are leads until a record is seen. A missing row means not in the catalogue, never that it did not happen." }];
    if (L.svg) b.push({ svg: L.svg, cap: "The places in date order (positions only; the dashed line is not the route taken)" });
    b.push({ lab: "Places, in date order, and whose ground each was" }, { ul: L.stops.map(function (s) {
      var g = (s.ground || []).map(function (x) { return x.none ? x.year + ": no era catalogued" : (x.year != null ? x.year + " under " : "under ") + x.polity + (x.regime ? " (" + x.regime + ")" : ""); }).join("; ");
      return s.n + ". " + (s.place ? s.place.name + ", " + s.place.country : "not found in the Atlas") + " (written: " + s.text + ")" + ((s.years || []).length ? "; " + s.years.join(", ") : "") +
        ((s.docs || []).length ? "; document" + (s.docs.length > 1 ? "s " : " ") + s.docs.join(", ") : "") + (g ? "; " + g : "") +
        (s.place && s.place.older && s.place.older.length ? "; also written " + s.place.older.slice(0, 4).join(", ") : "");
    }) });
    var reg = [];
    L.stops.forEach(function (s) {
      var v = s.volumes || {}, rows = (v.cover && v.cover.length ? v.cover : v.near) || [], tag = v.cover && v.cover.length ? "covers " + s.first : "nearest in time";
      rows.slice(0, 4).forEach(function (x) { reg.push(s.n + ". " + (s.place ? s.place.name : s.text) + ": " + x.title + " (" + x.from + "–" + x.to + "; " + tag + ")" + (x.held ? ", held at " + x.held : "") + (x.url ? " " + x.url : "")); });
      (s.filed || []).forEach(function (p) { reg.push(s.n + ". records of these years are filed under " + p.name + " " + (p.url || "")); });
    });
    if (reg.length) b.push({ lab: "Registers and holders the Atlas lists for those places and years" }, { ul: reg });
    (L.countries || []).forEach(function (c) {
      if ((c.sources || []).length) b.push({ lab: "Sources catalogued for " + c.name + " (" + c.total + " in all; best access first)" }, { ul: c.sources.map(function (p) { return p.name + (p.access ? " [" + p.access + "]" : "") + " " + (p.url || ""); }) });
    });
    if ((L.start || []).length) b.push({ lab: "Where to start, in this order" }, { ul: L.start.map(function (x, i) { return (i + 1) + ". " + x.title + (x.how ? " — " + x.how : "") + " [" + x.from + "]" + (x.url ? " " + x.url : ""); }) });
    var T = L.tree || {}, tl = [];
    [["focus", "The person the documents are about"], ["spouse", "Spouse"], ["parents", "Parent named"], ["children", "Child named"], ["others", "Other named"]].forEach(function (k) {
      (T[k[0]] || []).forEach(function (p) { tl.push(k[1] + ": " + p.name + " (" + (p.roles || []).join(", ") + "; document" + (p.docs.length > 1 ? "s " : " ") + p.docs.join(", ") + ")" + (p.born ? ", born " + p.born : "") + (p.birthplace ? ", " + p.birthplace : "")); });
    });
    if (tl.length) b.push({ lab: "People named, as leads (by role on the document; not a proven tree)" }, { ul: tl });
    var N = L.names || {}, nl = [];
    (N.surnames || []).forEach(function (x) { nl.push("Surname " + x.written + " (last word taken as the surname): " + (x.family ? "catalogued family " + x.family.name + (x.family.forms.length ? "; other spellings: " + x.family.forms.map(function (f) { return f.form + " (" + f.status + ")"; }).join(", ") : "; no other spelling catalogued") : "not in a catalogued family yet; no spelling confirmed")); });
    (N.given || []).forEach(function (g) { nl.push("Given name " + g.written + " is held as " + g.canon + "; other forms: " + g.forms.map(function (f) { return f.form; }).join(", ")); });
    (N.places || []).forEach(function (p) { if (p.atlas) nl.push("Place " + p.written + " = " + p.atlas + (p.then && p.then.length ? "; called " + p.then.join(", ") : "") + (p.older && p.older.length ? "; other names: " + p.older.slice(0, 6).join(", ") : "; no other name catalogued")); });
    (N.reading || []).forEach(function (r) { nl.push("Reading's own note (not the catalogues'): " + r.written + (r.reading ? " = " + r.reading : "") + (r.why ? ". " + r.why : "")); });
    if (nl.length) b.push({ lab: "Names and other forms to search" }, { ul: nl });
    return b;
  }

  /* ---- the short case document: what the PDF and the .md carry for pictures read as documents ---------------------------------------
     One page or two: the map, tables (places, timeline, people, where to look, names to try) and each document beside its picture. The long
     per-document and per-place prose stays on the page; this is the part a person can take to a desk. */
  function host(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; } }
  function cut(t, n) { t = String(t || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : t; }
  function compactBlocks(m) {
    var c = m.cf && !m.cf.unparsed ? m.cf : null, L = m.layer, T = (L && L.tree) || {}, b = [];
    var who = ((T.focus || [])[0] || {}).name;
    b.push({ h: 1, t: who ? "Case file: " + who : "Case file" },
      { p: m.docs.length + (m.docs.length === 1 ? " document" : " documents") + " · prepared " + m.today + " with Record Atlas", cls: "meta" });
    if (c && c.headline && String(c.headline).length > 11) b.push({ p: c.headline, cls: "lead" });
    if (c) (c.groups || []).forEach(function (g) {
      b.push({ p: "Same person across documents " + (g.docs || []).join(", ") + "? " + (g.verdict || "not given") + " — a hypothesis, not proof.", cls: "verdict" });
      if ((g.because || []).length) b.push({ ul: g.because.slice(0, 4).map(function (x) { return cut(x, 140); }) });
    });
    if (L && (L.stops || []).length) {
      b.push({ h: 2, t: "Journey" });
      if (L.svg) b.push({ svg: L.svg, cap: "Positions only; the dashed line follows the order of the dates, not the route." });
      b.push({ tbl: { head: ["", "Place", "When", "Whose ground", "Docs"], w: [4, 34, 14, 40, 8], rows: L.stops.map(function (s) {
        var g = (s.ground || []).filter(function (x) { return !x.none && x.polity; })[0];
        return [String(s.n), s.place ? s.place.name + ", " + s.place.country : s.text + " (not in the Atlas)", (s.years || []).join(", "), g ? g.polity : "", (s.docs || []).join(", ")];
      }) } });
    }
    if (c && (c.timeline || []).length) b.push({ h: 2, t: "Timeline" }, { tbl: { head: ["Date", "What", "Source"], w: [14, 70, 16], rows: c.timeline.map(function (t) {
      return [t.date || "?", (t.event || "") + (t.place ? " (" + t.place + ")" : ""), t.source || ""];
    }) } });
    var pr = [];
    [["focus", "Subject"], ["spouse", "Spouse"], ["parents", "Parent"], ["children", "Child"], ["others", "Other"]].forEach(function (k) {
      (T[k[0]] || []).forEach(function (p) { pr.push([p.name, k[1], (p.docs || []).join(", "), [p.born && "b. " + p.born, p.birthplace].filter(Boolean).join(", ")]); });
    });
    if (pr.length) b.push({ h: 2, t: "People" }, { tbl: { head: ["Name", "Role", "Docs", "Born"], w: [34, 18, 10, 38], rows: pr } });
    if (L && (L.start || []).length) b.push({ h: 2, t: "Where to look first" }, { tbl: { head: ["", "Where", "How", "Link"], w: [4, 32, 44, 20], rows: L.start.slice(0, 6).map(function (x, i) {
      return [String(i + 1), x.title, cut(x.how, 110), host(x.url)];
    }) } });
    if (L) {
      var rg = [];
      (L.stops || []).forEach(function (s) {
        var v = s.volumes || {}, rows = (v.cover && v.cover.length ? v.cover : v.near) || [];
        rows.slice(0, 2).forEach(function (x) { rg.push([s.place ? s.place.name : s.text, x.title, x.from + "–" + x.to + (v.cover && v.cover.length ? "" : " (nearest)"), x.held || ""]); });
      });
      if (rg.length) b.push({ h: 2, t: "Registers covering those years" }, { tbl: { head: ["Place", "Register", "Years", "Held at"], w: [18, 42, 18, 22], rows: rg.slice(0, 10) } });
    }
    var N = (L && L.names) || {}, nm = [];
    (N.surnames || []).forEach(function (x) { var f = x.family ? x.family.forms.slice(0, 6).map(function (y) { return y.form; }).join(", ") : ""; nm.push([x.written, "Surname", f || "none catalogued"]); });
    (N.given || []).forEach(function (g) { nm.push([g.written, "Given name", g.forms.slice(0, 6).map(function (f) { return f.form; }).join(", ")]); });
    (N.places || []).forEach(function (p) { if (p.atlas) nm.push([p.written, "Place", (p.then || []).concat(p.older || []).slice(0, 6).join(", ") || "none catalogued"]); });
    if (nm.length) b.push({ h: 2, t: "Names to try in an index" }, { tbl: { head: ["As written", "Kind", "Also try"], w: [26, 14, 60], rows: nm } });
    b.push({ h: 2, t: m.docs.length === 1 ? "The document" : "The documents" });
    m.docs.forEach(function (x) {
      var d = x.doc || {}, ln = list([d.date_on_document && "Dated " + d.date_on_document, (d.places_named || []).length && "Places: " + d.places_named.join("; "),
        d.what_it_is && cut(d.what_it_is, 220)]);
      (d.persons || []).slice(0, 4).forEach(function (p) {
        var det = p.details || {};
        ln.push((p.name_as_written || "") + (p.role ? " (" + p.role + ")" : "") + list([det.born && "b. " + det.born, det.birthplace, det.occupation]).map(function (t, i) { return (i ? ", " : ": ") + t; }).join(""));
      });
      b.push({ card: { t: "Document " + x.n + (d.doc_type ? ": " + d.doc_type : ""), img: m.withPics ? x.pic : "", cap: x.name || "", lines: ln } });
    });
    if (c && (c.next_steps || []).length) b.push({ h: 2, t: "Look for next" }, { tbl: { head: ["Look for", "Where", "Search with"], w: [34, 28, 38], rows: c.next_steps.slice(0, 6).map(function (x) { return [cut(x.look_for, 90), x.where || "", x.search_with || ""]; }) } });
    if (c && (c.conflicts || []).length) b.push({ h: 2, t: "To settle" }, { ul: c.conflicts.slice(0, 6).map(function (x) { return cut(x.issue + (x.how_to_settle ? " — " + x.how_to_settle : ""), 200); }) });
    b.push({ p: "Readings are drafts made by an AI; check them against the originals" + (m.withPics ? "" : ", which are not included") + ". Places, dates and names are leads, not findings.", cls: "fine" });
    return b;
  }

  var DEFAULT_GOAL = "Check the draft reading against the transcript, correct it, and say what I should look at next.";

  /* The prompt, for another AI or for a person. The entries come from the same blocks as the document, so the two cannot disagree. */
  function prompt(m, audience, goal) {
    var g = String(goal || "").trim() || DEFAULT_GOAL, mt = Object.assign({}, m, { withPics: false });
    var ent = toMarkdown(caseBlocks(mt).concat(atlasBlocks(mt), docBlocks(mt, 3), entryBlocks(mt, 3))), ctx = toMarkdown(contextBlocks(mt).slice(1));
    var close = "Prepared with Record Atlas (recordatlas.org). The draft readings were made by an AI and have not been checked by a person.";
    if (audience === "person") {
      return ["Hello,", "",
        "I would value a second pair of eyes on " + (m.many ? "these " + m.entries.length + " entries" : "this entry") + " from an old register. What I would like help with:", "", g, "",
        "Below is the transcript as I read it, a first draft reading (made by an AI, so please treat it with suspicion), and the words it was unsure of. " +
        "I have the original picture" + (m.many ? "s" : "") + " and can send " + (m.many ? "them" : "it") + " if that helps.",
        "", ctx ? "ABOUT THEM\n" + ctx : "", "THE ENTRIES", ent,
        "What would help most: whether the transcript is right, what each entry says, who is who, and where else to look. Please say which parts you are sure of and which are a guess.",
        "", "Thank you.", "", close].filter(function (x, i, a) { return x !== "" || a[i - 1] !== ""; }).join("\n");
    }
    return ["You are helping with family-history research. Below is a handover from Record Atlas: " + (m.many ? m.entries.length + " entries" : "one entry") +
      " from old parish or civil registers, the transcript as read from the page, a first-draft reading made by an AI, and the words that draft was unsure of.",
      "", "YOUR TASK", g, "",
      "RULES",
      "- The transcript may contain misreadings. If I have attached the original image, read it yourself and tell me where the transcript is wrong.",
      "- Everything labelled \"draft\" is unverified. Do not treat it as a finding.",
      "- Do not invent people, dates, places or relationships. Say \"I infer\" when you infer, and \"unknown\" when it is unknown.",
      "- The same name spelt the same way in two entries is a lead, not proof of one person.",
      "- If an entry may concern someone living, do not look them up or speculate about them.",
      "", ctx ? "CONTEXT\n" + ctx : "", "ENTRIES", ent,
      "WHAT I WANT BACK",
      "1. A corrected reading of each entry, with every word you changed and why.",
      "2. Where you disagree with the draft.",
      "3. Questions I should answer, and what to check on the original image.",
      "4. The next records to look at: the kind of register, the years, the place, and spellings of the names worth searching.",
      "5. Keep three things apart: what the entry says, what you infer, and what is unknown.",
      "", close].filter(function (x, i, a) { return x !== "" || a[i - 1] !== ""; }).join("\n");
  }

  function document_(m, audience, goal, opts) {
    if (m.docs.length) {
      var cb = compactBlocks(m);
      if (m.entries.length) cb = cb.concat(summaryBlocks(m), [{ h: 2, t: m.many ? "The entries" : "The entry" }], entryBlocks(m, 3));
      if (!(opts && opts.pdf)) cb.push({ h: 2, t: "Prompt to hand this on", brk: true },
        { p: audience === "person" ? "A note to send with this document:" : "Paste this into another AI assistant, and attach the original pictures if it accepts them:" },
        { pre: prompt(m, audience, goal) });
      return cb;
    }
    var b = [{ h: 1, t: "Record handover" },
      { p: "Prepared " + m.today + " with Record Atlas (recordatlas.org). " + (m.docs.length ? m.docs.length + " document" + (m.docs.length === 1 ? "" : "s") + " read from pictures" + (m.entries.length ? ", and " : ".") : "") +
        (m.entries.length ? (m.many ? m.entries.length + " entries" : "one entry") + " from old registers, with a draft reading." : "") }];
    b = b.concat(contextBlocks(m), caseBlocks(m), atlasBlocks(m));
    if (m.docs.length) b.push({ h: 2, t: m.docs.length === 1 ? "The document" : "The documents" }), b = b.concat(docBlocks(m, 3));
    if (m.entries.length) b = b.concat(summaryBlocks(m), [{ h: 2, t: m.many ? "The entries" : "The entry" }], entryBlocks(m, 3));
    var np = m.docs.length + m.entries.length > 1;
    b.push({ h: 2, t: "What is not in this document" },
      { p: m.withPics ? "The picture" + (np ? "s are" : " is") + " included above as shrunk copies, with their hidden data removed. Whoever takes this on should still look at the original" + (np ? "s" : "") + ": a reading can be wrong."
        : "The original picture" + (np ? "s are" : " is") + " not included. They stay on the reader's device. A reading can be wrong, so whoever takes this on should look at the image itself." },
      { p: "Draft readings are made by an AI and are leads to check against the page, not findings. Nothing here is a documented person." });
    b.push({ h: 2, t: "Prompt to hand this on", brk: true },
      { p: audience === "person" ? "A note to send with this document:" : "Paste this into another AI assistant, and attach the original picture" + (m.many ? "s" : "") + " if it accepts them:" },
      { pre: prompt(m, audience, goal) });
    return b;
  }

  function toMarkdown(blocks) {
    var o = [];
    blocks.forEach(function (x) {
      if (x.h) o.push("#".repeat(x.h) + " " + x.t, "");
      else if (x.lab) o.push("**" + x.lab + "**", "");
      else if (x.p != null) o.push(x.p, "");
      else if (x.ul) { x.ul.forEach(function (i) { o.push("- " + i); }); o.push(""); }
      else if (x.pre != null) { o.push("```", x.pre, "```", ""); }
      else if (x.img) { o.push("![" + (x.cap || "picture") + "](data:image/jpeg;base64," + x.img + ")", ""); }
      else if (x.tbl) {
        var row = function (r) { return "| " + r.map(function (c) { return String(c == null ? "" : c).replace(/\|/g, "/"); }).join(" | ") + " |"; };
        o.push(row(x.tbl.head), row(x.tbl.head.map(function () { return "---"; })));
        x.tbl.rows.forEach(function (r) { o.push(row(r)); }); o.push("");
      }
      else if (x.card) {
        o.push("### " + x.card.t, "");
        if (x.card.img) o.push("![" + (x.card.cap || "picture") + "](data:image/jpeg;base64," + x.card.img + ")", "");
        x.card.lines.forEach(function (l) { o.push("- " + l); }); o.push("");
      }
    });
    return o.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }

  var CSS = "@page{size:A4;margin:18mm 16mm}*{box-sizing:border-box}body{font:10pt/1.45 Georgia,'Times New Roman',serif;color:#1d2a2e;margin:0}" +
    "h1{font-size:20pt;margin:0 0 4pt;color:#245565}h2{font-size:14pt;margin:18pt 0 4pt;border-bottom:1px solid #b9c5c9;padding-bottom:2pt;color:#245565}" +
    "h3{font-size:12pt;margin:12pt 0 3pt}.lab{font:600 8.5pt/1.4 Helvetica,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#52666c;margin:8pt 0 2pt}" +
    "p{margin:0 0 6pt}ul{margin:0 0 6pt;padding-left:16pt}li{margin:0 0 2pt}pre{white-space:pre-wrap;word-wrap:break-word;font:10pt/1.45 Menlo,Consolas,monospace;background:#f3f1ec;border:1px solid #d9d4c7;border-radius:3pt;padding:7pt 9pt;margin:0 0 8pt}" +
    "figure{margin:6pt 0 10pt;break-inside:avoid}figure img{max-width:100%;max-height:150mm;border:1px solid #d9d4c7}figcaption{font:8.5pt Helvetica,Arial,sans-serif;color:#52666c}.brk{break-before:page}h3,.lab{break-after:avoid}pre,li{break-inside:avoid-page}" +
    "table{width:100%;border-collapse:collapse;margin:2pt 0 10pt;font:9pt/1.35 Helvetica,Arial,sans-serif;table-layout:fixed}th{text-align:left;font-weight:600;font-size:7.5pt;letter-spacing:.08em;text-transform:uppercase;color:#52666c;border-bottom:1.5px solid #245565;padding:3pt 5pt 3pt 0}" +
    "td{padding:3.5pt 5pt 3.5pt 0;border-bottom:1px solid #e3e0d6;vertical-align:top;overflow-wrap:anywhere}tr{break-inside:avoid}td:first-child{color:#52666c}" +
    ".meta{font:9pt Helvetica,Arial,sans-serif;color:#52666c;margin:0 0 10pt}.lead{font-size:13pt;line-height:1.35;margin:0 0 8pt}.verdict{font:600 10pt Helvetica,Arial,sans-serif;background:#e4eef0;border-left:3pt solid #245565;padding:5pt 8pt;margin:0 0 4pt}.fine{font:8.5pt Helvetica,Arial,sans-serif;color:#52666c;margin-top:14pt}" +
    "figure img[src^='data:image/svg']{width:100%;max-height:none;border:0}.card{display:flex;gap:12pt;align-items:flex-start;margin:0 0 10pt;break-inside:avoid;border-top:1px solid #d9d4c7;padding-top:8pt}.card img{width:52mm;max-height:60mm;object-fit:contain;border:1px solid #d9d4c7;flex:none}.card h3{margin:0 0 3pt;font-size:11pt}.card ul{margin:0;padding-left:13pt;font-size:9.5pt}.card li{margin:0 0 2pt}";

  /* Draw the blocks into a document with DOM calls only. */
  function toDom(doc, root, blocks) {
    blocks.forEach(function (x) {
      var e;
      if (x.h) { e = doc.createElement("h" + x.h); e.textContent = x.t; if (x.brk) e.className = "brk"; }
      else if (x.lab) { e = doc.createElement("p"); e.className = "lab"; e.textContent = x.lab; }
      else if (x.p != null) { e = doc.createElement("p"); e.textContent = x.p; if (x.cls) e.className = x.cls; }
      else if (x.tbl) {
        e = doc.createElement("table"); var th = doc.createElement("thead"), tr = doc.createElement("tr");
        x.tbl.head.forEach(function (h, i) { var c = doc.createElement("th"); c.textContent = h; if (x.tbl.w) c.style.width = x.tbl.w[i] + "%"; tr.appendChild(c); }); th.appendChild(tr); e.appendChild(th);
        var tb = doc.createElement("tbody");
        x.tbl.rows.forEach(function (r) { var q = doc.createElement("tr"); r.forEach(function (v) { var c = doc.createElement("td"); c.textContent = v == null ? "" : v; q.appendChild(c); }); tb.appendChild(q); }); e.appendChild(tb);
      }
      else if (x.card) {
        e = doc.createElement("div"); e.className = "card";
        if (x.card.img) { var ci = doc.createElement("img"); ci.src = "data:image/jpeg;base64," + x.card.img; ci.alt = x.card.cap || "picture"; e.appendChild(ci); }
        var cb = doc.createElement("div"), ch = doc.createElement("h3"); ch.textContent = x.card.t; cb.appendChild(ch);
        var cu = doc.createElement("ul"); x.card.lines.forEach(function (l) { var li = doc.createElement("li"); li.textContent = l; cu.appendChild(li); }); cb.appendChild(cu); e.appendChild(cb);
      }
      else if (x.ul) { e = doc.createElement("ul"); x.ul.forEach(function (i) { var li = doc.createElement("li"); li.textContent = i; e.appendChild(li); }); }
      else if (x.pre != null) { e = doc.createElement("pre"); e.textContent = x.pre; }
      else if (x.svg) { e = doc.createElement("figure"); var sv = doc.createElement("img"); sv.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(x.svg); sv.alt = x.cap || "map"; e.appendChild(sv);
        var sc = doc.createElement("figcaption"); sc.textContent = x.cap || ""; e.appendChild(sc); }
      else if (x.img) { e = doc.createElement("figure"); var im = doc.createElement("img"); im.src = "data:image/jpeg;base64," + x.img; im.alt = x.cap || "picture"; e.appendChild(im);
        var fc = doc.createElement("figcaption"); fc.textContent = x.cap || ""; e.appendChild(fc); }
      if (e) root.appendChild(e);
    });
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { sections: sections, model: model, prompt: prompt, document: document_, toMarkdown: toMarkdown, entryBlocks: entryBlocks, docBlocks: docBlocks, caseBlocks: caseBlocks, atlasBlocks: atlasBlocks, DEFAULT_GOAL: DEFAULT_GOAL };
  if (typeof document === "undefined") return;

  var done = Object.create(null), pics = {}, docs = [], cfile = null, layer = null;
  function el(tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }

  function boot() {
    var host = document.getElementById("ask-hand"), text = document.getElementById("ask-text"), where = document.getElementById("ask-where");
    if (!host || !text) return;
    var built = false, aud, goal, ta, said, withPics;

    function current() {
      return model(text.value, done, window.raAtlasFacts || null, where ? where.value : "", null,
        { docs: docs, cf: cfile, pics: pics, withPics: !!(withPics && withPics.checked), layer: layer });
    }
    function refresh() { if (!built) return; var m = current(); ta.value = prompt(m, aud.value, goal.value); }
    function say(t) { said.textContent = t || ""; }

    function build() {
      built = true; host.textContent = "";
      var c = el("div", null, "rr-card hd-card");
      c.append(el("h3", "Hand it over"),
        el("p", "Everything above as one file, or a prompt for a person or another AI. Made here; nothing is sent anywhere.", "cap"));
      var row = el("p", null, "hd-row");
      aud = el("select"); aud.setAttribute("aria-label", "Who the prompt is for");
      [["ai", "For another AI assistant"], ["person", "For a person (a note to send with it)"]].forEach(function (o) { var op = el("option", o[1]); op.value = o[0]; aud.append(op); });
      goal = el("input"); goal.type = "text"; goal.maxLength = 300; goal.spellcheck = false; goal.setAttribute("aria-label", "What should they work out");
      goal.placeholder = "What should they work out? (optional)";
      row.append(aud, goal); c.append(row);
      var pl = el("label", null, "hd-pics"); withPics = el("input"); withPics.type = "checkbox"; withPics.checked = true;
      pl.append(withPics, document.createTextNode(" Include the pictures (shrunk, hidden data removed)"));
      c.append(el("p", null, "")); c.lastChild.append(pl);
      var btns = el("p", null, "ask-row");
      var bc = el("button", "Copy the prompt", "chip ask-btn"), bp = el("button", "Save as PDF", "chip ask-btn"), bm = el("button", "Download as text (.md)", "chip ask-btn");
      [bc, bp, bm].forEach(function (b) { b.type = "button"; btns.append(b); });
      c.append(btns);
      said = el("p", null, "cap"); said.setAttribute("role", "status"); said.setAttribute("aria-live", "polite"); c.append(said);
      var det = el("details", null, "hd-det"); det.append(el("summary", "See the prompt"));
      ta = el("textarea", null, "hd-prompt"); ta.readOnly = true; ta.rows = 12; ta.setAttribute("aria-label", "The prompt"); det.append(ta); c.append(det);
      c.append(el("p", "Leave out anyone who may be alive before you share it.", "cap"));
      host.append(c);

      aud.addEventListener("change", refresh); goal.addEventListener("input", refresh);
      withPics.addEventListener("change", function () { say(withPics.checked ? "The pictures will be in the saved file." : "The saved file will not include the pictures."); });
      bc.addEventListener("click", function () {
        refresh();
        function fallback() { det.open = true; ta.focus(); ta.select(); say("Selected: press Ctrl+C (or ⌘C) to copy."); }
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(function () { say("Copied. Paste it into the other assistant, or into a message."); }, fallback); else fallback();
      });
      bm.addEventListener("click", function () {
        var m = current(), md = toMarkdown(document_(m, aud.value, goal.value));
        var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" })); a.download = "record-handover-" + m.today + ".md";
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
        say("Saved as " + a.download + ".");
      });
      bp.addEventListener("click", function () {
        var m = current(), f = document.createElement("iframe");
        f.setAttribute("aria-hidden", "true"); f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
        document.body.appendChild(f);
        var d = f.contentDocument; d.open(); d.write("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Record handover</title></head><body></body></html>"); d.close();
        var st = d.createElement("style"); st.textContent = CSS; d.head.appendChild(st);
        toDom(d, d.body, document_(m, aud.value, goal.value, { pdf: true }));
        say("Your print window is open: choose “Save as PDF” as the destination.");
        setTimeout(function () { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { say("This browser would not open the print window. Use Download as text instead."); } setTimeout(function () { f.remove(); }, 60000); }, 150);
      });
      refresh();
    }

    window.raHandover = {
      /* called by the reader after each draft: remember it against the exact text it was made for */
      note: function (txt, resp, lang) { done[String(txt).trim()] = { res: resp, lang: lang || "" }; },
      /* the shrunk copy of picture n (the Picture N line in the box), kept in memory only, to go into the saved file if the reader leaves the box ticked */
      picture: function (n, b64) { pics[n] = b64; },
      /* documents read whole: [{ n, name, pic, doc }], and the case file made from them (or null) */
      documents: function (list, cf) { docs = list || []; cfile = cf || null; },
      /* the Atlas page drawn for those documents (case-atlas.js), or null */
      atlas: function (l) { layer = l || null; if (built) refresh(); },
      /* called after any read: show the card, and keep it current */
      open: function () { if (!built) build(); else refresh(); host.hidden = false; }
    };
    text.addEventListener("input", refresh); if (where) where.addEventListener("input", refresh);
    document.addEventListener("ra-ask-read", function () { setTimeout(refresh, 600); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
