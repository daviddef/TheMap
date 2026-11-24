/* ADVERSARIAL CASES: the awkward, obscure and hostile ways people write a family story. Same shape as corpus.mjs. A case with `gap` is a known hole: it is listed, not failed,
   and run.mjs says so the day it starts to pass (remove the gap then). */
const NFD = (s) => s.normalize("NFD");
export const C = [
 // ---- typography: the same story must read the same
 { id:"adv-nfd", t:NFD("He was born in Kraków in 1921 and died in Zürich in 1990."), e:{stops:["Krak","Z"], years:[1921,1990]} },
 { id:"adv-nbsp", t:"He was born in Senj in 1880.", e:{stops:["Senj"], years:[1880]} },
 { id:"adv-zerowidth", t:"My grand​father was born in Cork​ in 1900.", e:{stops:["Cork"], years:[1900], rel:"grandfather"} },
 { id:"adv-tabs-newlines", t:"Born\tin   Senj,\n\n Croatia   in 1880.", e:{stops:["Senj"], years:[1880]} },
 { id:"adv-crlf", t:"My father was born in Cork.\r\nHe moved to Boston in 1923.\r\n", e:{stops:["Cork","Boston"], years:[null,1923]} },
 { id:"adv-allcaps", t:"BORN IN SENJ IN 1880, DIED IN ZAGREB IN 1950.", e:{stops:["Senj","Zagreb"], years:[1880,1950]} },
 { id:"adv-lowercase", t:"born in senj in 1880 died in zagreb 1950", e:{stops:["Senj","Zagreb"], years:[1880,1950]} },
 { id:"adv-fullwidth", t:"Ｈｅ ｗａｓ ｂｏｒｎ ｉｎ Ｃｏｒｋ ｉｎ １９００．", e:{stops:["Cork"], years:[1900]} },
 { id:"adv-smart-quotes", t:"My grandfather’s brother was born in O’Brien’s Bridge, then moved to Cork.", e:{stops:["O\u2019Brien\u2019s Bridge","Cork"]} },
 // ---- hostile strings
 { id:"adv-proto", t:"My grandfather __proto__ was born in constructor and moved to toString.", e:{stops:[]} },
 { id:"adv-html", t:"<script>alert(1)</script> My father was born in Cork.", e:{stops:["Cork"], rel:"father"} },
 { id:"adv-emoji", t:"My nan \u{1F475} was born in Leeds \u{1F1EC}\u{1F1E7} in 1920.", e:{stops:["Leeds"], years:[1920]} },
 { id:"adv-only-punct", t:"?!?! ... ,,, ;;;", e:{stops:[]} },
 { id:"adv-digits", t:"1 2 3 4 5 6 7 8 9 10 11 12 1066 1492 1923", e:{stops:[]} },
 // ---- places that are also words, names, or other places
 { id:"adv-kraków-accent", t:"He was born in Kraków.", e:{stops:["Krak"], cc:["PL"]} },
 { id:"adv-born-the-verb", t:"Born in Krakow in 1880.", e:{stops:["Krak"], years:[1880], cc:["PL"]} },
 { id:"adv-list-given-places", t:"They lived in Perth, Sydney and Melbourne.", e:{stops:["Perth","Sydney","Melbourne"], cc:["AU","AU","AU"]} },
 { id:"adv-list-paris", t:"He lived in Lyon, Paris and Marseille.", e:{stops:["Lyon","Paris","Marseille"]} },
 { id:"adv-list-late", t:"She lived in Springfield, Peoria and Chicago.", e:{stops:["Springfield","Peoria","Chicago"]} },
 { id:"adv-sydney-first", t:"He visited Sydney, Perth and Melbourne.", gap:"Perth is read as Perth in Canada: the Atlas has no Perth in Australia with books", e:{stops:["Sydney","Perth","Melbourne"], cc:["AU","AU","AU"]} },
 { id:"adv-wales", t:"My family came from Wales and moved to Pennsylvania.", e:{stops:["Wales","Pennsylvania"], cc:["GB","US"]} },
 { id:"adv-scotland", t:"My family came from Scotland and moved to Pennsylvania.", e:{stops:["Scotland","Pennsylvania"], cc:["GB","US"]} },
 { id:"adv-wales-nsw", t:"They came from Wales to Australia.", e:{stops:["Wales","Australia"], cc:["GB","AU"]} },
 { id:"adv-new-south-wales", t:"He was born in New South Wales in 1890.", e:{stops:["New South Wales"]} },
 { id:"adv-cousins-are-people", t:"My cousins Paris and Florence live in Dublin.", e:{stops:["Dublin"]}, gap:"Paris is still read as a place beside the cousins' names" },
 { id:"adv-two-poland", t:"My father Józef Kowalski was born in Kraków in 1921, lived in Warsaw, and died in London in 1999.", e:{stops:["Krak","Warsaw","London"], cc:["PL","PL","GB"]} },
 { id:"adv-krakow-warsaw", t:"He was born in Kraków in 1921 and lived in Warsaw.", e:{stops:["Krak","Warsaw"], cc:["PL","PL"]} },
 // ---- Slavic case endings
 { id:"adv-slovene", t:"Moj dedo se je rodil v Ljubljani in umrl v Mariboru.", e:{stops:["Ljubljana","Maribor"]} },
 { id:"adv-polish", t:"Mój dziadek urodził się w Krakowie.", e:{stops:["Krak"]} },
 { id:"adv-croatian-locative", t:"Moj djed rođen je u Senju, umro u Zagrebu.", e:{stops:["Senj","Zagreb"]} },
 // ---- years in odd company
 { id:"adv-year-after", t:"Born in Cork 1900, died in Boston 1970.", e:{stops:["Cork","Boston"], years:[1900,1970]} },
 { id:"adv-apostrophe-year", t:"He left Cork in '23 and reached Boston in '24.", e:{stops:["Cork","Boston"], years:[1923,1924]} },
 { id:"adv-street-number", t:"He lived at 1923 Main Street in Boston.", e:{stops:["Boston"], years:[null]} },
 { id:"adv-age", t:"He was 45 when he left Cork in 1923.", e:{stops:["Cork"], years:[1923]} },
 // ---- what did not happen
 { id:"adv-hypothetical", t:"He planned to go to Boston but stayed in Cork.", e:{stops:["Cork"]} },
 { id:"adv-negated", t:"He never went to Boston; he lived all his life in Cork.", e:{stops:["Cork"]} },
 // ---- names in awkward dress
 { id:"adv-nickname-quoted", t:"Ivan \"Johnny\" Horvat was born in Senj in 1880.", e:{stops:["Senj"], years:[1880], name:"Ivan Horvat"} },
 { id:"adv-nickname-paren", t:"Ivan (Johnny) Horvat was born in Senj in 1880.", e:{stops:["Senj"], years:[1880], name:"Ivan Horvat"} },
 { id:"adv-brothers-are-people", t:"The Horvat brothers, Ivan and Petar, left Senj in 1905.", e:{stops:["Senj"], years:[1905]} },
 { id:"adv-brothers-lead", t:"Brothers Ivan and Petar left Senj in 1905.", e:{stops:["Senj"], years:[1905]} },
 { id:"adv-particle-de-la", t:"Maria de la Cruz was born in Seville in 1900.", e:{stops:["Sevil"], cc:["ES"]} },
 { id:"adv-particle-van-der", t:"Jan van der Berg was born in Utrecht in 1890 and moved to Chicago.", e:{stops:["Utrecht","Chicago"]} },
 { id:"adv-my-name-is", t:"My name is Ivan. I was born in Senj.", e:{stops:["Senj"], name:"Ivan"}, gap:"a first name told as «my name is» is not kept as the teller's name" },
 // ---- dates in awkward dress
 { id:"adv-b-d-abbrev", t:"b. 1880 Senj, d. 1950 Zagreb", e:{stops:["Senj","Zagreb"], years:[1880,1950]}, gap:"«b. 1880 Senj»: the birth year is read but not tied to the place" },
 { id:"adv-paren-roles", t:"1880 Senj (born), 1950 Zagreb (died)", e:{stops:["Senj","Zagreb"], years:[1880,1950]}, gap:"a role in brackets after the place is given to the other place" },
 { id:"adv-between-years", t:"Between 1880 and 1890 the family moved from Senj to Rijeka.", e:{stops:["Senj","Rijeka"], years:[null,1890]}, gap:"the start of a range is lost; Senj gets the later year" },
 { id:"adv-decade", t:"He emigrated in the 1920s from Cork to Boston.", e:{stops:["Cork","Boston"]} },
 { id:"adv-uncertain-place", t:"He was born around 1880 in either Senj or Rijeka; we aren't sure which.", e:{stops:["Senj","Rijeka"]} },
 // ---- the same name twice
 { id:"adv-london-twice", t:"He was born in London, Ontario and later lived in London, England.", e:{stops:["London","London"], cc:["CA","GB"]}, gap:"a place named twice with different qualifiers is read once, and «England» becomes a stop" },
 { id:"adv-old-new-name", t:"Born in Danzig 1900; died in Gdańsk 1980.", e:{stops:["Gda","Gda"], years:[1900,1980]}, gap:"the old and the new name of one place are folded into one stop and the second year is lost" },
 { id:"adv-two-people-years", t:"I was born in 1980 in Sydney. My daughter was born in 2010 in Perth.", e:{stops:["Sydney","Perth"], years:[1980,2010]}, gap:"a second person's year is not kept for her place" },
 // ---- size
 { id:"adv-long", t:("My grandfather was born in Cork in 1900. ").repeat(400), e:{stops:undefined} },
 { id:"adv-many-places", t:["Cork","Limerick","Galway","Dublin","Belfast","Derry","Sligo","Kerry","Mayo","Clare"].map((x,i)=>"In "+(1900+i)+" he moved to "+x+".").join(" "), e:{stops:["Cork","Limerick","Galway","Dublin","Belfast","Derry","Sligo","Kerry","Mayo","Clare"]} },
];

