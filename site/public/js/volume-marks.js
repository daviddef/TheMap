/* EXTRACTED FROM VolumeMarks.astro, AND THE REASON IS ARITHMETIC.
   This ran as an `is:inline` script, which Astro copies into the HTML of
   every page that uses it. 27,953 bytes multiplied by 54,043 place pages is
   gigabytes of the same text, and site/dist reached 10 GB — the exact
   ceiling GitHub Pages refuses to deploy. Every deploy was failing with
   «Artifact could not be deployed … total size is less than 10GB», and the
   build's own audit had been printing «this will not deploy» above it.

   LOADED AS A CLASSIC SCRIPT, NOT A MODULE, ON PURPOSE. Dropping `is:inline`
   would let Astro bundle this — and bundled scripts are modules, which are
   deferred. This one opens with `if (!window.raProgress) return;`, so it must still run after ProgressKit and before nothing in particular. So the tag stays a plain
   parser-blocking <script src>: same execution order as the inline version
   it replaces, same globals, one file the browser caches once.
*/
(function () {
    if (!window.raProgress) return;
    var P = window.raProgress;

    function esc(s) {
      return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
      });
    }

    /* A PILL, NOT A SENTENCE. David: «instead of the words "mark pages" could
       we just have a neat green icon/pill? or an alternate one if we already
       marked it and want to edit or remove?» Forty rows each ending in two
       words of instruction is a column of repeated prose, and the instruction
       is only news the first time.
       + to add, ✓ once there is something there — so the state of the row is
       legible down the whole list at a glance rather than by reading it.

       THE WORDS DO NOT DISAPPEAR, THEY MOVE TO WHERE A SCREEN READER FINDS
       THEM. `aria-label` carries the full sentence including the book's own
       title, and `title` gives a sighted reader the same on hover. This
       project already made exactly this trade for the menu burger and wrote
       down why: a bare glyph with no accessible name announces itself as
       «button» and nothing else, which is not the bargain being made here. */
    function summary(id, what) {
      var m = P.get(id);
      var of = what ? " in " + what : "";
      if (!m || !m.done || !m.done.length) {
        return '<button type="button" class="vm-open vm-pill" ' +
               'aria-label="Mark the pages you have done' + esc(of) + '" ' +
               'title="Mark the pages you have done">+</button>';
      }
      var done = P.covered(m.done);

      /* AMBER UNTIL IT IS FINISHED, GREEN WHEN IT IS. David: «if its not
         complete it should probably be marked amber rather? and green is when
         all pages done or confirmed complete?» Right, and it makes the list
         answer a better question than «have I touched this»: it answers «what
         is still open».
         COMPLETE MEANS THE READER SAID SO. The only way this can know a book
         is finished is a total to measure against, and the total is the
         reader's — see ProgressKit's note on denominators this atlas does not
         have. So a book with pages recorded and no total stays amber however
         many pages are in it, and the tooltip says why rather than leaving
         somebody wondering what is keeping it off green.
         NOT COLOUR ALONE: + for nothing, ✓ outlined for started, ✓ filled for
         finished. Shape and fill carry it too, so it survives a reader who
         cannot tell the two hues apart. */
      var whole = m.total && done >= m.total;
      var tip = P.fmt(m.done) + " \u00b7 " + done + " page" +
                (done === 1 ? "" : "s") +
                (m.total ? " of " + m.total : "") +
                " \u00b7 start again at " + P.resume(m.done) +
                (m.total ? "" : " \u00b7 give a total to mark it finished");

      /* THE SUMMARY MOVES INTO THE BUTTON. David: «can that be shown once i
         click the button, not consume real estate on the main page?» It was a
         second line under every marked row — ranges, a page count, a resume
         point and a date — which on a place page with forty books is forty
         extra lines of the thing he had already read. It is all still here:
         on the pill as its title and its accessible name, and in full the
         moment the editor opens. */
      return '<button type="button" class="vm-open vm-pill ' +
             (whole ? "vm-pill-on" : "vm-pill-part") + '" ' +
             'aria-label="' + esc((whole ? "Finished" : "In progress") + of +
                                  " \u2014 " + tip) + '" ' +
             'title="' + esc(tip) + '">\u2713</button>';
    }

    /* Kept for the editor, which does want the whole sentence. */
    function detail(id) {
      var m = P.get(id);
      if (!m || !m.done || !m.done.length) return "";
      var done = P.covered(m.done);
      var bits = ['<b>' + esc(P.fmt(m.done)) + "</b>"];
      /* THE TOTAL IS THE READER'S, so the share is only shown once they have
         given one — see the note in ProgressKit.astro about denominators this
         atlas does not have. */
      if (m.total) {
        bits.push('<span class="vm-bar" aria-hidden="true"><i style="width:' +
                  Math.min(100, Math.round((done / m.total) * 100)) + '%"></i></span>');
        bits.push('<span class="vm-n">' + done + " of " + m.total +
                  " · your count</span>");
      } else {
        bits.push('<span class="vm-n">' + done + " page" + (done === 1 ? "" : "s") + "</span>");
      }
      bits.push('<span class="vm-res">start again at ' + P.resume(m.done) + "</span>");
      if (m.note) bits.push('<span class="vm-note">' + esc(m.note) + "</span>");
      if (m.since) bits.push('<span class="vm-since">' + esc(m.since) + "</span>");
      return bits.join(" ");
    }

    /* AN EDITOR THAT OPENS OFF-SCREEN READS AS A DEAD BUTTON. David, twice:
       «what is "mark pages" supposed to do, it does nothing right now». It
       does — measured on the live site, the click lands and the panel renders
       709x127 — at top 1388 in a 682-pixel window. The volumes sit in a
       multi-column list, the slot becomes a block when it fills, and the
       editor can land a column over and a screen down from the button that
       opened it. None of that is visible to the person clicking.
       So the editor is brought to the reader rather than left where the
       layout happened to put it, and the pages box takes focus so it can be
       typed into at once. Only scrolled when it is actually out of view, so a
       reader who can already see it is not jerked around. */
    function reveal(li) {
      var ed = li.querySelector(".vm-edit");
      if (!ed) return;
      var box = ed.getBoundingClientRect();
      if (box.top < 8 || box.bottom > window.innerHeight - 8)
        ed.scrollIntoView({ block: "center", behavior: "smooth" });
      var f = ed.querySelector(".vm-r");
      if (f) f.focus({ preventScroll: true });
    }

    function editor(id) {
      var m = P.get(id) || {};
      /* THE WHOLE SENTENCE, HERE, WHERE IT WAS ASKED FOR. It came off the row
         to stop forty books costing forty extra lines; it belongs in the panel
         the reader deliberately opened. */
      var d = detail(id);
      /* ONE THING PER ROW. David: «form is a mess. can you clean it up» — and
         it was: every field, the running summary, a checkbox and three
         buttons were siblings in one wrapping flex line, so the layout was
         decided by how wide the panel happened to be and the summary ended up
         wedged between «your count» and the pages box.
         Explicit rows instead, top to bottom in the order the reader fills
         them: what you have already recorded, then the numbers, then the
         note, then the one checkbox that changes who the work belongs to,
         then the buttons. Nothing wraps into anything else. */
      return '<span class="vm-edit">' +
        (d ? '<span class="vm-detail">' + d + "</span>" : "") +
        '<span class="vm-row">' +
        '<label>pages done <input class="vm-r" type="text" inputmode="numeric" ' +
        'placeholder="1-47, 60-72" value="' + esc(P.fmt(m.done)) + '"></label>' +
        '<label>of <input class="vm-t" type="text" inputmode="numeric" size="5" ' +
        'placeholder="total" value="' + esc(m.total || "") + '"></label>' +
        "</span>" +
        '<label class="vm-notel">note <input class="vm-no" type="text" ' +
        'placeholder="found something?" value="' + esc(m.note || "") + '"></label>' +
        /* THE ONE CHECKBOX THAT CHANGES WHOSE WORK THIS IS. Scanning a page
           for a surname is true for that surname; READING every entry on it
           is true for every family afterwards. Ticking this stores the range
           once, above the lines, so a second family opening the same book
           inherits it instead of walking it again. It is worded as what the
           reader did, not as a data model. */
        '<label class="vm-walk"><input class="vm-w" type="checkbox"' +
        (m.walked && m.walked.length ? " checked" : "") +
        "> I read every entry (counts for every family)</label>" +
        '<span class="vm-btns">' +
        '<button type="button" class="vm-save">save</button>' +
        '<button type="button" class="vm-cancel">cancel</button>' +
        (m.done ? '<button type="button" class="vm-clear">forget</button>' : "") +
        "</span></span>";
    }

    /* THE SLOT IS MADE, NOT DEMANDED. Every list that wants marking had to
       carry a <span class="volmark"> of its own, so adding marking to a new
       list meant two edits and I made one of them — the sources on a place
       page declared ids and had nowhere to draw. A row that says what it is
       is enough; the control follows. */
    /* FIRST CHILD, NOT LAST. David: «can the icon be on the left? its getting
       ugly on right». It was: a trailing pill sat after the title, the year
       span, the denomination and the film number, so in a three-column list
       it wrapped to its own line and landed under the middle of the text —
       and where it landed changed with the length of every title, so a column
       of them was a scatter rather than a column.
       At the head of the row it is a margin: every pill at the same x, which
       is what makes a list of forty scannable at all. */
    function slotFor(el, cls) {
      var slot = el.querySelector("." + cls);
      if (!slot) {
        slot = document.createElement("span");
        slot.className = cls;
      }
      /* MOVED, NOT ONLY CREATED. Place pages ship their own
         <span class="volmark"> at the END of the row — that is how this
         component was originally fed — so creating it at the front fixed the
         map panel and left every place page with the pill still trailing.
         Whoever made the slot, it belongs at the head of the row. */
      if (el.firstChild !== slot) el.insertBefore(slot, el.firstChild);
      return slot;
    }

    function paint(li, force) {
      var slot = slotFor(li, "volmark");
      /* NEVER PAINT OVER AN OPEN EDITOR. On the map the panel is watched by a
         MutationObserver so that rebuilt rows get their marks — and opening
         the editor IS a mutation of that panel, so the observer fired,
         repainted the row, and replaced the editor with the summary inside
         the same tick. Clicking «mark pages» in the panel did nothing at all,
         visibly and literally, because the thing it opened was destroyed
         before a frame was drawn. */
      /* WHICH ROW IS BEING EDITED IS STATE, NOT SOMETHING TO INFER FROM THE
         DOM. Asking «does this slot contain an editor» looks equivalent and
         is not: paintAll runs on a timer after every mutation, its own writes
         mutate the panel and retrigger it, and somewhere in those passes the
         answer came back wrong and the editor was overwritten — clicking
         «mark pages» in the map panel appeared to do nothing at all.
         One variable, set when the editor opens and cleared when it closes,
         cannot be raced. `force` is save and cancel saying «this row was just
         edited, replace it now». */
      if (!force && _editing === li.getAttribute("data-vol")) return;
      /* WRITE ONLY WHAT CHANGES. Every paint replaced the slot's innerHTML
         whether or not a single character of it differed, and each of those
         writes is a mutation the observer below then reacts to. Comparing
         first costs a string compare and breaks the feedback at its source:
         a panel that is already correct produces no mutations at all. */
      var html = summary(li.getAttribute("data-vol"),
                         li.getAttribute("data-vol-t"));
      if (slot.innerHTML !== html) slot.innerHTML = html;
      li.classList.toggle("vm-has", !!(P.get(li.getAttribute("data-vol")) || {}).done);
    }

    function all() {
      return [].slice.call(document.querySelectorAll("li[data-vol]"));
    }
    /* WHAT THE TOWN COMES TO, COUNTED FROM ITS OWN ROWS. Never stored: a
       town's progress IS its volumes, and keeping a second number would mean
       keeping two that can disagree. Counted from the rows on the page —
       including the ones folded behind «and 34 more», because they are in the
       DOM — so it is right the moment any of them changes. */
    function rollup() {
      var el = document.querySelector(".ra-rollup, .ra-rollup-page");
      if (!el) return;
      var rows = all();
      if (!rows.length) { el.hidden = true; return; }
      var done = 0, pages = 0;
      rows.forEach(function (li) {
        var m = P.get(li.getAttribute("data-vol"));
        if (m && m.done) { done++; pages += P.covered(m.done); }
      });
      if (!done) { el.hidden = true; return; }
      el.hidden = false;
      el.innerHTML = '<b>' + done + " of " + rows.length + "</b> volume" +
        (rows.length === 1 ? "" : "s") + " marked \u00b7 " +
        pages.toLocaleString() + " page" + (pages === 1 ? "" : "s");
    }
    function paintAll() {
      /* NOT `all().forEach(paint)`. forEach hands the callback (element,
         INDEX, array), so paint's second parameter — `force` — arrived as the
         row's position: 0 for the first row and a truthy number for every
         other. The first row's editor was therefore protected and all the
         rest were overwritten the instant they opened, which is exactly what
         «if i click on mark pages nothing happens» looked like, and why it
         once appeared to work while I was testing row zero. */
      all().forEach(function (li) { paint(li); });
      srcAll().forEach(function (el) { srcPaint(el); });
      rollup();
      bump();
      /* The map's own dots, so «where have I been» is answerable at a glance
         rather than by opening places one at a time. */
      if (window.raPaintProgress) window.raPaintProgress();
    }
    /* REPAINT WHEN THE PANEL IS REBUILT, which is most of the time. On a place
       PAGE the rows are in the HTML and painting once at load is enough. On
       the MAP the panel is regenerated by script on every search, every marker
       click and every filter change — so a kit that paints once would paint an
       empty page and then never see the rows that matter.
       An observer rather than a call at each render site: the panel is written
       from a dozen places in RecordMap.astro and the one that got forgotten
       would be the one a reader used. */
    var _editing = null;
    var _painting = false;
    var _obs = new MutationObserver(function () {
      if (_painting) return;
      _painting = true;
      /* After the batch, not during it — innerHTML fires many records and
         painting inside the callback would re-enter the observer. */
      /* HOLDING THE FLAG ACROSS THE PAINT IS NOT ENOUGH, and believing it was
         cost David a day. `_painting` suppresses callbacks that fire WHILE it
         is set — but a MutationObserver delivers the records its own subject
         produced in a LATER microtask, after this function has returned and
         after the flag has been cleared. So paintAll's own writes were queued,
         delivered to a callback that now saw `_painting === false`, and
         scheduled the next paint. Measured on the live map panel: 3,906
         mutations in three seconds with nobody touching the page, about
         1,300 a second, for ever.
         That is what «mark pages does nothing» actually was. The button was
         being destroyed and rebuilt under the pointer — a real click landed on
         a node that had already been replaced, and an editor that did open was
         overwritten within milliseconds. It only happened on the MAP PANEL,
         because that is the only surface this observer watches, which is why
         the place pages tested clean and the bug survived two fixes.
         takeRecords() empties the queue our own writes filled, so the pending
         callback finds nothing to report and the loop has no fuel. */
      setTimeout(function () {
        paintAll();
        _obs.takeRecords();
        _painting = false;
      }, 0);
    });
    [".at-panel", "#ra-check-b", "#ra-body"].forEach(function (sel) {
      var el = document.querySelector(sel);
      if (el) _obs.observe(el, { childList: true, subtree: true });
    });
    /* PAINTED AFTER THE DOCUMENT, NOT DURING IT. This ran inline, which is
       fine for the rows above the script and wrong for anything after it —
       and the rollup element sits in the page body wherever the page chose to
       put it. One tick costs nothing and removes the ordering question
       entirely. */
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", paintAll);
    } else {
      setTimeout(paintAll, 0);
    }
    /* SWITCHING FAMILY REPAINTS EVERYTHING. Every mark on the page belongs to
       the line that was open when it was drawn, so a switch makes all of them
       stale at once — including the rings on the map, which paintAll already
       pokes.
       IT WAS REGISTERED INSIDE THE readyState BRANCH ABOVE, so on any page
       that had already finished loading when this script ran — which is most
       of them, the script is at the foot of the body — the listener was never
       attached and changing family repainted nothing. Outside the branch, so
       it is attached either way. */
    document.addEventListener("ra-progress-changed", function () { paintAll(); });

    document.addEventListener("click", function (e) {
      var li = e.target.closest && e.target.closest("li[data-vol]");
      if (!li) return;
      var id = li.getAttribute("data-vol");
      var slot = li.querySelector(".volmark");

      if (e.target.closest(".vm-open")) {
        _editing = id;
        slot.innerHTML = editor(id);
        var f = slot.querySelector(".vm-r");
        if (f) f.select();
        /* After the layout has settled, not before: the editor has only just
           been written and its position is not final until the browser has
           reflowed the column it landed in. */
        requestAnimationFrame(function () { reveal(li); });
        return;
      }
      if (e.target.closest(".vm-cancel")) { _editing = null; paint(li, true); return; }
      if (e.target.closest(".vm-clear")) { _editing = null; P.clear(id); paint(li, true); rollup(); bump(); return; }
      if (e.target.closest(".vm-save")) {
        /* WHAT THE ROW IS, SAVED WITH IT. The id is a FamilySearch waypoint —
           «3JXZ-K68:172062901,172062902,172062903» — which is stable, which is
           why it is the key, and which tells a reader nothing. My research
           listed those raw and was a column of barcodes. The title, the place
           and the way back are copied in at save time because the page that
           lists them later has no way to look any of it up. */
        P.setWhat(id, {
          t: li.getAttribute("data-vol-t"),
          where: li.getAttribute("data-vol-where"),
          href: li.getAttribute("data-vol-href")
        });
        P.setRanges(id, slot.querySelector(".vm-r").value,
                    { walked: slot.querySelector(".vm-w").checked });
        P.setTotal(id, slot.querySelector(".vm-t").value);
        P.setNote(id, slot.querySelector(".vm-no").value);
        _editing = null;
        paint(li, true);
        rollup();
        bump();
        return;
      }
    });
    /* Enter saves, Escape abandons — a form that can only be left with the
       mouse is a form people stop using. */
    document.addEventListener("keydown", function (e) {
      var li = e.target.closest && e.target.closest("li[data-vol]");
      if (!li || !e.target.matches("input")) return;
      if (e.key === "Enter") { e.preventDefault();
        var b = li.querySelector(".vm-save"); if (b) b.click(); }
      if (e.key === "Escape") { e.preventDefault(); paint(li); }
    });

    /* ---- A SOURCE AND A PLACE TAKE A STATE, NOT A RANGE -----------------
       David's list was «i have finished searching this volume, or i have
       already scanned this location, etc». A volume has pages; an archive and
       a town do not. What you record about an archive is that you wrote to it
       and they have not answered, or you went and it was shut, or you read
       everything they hold. Forcing those through a page-range box would be
       the tool telling the work what shape to be.

       The states are the ones a genealogist actually reaches for, and
       «written, no reply» is there because it is the commonest and the one
       most worth a date against it. */
    var STATES = [
      ["", "not started"],
      ["planned", "planning to"],
      ["written", "written, no reply"],
      ["searched", "searched, nothing found"],
      ["found", "found something"],
      ["exhausted", "read everything here"],
      ["blocked", "cannot get access"]
    ];
    function label(v) {
      for (var i = 0; i < STATES.length; i++) if (STATES[i][0] === v) return STATES[i][1];
      return v;
    }
    /* WHICH SOURCE ROW IS EXPANDED. Same variable, same reason as `_editing`
       on the volumes: inferring it from the DOM loses the race against the
       repaint. */
    var _srcOpen = null;

    function srcExpand(id, m) {
      var unset = !m.state;
      var opts = STATES.map(function (o) {
        var text = (o[0] === "" && unset) ? "mark what you did \u2026" : o[1];
        return '<option value="' + o[0] + '"' +
               (o[0] === (m.state || "") ? " selected" : "") + ">" + text + "</option>";
      }).join("");
      return '<span class="src-edit">' +
        '<select class="src-s" aria-label="What you have done here">' + opts + "</select>" +
        (m.state ? '<input class="src-no" type="text" placeholder="note" value="' +
                   esc(m.note || "") + '">' : "") +
        '<button type="button" class="src-shut" aria-label="Close">\u00d7</button>' +
        "</span>";
    }

    function srcPaint(el, force) {
      var slot = slotFor(el, "srcmark");
      var id = el.getAttribute("data-src");
      /* NEVER PAINT OVER AN OPEN ONE — the same rule the volume editor needed
         and for the same reason. */
      if (!force && _srcOpen === id) return;
      var m = P.get(id) || {};
      /* THE EMPTY OPTION HAS TO ASK FOR SOMETHING. David: «i cant see a way
         to add on the home screen sources, or the places pages either». The
         control was there on every source row — a 11.5px select reading «not
         started», which is a STATUS. A reader scanning a place page reads a
         status as something the atlas is telling them, not as something they
         are being invited to change, and nothing else on the row looks
         clickable either. The volumes list says «mark pages» and that one gets
         found.
         So the resting label asks, and «not started» comes back as soon as
         there is a state to return from — because then it is a real choice the
         reader may want again, rather than a label on an empty box. */
      var unset = !m.state;
      var opts = STATES.map(function (o) {
        var text = (o[0] === "" && unset) ? "mark what you did \u2026" : o[1];
        return '<option value="' + o[0] + '"' +
               (o[0] === (m.state || "") ? " selected" : "") + ">" + text + "</option>";
      }).join("");
      /* A PILL AT REST, THE DROPDOWN ON CLICK. David: «could we also use the
         same icon/pill and allow this dropdown on click? its taking a lot of
         real estate.» He is right about the cost — a 180px select on every
         row wrapped onto a line of its own, so ten archives came to twenty
         lines and the list read as a form rather than as sources.
         Shut, a row is a + or a ✓ and the state in words once there is one.
         Open, it is the select it always was. Exactly the volumes' bargain,
         which is the point: one control to learn, not two. */
      var what = el.getAttribute("data-src-t");
      var of = what ? " at " + what : "";
      var shtml = _srcOpen === id
        ? srcExpand(id, m)
        : (m.state
            ? '<button type="button" class="src-open vm-pill vm-pill-on" ' +
              'aria-label="Edit what you recorded' + esc(of) + '" ' +
              'title="Edit or remove what you recorded">\u2713</button>' +
              '<span class="src-state">' + esc(label(m.state)) + "</span>" +
              (m.note ? '<span class="vm-note">' + esc(m.note) + "</span>" : "") +
              (m.since ? '<span class="vm-since">' + esc(m.since) + "</span>" : "")
            : '<button type="button" class="src-open vm-pill" ' +
              'aria-label="Mark what you have done' + esc(of) + '" ' +
              'title="Mark what you have done here">+</button>');
      if (slot.innerHTML !== shtml) slot.innerHTML = shtml;
      el.classList.toggle("src-has", !!m.state);
    }
    function srcAll() {
      return [].slice.call(document.querySelectorAll("[data-src]"));
    }
    /* OPEN AND SHUT. The pill expands its own row; anything else that was
       open shuts first, so the list never carries two selects at once — which
       would give back exactly the space this was meant to save. */
    document.addEventListener("click", function (e) {
      var el = e.target.closest && e.target.closest("[data-src]");
      if (!el) return;
      var id = el.getAttribute("data-src");
      if (e.target.closest(".src-open")) {
        var was = _srcOpen;
        _srcOpen = null;
        if (was && was !== id) {
          var prev = document.querySelector('[data-src="' + was.replace(/"/g, '\\"') + '"]');
          if (prev) srcPaint(prev, true);
        }
        _srcOpen = id;
        srcPaint(el, true);
        var s = el.querySelector(".src-s");
        if (s) s.focus();
        return;
      }
      if (e.target.closest(".src-shut")) {
        _srcOpen = null;
        srcPaint(el, true);
        return;
      }
    });

    document.addEventListener("change", function (e) {
      var el = e.target.closest && e.target.closest("[data-src]");
      if (!el || !e.target.classList.contains("src-s")) return;
      var id = el.getAttribute("data-src");
      P.setWhat(id, { t: el.getAttribute("data-src-t"),
                      where: el.getAttribute("data-src-where"),
                      href: el.getAttribute("data-src-href") });
      P.setState(id, e.target.value);
      /* CHOOSING IS FINISHING, for the common case. Picking a state is the
         whole interaction nine times in ten, so it saves and collapses back
         to the pill rather than leaving a select open on a row that is now
         answered. A note is the tenth time: click the ✓ again and the field
         is there, because by then there is a state for it to belong to. */
      _srcOpen = null;
      srcPaint(el, true);
      bump();
    });
    document.addEventListener("input", function (e) {
      var el = e.target.closest && e.target.closest("[data-src]");
      if (!el || !e.target.classList.contains("src-no")) return;
      P.setNote(el.getAttribute("data-src"), e.target.value);
      bump();
    });

    /* A COUNT THE READER CAN SEE, because progress kept somewhere invisible
       is progress nobody trusts. Links to the page that can export it. */
    function bump() {
      var n = P.count();
      var el = document.getElementById("ra-mywork");
      if (!el) return;
      el.hidden = !n;
      el.innerHTML = n
        ? '<b>' + n + "</b> volume" + (n === 1 ? "" : "s") +
          " marked in this browser · " +
          '<a href="' + (el.getAttribute("data-href") || "#") + '">see and export them</a>'
        : "";
    }
    bump();
  })();
