/* THE CHAPTERS OF THE STORY TOUR, as one HTML string with every number and every example filled in from the data (see lib/start-data.js).
   It is served as /start-tour.html (pages/start-tour.html.js) and fetched by public/js/start-tour-gate.js only when the tour opens. Nothing in the
   markup is a number typed by hand: the counts arrive as `n`, the examples (a place's names, a surname's spellings, the eras) as `ex`, and the
   spoken text of each chapter as `sr`. The staged scenes are labelled in the markup itself: "an invented photo", "an invented example page",
   "invented journey", "Example only". */
export function tourMarkup({ n, ex, sr, b, data }) {
  return `<!-- ===== The tour ===== -->
<div id="ra-tour" role="dialog" aria-modal="true" aria-label="The Record Atlas story" aria-describedby="tr-live">
  <canvas id="tr-cv" aria-hidden="true"></canvas>
  <div class="top">
    <span class="brand">Record <em>Atlas</em></span>
    <span class="where" id="tr-where" aria-hidden="true"></span>
    <span class="sp"></span>
    <a class="astext" href="${b}/start/#the-whole-page">Read it as a page</a>
    <button class="btn skip" id="tr-skip" type="button">Skip <span aria-hidden="true">&#10005;</span> <kbd>Esc</kbd></button>
  </div>

  <div id="tr-chs">

  <!-- 0. the photo and the question -->
  <section class="ch" data-i="0" data-eyebrow="Start here" data-title="One word on the back" data-still="6.5" hidden
    data-sr="${sr[0]}">
    <div class="st">
      <figure class="photo" data-cls="flip" data-at="1.7" style="margin:0">
        <div class="c3">
          <div class="f fr"><svg viewBox="0 0 200 250" role="img" aria-label="An invented, faded portrait of a woman in a headscarf">
            <defs><linearGradient id="tr-pg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a3d2f"/><stop offset="1" stop-color="#7d6a52"/></linearGradient>
            <radialGradient id="tr-pv" cx=".5" cy=".45" r=".75"><stop offset=".55" stop-color="#0000"/><stop offset="1" stop-color="#000A"/></radialGradient>
            <filter id="tr-gr"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .2  0 0 0 0 .16  0 0 0 0 .1  0 0 0 .55 0"/></filter></defs>
            <rect width="200" height="250" fill="url(#tr-pg)"/>
            <path d="M20 250C22 192 58 168 100 168s78 24 80 82z" fill="#2a2119"/>
            <path d="M62 128c-2-40 22-62 40-62 22 0 42 22 38 64-4 30-24 42-40 42s-36-14-38-44z" fill="#a38c6e"/>
            <path d="M54 140c-10-52 18-82 50-82s58 30 44 86c-6-22-18-34-26-40-12 6-32 8-50 2-8 6-14 18-18 34z" fill="#2a2119"/>
            <ellipse cx="98" cy="128" rx="25" ry="31" fill="#bba685"/>
            <path d="M60 168c10 18 28 26 42 26s32-8 42-26c-10 4-28 10-42 10s-32-6-42-10z" fill="#d1a154" opacity=".55"/>
            <rect width="200" height="250" fill="url(#tr-pv)"/><rect width="200" height="250" filter="url(#tr-gr)" opacity=".6"/>
          </svg></div>
          <div class="f bk"><span class="ink tl-ink" id="tr-ink">Fiume</span><span class="stamp"></span></div>
        </div>
      </figure>
      <p class="photo-cap tl" data-at="0.6">an invented photo</p>
      <div class="counts tl" data-at="1.0" aria-label="The atlas in numbers">
        <div><b class="cnt" data-to="${n.placesRaw}">${n.places}</b>places</div>
        <div><b class="cnt" data-to="${n.regionsRaw}">${n.regions}</b>record regions</div>
        <div><b class="cnt" data-to="${n.volumesRaw}" data-fmt="m">${n.volumesM}</b>volumes</div>
      </div>
    </div>
    <div class="narr">
      <p class="eyebrow">Start here</p>
      <div class="capbox" aria-hidden="true">
        <p class="cap" data-at="0">Nonna left one <em>clue</em>.</p>
        <p class="cap" data-at="2.3">One word, on the back.</p>
        <p class="cap" data-at="4.4">Where is that record? Can I see it tonight?</p>
      </div>
      <form class="ask tl" data-at="4.8" id="tr-askform" autocomplete="off" novalidate>
        <label for="tr-q">Type the word, or any place, surname or first name</label>
        <div class="field"><input id="tr-q" name="q" type="text" inputmode="search" enterkeyhint="search" placeholder="${ex.placeholder}" spellcheck="false" autocapitalize="off"><button class="btn pri" type="submit">Go</button></div>
        <div class="chips" aria-label="Examples to try"><span class="note">Try</span>${ex.chips}</div>
        <p class="hint" id="tr-hint" role="status"></p>
        <p class="doors-q">Or start with <a href="${b}/your-name/">a name</a> &middot; <a href="${b}/tree-canvas/">a tree file</a> &middot; <a href="${b}/looking-for/">a story</a></p>
      </form>
    </div>
  </section>

  <!-- 1. the name changed: places -->
  <section class="ch" data-i="1" data-eyebrow="Obstacle 1 of 4 &middot; The name changed" data-title="A place has many names" data-still="11" hidden
    data-sr="${sr[1]}">
    <div class="st">
      <div class="stat tl" data-at="9.6"><b>${n.altPlaces}</b>places<br><b>${n.altNames}</b>other names</div>
      <div class="yearbox tl" data-at="0.8">
        <div class="yearrow"><output id="tr-y1v" for="tr-y1">1850</output><span class="who" id="tr-y1w"></span></div>
        <input type="range" id="tr-y1" min="1850" max="2000" step="1" value="1850" aria-label="Year">
        <div class="tlabels" id="tr-y1t"><span>1850</span><span>2000</span></div>
        <div class="chips"><span class="note" id="tr-y1n">Hand-built example, flags simplified.</span><button class="mini" id="tr-y1alt" type="button">Try Salisbury</button></div>
      </div>
    </div>
    <div class="narr">
      <p class="eyebrow">Obstacle 1 of 4 &middot; The name changed</p>
      <div class="capbox" aria-hidden="true">
        <p class="cap" data-at="0">Fiume isn't on a modern map.</p>
        <p class="cap" data-at="2.2">Drag the years. Watch the name.</p>
        <p class="cap" data-at="9.6">Same place. Every name it has had.</p>
      </div>
      <p class="atl">On the Atlas: <a href="${b}/places/">Every place</a> &middot; <a href="${b}/">The map</a></p>
    </div>
  </section>

  <!-- 2. the name changed: spellings -->
  <section class="ch" data-i="2" data-eyebrow="Obstacle 1 of 4 &middot; The name changed, again" data-title="A name has many spellings" data-still="15" hidden
    data-sr="${sr[2]}">
    <div class="st">
      <div class="forms">
        <div class="eq tl" data-at="10.6" aria-hidden="true">${ex.givenEq}</div>
        <p class="note tl" data-at="11.6">${n.givenNames} given names &middot; ${n.givenForms} forms &middot; ${n.surnameFamilies} surname families</p>
      </div>
    </div>
    <div class="narr">
      <p class="eyebrow">Obstacle 1 of 4 &middot; The name changed, again</p>
      <div class="capbox" aria-hidden="true">
        <p class="cap" data-at="0">Her surname moved too.</p>
        <p class="cap" data-at="6.9">Spelt by the clerk, not the family.</p>
        <p class="cap" data-at="10.2">A first name does the same.</p>
      </div>
      <p class="atl">Example surname, from the catalogue. On the Atlas: <a href="${b}/your-name/">Names</a> &middot; <a href="${b}/surname-families/">Surname families</a></p>
    </div>
  </section>

  <!-- 3. the jurisdiction changed: flags, eras, hubs -->
  <section class="ch" data-i="3" data-eyebrow="Obstacle 2 of 4 &middot; The jurisdiction changed" data-title="Whose flag flew over it" data-still="14" hidden
    data-sr="${sr[3]}">
    <div class="st">
      <div class="flagrow tl" data-at="0.4" aria-hidden="true">${ex.flagRow}</div>
      <div class="yearbox">
        <div class="yearrow tl" data-at="2.2"><output id="tr-y3v">1850</output><span class="who">illustrative borders, simplified</span></div>
        <div class="legend tl" data-at="2.4" style="position:static" aria-hidden="true">${ex.legend}</div>
        <div class="nums tl" data-at="10.8"><div><b>${n.flagPages}</b>flag pages</div><div><b>${n.eras}</b>eras</div><div><b>${n.regions}</b>record regions</div><div><b>${n.hubs}</b>hubs</div></div>
      </div>
      <div class="callout tl" id="tr-c3" data-at="5" data-until="9.6" style="left:2%;top:46%">${ex.callout}</div>
    </div>
    <div class="narr">
      <p class="eyebrow">Obstacle 2 of 4 &middot; The jurisdiction changed</p>
      <div class="capbox" aria-hidden="true">
        <p class="cap" data-at="0">Then the town changed hands.</p>
        <p class="cap" data-at="2.4">Whose flag? Whose archive kept the paper?</p>
        <p class="cap" data-at="10.6">Grouped into hubs, by region.</p>
      </div>
      <p class="atl">On the Atlas: <a href="${b}/flags/">Flags</a> &middot; <a href="${b}/history/">History</a> &middot; <a href="${b}/flags/#hubsHeadingEl">The ${n.hubs} hubs</a></p>
    </div>
  </section>

  <!-- 4. online is eight things -->
  <section class="ch" data-i="4" data-eyebrow="Obstacle 3 of 4 &middot; &ldquo;Online&rdquo; is eight different things" data-title="Who holds the paper" data-still="12" hidden
    data-sr="${sr[4]}">
    <div class="st">
      <div class="key-wrap tl" data-at="2.4">
        <ul class="key" aria-label="What it costs to look">
          <li class="tl" data-at="2.6"><i class="sw" style="--c:var(--c-free)"></i>Images, free, no account</li>
          <li class="tl" data-at="2.9"><i class="sw" style="--c:var(--c-account)"></i>Images, free login</li>
          <li class="tl" data-at="3.2"><i class="sw" style="--c:var(--c-index)"></i>An index only</li>
          <li class="tl" data-at="3.5"><i class="sw" style="--c:var(--c-mixed)"></i>Part free, part paid</li>
          <li class="tl" data-at="3.8"><i class="sw" style="--c:var(--c-paid)"></i>Behind a paywall</li>
          <li class="tl" data-at="4.1"><i class="sw" style="--c:var(--c-cat)"></i>A catalogue card</li>
          <li class="tl" data-at="4.4"><i class="sw" style="--c:var(--c-onsite)"></i>Paper, in the building</li>
          <li class="tl" data-at="4.7"><i class="sw" style="--c:var(--c-none);box-shadow:0 0 0 1px #8797A0"></i>Nobody has looked</li>
        </ul>
        <p class="note" style="margin-top:8px">Colours placed for the picture. The real ones are on the map.</p>
      </div>
    </div>
    <div class="narr">
      <p class="eyebrow">Obstacle 3 of 4 &middot; &ldquo;Online&rdquo; is eight things</p>
      <div class="capbox" aria-hidden="true">
        <p class="cap" data-at="0">So who holds the paper?</p>
        <p class="cap" data-at="2.2">Every colour is what it costs to look.</p>
        <p class="cap" data-at="7.2">Shelf by shelf, volume by volume.</p>
        <p class="cap" data-at="10.2">A grey dot: nobody has looked.</p>
      </div>
      <p class="atl">On the Atlas: <a href="${b}/">The map</a> &middot; <a href="${b}/providers/">Who holds records</a> &middot; <a href="${b}/coverage/">What's missing</a></p>
    </div>
  </section>

  <!-- 5. not always a register -->
  <section class="ch" data-i="5" data-eyebrow="Obstacle 4 of 4 &middot; The record is not always a register" data-title="In Australia it's a newspaper" data-still="5" hidden
    data-sr="${sr[5]}">
    <div class="st">
      <div class="news tl" data-at="0.3" aria-hidden="true">
        <div class="mast">The Example Courier</div>
        <div class="date"><span>Melbourne</span><span>invented example</span></div>
        <div class="cols">
          <div><i class="ln"></i><i class="ln"></i><i class="ln" style="width:80%"></i><i class="ln"></i><i class="ln" style="width:60%"></i></div>
          <div><i class="ln"></i><i class="ln" style="width:90%"></i><i class="ln"></i><i class="ln" style="width:70%"></i></div>
        </div>
        <div class="hl">Arrivals by the steamer: a family from Fiume<small>highlighted: the line you were looking for</small></div>
        <div class="cols"><div><i class="ln"></i><i class="ln" style="width:75%"></i></div><div><i class="ln"></i><i class="ln"></i></div></div>
      </div>
      <div class="bigcount tl" data-at="2.6"><b class="cnt" data-to="${n.newspapersRaw}">${n.newspapers}</b>digitised newspapers<br>for the Australian record</div>
    </div>
    <div class="narr">
      <p class="eyebrow">Obstacle 4 of 4 &middot; The record is not always a register</p>
      <div class="capbox" aria-hidden="true">
        <p class="cap" data-at="0">Not every record is a register.</p>
        <p class="cap" data-at="2.4">In Australia, it's the newspaper.</p>
      </div>
      <p class="atl">On the Atlas: <a href="${b}/countries/">Countries</a> &middot; <a href="${b}/help/">Help</a></p>
    </div>
  </section>

  <!-- 6. record reader -->
  <section class="ch" data-i="6" data-eyebrow="The Record Reader" data-title="Old hands, old Latin" data-still="9" hidden
    data-sr="${sr[6]}">
    <div class="st"><div class="lw">
      <div class="ledger tl" data-at="0.2" aria-hidden="true">
        <svg viewBox="0 0 420 330" id="tr-ledsvg"><rect width="420" height="330" fill="#D9CFB5"/>
          <g id="tr-ledlines"></g>
          <rect class="hlr tl2" data-at="2.6" x="26" y="86" width="196" height="26" rx="3"/>
          <rect class="hlr tl2" data-at="5.0" x="26" y="152" width="128" height="26" rx="3"/>
          <text class="hand" x="30" y="106">die 30 7bris 1671</text>
          <text class="hand" x="30" y="172">baptizatus, Joannes</text>
        </svg>
        <span class="cap2">an invented example page</span>
      </div>
      <div class="rd">
        <div class="card tl" data-at="2.8"><span class="a">7bris</span> &rarr; <b>September</b><small>die 30 7bris 1671 = 30 September 1671</small></div>
        <div class="card tl" data-at="5.2"><span class="a">Joannes</span> &rarr; <b>John</b><small>Ivan, Johann, Giovanni, Zuane: one name</small></div>
        <div class="card tl" data-at="7.2"><b>Claude drafts a reading.</b> You check it.<small>Only when you press the button. ${n.terms} sourced terms to look up.</small></div>
      </div>
    </div></div>
    <div class="narr">
      <p class="eyebrow">The Record Reader</p>
      <div class="capbox" aria-hidden="true">
        <p class="cap" data-at="0">Found it. Now read it.</p>
        <p class="cap" data-at="2.6">7bris is September.</p>
        <p class="cap" data-at="5.0">Joannes is John.</p>
        <p class="cap" data-at="7.2">Claude drafts. You check.</p>
      </div>
      <p class="atl">On the Atlas: <a href="${b}/read/">Record Reader</a> &middot; <a href="${b}/your-name/">Names</a></p>
    </div>
  </section>

  <!-- 7. tree canvas -->
  <section class="ch" data-i="7" data-eyebrow="Tree Canvas" data-title="Put her in a tree" data-still="16" hidden
    data-sr="${sr[7]}">
    <div class="st">
      <div class="vchips tl" data-at="4.8" id="tr-vchips" aria-hidden="true">
        <span class="chip" data-v="tree">Tree</span><span class="chip" data-v="fan">Fan</span><span class="chip" data-v="sky">Night sky</span><span class="chip" data-v="life">Lifespans</span><span class="chip" data-v="lanes">Place lanes</span><small>+ Surnames, Generations, Household</small>
      </div>
      <div class="fixpill tl" data-at="14.2"><b>Fix list</b><span>3 to tidy (example) &middot; People &middot; Places &middot; Orphans</span></div>
    </div>
    <div class="narr">
      <p class="eyebrow">Tree Canvas</p>
      <div class="capbox" aria-hidden="true">
        <p class="cap" data-at="0">Now put her in a tree.</p>
        <p class="cap" data-at="1.9">Read here. Never uploaded.</p>
        <p class="cap" data-at="5.0">Same people, every view.</p>
        <p class="cap" data-at="14.0">And what needs tidying.</p>
      </div>
      <p class="atl">Invented family; living people appear by name only. On the Atlas: <a href="${b}/tree-canvas/">Tree Canvas</a></p>
    </div>
  </section>

  <!-- 8. compass -->
  <section class="ch" data-i="8" data-eyebrow="Compass" data-title="Where she went" data-still="11" hidden
    data-sr="${sr[8]}">
    <div class="st">
      <div class="reg tl" data-at="9" aria-hidden="true"><h3>Registers to ask for</h3><ul><li><b>Fiume</b> &middot; birth, 1921</li><li><b>Genoa</b> &middot; leaving, 1949</li><li><b>Melbourne</b> &middot; arrival, 1950</li></ul><small>Example only.</small></div>
      <div class="yearbox tl" data-at="0.6">
        <div class="yearrow"><output id="tr-y8v" for="tr-y8">1921</output><span class="who">invented journey</span></div>
        <input type="range" id="tr-y8" min="1921" max="1951" step="0.1" value="1921" aria-label="Year">
        <div class="note">The dashed line joins places in order. It is not the route they took.</div>
      </div>
    </div>
    <div class="narr">
      <p class="eyebrow">Compass</p>
      <div class="capbox" aria-hidden="true">
        <p class="cap" data-at="0">Then follow where she went.</p>
        <p class="cap" data-at="3">Each move, in order.</p>
        <p class="cap" data-at="9">With the registers to ask for.</p>
      </div>
      <p class="atl">On the Atlas: <a href="${b}/tree-canvas/">Tree Canvas</a> &middot; <a href="${b}/looking-for/">Who are you looking for?</a></p>
    </div>
  </section>

  <!-- 9. keep -->
  <section class="ch" data-i="9" data-eyebrow="Keeping your research" data-title="Keep what you find" data-still="6" hidden
    data-sr="${sr[9]}">
    <div class="st">
      <div class="three">
        <div class="k3 tl" data-at="1.0"><svg viewBox="0 0 48 48" aria-hidden="true"><rect x="5" y="9" width="38" height="30" rx="4"/><path d="M5 17h38M11 13h.01M16 13h.01"/></svg><h3>This browser</h3><p>Volumes marked, pages done. No account.</p></div>
        <div class="k3 tl" data-at="2.4"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M12 5h17l8 8v30H12z"/><path d="M29 5v8h8M18 26h14M18 32h14"/></svg><h3>A file you own</h3><p>Back up in one tap. Import it anywhere.</p></div>
        <div class="k3 tl" data-at="3.8"><svg viewBox="0 0 48 48" aria-hidden="true"><rect x="9" y="21" width="30" height="21" rx="4"/><path d="M15 21v-6a9 9 0 0 1 18 0v6M24 29v5"/></svg><h3>Six words</h3><p>An encrypted copy online. No email.</p><code>${ex.words}</code></div>
      </div>
      <p class="safe tl" data-at="4.8">Nothing is sent anywhere unless you press Read it with Claude. Example words from the Atlas.</p>
    </div>
    <div class="narr">
      <p class="eyebrow">Keeping your research</p>
      <div class="capbox" aria-hidden="true">
        <p class="cap" data-at="0">Keep what you find.</p>
        <p class="cap" data-at="1.0">In your browser. No account.</p>
        <p class="cap" data-at="2.4">A file you own. Or six words.</p>
      </div>
      <p class="atl">On the Atlas: <a href="${b}/my-research/">My research</a> &middot; <a href="${b}/backup/">Connection &amp; Backup</a></p>
    </div>
  </section>

  <!-- 10. connect -->
  <section class="ch" data-i="10" data-eyebrow="Connect" data-title="Take it with you" data-still="6" hidden
    data-sr="${sr[10]}">
    <div class="st"><div class="hub tl" data-at="0.3">
      <svg viewBox="0 0 520 360" role="img" aria-label="The Atlas at the centre, connected to data files, the read API, an MCP server for assistants, and Ask Claude">
        <g stroke="#3F515C" stroke-width="1.5" fill="none" stroke-dasharray="4 5" id="hubl">
          <path d="M260 180 L90 70"/><path d="M260 180 L430 70"/><path d="M260 180 L90 290"/><path d="M260 180 L430 290"/>
        </g>
        <circle cx="260" cy="180" r="52" fill="#1B2E36" stroke="#6FB6C6" stroke-width="2"/>
        <text x="260" y="186" text-anchor="middle" font-family="Fraunces,Georgia,serif" font-style="italic" font-size="26" fill="#6FB6C6">Atlas</text>
        <g class="node tl" data-at="1.0"><rect x="14" y="40" width="152" height="60" rx="10" fill="#0B1218" stroke="#3F515C"/><text x="90" y="64" text-anchor="middle" font-size="15" font-weight="600" fill="#E8E6DF">Data files</text><text x="90" y="85" text-anchor="middle" font-size="12" fill="#A6B4BC" font-family="IBM Plex Mono,monospace">one curl line, no key</text></g>
        <g class="node tl" data-at="1.8"><rect x="354" y="40" width="152" height="60" rx="10" fill="#0B1218" stroke="#3F515C"/><text x="430" y="64" text-anchor="middle" font-size="15" font-weight="600" fill="#E8E6DF">Read API</text><text x="430" y="85" text-anchor="middle" font-size="12" fill="#A6B4BC" font-family="IBM Plex Mono,monospace">read-only, any site</text></g>
        <g class="node tl" data-at="2.6"><rect x="14" y="260" width="152" height="60" rx="10" fill="#0B1218" stroke="#3F515C"/><text x="90" y="284" text-anchor="middle" font-size="15" font-weight="600" fill="#E8E6DF">MCP</text><text x="90" y="305" text-anchor="middle" font-size="12" fill="#A6B4BC" font-family="IBM Plex Mono,monospace">for AI assistants</text></g>
        <g class="node tl" data-at="3.4"><rect x="354" y="260" width="152" height="60" rx="10" fill="#0B1218" stroke="#3F515C"/><text x="430" y="284" text-anchor="middle" font-size="15" font-weight="600" fill="#E8E6DF">Ask Claude</text><text x="430" y="305" text-anchor="middle" font-size="12" fill="#A6B4BC" font-family="IBM Plex Mono,monospace">a line or a photo</text></g>
      </svg></div></div>
    <div class="narr">
      <p class="eyebrow">Connect</p>
      <div class="capbox" aria-hidden="true">
        <p class="cap" data-at="0">Take it with you.</p>
        <p class="cap" data-at="1.8">Plain files. An API. An assistant.</p>
      </div>
      <p class="atl">On the Atlas: <a href="${b}/connect/">Connect</a> &middot; <a href="${b}/data/">Use the data</a></p>
    </div>
  </section>

  <!-- 11. what it does not know -->
  <section class="ch" data-i="11" data-eyebrow="What it does not know" data-title="Mostly grey" data-still="9" hidden
    data-sr="${sr[11]}">
    <div class="st">
      <div class="grey tl" data-at="1.2"><b><span class="cnt" data-to="${n.unsurveyedTenths}" data-fmt="pct">${n.unsurveyedPct}%</span></b><span>of ${n.places} places not yet surveyed<br>${n.surveyed} have a cost worked out<br>${n.walked} walked volume by volume</span></div>
      <div class="addcard tl" data-at="5.2"><h3>Know one we lack?</h3>
        <div class="f"><i>Name</i><span id="tr-af1"></span></div><div class="f"><i>Web address</i><span id="tr-af2"></span></div><div class="f"><i>Costs to look</i><span id="tr-af3"></span></div>
        <small>No login. No queue. Nothing is sent from the page: it writes the message, you send it.</small>
        <a class="btn" href="${b}/add/" style="justify-self:start">Add a source</a></div>
    </div>
    <div class="narr">
      <p class="eyebrow">What it does not know</p>
      <div class="capbox" aria-hidden="true">
        <p class="cap" data-at="0">Here is what we don't know.</p>
        <p class="cap" data-at="1.4">Most of the map is grey.</p>
        <p class="cap" data-at="4.6">That's the invitation.</p>
      </div>
      <p class="atl">On the Atlas: <a href="${b}/coverage/">What's missing</a> &middot; <a href="${b}/add/">Add a source</a></p>
    </div>
  </section>

  <!-- 12. doors and coda -->
  <section class="ch" data-i="12" data-eyebrow="Where to start" data-title="Your turn" data-still="3" hidden
    data-sr="${sr[12]}">
    <div class="st"><div class="doors">
      <div class="big3 tl" data-at="0.4">
        <a class="door" href="${b}/your-name/"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 38l8-3 20-20-5-5L11 30z"/><path d="M28 10l5 5"/></svg><b>Type a name</b><span>A place, a surname, a first name</span></a>
        <a class="door" href="${b}/tree-canvas/"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 40V22M24 22l-10-8M24 22l10-8M24 30l-8-5"/><circle cx="14" cy="12" r="4"/><circle cx="34" cy="12" r="4"/><circle cx="24" cy="42" r="3"/></svg><b>Drop in a tree</b><span>A GEDCOM, read in your browser</span></a>
        <a class="door" href="${b}/looking-for/"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 6h22l8 8v28H10z"/><path d="M32 6v8h8M16 24h18M16 31h18M16 38h10"/></svg><b>Tell a story</b><span>Who you are looking for, in a sentence</span></a>
      </div>
      <ul class="quiet tl" data-at="1.2">
        <li><a href="${b}/"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>Map</a></li>
        <li><a href="${b}/your-name/"><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h10M4 18h6"/></svg>Names</a></li>
        <li><a href="${b}/flags/"><svg viewBox="0 0 24 24"><path d="M5 21V4M5 5h13l-3 4 3 4H5"/></svg>Flags</a></li>
        <li><a href="${b}/history/"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>History</a></li>
        <li><a href="${b}/read/"><svg viewBox="0 0 24 24"><path d="M5 4h11l3 3v13H5z"/><path d="M8 11h8M8 15h6"/></svg>Reader</a></li>
        <li><a href="${b}/connect/"><svg viewBox="0 0 24 24"><path d="M9 8l-4 4 4 4M15 8l4 4-4 4"/></svg>Connect</a></li>
      </ul>
      <div class="coda tl" data-at="2.0">
        <p style="margin:0"><b>Where it came from</b>One family's archive, opened to the world. There are <a href="${b}/my-work/">nine such archives</a>.</p>
        <p style="margin:0"><b>How it is built</b>A static site: no server, no database, no account. Public JSON, <a href="https://github.com/daviddef/TheMap">in a public repository</a>, gated before it ships. Natural Earth, GeoNames (CC BY 4.0), OpenStreetMap.</p>
        <p style="margin:0;grid-column:1/-1">Behind the atlas: <a href="${b}/worklist/">What is being done</a> &middot; <a href="${b}/errands/">Letters to send</a> &middot; <a href="${b}/my-work/">My work</a> &middot; <a href="${b}/changelog/">What changed</a></p>
      </div>
    </div></div>
    <div class="narr">
      <p class="eyebrow">Where to start</p>
      <div class="capbox" aria-hidden="true">
        <p class="cap" data-at="0">Your turn.</p>
      </div>
      <div class="chips tl" data-at="1.6"><button class="btn pri" id="tr-end-close" type="button">Open the map</button><button class="btn" id="tr-end-again" type="button">Play again</button></div>
    </div>
  </section>

  </div><!-- /chs -->

  <div class="ctl">
    <button class="btn" id="tr-prev" type="button" aria-label="Previous chapter">&#8592; <span>Back</span></button>
    <div class="rail" id="tr-rail" role="group" aria-label="Chapters"></div>
    <button class="btn pri" id="tr-next" type="button" aria-label="Next chapter"><span>Next</span> &#8594;</button>
  </div>
  <div class="sr" id="tr-live" aria-live="polite" aria-atomic="true"></div>
</div>


<script type="application/json" id="ra-tour-data">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
}
