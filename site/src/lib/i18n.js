/* THE ATLAS SPEAKS ENGLISH AT PEOPLE RESEARCHING CROATIA.
 *
 * Everyone this is for — somebody after a Gračišće baptism, a Puglia
 * birth, a Wielkopolska parish — is likelier to read Croatian, Italian or
 * Polish than English, and every word of it was in English.
 *
 * WHAT THIS DOES AND DOES NOT DO, because the difference is the whole
 * design:
 *
 *   It translates the CHROME — the controls, the labels, the opening
 *   panel, the words that tell a reader what to type and what a colour
 *   means. That is the first thirty seconds, which is where somebody
 *   decides whether this site is for them.
 *
 *   It does NOT translate the prose. The essays on this site are careful
 *   about evidence — what «attested» means, what a grey dot does not
 *   mean, why an absence is not a finding — and worklist row 53 is right
 *   that running that through a translator produces confident nonsense in
 *   another language. Those paragraphs stay in English until somebody who
 *   speaks the language reads them.
 *
 *   It does NOT create translated URLs, and therefore carries no
 *   hreflang. There is one page per place, and it is honest to say so:
 *   hreflang pointing at a page that is 90% English would be a claim this
 *   site cannot back. Translated routes would also triple a 46,000-page
 *   build. That is the next step and it is deliberately not this one.
 *
 * Croatian and Italian first, because that is the deepest ground here.
 * A language with no table falls back to English, key by key, so a
 * half-finished translation is never a blank label.
 */

export const LANGS = [
  ["en", "English"],
  ["hr", "Hrvatski"],
  ["it", "Italiano"],
];

/* Keys are the English string, so a missing translation renders as the
   original rather than as a key name — the failure mode is «not yet
   translated», never «broken». */
const HR = {
  "The map": "Karta",
  "Look up a surname": "Potraži prezime",
  "Every place": "Sva mjesta",
  "Countries": "Države",
  "Who holds records": "Tko čuva zapise",
  "Whose archive": "Čiji arhiv",
  "What's missing": "Što nedostaje",
  "Start here": "Počnite ovdje",
  "About the atlas": "O atlasu",
  "Use the data": "Koristite podatke",
  "What changed": "Što se promijenilo",
  "What is being done": "Što se radi",

  "Find a place or a surname \u2014 Gallignana \u00b7 \u017dubrini\u0107 \u00b7 Lerena":
    "Na\u0111ite mjesto ili prezime \u2014 Gallignana \u00b7 \u017dubrini\u0107 \u00b7 Lerena",
  "Find a place or a surname, by any name it has ever had":
    "Na\u0111ite mjesto ili prezime, po bilo kojem imenu koje je ikad nosilo",
  "Churches and parishes": "Crkve i \u017eupe",
  "Skip to the map": "Prije\u0111i na kartu",
  "Language:": "Jezik:",
  "Start with what you have": "Počnite s onim što imate",
  "A surname.": "Prezime.",
  "A village, by any name it ever had.": "Selo, pod bilo kojim imenom koje je nosilo.",
  "Only a country.": "Samo država.",
  "The colour of a dot is what it costs to look":
    "Boja točke govori koliko košta pogledati",

  "What it costs to look": "Koliko košta pogledati",
  "What kind of record": "Koja vrsta zapisa",
  "Images, free, no account": "Slike, besplatno, bez računa",
  "Images, free, account needed": "Slike, besplatno, treba račun",
  "An index only — no images": "Samo kazalo — bez slika",
  "Partly free, partly paid": "Dijelom besplatno, dijelom plaćeno",
  "Images, behind a paywall": "Slike, iza plaćanja",
  "A catalogue entry — not photographed": "Kataložna jedinica — nije snimljeno",
  "On paper, in the building": "Na papiru, u zgradi",
  "Nobody has walked this one yet": "Ovo još nitko nije prošao",

  "Shelf": "Polica",
  "Archives": "Arhivi",
  "Jurisdiction": "Nadležnost",
  "Others": "Ostalo",
  "Cemeteries": "Groblja",
  "Churches": "Crkve",
  "Libraries": "Knjižnice",

  "Loading the atlas…": "Učitavanje atlasa…",
  "Back to the map": "Natrag na kartu",
  "Print this plan": "Ispiši ovaj plan",
  "places": "mjesta",
  "place": "mjesto",
  "volumes": "svezaka",
  "Play the years": "Pokreni godine",
  "Clear the year": "Poništi godinu",
};

