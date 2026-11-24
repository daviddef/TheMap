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
    var re = [/\b(?:[Mm]y|[Oo]ur)\s+(?:[a-z]+(?:-[a-z]+)*\s+){1,2}?(\p{Lu}[\p{L}'\u2019-]{2,})/u, /\b[Tt]he\s+(\p{Lu}[\p{L}'\u2019-]{2,})\s+family\b/u, /\bsurname(?:d)?\s+(?:was\s+|is\s+)?(\p{Lu}[\p{L}'\u2019-]{2,})/u];
    for (var i = 0; i < re.length; i++) {
      var m = re[i].exec(text); if (!m) continue;
      var w = m[1], f = w.toLowerCase();
      if (skip.test(w) || folds[f] || (o && o.place && o.place(w))) continue;
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

  var api = { gaps: gaps, append: append, clue: gaps.clue, answer: answer };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.raStoryGaps = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
