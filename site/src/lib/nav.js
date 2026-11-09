import fs from "node:fs";

/* THE PLACES MENU POINTS AT THE HUBS; IT DOES NOT LIST THEM. David once asked for the full hub list in a sub menu; with 34 hubs it took
   the whole menu, so it is one row to the Flags Atlas's hub section now. The hubs are read from public/flag-index.json (the same 34 the
   page shows) at build time, so the count stays right with no second list to keep. If the file cannot be read the entry falls back to
   the plain Flags link, never a half menu. */
function hubLinks() {
  try {
    const j = JSON.parse(fs.readFileSync("public/flag-index.json", "utf8"));
    return (j.hubs || []).map((h) => ["/" + String(h.url).replace(/^\/+/, "").replace(/\.html$/, "/"), h.name]);
  } catch (e) { return []; }
}
const hubs = hubLinks();

/* The site menu, one list. Base.astro renders it on every page; the Roots & Routes page (src/pages/roots/) renders it too, without the
   counter and ads that Base carries. Moved here verbatim from Base.astro so the two cannot drift. */
export const nav = [
  /* NAMES ARE THE FRONT DOOR AND WERE FILED AS A DATASET. People arrive
     holding a name far more often than a place — it is the one thing on a
     certificate that survives every border change — and 23,930 of these
     pages exist, each naming the spellings, the countries, and the archives
     to write to. The navigation listed them fourth, under a word that reads
     like a table of statistics. Second, and named as the question. */
  /* FOUR DOORS, NOT A CUPBOARD WITH FOUR DOORS INSIDE IT. David: «could we
     move "every place" to the top menu level as "Places"? Surnames as
     "Surnames", and Research as "My Research"?» He is right, and the comment
     further down this file already argued his case: «a disclosure holding a
     single item is a click in front of a click». Explore held the four things
     a reader actually comes here to do, behind one word that names none of
     them, and pulling three out would have left the fourth alone in a menu.
     So all four come out, and Explore goes.

     NAMED AS THE THING, NOT AS THE INVITATION. «Look up a surname» and «Every
     place» are sentences for a menu with room; a top-level bar wants nouns.
     Sentence case throughout, because «My Research» beside «The sources»
     reads as two different hands. */
  /* HISTORY IS THE MAP'S OTHER HALF. David: «the history menu, can that be under the map tab, it's really an extension of the same
     thing?» It is: the same ground, played through time. So the map is a group of two, and History left the bar as a word of its own. */
  ["The map", [
    ["/", "The records map"],
    ["/history/", "History"],
  ]],
  /* NAMES IS ONE DOOR, NOT THREE PAGES. «Surnames» opened the dataset page, «Say your name» was reachable only from the home
     page, and the spellings catalogue was reachable from neither. A person holding a name does not know which of them to
     want. /your-name/ is the one page now (a Given name / Surname switch, the finder that answers on the map, the spellings
     and what each rests on); /surnames/ stays at its address as the dataset page it always was. */
  ["Names", "/your-name/"],
  ["Roots & Routes", "/roots/"],
  /* THE RECORD READER HAS ITS OWN DOOR. David: «can we add a icon in our top menu for the "Record Reader"?» It was filed under About as
     "Reading old records", three clicks from the person holding a register line. It is one page, so it is a link, not a disclosure; the
     icon is drawn by styles.css on the href, so a label that changes still has it. */
  ["Record Reader", "/read/"],
  /* PLACES HOLDS THE FLAGS TOO. David: «could we bring flags under the places menu tab?» A flag page is a country's other face (see the
     links between a country page and its flag history), so the two share a door: every place, the countries, the Flags Atlas, then ONE row to
     the hubs (the Flags Atlas page's own hub section). They were listed here, 34 rows, and took the whole menu; the count is read from
     the Flags Atlas index at build time, so it stays right by itself. */
  hubs.length
    ? ["Places", [["/places/", "Every place"], ["/countries/", "Countries"], [null, "Flags"], ["/flags/", "The Flags Atlas: every country"], ["/flags/#hubsHeadingEl", "The " + hubs.length + " hubs, by region"]]]
    : ["Places", [["/places/", "Every place"], ["/countries/", "Countries"], ["/flags/", "The Flags Atlas"]]],
  /* FOUR ROWS, NOT TEN. David, looking at the menu: «there are so many options here, and they're really just showing help stuff ... it
     needs to be neat, exciting and simple.» The four that help a reader are here. The project's own pages (what is being done, the
     letters, my work, what changed) and the fine print (the data, privacy) are in the footer, where a person who wants them looks,
     and where a person who does not never has to read past them. What's new is in About, and About flashes when there is news. */
  /* THE SOURCES JOINED ABOUT, AS A SECOND TIER. David: «can we merge sources into about? maybe in a 2 tier menu?» A row whose first
     element is null is a heading, not a link: the panel reads "Learn" then four pages, "The sources" then four pages. */
  ["About", [
    [null, "Learn"],
    ["/whats-new/", "What's new"],
    ["/start/", "Start here"],
    ["/looking-for/", "Who are you looking for?"],
    ["/help/", "Help"],
    ["/about/", "About the atlas"],
    [null, "The sources"],
    ["/providers/", "Who holds records"],
    ["/jurisdictions/", "Whose archive"],
    ["/coverage/", "What's missing"],
    /* Phase 4B. The survey queue was a column in a JSON file; 316 sources nobody has opened is the atlas's clearest bottleneck, and
       one person cannot close it. This is the way in for anybody with an evening. */
    ["/survey/", "Survey a source"],
    /* Moved here from the header bar, where it was a pill on every page. */
    ["/add/", "Add source"],
  ]],
];

/* The footer keeps only what no help or sources page already says: the licences and the privacy note. The project's own pages (what is
   being done, letters to send, what changed, my work) are linked from the end of About. */
export const footLinks = [
  ["/data/", "Use the data"],
  ["/privacy/", "Privacy"],
];
