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
  ["Places", "/places/"],
  ["Roots & Routes", "/roots/"],
  /* FLAGS IS A DIRECT LINK, NOT A DROPDOWN, and the shape of this array had to
     grow one case to allow it. Every other entry here is [label, [links]] and
     renders as a disclosure; a disclosure holding a single item is a click in
     front of a click. The 245 flag pages have one front door — their own
     landing page, kept exactly as it was — so the menu item IS the door.
     A string second element means a direct link. */
  ["Flags", "/flags/"],
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
    ["/read/", "Reading old records"],
    ["/help/", "Help"],
    ["/about/", "About the atlas"],
    [null, "The sources"],
    ["/providers/", "Who holds records"],
    ["/jurisdictions/", "Whose archive"],
    ["/coverage/", "What's missing"],
    /* Phase 4B. The survey queue was a column in a JSON file; 316 sources nobody has opened is the atlas's clearest bottleneck, and
       one person cannot close it. This is the way in for anybody with an evening. */
    ["/survey/", "Survey a source"],
  ]],
];

/* The pages that left the About menu, for the footer. One list so the footer and its test read the same names. */
export const footLinks = [
  ["/data/", "Use the data"],
  ["/privacy/", "Privacy"],
  ["/changelog/", "What changed"],
  ["/worklist/", "What is being done"],
  ["/errands/", "Letters to send"],
  ["/my-work/", "My work"],
];
