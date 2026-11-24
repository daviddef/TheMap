/* A LINK THAT CARRIES THE STORY. Somebody helping in a group sends one address and the reader opens the story page already filled in:
   /read/#story=My%20great-grandfather%20Ivan%20Kauzlari%C4%87%20came%20from%20Fu%C5%BEine%20to%20Pittsburgh%20around%201928.
   The words ride in the part after the # on purpose: that part is never sent to a server, so a name in a link goes to the person who opens it and nowhere else.

   It also reads the links the retired /looking-for/ page made (#surname=Kauzlarić&from=Fužine&to=Pittsburgh&left=1928) and turns them into the same sentence, so an address
   already posted somewhere still lands on the story.

   Text only: the words go into the story box, never into markup. A classic script: window.raStoryLink, and module.exports for the tests. */
(function (root) {
  "use strict";
  var MAX = 1500;
  var HOLDS = { photo: "a photo", document: "a document", letter: "a letter", story: "the family story" };

  function clean(s, n) { return String(s == null ? "" : s).replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n || 80); }

  /* the sentence an old looking-for link stood for, in the form the story reader understands best; "" when the link says nothing */
  function sentenceFromOld(hash) {
    var h = String(hash || "").replace(/^#/, ""); if (!h || h.indexOf("=") < 0) return "";
    var q; try { q = new URLSearchParams(h); } catch (e) { return ""; }
    var g = function (k, n) { return clean(q.get(k), n); };
    var rel = g("rel"), sur = g("surname"), nm = g("name"), from = g("from"), to = g("to"), left = g("left", 4), born = g("born", 4), holds = g("holds");
    var who = nm || sur; if (nm && sur && nm.indexOf(sur) < 0) who = nm + " " + sur;
    if (!who && !from && !to) return "";
    var s = "My " + (rel || "ancestor") + (who ? " " + who : "");
    if (from && to) s += " came from " + from + " to " + to; else if (from) s += " came from " + from; else if (to) s += " came to " + to;
    if (/^\d{4}$/.test(left)) s += " around " + left;
    s += ".";
    if (/^\d{4}$/.test(born)) s += " They were born about " + born + ".";
    if (HOLDS[holds]) s += " All I have is " + HOLDS[holds] + ".";
    return s;
  }

  /* the words in a #story=... link, or "" */
  function textFromHash(hash) {
    var h = String(hash || "").replace(/^#/, ""), m = /^story=(.*)$/.exec(h);
    if (m) { try { return decodeURIComponent(m[1].replace(/\+/g, " ")).replace(/[\u0000-\u0008\u000b-\u001f]/g, " ").slice(0, MAX); } catch (e) { return ""; } }
    return sentenceFromOld(h);
  }

  /* #story=<the words>; the first MAX characters, because an address has a length */
  function hashFor(text) {
    var t = String(text || "").trim();
    return { hash: "#story=" + encodeURIComponent(t.slice(0, MAX)), cut: t.length > MAX };
  }

  var api = { sentenceFromOld: sentenceFromOld, textFromHash: textFromHash, hashFor: hashFor, MAX: MAX };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.raStoryLink = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
