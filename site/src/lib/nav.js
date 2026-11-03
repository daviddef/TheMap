/* The site menu, one list. Base.astro renders it on every page; the Roots & Routes page (src/pages/roots/) renders it too, without the
   counter and ads that Base carries. Moved here verbatim from Base.astro so the two cannot drift. */
export const nav = [
  /* SURNAMES ARE THE FRONT DOOR AND WERE FILED AS A DATASET. People arrive
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
  ["The map", "/"],
  ["Surnames", "/surnames/"],
  ["Places", "/places/"],
  ["Roots & Routes", "/roots/"],
  ["The sources", [
    ["/providers/", "Who holds records"],
    ["/jurisdictions/", "Whose archive"],
    ["/coverage/", "What's missing"],
    /* Phase 4B. The survey queue was a column in a JSON file; 316 sources
       nobody has opened is the atlas's clearest bottleneck, and one person
       cannot close it. This is the way in for anybody with an evening. */
    ["/survey/", "Survey a source"],
  ]],
  /* FLAGS IS A DIRECT LINK, NOT A DROPDOWN, and the shape of this array had to
     grow one case to allow it. Every other entry here is [label, [links]] and
     renders as a disclosure; a disclosure holding a single item is a click in
     front of a click. The 245 flag pages have one front door — their own
     landing page, kept exactly as it was — so the menu item IS the door.
     A string second element means a direct link. */
  ["Flags", "/flags/"],
  /* THE SECOND ROOM. Conquest and migration were the last rows of a dropdown
     inside the records map, drawing nothing until a year was set. David: «it
     really isn't visual enough. It's hidden away.» It has its own page now,
     and its own word in the bar. */
  ["History", "/history/"],
  ["About", [
    ["/start/", "Start here"],
    /* The two prose panels that used to sit folded under the map. Folding
       them was right for the front page and wrong as a home: a reader who
       wants them is asking for help, and a reader who does not should never
       meet them. */
    ["/help/", "Help"],
    ["/about/", "About the atlas"],
    /* The nine family archives used to sit under the map on the front page.
       Below a map they read as documentation of somebody else's research, in
       the place a reader was trying to find their own — so the strip was cut
       to one line and the long version had nowhere to live. It lives here. */
    ["/my-work/", "My work"],
    /* The files this map draws from are public URLs and nothing said so.
       A licence nobody can find is a licence nobody can act on. */
    ["/data/", "Use the data"],
    /* Both were footer-only links. The footer had grown to five stacked
       blocks and half of it duplicated this menu — About, Use the data and
       Add a source all appear above. These two did not, so they move up
       rather than disappear. */
    ["/privacy/", "Privacy"],
    ["/changelog/", "What changed"],
    ["/worklist/", "What is being done"],
    /* The letters this atlas has drafted and not sent. It sits beside the work
       list for the same reason the work list exists: a gap nobody is told
       about is a gap nobody can close. These are the ones a person has to
       close, because the archive has said no to crawlers or its server has
       stopped answering. */
    ["/errands/", "Letters to send"],
  ]],
];
