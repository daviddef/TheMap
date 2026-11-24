/* WHO IS WHOSE PARENT, SAID THE WAY PEOPLE SAY IT. David, with a story told as a post tells it:
     «my father ivan comes from senj, croatia. he married my mother in 1980. he was born in 1951 to ivan and hedviga. hedviga was from senj, but ivan was from crikvenica.
      my grandfather ivan was born in 1925.»
   The story reader (story-engine.js) understands «his father ivan was from crikvenica», and does not understand «he was born in 1951 to ivan and hedviga»: it read «to ivan» as a
   journey to a village called Ivan, lost the grandparents, and gave the father his grandfather's birth year. This turns the loose ways of naming parents into the explicit
   wording the reader already handles, before it reads, and the page shows the writer exactly how their words were read, so nothing is hidden:

     «he was born in 1951 to ivan and hedviga»                   ->  «he was born in 1951.» and «his father ivan ...», «his mother hedviga ...»
     «hedviga was from senj, but ivan was from crikvenica»       ->  what is said of each parent is joined to that parent
     «my grandfather ivan was born in 1925» (his father is Ivan)  ->  the same parent, not a third Ivan

   Rules, not AI: a pattern on the words, nothing looked up, no fact added. A name is never given a fact the writer did not say about it; where this cannot tell who is meant it
   changes nothing. A classic script: window.raStoryKin, and module.exports for the tests. */
