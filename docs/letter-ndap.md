# Letter to the Naczelna Dyrekcja Archiwów Państwowych — the fonds inventory

**Status: a draft for David to send. Nothing here has been sent.**
Written 23 September 2026. Work list row 33.

## Why this letter exists

Poland is the largest hole in this atlas's coverage that is not a hole in
the world. The Polish State Archives hold the scanned civil registration of
the Prussian partition, the parish duplicates before 1874, and the
population books from 1837, and they publish them free to read and
download. None of it is in Record Atlas, and the reason is not that anybody
is hiding it.

**Genealogia w Archiwach** (`genealogiawarchiwach.pl`) is a Vaadin
application. Every URL on it returns the same application shell —
`robots.txt` and `sitemap.xml` included, which is how this was established
rather than assumed — and the data moves over a stateful UIDL protocol.
There is no crawlable surface. That is a different thing from a bot gate:
nobody is refusing us, there is simply nothing addressable to read.

**Szukaj w Archiwach** (`szukajwarchiwach.gov.pl`) is behind Imperva.
`robots.txt` itself returns a JavaScript challenge marked
`noindex,nofollow`, so we cannot read the archives' own crawling policy,
let alone crawl. This atlas does not work around bot gates, and it will not
here. It is worth saying plainly in the letter that we stopped at the door.

**dane.gov.pl** — the national open data portal — was checked before
writing. There is no Naczelna Dyrekcja Archiwów Państwowych institution on
it and no dataset from the state archives. So the thing being asked for is
not already public somewhere we failed to look.

That leaves asking. This is an email, like the Meertens letter, not a
harvester.

## What is actually being asked for

Not the scans. Not anything about people. **The inventory**: which fonds
(*zespoły*) and series exist, which archive holds each, which place and
which years each covers. That is a catalogue of holdings — the thing this
atlas is made of — and it is the layer that turns "Poland" into "write to
the State Archive in Poznań for this parish, these years".

## Where to send it

Naczelna Dyrekcja Archiwów Państwowych, ul. Rakowiecka 2D, 02-517 Warszawa
— via the contact address on `archiwa.gov.pl`. Worth also copying the
address given for Genealogia w Archiwach, since that service's holdings are
the specific interest.

**Send the Polish version.** The English one below is there so that David
can read what he is sending and so a reply in English is easy to give. A
native speaker should glance over the Polish before it goes — it was
written carefully, and carefully is not the same as natively.

## The letter, in Polish

> **Temat: Pytanie o maszynowo czytelny wykaz zespołów archiwalnych dla otwartego atlasu źródeł genealogicznych**
>
> Szanowni Państwo,
>
> prowadzę Record Atlas (`daviddef.github.io/TheMap`) — bezpłatną,
> niekomercyjną mapę *źródeł* genealogicznych. Odpowiada ona na jedno
> pytanie: dla danej miejscowości, które archiwa i które zespoły
> przechowują dotyczące jej akta, i co badacz może dziś realnie obejrzeć.
> Atlas powstał z ośmiu archiwów rodzinnych i jest publikowany otwarcie,
> z podaniem i datowaniem każdego źródła.
>
> Zbiory Archiwów Państwowych — skany akt stanu cywilnego z zaboru
> pruskiego, duplikaty ksiąg metrykalnych sprzed 1874 roku, księgi ludności
> od 1837 roku — są dokładnie tym, czego taka mapa potrzebuje, a Polski
> w atlasie praktycznie nie ma. Powód jest techniczny, nie merytoryczny.
> Serwis Genealogia w Archiwach jest aplikacją Vaadin: każdy adres zwraca
> tę samą powłokę aplikacji, łącznie z `robots.txt` i `sitemap.xml`, więc
> nie ma powierzchni, którą można by odczytać. Serwis Szukaj w Archiwach
> jest chroniony przez Imperva — samo `robots.txt` zwraca wyzwanie
> JavaScript — wobec czego nie jesteśmy w stanie odczytać nawet Państwa
> własnych zasad indeksowania. **Nie podejmowaliśmy prób obejścia tych
> zabezpieczeń i nie zamierzamy tego robić.** Sprawdziliśmy również portal
> dane.gov.pl, gdzie nie znaleźliśmy zbiorów Archiwów Państwowych.
>
> Stąd to pytanie. **Czy wykaz zespołów archiwalnych jest gdziekolwiek
> publikowany w postaci maszynowo czytelnej?** Interesuje mnie sam
> inwentarz, a nie skany i nie dane osobowe:
>
> * nazwa i sygnatura zespołu, archiwum przechowujące,
> * miejscowość lub obszar, którego zespół dotyczy,
> * zakres chronologiczny,
> * odnośnik do opisu zespołu w Państwa serwisie.
>
> Wystarczyłby zrzut danych, punkt końcowy API, interfejs OAI-PMH albo
> okresowo aktualizowany plik. Jeżeli coś takiego istnieje, a ja tego nie
> znalazłem, będę wdzięczny za wskazanie.
>
> Ze swojej strony deklaruję:
>
> * Archiwa Państwowe będą wskazane jako źródło na każdej stronie
>   korzystającej z tych danych, wraz z odnośnikiem i datą pobrania.
> * Zastosuję się do ustalonej przez Państwa licencji, w tym do warunku
>   niekomercyjnego lub zakazu redystrybucji w całości — w takim wypadku
>   atlas będzie odsyłał do Państwa serwisu zamiast powielać dane.
> * Nie potrzebuję i nie chcę żadnych danych o osobach.
> * Chętnie przyjmę wyciąg przygotowany po Państwa stronie zamiast
>   pobierać cokolwiek samodzielnie.
>
> Jeżeli udostępnienie nie jest możliwe, sama taka informacja jest dla mnie
> cenna. Atlas zapisuje, dlaczego danego kraju w nim brakuje, a zdanie
> „instytucja nie udostępnia tych danych do ponownego wykorzystania" jest
> dla czytelnika odpowiedzią uczciwszą niż milczenie.
>
> Serwis wyświetla reklamy pokrywające koszty hostingu. Jeżeli w Państwa
> ocenie czyni to wykorzystanie komercyjnym, proszę o taką informację —
> wówczas albo usunę reklamy ze stron, których to dotyczy, albo nie
> wykorzystam danych.
>
> Z wyrazami szacunku,
>
> David Defranceski
> david.defranceski@gmail.com
> https://daviddef.github.io/TheMap/

