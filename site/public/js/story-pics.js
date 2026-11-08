/* THE PICTURES OF A STORY, kept in this browser. A story's words travel (the research file, the six-word copy); its pictures do not: they are
   large, and they are the reader's own papers. Each is shrunk to 1600px on its longest side and kept in IndexedDB under "storyId/pieceId", so
   My story can show it beside the reading that was taken from it. Nothing here sends anything anywhere. Classic script. */
(function (root) {
  "use strict";
  var DB = "ra-story-pics", OS = "pics", MAX_EDGE = 1600;
  function open() {
    return new Promise(function (ok, fail) {
      if (!root.indexedDB) { fail(new Error("This browser keeps no pictures.")); return; }
      var r; try { r = root.indexedDB.open(DB, 1); } catch (e) { fail(e); return; }
      r.onupgradeneeded = function () { r.result.createObjectStore(OS); };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { fail(r.error || new Error("blocked")); };
    });
  }
  function tx(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (ok, fail) {
        var t = db.transaction(OS, mode), req = fn(t.objectStore(OS));
        t.oncomplete = function () { db.close(); ok(req && req.result); };
        t.onerror = t.onabort = function () { db.close(); fail(t.error || new Error("not kept")); };
      });
    });
  }
  function dims(w, h) { var k = Math.min(1, MAX_EDGE / Math.max(w, h, 1)); return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }; }
  /* a picture file, shrunk: {blob, data} where data is the base64 a reading is sent as */
  function shrink(f) {
    return new Promise(function (ok, fail) {
      var img = new Image(), url = URL.createObjectURL(f);
      img.onload = function () {
        var d = dims(img.naturalWidth, img.naturalHeight), cv = document.createElement("canvas");
        cv.width = d.w; cv.height = d.h; cv.getContext("2d").drawImage(img, 0, 0, d.w, d.h); URL.revokeObjectURL(url);
        cv.toBlob(function (b) {
          if (!b) { fail(new Error("That picture could not be shrunk.")); return; }
          var fr = new FileReader(); fr.onload = function () { ok({ blob: b, data: String(fr.result).split(",")[1] }); }; fr.onerror = function () { fail(new Error("That picture could not be read.")); }; fr.readAsDataURL(b);
        }, "image/jpeg", 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); fail(new Error("That picture could not be opened.")); };
      img.src = url;
    });
  }
  var api = {
    shrink: shrink, dims: dims,
    put: function (key, blob) { return tx("readwrite", function (os) { return os.put(blob, String(key)); }); },
    get: function (key) { return tx("readonly", function (os) { return os.get(String(key)); }).then(function (b) { return b || null; }); },
    del: function (key) { return tx("readwrite", function (os) { return os.delete(String(key)); }); },
    delStory: function (id) { return tx("readwrite", function (os) { return os.delete(root.IDBKeyRange.bound(String(id) + "/", String(id) + "/￿")); }); }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.raStoryPics = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
