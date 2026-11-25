/* WHAT IS STILL MISSING FROM A STORY, ASKED AS YOU TYPE. David, on the two story pages: «confusingly similar and wordy ... keep /read/#story, merge into one place, and as we
   type we prompt for gaps». The old sentence page asked six questions up front whether or not they mattered. This asks only the ones this story has not answered, in the order
   that unlocks the most records, three at a time.

   Rules, not AI: each gap is a plain test on what the story reader (story-engine.js parseStory) found and on the words typed. Nothing is looked up, sent or guessed; a gap is a
   question, and the answer is the reader's own words. A tap adds the start of a sentence to the box for them to finish. Nothing here asks about anybody who may be alive
   (the page's own fine print says so), and no gap is ever filled in for the reader.

   A classic script: window.raStoryGaps, and module.exports for the tests. */
(function (root) {
  "use strict";
  var FEMALE = /^(?:mother|grandmother|great-grandmother|great-great-grandmother|aunt|wife|sister|daughter)$/;
  var MAIDEN = /\b(?:n[ée]e|maiden|born [A-Z]|before (?:she |they )?married|birth name|her family name|girl(?:hood)? name)\b/;
  var FAITH = /\b(?:catholic|orthodox|jewish|jew|muslim|protestant|lutheran|calvinist|reformed|greek|uniate|baptis|christen|synagogue|mosque|church|parish|priest|rabbi|faith|religio)/i;
  var SHIP = /\b(?:ship|sailed|steamer|steamship|boat|port|ellis island|liverpool|hamburg|bremen|le havre|naples|genoa|trieste|rijeka|fiume|passage|crossing|passenger)\b/i;
  var DEATH = /\b(?:died|death|buried|burial|funeral|passed away|grave|cemetery|killed|drowned|widow)/i;
  var FAMILY = /\b(?:married|wife|husband|spouse|children|son|daughter|kids|siblings|brother|sister|widow)\b/i;

  /* A SURNAME TOLD ON ITS OWN, which the story reader does not take as a name until a first name comes with it («my great-grandfather Kauzlarić», «the Kauzlarić family»).
     Seen only so the page does not ask «do you know their name?» of a story that has just said it; the first name is asked for instead, because with it the surname's
     spellings can be read. A capitalised word that is a place (o.place) or the place the story named is not one. */
  function surnameGuess(text, p, o) {
    var folds = {}, skip = /^(?:I|My|Our|He|She|They|The|We|His|Her|Their|It|All|Only|A|An|In|At|On|From|To|But|And)$/;
    ((p && p.stops) || []).forEach(function (s) { if (s.word) folds[String(s.word).toLowerCase()] = 1; });
    var re = [/\b(?:[Mm]y|[Oo]ur)\s+(?:[a-z]+(?:-[a-z]+)*\s+){1,2}?(\p{Lu}[\p{L}'\u2019-]{2,})/u, /\b[Tt]he\s+(\p{Lu}[\p{L}'\u2019-]{2,})\s+family\b/u, /\b[Ss]urname(?:d)?:?\s+(?:was\s+|is\s+)?(\p{Lu}[\p{L}'\u2019-]{2,})/u,
              /\b(?:maiden|birth|family|last)\s+name:?\s+(?:was\s+|is\s+)?(\p{Lu}[\p{L}'\u2019-]{2,})/u, /\bn[\u00e9e]e\s+(\p{Lu}[\p{L}'\u2019-]{2,})/u,
              /\b(?:[Oo]bitelj|[Pp]rezime|[Pp]orodica|[Ff]amiglia|[Cc]ognome|[Ff]amilia|[Aa]pellido|[Ff]amilie|[Nn]achname)\s+(\p{Lu}[\p{L}'\u2019-]{2,})/u,
              /^\s*(\p{Lu}[\p{L}'\u2019-]{2,})(?:[\s,]+\1)*[\s,:!?-]+(?:anyone|anybody|family|name|relatives|any\s)/u];
    for (var i = 0; i < re.length; i++) {
      var m = re[i].exec(text); if (!m) continue;
      var w = m[1], f = w.toLowerCase();
      if (skip.test(w) || folds[f]) continue;
      if (i === 0 && o && o.place && o.place(w)) continue;   /* only the loose «my … X» guess is vetoed by a place of that name; «surname X», «née X», «obitelj X» say it is one */
      return w;
    }
    return "";
  }

  /* Each gap: id, the question, a short why, the words added when it is tapped (or an action), and its order (lower is asked first). */
  function gaps(p, text, o) {
    o = o || {};
    p = p || {}; text = String(text || "");
    var out = [], stops = p.stops || [], route = p.route || [], has = function (re) { return re.test(text); };
    var told = (p.given || p.surname) ? "" : surnameGuess(text, p, o), named = !!(p.given || p.surname || told), hasPlace = stops.length > 0;
    var countryOnly = hasPlace && stops.every(function (s) { return s.isCountry; });
    var yearTold = p.left != null || p.born != null || stops.some(function (s) { return !!s.yearTold; });
    var add = function (id, order, ask, why, stub, action) { out.push({ id: id, order: order, ask: ask, why: why, add: stub || "", action: action || "" }); };

    if (!hasPlace) add("from", 10, "Where did they start?", "Name the village, parish or nearest town.", " They came from ");
    else if (countryOnly) add("village", 12, "Which village, or the nearest town?", "Records are kept by parish, not by country.", " The village was ");

    if (!named) add("name", 20, "Do you know their name?", "A surname alone is enough; the Atlas tries the other spellings.", " Their name was ");
    else if (told) add("given", 22, "What was their first name?", "With it the page can read the surname and try its spellings.", " Their first name was ");
    else if (!p.surname) add("surname", 21, "What was the surname?", "Spell it the way your family does.", " The surname was ");
    else if (!p.given) add("given", 22, "What was their first name?", "A nickname or short form is fine: Ivan, Johann and Giovanni are one name.", " Their first name was ");

    if (hasPlace && route.length < 2 && !countryOnly) add("to", 30, "Where did they go?", "Name the town they settled in: the other end of the journey.", " They went to ");
    if (!yearTold) add("when", 32, "Roughly when did they leave?", "A decade is enough. It decides whose records to search.", " They left around ");

    if (!p.rel && !(p.people || []).length && text.trim().length > 12) add("rel", 34, "Who are they to you?", "Grandparent, great-uncle, a name on a photo.", "They were my ");

    if ((p.holds === "story" || !p.holds) && !o.files) add("holds", 40, "Do you have a photo, document or letter?", "The writing on the back often names the place.", "", "photo");

    if (FEMALE.test(p.rel || "") && !has(MAIDEN)) add("maiden", 42, "What was her name before she married?", "Registers file a woman under her birth name.", " Her name before marriage was ");

    if (hasPlace && !has(FAITH)) add("faith", 50, "Which church or faith?", "The church kept the register, so it tells you which book.", " They were ");
    if (!has(FAMILY) && !(p.siblings || []).length && !(p.kin || []).length && (p.people || []).length < 2) add("family", 52, "Did they marry or have children?", "A spouse's name and where they married points to the marriage record.", " They married ");
    if (route.length > 1 && !has(SHIP)) add("ship", 54, "Do you know how they travelled?", "A ship or port. Passenger lists name the village.", " They sailed from ");
    if (!has(DEATH) && !(p.life && p.life.died)) add("end", 56, "Where and when did they die?", "A death entry names the parents.", " They died in ");

    out.sort(function (a, b) { return a.order - b.order; });
    return out;
  }

  /* The words a tap adds: onto a new sentence, never into the middle of one. */
  function append(text, stub) {
    text = String(text || "").replace(/\s+$/, "");
    if (!stub) return text;
    var lead = /^\s/.test(stub) ? stub.replace(/^\s+/, "") : stub;
    if (!text) return lead.replace(/^They /, "My ancestor ").replace(/^Their /, "My ancestor's ").replace(/^Her /, "Her ");
    return text + (/[.!?]$/.test(text) ? " " : ". ") + lead;
  }

  /* The clue each gap is, in two or three words, and what a reader might type into its small box. Only a hint of the shape of an answer, never a suggestion of a person. */
  var CLUE = {
    from: ["Where from", "a village, parish or town"], village: ["The village", "the village or nearest town"], name: ["A name", "a surname, or any name on the photo"],
    given: ["First name", "Ivan, Marija, a nickname"], surname: ["Surname", "spelled the way your family does"], to: ["Where to", "the town they settled in"],
    when: ["When", "a decade is enough: 1905, the 1920s"], rel: ["Who to you", "grandfather, great-aunt"], holds: ["The paper", ""], maiden: ["Birth name", "her name before she married"],
    faith: ["The church", "Catholic, Orthodox, Jewish"], family: ["Family", "who they married, and where"], ship: ["The crossing", "a ship, or a port like Trieste"], end: ["The end", "where and when, as far as you know"]
  };
  gaps.clue = function (id) { return CLUE[id] || [id, ""]; };

  /* THE SENTENCE AN INLINE ANSWER ADDS: the start of the sentence this clue's tap would add, finished with the words typed, and a full stop. */
  function answer(text, stub, value) {
    value = String(value || "").replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
    if (!value) return String(text || "");
    return append(text, (stub || "") + value + ".");
  }

  /* THE WORDS IN THE STORY THE PAGE HAS RECOGNISED, as spans to draw as tappable pills: a person's name, a place. David: «"my fathers name was ivan", can we flash/pill "ivan"
     and on tap show some things to ask? e.g. add his year of birth, death, etc.» Each span is found in the words as typed (case ignored), once, never overlapping another.
     Nothing here reads anything new: the names and places are the ones the reader already found. */
  var ROLE = { father: "your father", mother: "your mother", grandfather: "your grandfather", grandmother: "your grandmother", uncle: "your uncle", aunt: "your aunt", brother: "your brother", sister: "your sister", husband: "your husband", wife: "your wife", son: "your son", daughter: "your daughter" };
  function esc(w) { return String(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function tokens(text, p) {
    text = String(text || ""); p = p || {};
    var out = [], taken = [];
    function free(a, b) { return !taken.some(function (t) { return a < t[1] && b > t[0]; }); }
    function put(word, kind, name, label, ref) {
      word = String(word || "").trim(); if (word.length < 2) return;
      var m = new RegExp("(^|[^\\p{L}])(" + esc(word) + ")(?![\\p{L}])", "iu"), at = -1, hit;
      var re = new RegExp(m.source, "giu");
      while ((hit = re.exec(text))) { var st = hit.index + hit[1].length; if (free(st, st + word.length)) { at = st; break; } }
      if (at < 0) return;
      taken.push([at, at + word.length]); out.push({ start: at, end: at + word.length, kind: kind, name: name || word, label: label || "", ref: ref || "", word: text.slice(at, at + word.length) });
    }
    /* the same name twice (the story's person, and «my father» of the same name): the one with a relation is the one meant */
    var ppl = (p.people || []).slice().sort(function (x, y) { return (ROLE[y.role] ? 1 : 0) - (ROLE[x.role] ? 1 : 0); });
    ppl.forEach(function (pe) {
      if (!pe.name) return;
      var given = String(pe.name).split(/\s+/)[0], rel = pe.role === "self" ? (p.rel ? ROLE[p.rel] || "your " + String(p.rel).replace(/-/g, " ") : "") : pe.role === "spouse" ? "his or her partner" : pe.role === "child" ? "a child" : ROLE[pe.role] ? "the " + pe.role : "";
      var ref = pe.role === "self" && p.rel && !pe.me ? "my " + String(p.rel).replace(/-/g, " ") : (pe.role === "father" || pe.role === "mother") && !p.rel ? "my " + pe.role : "";
      if (ref) rel = "your " + ref.slice(3);
      put(pe.name, "person", given, rel, ref); if (!out.some(function (t) { return t.name === given && t.kind === "person"; })) put(given, "person", given, rel, ref);
    });
    (p.siblings || []).forEach(function (sb) { put(sb.name, "person", sb.name, (sb.label || sb.rel || "").replace(/^(?:his|her|their)\b/, "their")); });
    (p.others || []).forEach(function (o) { if (o && o.name) put(o.name, "person", String(o.name).split(/\s+/)[0], (o.poss ? o.poss.replace(/^(?:my|our)$/, "your") + " " : "") + (o.kin || "")); });
    (p.stops || []).forEach(function (st) { if (st.word && !st.isCountry) put(st.word, "place", st.word, ""); });
    out.sort(function (a, b) { return a.start - b.start; });
    return out;
  }
  /* WHAT CAN BE ADDED ABOUT A PERSON OR A PLACE: each is the start of a sentence in the person's own name, and what a reader might type to finish it. */
  var ABOUT_PERSON = [
    ["born", "Born", "was born in ", "a year, and where: 1951, Senj"], ["died", "Died", "died in ", "a year, and where"], ["married", "Married", "married ", "who, and when: Cheryl, 1980"],
    ["children", "Children", "had children: ", "names, or how many"], ["job", "Job", "worked as ", "a trade or a job"], ["moved", "Moved", "moved to ", "a town, and when"],
    ["faith", "Religion", "was ", "Catholic, Orthodox, Jewish, Lutheran"], ["travelled", "How they travelled", "travelled by ", "a ship, or a port like Trieste"],
    ["father", "His father", "'s father was ", "a name, and where from"], ["mother", "His mother", "'s mother was ", "a name, and where from"], ["siblings", "Brothers, sisters", "had brothers and sisters: ", "names, or how many"]
  ];
  var ABOUT_PLACE = [["when", "When", "{}: they were there in ", "a year or a decade"], ["what", "What happened", "In {}, ", "what they did, or what happened"], ["who", "Who else", "{}: others from the family there were ", "a name, then how they are related: Hedviga, cousin"]];
  /* WHAT THE STORY ALREADY SAYS ABOUT A PERSON OR A PLACE. David, looking at «Ivan · your father» with a Born pill after the story had said «my dad was born in 1951»: «if we already
     have his date of birth, etc, it should be checked off on the pill list / differently coloured.» Returns {optionId: detail} for each thing the words (and what the reader found in
     them) already tell, so the pill can be shown as told and the reader is not asked again. Rules on the words, never a guess: a pill is ticked only where the story says it.
     The person the story follows is read from the whole telling; anybody else (a sibling, another relative) only from the sentences that name them. */
  var K_BORN = /\b(?:born|birth|birthday|baptis\w*|christen\w*|b\.)\b/i, K_MARRIED = /\b(?:married|marry|wife|husband|spouse|wedding|wed|widow(?:er)?|partner|divorced)\b/i,
      K_CHILD = /\b(?:children|child|kids?|sons?|daughters?)\b/i, K_JOB = /\b(?:worked|works|working|job|occupation|trade|career|profession|farmer|fisherman|miner|carpenter|teacher|baker|blacksmith|sailor|soldier|priest|merchant|shopkeeper|nurse|doctor|engineer|labourer|laborer|clerk|tailor|shoemaker|butcher|builder|driver|mechanic|policeman|miller|weaver)\b/i,
      K_MOVED = /\b(?:moved|move|emigrated|migrated|immigrated|settled|relocated|came to|went to|left for|fled|arrived|returned)\b/i, K_FATHER = /\b(?:his|her|their)\s+(?:father|dad|papa)\b|\b(?:grandfather|grandpa)\b/i,
      K_MOTHER = /\b(?:his|her|their)\s+(?:mother|mum|mom|mama)\b|\b(?:grandmother|grandma|nana)\b/i, K_SIBS = /\b(?:brothers?|sisters?|siblings?)\b/i, K_YEAR = /\b(?:1[0-9]{3}|20[0-2][0-9])s?\b|\b(?:age|aged|years old|year old)\b/i;
  function sentencesOf(text) { return String(text || "").split(/(?<=[.!?])\s+|\n+/).filter(function (x) { return x.trim(); }); }
  function known(kind, tk, p, text) {
    p = p || {}; text = String(text || ""); tk = tk || {};
    var out = {}, name = String(tk.name || tk.word || "").toLowerCase(), all = sentencesOf(text);
    var named = name ? all.filter(function (x) { return x.toLowerCase().indexOf(name) > -1; }) : [];
    if (kind === "place") {
      /* a year, a decade or an age in a sentence that names the place */
      if (named.some(function (x) { return K_YEAR.test(x); })) out.when = "";
      return out;
    }
    var subject = !(p.people || []).length || (p.people || []).some(function (pe) { return pe && pe.role === "self" && String(pe.name || "").split(/\s+/)[0].toLowerCase() === name; });
    /* the teller's own sentences («I was born in …») are not the person's */
    var scope = subject ? all.filter(function (x) { return !/^\s*(?:i|we|i'm|i've|me)\b/i.test(x); }).join(" ") : named.join(" ");
    function yearNear(re) { var m = re.exec(scope); if (!m) return ""; var tail = scope.slice(m.index, m.index + 70).match(/\b(1[0-9]{3}|20[0-2][0-9])\b/); return tail ? tail[1] : ""; }
    if (K_BORN.test(scope) || (subject && p.born != null)) out.born = subject && p.born != null ? String(p.born) : yearNear(K_BORN);
    if (DEATH.test(scope) || (subject && p.life && p.life.died)) out.died = yearNear(DEATH);
    if (K_MARRIED.test(scope) || (subject && p.life && p.life.married > 0)) out.married = "";
    /* what a sentence says OF someone else's family («His brother Ante died») is that they are a relative, not that their own parents, children or siblings are told */
    if (subject && (K_CHILD.test(scope) || (p.kids || []).length)) out.children = "";
    if (K_JOB.test(scope) || (subject && ((p.life && (p.life.occupations || []).length) || (p.people || []).some(function (pe) { return pe && pe.role === "self" && pe.occupation; })))) out.job = "";
    if (K_MOVED.test(scope) || (subject && (p.route || []).length > 1)) out.moved = "";
    if (FAITH.test(scope)) out.faith = "";
    if (SHIP.test(scope)) out.travelled = "";
    if (subject && K_FATHER.test(scope)) out.father = "";
    if (subject && K_MOTHER.test(scope)) out.mother = "";
    if (subject && (K_SIBS.test(scope) || (p.siblings || []).length)) out.siblings = "";
    return out;
  }

  function about(kind) { return (kind === "place" ? ABOUT_PLACE : ABOUT_PERSON).map(function (x) { return { id: x[0], label: x[1], stub: x[2], ph: x[3] }; }); }
  /* the sentence one answer adds: «Ivan was born in 1951, Senj.» */
  function sentence(kind, name, opt, value) {
    value = String(value || "").replace(/\s+/g, " ").trim().replace(/[.!?]+$/, ""); if (!value) return "";
    var o = about(kind).filter(function (x) { return x.id === opt; })[0]; if (!o) return "";
    if (kind === "place" && opt === "who") {
      /* «Hedviga, cousin» or «cousin Hedviga» or «Hedviga»: said as a sentence the story reader takes as a person, «His cousin Hedviga lived in Senj.» */
      var KINS = "cousin|uncle|aunt|brother|sister|niece|nephew|relative|son|daughter", wm = new RegExp("^(\\p{Lu}[\\p{L}'\u2019-]+)(?:\\s*[,(-]\\s*(?:his |her |a |the )?(" + KINS + ")\\)?)?$", "iu").exec(value), wk = new RegExp("^(" + KINS + ")\\s+(\\p{Lu}[\\p{L}'\u2019-]+)$", "iu").exec(value);
      var nm = wm ? wm[1] : wk ? wk[2] : "", rel = wm ? (wm[2] || "relative") : wk ? wk[1] : "";
      if (nm) { nm = nm.charAt(0).toUpperCase() + nm.slice(1); return "His " + rel.toLowerCase() + " " + nm + " lived in " + name + "."; }
    }
    if (kind === "place") return o.stub.replace("{}", name) + value + ".";
    var who = String(name || ""); who = who.charAt(0).toUpperCase() + who.slice(1);   /* «my father» is «My father»: said of the person the story is about, the way the reader already understands it */
    return who + (/^'s /.test(o.stub) ? "" : " ") + o.stub + value + ".";
  }

  var api = { gaps: gaps, append: append, clue: gaps.clue, answer: answer, tokens: tokens, about: about, known: known, sentence: sentence };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.raStoryGaps = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
