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
      pics: (extra && extra.pics) || {}, withPics: !!(extra && extra.withPics)
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

  var DEFAULT_GOAL = "Check the draft reading against the transcript, correct it, and say what I should look at next.";

  /* The prompt, for another AI or for a person. The entries come from the same blocks as the document, so the two cannot disagree. */
  function prompt(m, audience, goal) {
    var g = String(goal || "").trim() || DEFAULT_GOAL, mt = Object.assign({}, m, { withPics: false });
    var ent = toMarkdown(caseBlocks(mt).concat(docBlocks(mt, 3), entryBlocks(mt, 3))), ctx = toMarkdown(contextBlocks(mt).slice(1));
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

  function document_(m, audience, goal) {
    var b = [{ h: 1, t: "Record handover" },
      { p: "Prepared " + m.today + " with Record Atlas (recordatlas.org). " + (m.docs.length ? m.docs.length + " document" + (m.docs.length === 1 ? "" : "s") + " read from pictures" + (m.entries.length ? ", and " : ".") : "") +
        (m.entries.length ? (m.many ? m.entries.length + " entries" : "one entry") + " from old registers, with a draft reading." : "") }];
    b = b.concat(contextBlocks(m), caseBlocks(m));
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
    });
    return o.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }

  var CSS = "@page{size:A4;margin:18mm 16mm}*{box-sizing:border-box}body{font:11pt/1.5 Georgia,'Times New Roman',serif;color:#1d2a2e;margin:0}" +
    "h1{font-size:22pt;margin:0 0 4pt;color:#245565}h2{font-size:14pt;margin:18pt 0 4pt;border-bottom:1px solid #b9c5c9;padding-bottom:2pt;color:#245565}" +
    "h3{font-size:12pt;margin:12pt 0 3pt}.lab{font:600 8.5pt/1.4 Helvetica,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#52666c;margin:8pt 0 2pt}" +
    "p{margin:0 0 6pt}ul{margin:0 0 6pt;padding-left:16pt}li{margin:0 0 2pt}pre{white-space:pre-wrap;word-wrap:break-word;font:10pt/1.45 Menlo,Consolas,monospace;background:#f3f1ec;border:1px solid #d9d4c7;border-radius:3pt;padding:7pt 9pt;margin:0 0 8pt}" +
    "figure{margin:6pt 0 10pt;break-inside:avoid}figure img{max-width:100%;max-height:150mm;border:1px solid #d9d4c7}figcaption{font:8.5pt Helvetica,Arial,sans-serif;color:#52666c}.brk{break-before:page}h3,.lab{break-after:avoid}pre,li{break-inside:avoid-page}";

  /* Draw the blocks into a document with DOM calls only. */
  function toDom(doc, root, blocks) {
    blocks.forEach(function (x) {
      var e;
      if (x.h) { e = doc.createElement("h" + x.h); e.textContent = x.t; if (x.brk) e.className = "brk"; }
      else if (x.lab) { e = doc.createElement("p"); e.className = "lab"; e.textContent = x.lab; }
      else if (x.p != null) { e = doc.createElement("p"); e.textContent = x.p; }
      else if (x.ul) { e = doc.createElement("ul"); x.ul.forEach(function (i) { var li = doc.createElement("li"); li.textContent = i; e.appendChild(li); }); }
      else if (x.pre != null) { e = doc.createElement("pre"); e.textContent = x.pre; }
      else if (x.img) { e = doc.createElement("figure"); var im = doc.createElement("img"); im.src = "data:image/jpeg;base64," + x.img; im.alt = x.cap || "picture"; e.appendChild(im);
        var fc = doc.createElement("figcaption"); fc.textContent = x.cap || ""; e.appendChild(fc); }
      if (e) root.appendChild(e);
    });
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { sections: sections, model: model, prompt: prompt, document: document_, toMarkdown: toMarkdown, entryBlocks: entryBlocks, docBlocks: docBlocks, caseBlocks: caseBlocks, DEFAULT_GOAL: DEFAULT_GOAL };
  if (typeof document === "undefined") return;

  var done = Object.create(null), pics = {}, docs = [], cfile = null;
  function el(tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }

  function boot() {
    var host = document.getElementById("ask-hand"), text = document.getElementById("ask-text"), where = document.getElementById("ask-where");
    if (!host || !text) return;
    var built = false, aud, goal, ta, said, withPics;

    function current() {
      return model(text.value, done, window.raAtlasFacts || null, where ? where.value : "", null,
        { docs: docs, cf: cfile, pics: pics, withPics: !!(withPics && withPics.checked) });
    }
    function refresh() { if (!built) return; var m = current(); ta.value = prompt(m, aud.value, goal.value); }
    function say(t) { said.textContent = t || ""; }

    function build() {
      built = true; host.textContent = "";
      var c = el("div", null, "rr-card hd-card");
      c.append(el("h3", "Hand it over"),
        el("p", "Bring the pictures, the readings, the case file and the place facts together as one document, with a prompt so another person or another AI can carry on. " +
          "Nothing is sent anywhere: these are made here, from what is on this page.", "cap"));
      var row = el("p", null, "hd-row");
      aud = el("select"); aud.setAttribute("aria-label", "Who the prompt is for");
      [["ai", "For another AI assistant"], ["person", "For a person (a note to send with it)"]].forEach(function (o) { var op = el("option", o[1]); op.value = o[0]; aud.append(op); });
      goal = el("input"); goal.type = "text"; goal.maxLength = 300; goal.spellcheck = false; goal.setAttribute("aria-label", "What should they work out");
      goal.placeholder = "What should they work out? (optional, e.g. who the godparents were, or where to look for the marriage)";
      row.append(aud, goal); c.append(row);
      var pl = el("label", null, "hd-pics"); withPics = el("input"); withPics.type = "checkbox"; withPics.checked = true;
      pl.append(withPics, document.createTextNode(" Include the pictures in the saved PDF and text file (shrunk copies, with their hidden data removed)"));
      c.append(el("p", null, "")); c.lastChild.append(pl);
      var btns = el("p", null, "ask-row");
      var bc = el("button", "Copy the prompt", "chip ask-btn"), bp = el("button", "Save as PDF", "chip ask-btn"), bm = el("button", "Download as text (.md)", "chip ask-btn");
      [bc, bp, bm].forEach(function (b) { b.type = "button"; btns.append(b); });
      c.append(btns);
      said = el("p", null, "cap"); said.setAttribute("role", "status"); said.setAttribute("aria-live", "polite"); c.append(said);
      var det = el("details", null, "hd-det"); det.append(el("summary", "See the prompt"));
      ta = el("textarea", null, "hd-prompt"); ta.readOnly = true; ta.rows = 12; ta.setAttribute("aria-label", "The prompt"); det.append(ta); c.append(det);
      c.append(el("p", "Before you share it: the document holds whatever is in the box. Leave out anyone who may be alive.", "cap"));
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
        toDom(d, d.body, document_(m, aud.value, goal.value));
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
      /* called after any read: show the card, and keep it current */
      open: function () { if (!built) build(); else refresh(); host.hidden = false; }
    };
    text.addEventListener("input", refresh); if (where) where.addEventListener("input", refresh);
    document.addEventListener("ra-ask-read", function () { setTimeout(refresh, 600); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
