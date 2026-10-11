/* WHICH SHARD FILE ANSWERS THIS QUERY — the client half of one rule.
 *
 * Every search corpus here is sharded on the first three alphanumerics of a
 * form, and this project has twice paid for the build and the client working
 * that out separately. Once it cost 10,962 surnames, every name with a
 * separator near the front — O'Brien, D'Angelo, Le Roy — sharded one way and
 * looked up another, unfindable by their own spelling. Once it wrote
 * thousands of Cyrillic shards the client's /[a-z0-9]/ could never ask for.
 *
 * So there is one rule and it is in one file. build.py's `run_key` is this
 * function; build.py's `write_shards` decides which prefixes need more than
 * three characters and writes the decision to public/shards.json; this reads
 * the decision rather than re-deriving it.
 *
 * Two things it does that the eleven copied loops it replaces did not:
 *
 * DEEPER KEYS WHERE THE BUILD SPLIT A SHARD. `cha` was 3.4 MB of surnames,
 * fetched by anybody three characters into «Chapman». Where splitting keeps
 * the rows, the build writes cha0…chaz and lists `cha` as deep; a query with
 * a fourth character asks for the child, and a query that stops at three
 * asks for `cha` itself, which now holds only the names spelled exactly
 * that. The loop continues while the key is still deep, because `char` and
 * `char1` can need splitting too.
 *
 * ANOTHER WORD WHERE THE SHARD CANNOT BE SPLIT. `san` is 5.9 MB and cannot:
 * 48,024 of its rows are there because a spelling contains the WORD «san»,
 * which has no fourth character. But a place is indexed under EVERY word it
 * has, so «San Giovanni» is in `gio` as well, and `gio` is small. When the
 * first word of a query leads to a shard the build marked fat, the longest
 * other word that does not is used instead. The row is the same row; only
 * the file it is read out of is smaller.
 *
 * THE WHOLE QUERY IS THE DEFAULT SOURCE, AND ONLY A FAT SHARD MAKES IT LOOK
 * AT WORDS. The first version of this took the first word always, and the
 * agreement check caught it in the first run: build.py keys the surname «Le
 * Roy» as `ler`, scanning straight across the space, and a client that keyed
 * on «le» would find it two characters short and ask for nothing at all. Le
 * Roy, De Witt and St John were all unfindable by their own spelling — the
 * d'arcy bug, reintroduced by the fix for a different one.
 *
 * AND WHEN IT DOES SPLIT, IT SPLITS ON WHITESPACE AND NOTHING ELSE, because
 * that is what the build splits the gazetteer's forms on. Splitting on
 * punctuation too would make «d'arcy» into «d» and «arcy» and key it `arc`;
 * it is one word with the key `dar`.
 */
(function () {
  var ALNUM = /[\p{L}\p{N}]/u;

  /* ONE FOLD, FOR THE SAME REASON AS ONE KEY. There were three and they
     disagreed. build.py translates đ ł ø ß æ œ ı and then NFKD-normalises;
     RecordMap did the same but had lost the ı; SmartFind did neither, so
     «Đakovo» folded to «đakovo» there and went looking for a shard the build
     had written under `dak`. Croatian đ is not an edge case on an atlas built
     out of Istrian and Dalmatian parish books.

     NFKD rather than NFD, and the translation table first, because NFD does
     not decompose a stroked d — there is no «d» plus a combining stroke to
     take apart, which is exactly why the table has to exist. */
  var XL = { "đ": "d", "ł": "l", "ø": "o", "ß": "ss", "æ": "ae", "œ": "oe", "ı": "i" };
  window.raFold = function (s) {
    return (s == null ? "" : String(s)).toLowerCase()
      .replace(/[đłøßæœı]/g, function (c) { return XL[c]; })
      .normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  };

  /* The first n alphanumerics anywhere in the string, or "" if there are
     fewer than n of them. build.py's run_key, character for character. */
  function runKey(s, n) {
    var k = "";
    for (var i = 0; i < s.length && k.length < n; i++)
      if (ALNUM.test(s[i])) k += s[i];
    return k.length === n ? k : "";
  }

  /* `folded` must already have been through raFold. `info` is one
     directory's entry from shards.json — {deep, fat, byword} — and an absent
     or empty one gives exactly the three-character key the eleven copied
     loops gave, which is what every directory but g/ and s/ still wants. */
  window.raShardKey = function (folded, info) {
    info = info || {};
    var deep = info.deep || [], fat = info.fat || [];

    /* Descend while the build says this prefix was split, which it only ever
       says about a prefix it actually wrote children for. `char` and `char1`
       can both need splitting, so this is a loop and not one step. */
    function resolve(s) {
      var key = runKey(s, 3);
      if (!key) return "";
      while (deep.indexOf(key) > -1) {
        var next = runKey(s, key.length + 1);
        if (!next) break;
        key = next;
      }
      return key;
    }

    var src = String(folded || "");
    if (!info.byword) return resolve(src);

    /* BY WORD, FOR THE GAZETTEER ONLY, because its forms are single words: a
       place is indexed under every word of every spelling it has. So every
       word of the query leads to a file holding the row, and the longest one
       leads to the smallest — «San Giovanni» asks for a child of `gio`
       rather than for `san`, which eighty thousand places share. Longest
       first because the longest word is the most distinctive; a word too
       short to make a key is skipped, and if none of them can, the whole
       string is tried the way a surname would be. */
    var words = src.split(/\s+/).filter(Boolean).sort(function (a, b) {
      return b.length - a.length;
    });
    for (var i = 0; i < words.length; i++) {
      var k = resolve(words[i]);
      if (k && fat.indexOf(k) < 0) return k;
    }
    for (var j = 0; j < words.length; j++) {
      var k2 = resolve(words[j]);
      if (k2) return k2;
    }
    return resolve(src);
  };

  /* Cyrillic keys mean Cyrillic filenames, which must be escaped in a URL. */
  window.raShardUrl = function (base, key) {
    return base + encodeURIComponent(key) + ".json";
  };
}());