## The same letter, in English

> **Subject: Is the fonds inventory published in machine-readable form?**
>
> Dear colleagues,
>
> I maintain Record Atlas (`daviddef.github.io/TheMap`), a free,
> non-commercial map of genealogical *sources*. It answers one question:
> for a given place, which archives and which fonds hold records covering
> it, and what can a researcher actually reach today. It grew out of eight
> family archives of my own and is published openly, with every source
> credited and dated.
>
> The holdings of the Polish State Archives — scanned civil registration
> from the Prussian partition, parish duplicates before 1874, population
> books from 1837 — are exactly what such a map is for, and Poland is very
> nearly absent from it. The reason is technical rather than editorial.
> Genealogia w Archiwach is a Vaadin application: every URL returns the
> same application shell, `robots.txt` and `sitemap.xml` included, so there
> is no surface to read. Szukaj w Archiwach sits behind Imperva —
> `robots.txt` itself returns a JavaScript challenge — so I cannot read
> even your own crawling policy. **I have made no attempt to work around
> either, and will not.** I also checked dane.gov.pl and found no State
> Archives datasets there.
>
> Hence the question. **Is the inventory of fonds published anywhere in
> machine-readable form?** It is the inventory I want, not the scans and
> not anything about individuals:
>
> * fonds name and reference, and the archive holding it,
> * the place or area it covers,
> * its date range,
> * a link to your own description of it.
>
> A data dump, an API endpoint, an OAI-PMH interface or a periodic file
> would each do. If something like this exists and I have simply failed to
> find it, a pointer would be very welcome.
>
> For my part: the State Archives would be credited on every page using the
> data, with a link and the date taken; I would honour whatever licence you
> set, including non-commercial terms or a bar on bulk redistribution, in
> which case the atlas would link to you rather than republish; I need
> nothing about individuals; and I would gladly work from an extract you
> prepare rather than fetching anything myself.
>
> If reuse is not possible, saying so is genuinely useful. The atlas records
> why each country is missing, and "the holder does not licence this for
> reuse" is a more honest answer to a reader than silence.
>
> The site carries advertising to cover hosting. If that makes the use
> commercial in your terms, please say so and I will either remove the
> advertising from the pages concerned or not use the data.
>
> With thanks for your time,
>
> David Defranceski
> david.defranceski@gmail.com
> https://daviddef.github.io/TheMap/

## When a reply comes

* **Yes, here it is** — a new harvester in `scripts/`, a provider row
  already exists, and work list row 33 moves to done. The fonds become
  collections against places, which is the shape the atlas already has.
* **Yes, but under terms** — record the terms beside the data and honour
  them. A link-only arrangement is still worth having: "the State Archive
  in Poznań holds this parish, these years, see here" is most of the value.
* **No** — record it in `data/_declined.json` with the date and the reason
  given. A stated refusal is much stronger evidence than the inference now
  recorded, and it belongs on the coverage page.
* **No reply after a month** — note the date the letter went, and leave the
  entry as it stands. A letter that went unanswered is worth writing down.