const IT = {
  "The map": "La mappa",
  "Look up a surname": "Cerca un cognome",
  "Every place": "Tutti i luoghi",
  "Countries": "Paesi",
  "Who holds records": "Chi conserva i registri",
  "Whose archive": "Di chi è l'archivio",
  "What's missing": "Cosa manca",
  "Start here": "Comincia qui",
  "About the atlas": "Informazioni sull'atlante",
  "Use the data": "Usa i dati",
  "What changed": "Cosa è cambiato",
  "What is being done": "Cosa si sta facendo",

  "Find a place or a surname \u2014 Gallignana \u00b7 \u017dubrini\u0107 \u00b7 Lerena":
    "Trova un luogo o un cognome \u2014 Gallignana \u00b7 \u017dubrini\u0107 \u00b7 Lerena",
  "Find a place or a surname, by any name it has ever had":
    "Trova un luogo o un cognome, con qualunque nome abbia mai avuto",
  "Churches and parishes": "Chiese e parrocchie",
  "Skip to the map": "Vai alla mappa",
  "Language:": "Lingua:",
  "Start with what you have": "Comincia da quello che hai",
  "A surname.": "Un cognome.",
  "A village, by any name it ever had.": "Un paese, con qualunque nome abbia avuto.",
  "Only a country.": "Soltanto un paese.",
  "The colour of a dot is what it costs to look":
    "Il colore di un punto dice quanto costa guardare",

  "What it costs to look": "Quanto costa guardare",
  "What kind of record": "Che tipo di registro",
  "Images, free, no account": "Immagini, gratis, senza account",
  "Images, free, account needed": "Immagini, gratis, serve un account",
  "An index only — no images": "Solo un indice — nessuna immagine",
  "Partly free, partly paid": "In parte gratis, in parte a pagamento",
  "Images, behind a paywall": "Immagini, a pagamento",
  "A catalogue entry — not photographed": "Una scheda di catalogo — non fotografata",
  "On paper, in the building": "Su carta, in sede",
  "Nobody has walked this one yet": "Nessuno l'ha ancora percorso",

  "Shelf": "Scaffale",
  "Archives": "Archivi",
  "Jurisdiction": "Giurisdizione",
  "Others": "Altri",
  "Cemeteries": "Cimiteri",
  "Churches": "Chiese",
  "Libraries": "Biblioteche",

  "Loading the atlas…": "Caricamento dell'atlante…",
  "Back to the map": "Torna alla mappa",
  "Print this plan": "Stampa questo piano",
  "places": "luoghi",
  "place": "luogo",
  "volumes": "volumi",
  "Play the years": "Scorri gli anni",
  "Clear the year": "Azzera l'anno",
};

export const TABLES = { hr: HR, it: IT };

/* One translated string. Unknown language or unknown key returns the
   English, which is the string itself. */
export function t(lang, s) {
  const tab = TABLES[lang];
  return (tab && tab[s]) || s;
}

/* How many of the chrome strings each language actually has, so the page
   can be honest about being part-translated rather than implying a full
   localisation. Counted, not claimed. */
export function coverage() {
  const keys = new Set([...Object.keys(HR), ...Object.keys(IT)]);
  return LANGS.map(([code, name]) => ({
    code, name,
    strings: code === "en" ? keys.size : Object.keys(TABLES[code] || {}).length,
    of: keys.size,
  }));
}