/* FAMOUS CITIES WITH MANY NAMESAKES: each one, named alone, is the city, in its country (Lisbon is in Portugal, not Ohio; Cardiff is in Wales, not New South Wales). An entry that
   still fails is listed in FAMOUS_GAPS. */
const FAMOUS = {Lisbon:"PT",Madrid:"ES",Barcelona:"ES",Valencia:"ES",Seville:"ES",Geneva:"CH",Zurich:"CH",Basel:"CH",Bern:"CH",Cardiff:"GB",Belfast:"GB",Glasgow:"GB",Liverpool:"GB",Manchester:"GB",Birmingham:"GB",Bristol:"GB",Leeds:"GB",Sheffield:"GB",Newcastle:"GB",York:"GB",Plymouth:"GB",Nottingham:"GB",Copenhagen:"DK",Stockholm:"SE",Oslo:"NO",Helsinki:"FI",Moscow:"RU",Kiev:"UA",Kyiv:"UA",Minsk:"BY",Riga:"LV",Vilnius:"LT",Tallinn:"EE",Sofia:"BG",Belgrade:"RS",Zagreb:"HR",Sarajevo:"BA",Skopje:"MK",Tirana:"AL",Vienna:"AT",Salzburg:"AT",Graz:"AT",Prague:"CZ",Brno:"CZ",Bratislava:"SK",Budapest:"HU",Hamburg:"DE",Munich:"DE",Frankfurt:"DE",Dresden:"DE",Leipzig:"DE",Nuremberg:"DE",Stuttgart:"DE",Paris:"FR",Lyon:"FR",Marseille:"FR",Nice:"FR",Strasbourg:"FR",Amsterdam:"NL",Rotterdam:"NL",Antwerp:"BE",Brussels:"BE",Luxembourg:"LU",Rome:"IT",Milan:"IT",Naples:"IT",Turin:"IT",Palermo:"IT",Bologna:"IT",Athens:"GR",Istanbul:"TR",Ankara:"TR",Tehran:"IR",Baghdad:"IQ",Beirut:"LB",Tel_Aviv:"IL",Cairo:"EG",Tunis:"TN",Algiers:"DZ",Casablanca:"MA",Lagos:"NG",Nairobi:"KE",Johannesburg:"ZA",Durban:"ZA",Mumbai:"IN",Delhi:"IN",Karachi:"PK",Dhaka:"BD",Colombo:"LK",Bangkok:"TH",Singapore:"SG",Manila:"PH",Tokyo:"JP",Osaka:"JP",Seoul:"KR",Beijing:"CN",Shanghai:"CN",Auckland:"NZ",Wellington:"NZ",Adelaide:"AU",Brisbane:"AU",Toronto:"CA",Montreal:"CA",Vancouver:"CA",Ottawa:"CA",Halifax:"CA",Chicago:"US",Boston:"US",Philadelphia:"US","Buenos Aires":"AR",Montevideo:"UY",Santiago:"CL",Lima:"PE",Bogota:"CO",Caracas:"VE","Mexico City":"MX",Havana:"CU","Rio de Janeiro":"BR","Sao Paulo":"BR",Kingston:"JM",Dublin:"IE",Cork:"IE",Edinburgh:"GB",Aberdeen:"GB",Dundee:"GB",Cologne:"DE",Hanover:"DE",Brunswick:"DE",Naples_:"IT",Venice:"IT",Florence:"IT",Genoa:"IT",Verona:"IT",Padua:"IT",Moscow_:"RU",Warsaw:"PL",Krakow:"PL",Gdansk:"PL",Poznan:"PL",Wroclaw:"PL",Lodz:"PL",Lviv:"UA",Odessa:"UA",Bucharest:"RO",Belgrade_:"RS",Thessaloniki:"GR",Nicosia:"CY",Valletta:"MT",Reykjavik:"IS"};
const FAMOUS_GAPS = { Frankfurt: "the gazetteer and the index hold no «Frankfurt» on its own (it is Frankfurt am Main)" };
for (const [k, cc] of Object.entries(FAMOUS)) {
  const name = k.replace(/_/g, " ").trim();
  C.push({ id: "city-" + name.toLowerCase().replace(/ /g, "-") + (k.endsWith("_") ? "-2" : ""), t: "He was born in " + name + ".", e: { cc: [cc] }, ...(FAMOUS_GAPS[name] ? { gap: FAMOUS_GAPS[name] } : {}) });
}