(function (root) {
  "use strict";
  var KIN = "father|mother|grandfather|grandmother|uncle|aunt|brother|sister|husband|wife|son|daughter|great-grandfather|great-grandmother|great grandfather|great grandmother";
  var MALE = /^(?:father|grandfather|uncle|brother|husband|son|great[- ]grandfather)$/i;
  var NOTNAME = /^(?:the|a|an|his|her|my|our|their|two|three|four|parents|wife|husband|mother|father|him|them|us|me|and|or|but|to|of|in|at|on|from|who|whom|that|this|one|each|both|all|go|see|be|have|do|get)$/i;
  /* three-letter names are not in the given-name map the page loads (names under four letters are left out of it); these are common enough, after a word like wife or sister, to be names */
  var SHORT = /^(?:ada|ann|amy|eva|ina|ida|ema|ivo|ivy|joe|tom|tim|sam|ben|dan|jim|bob|ted|ray|roy|ian|leo|max|pat|kim|sue|zoe|una|mia|ela|eli|rob|ana|ivi|jan|jon|kay|liz|meg|nan|pam|ron|stu|viv|win|lou|abe|ned|hal|gus|les|len|bea|dot|flo|fay|joy|mae|may|ola|ora|ria|sia|tea|tia|uma|vic|zan|zac)$/i;
  var NOTVERB = /^(?:born|died|came|left|lived|moved|married|was|were|had|has|have|still|also|then|later|too|now|ever|never|never|always|stayed|went|sailed|arrived|worked|passed|raised|brought|said|told|says|did|does|got|would|could|will|can|may|just|only|very|really|here|there|where|when|while|after|before|since|until|because|though|although|about|around|over|under|into|onto|with|without|for|by|as|if|so|not|no|yes|old|young|dead|alive|gone|well|good|sick|ill|poor|rich)$/i;
  var NAME = "([\\p{L}][\\p{L}'\\u2019-]{1,})";
  /* names that end in a and are men's (Croatian and neighbours): the common ones; any other name in -a, -e, -ica, -ina, -ka is taken as a woman's */
  var MASC_A = /^(?:luka|nikola|ilija|toma|sava|jura|andrija|mirza|kosta|bora|vuka|jovica|kuzma|žarko|zarko|joša|josa|ante|tonći|tonci)$/i;
  function fem(n) { n = String(n || "").toLowerCase(); return !MASC_A.test(n) && /(?:a|e|ica|ina|ka)$/.test(n); }
  /* the same name, allowing one slipped letter in a name of five or more ("hedvga" for Hedviga): typing is not spelling */
  function same(a, b) {
    a = String(a).toLowerCase(); b = String(b).toLowerCase(); if (a === b) return true;
    if (a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 1 || a.charAt(0) !== b.charAt(0)) return false;
    var i = 0; while (i < a.length && i < b.length && a.charAt(i) === b.charAt(i)) i++;
    if (i >= Math.min(a.length, b.length) - (a.length === b.length ? 1 : 0)) return false;   /* a different last letter is a different name (Josip, Josipa; Marko, Marka) */
    if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);                 /* one letter changed */
    return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);   /* one letter missing */
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function sentences(text) {
    var out = [], re = /[^.!?\n]+(?:[.!?]+|\n|$)\s*/g, m;
    while ((m = re.exec(String(text || "")))) out.push(m[0]);
    return out;
  }
  function nameOk(w, isGiven) { return !!w && w.length > 1 && !NOTNAME.test(w) && (isGiven(w) || /^\p{Lu}/u.test(w)); }

  /* rewrite(text, isGiven) -> { text, changed, notes: [what was understood, in words] } */
  function rewrite(text, isGiven) {
    isGiven = isGiven || function () { return false; };
    var src = sentences(text), out = [], notes = [], subj = null, regs = [], changed = false;
    function lastSubjectPoss() { return !subj ? "" : subj.self ? "my" : MALE.test(subj.kin) ? "his" : "her"; }

    src.forEach(function (raw) {
      var s = raw, trail = (s.match(/\s*$/) || [""])[0], body = s.slice(0, s.length - trail.length), m;

      /* A NAME TYPED IN LOWER CASE AFTER THE WORD FOR WHAT THEY ARE: «his wife was cheryl», «a sister ada». The reader takes a name from a capital or from the given
         names it knows; a name this page knows (isGiven) and that stands straight after wife, brother, sister ... gets its capital, and the page says so. */
      var capNotes = [];
      body = body.replace(new RegExp("\\b(" + KIN + ")(\\s+(?:(?:was|is|called|named|were)\\s+)?)(\\p{Ll}[\\p{L}'\u2019-]{2,})(?![\\p{L}'\u2019-])", "giu"), function (all, kin, mid, w) {
        if (w.charAt(0) === w.charAt(0).toUpperCase() || NOTNAME.test(w) || NOTVERB.test(w) || !(isGiven(w) || SHORT.test(w))) return all;
        capNotes.push(w); return kin + mid + cap(w);
      });
      if (capNotes.length) { s = body + trail; changed = true; notes.push("«" + capNotes.join("», «") + "» written with a capital: " + (capNotes.length === 1 ? "a name" : "names") + " after " + (capNotes.length === 1 ? "the word for who they are" : "the words for who they are") + "."); }

      /* WHO THE SENTENCE IS ABOUT: «my father ivan ...», «my mother ...», «I was ...»; he and she keep the last */
      if ((m = /^\s*(?:(?:and|but|so|also)\s+)?my\s+(?:great[- ])?(father|mother)\b(?:\s+(\p{L}[\p{L}'’-]*))?/iu.exec(body))) {
        var nm = m[2] && !/^(?:was|is|comes|came|had|has|were|born|married|died|left|lived|moved|and|who|from|in|at|to)$/i.test(m[2]) && (isGiven(m[2]) || /^\p{Lu}/u.test(m[2])) ? m[2] : "";
        subj = { kin: m[1].toLowerCase(), name: nm, self: false };
      } else if (/^\s*(?:(?:and|so|but)\s+)?(?:i|i'm|i am)\b/i.test(body)) subj = { kin: "", name: "", self: true };
      else if (/^\s*(?:(?:and|so|but)\s+)?my\s+(?:grandfather|grandmother|uncle|aunt|brother|sister|husband|wife|son|daughter)\b/i.test(body) && !/\bborn\b[^.]*\bto\b/i.test(body)) {
        var gm = /^\s*(?:(?:and|so|but)\s+)?my\s+(grandfather|grandmother|uncle|aunt|brother|sister|husband|wife|son|daughter)\b(?:\s+(\p{L}[\p{L}'’-]*))?/iu.exec(body);
        if (gm) {
          /* «my grandfather ivan was born in 1925», when the story has already said who the father's father is: the same man */
          var rg = regs.filter(function (r) { return r.of && r.of.kin === (gm[1].toLowerCase() === "grandfather" ? "father" : gm[1].toLowerCase() === "grandmother" ? "mother" : "") && r.kinOf === gm[1].toLowerCase() && gm[2] && same(r.name, gm[2]); })[0];
          if (rg) {
            var rest = body.slice(gm[0].length).replace(/^\s+/, "");
            if (rest) { rg.facts.push(rest.replace(/[.!?\s]+$/, "")); notes.push("«" + gm[0].trim() + "» is the same " + rg.kinOf + " as " + rg.name + ", so " + rest.replace(/[.!?\s]+$/, "") + " is told of him."); changed = true; return; }
          }
        }
        subj = subj;   /* another relation: the subject stays as it was */
      }

      /* «he married my mother in 1980», said of my father: his wife (the reader takes «my mother» as the teller's own line and drops the father's journey) */
      if (subj && !subj.self && (subj.kin === "father" || subj.kin === "mother")) {
        var mm = /\b(married|marry|marries|wed|wedded)\s+my\s+(mother|father)\b/i.exec(body);
        if (mm && ((subj.kin === "father" && /^mother$/i.test(mm[2])) || (subj.kin === "mother" && /^father$/i.test(mm[2])))) {
          var spouse = subj.kin === "father" ? "his wife" : "her husband";
          s = s.replace(mm[0], mm[1] + " " + spouse); body = body.replace(mm[0], mm[1] + " " + spouse);
          notes.push("«" + mm[0] + "» is " + spouse + ": your " + mm[2].toLowerCase() + ", told of your " + subj.kin + "."); changed = true;
        }
      }

      /* «he was born in 1951 to ivan and hedviga» / «born to ivan and hedviga» / «son of ivan and hedviga» */
      var pm = /\s+to\s+(?:(?:his|her)\s+parents,?\s+)?\p{L}/iu.test(body) ? new RegExp("\\s+(?:to|of)\\s+" + NAME + "\\s+and\\s+(?:(?:his|her)\\s+(?:wife|husband)\\s+)?" + NAME + "\\b", "iu").exec(body) : null;
      var bornBefore = pm && /\b(?:born|son|daughter|child)\b/i.test(body.slice(0, pm.index + 1));
      if (pm && bornBefore && subj && (subj.self || subj.kin) && nameOk(pm[1], isGiven) && (!/^\p{Ll}/u.test(pm[2]) || !NOTNAME.test(pm[2])) && (nameOk(pm[2], isGiven) || isGiven(pm[1]) || /^\p{Lu}/u.test(pm[1]))) {
        var n1 = pm[1], n2 = pm[2], fa = n1, mo = n2;
        if (fem(n1) && !fem(n2)) { fa = n2; mo = n1; }
        var poss = lastSubjectPoss(), forSelf = subj.self;
        /* the writer's own parents are «my father», «my mother»; a father's are «his father»: the grandparents of the writer */
        var kin1 = { name: cap(fa), kin: "father", poss: poss, facts: [], of: subj, kinOf: forSelf ? "father" : subj.kin === "father" ? "grandfather" : "grandmother" };
        var kin2 = { name: cap(mo), kin: "mother", poss: poss, facts: [], of: subj, kinOf: forSelf ? "mother" : subj.kin === "father" ? "grandmother" : "grandmother" };
        regs.push(kin1, kin2);
        var cut = body.slice(0, pm.index) + body.slice(pm.index + pm[0].length);
        out.push({ s: cut + (trail || " ") }); out.push({ reg: [kin1, kin2] });
        notes.push("«" + pm[0].trim() + "» names " + (forSelf ? "your" : (poss === "his" ? "his" : "her")) + " parents: " + cap(fa) + " (father) and " + cap(mo) + " (mother).");
        changed = true; return;
      }

      /* WHAT IS SAID OF A NAMED PARENT, joined to that parent: «hedviga was from senj, but ivan was from crikvenica» */
      if (regs.length) {
        var parts = body.split(/,\s*(?:but|and|while|whereas)\s+|;\s*|,\s+(?=\p{L})/iu), keep = [], took = false;
        parts.forEach(function (part) {
          var pm2 = new RegExp("^\\s*(?:(?:and|but|while|whereas)\\s+)?" + NAME + "\\s+((?:was|is|comes?|came|were)\\b.*)$", "iu").exec(part);
          var reg = pm2 && regs.filter(function (r) { return same(r.name, pm2[1]); }).slice(-2).reverse()[0];
          /* the latest parents named: with two people of one name (the father and his father), the one named most recently is meant */
          if (pm2 && reg && !(subj && subj.name && subj.name.toLowerCase() === pm2[1].toLowerCase() && !regs.some(function (r) { return r.name.toLowerCase() === pm2[1].toLowerCase(); }))) { reg.facts.push(pm2[2].replace(/[.!?\s]+$/, "")); took = true; notes.push(reg.name + ": " + pm2[2].replace(/[.!?\s]+$/, "") + " (told of " + (reg.poss === "my" ? "your" : reg.poss) + " " + reg.kin + ")."); }
          else keep.push(part);
        });
        if (took) { changed = true; if (keep.length) out.push({ s: keep.join(", ") + (/[.!?]\s*$/.test(body) ? "" : ".") + trail }); return; }
      }
      out.push({ s: s });
    });

    var result = out.map(function (o) {
      if (o.s != null) return o.s;
      return o.reg.map(function (r) {
        var facts = r.facts.length ? " " + r.facts.join(" and ") : null;
        var lead = r.poss + " " + r.kin + " ";
        return facts ? lead + r.name + facts + ". " : lead + "is " + r.name + ". ";
      }).join("");
    }).join("").replace(/\s+\./g, ".").replace(/\.{2,}/g, ".").replace(/ {2,}/g, " ");
    return { text: changed ? result.replace(/\s+$/, "") : String(text || ""), changed: changed, notes: notes };
  }

  var api = { rewrite: rewrite, fem: fem, same: same };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.raStoryKin = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
