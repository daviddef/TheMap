"""What may go into data/provider-contacts.json. Shared by scripts/harvest-provider-contacts.py (which drops what fails) and
scripts/check-data.py (which refuses a file that holds it), so the two cannot disagree.

Wikidata is edited by anyone. Its P968 carries two addresses in one value, addresses cut short, and the mailboxes of named members of staff.
data/provider-emails.json already keeps role mailboxes only; this applies the same rule to the harvest. A dropped address costs a contact and
leaves the postal address and telephone; a kept personal one puts a person in the catalogue. So where the two cannot be told apart, it is dropped."""
import hashlib
import re
import unicodedata

ADDRESS = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")
# Mail anybody can open an account on. An address there is kept only where the mailbox names the institution (names_institution below).
FREE_MAIL = re.compile(r"(gmail|googlemail|icloud|protonmail|proton|aol|me|mac|msn)\.(com|me)|(yahoo|hotmail|outlook|live|gmx|yandex)(\.com?)?\.[a-z]{2,3}|"
                       r"web\.de|t-online\.de|libero\.it|virgilio\.it|tiscali\.it|orange\.fr|wanadoo\.fr|free\.fr|laposte\.net|wp\.pl|o2\.pl|interia\.pl|onet\.pl|"
                       r"seznam\.cz|centrum\.(cz|sk)|azet\.sk|freemail\.hu|citromail\.hu|mail\.ru|ukr\.net|net\.hr|siol\.net")
# Words that say a mailbox is an institution's or an office's. A priest's or caretaker's title is deliberately absent: «zupnik.», «pfarrer.»
# introduce a person. Written without accents, as mailbox names are.
OFFICE_WORDS = frozenset("""
opcina opcine grad gradski gradska gradsko narodna zupa zupni crkva samostan svetiste groblje muzej zavicajni knjiznica citaonica arhiv udruga
drustvo zbirka nacelnik tajnik tajnistvo pisarnica ured info obcina zupnija pokopalisce
comune municipio sindaco protocollo segreteria parrocchia diocesi chiesa cimitero biblioteca museo archivio
gemeinde stadt gemeindeamt pfarramt pfarre pfarrei kirche friedhof museum archiv verein bibliothek buecherei
mairie commune paroisse eglise cimetiere musee bibliotheque mediatheque archives
ayuntamiento parroquia iglesia cementerio archivo prefeitura paroquia igreja cemiterio museu arquivo
parish church council townhall cemetery library archive society office trust
gemeente parochie kerk begraafplaats
gmina parafia cmentarz muzeum biblioteka urzad obec mesto farnost hrbitov knihovna
curia kuria diocese vescovado biskupija biskupski ordinariat eveche obispado diecezja biskupstvi puspokseg
onkormanyzat plebania temeto konyvtar leveltar egyhaz primaria parohia cimitir muzeu
""".split())
FILLER = frozenset("sv svet sveta svete sveti svetog svetoga svetom st san santa santo sankt saint the of de di del von na u".split())
# A part of a mailbox name that says it belongs to a desk, not to somebody. Matched as the start of a part: «archiv» covers archivio, archives, archiwum's cousin «archiw».
ROLE_STEMS = ("arch", "arxiu", "arquiv", "arkiv", "arhiv", "leveltar", "bibl", "biblio", "library", "libr", "info", "contact", "kontakt", "office", "mail",
              "post", "sekret", "secretar", "segreter", "direc", "direk", "referen", "enquir", "inquir", "consult", "museu", "memorial", "cultur", "histor",
              "reading", "records", "research", "service", "servi", "registr", "gabinet", "titkarsag", "agendamento", "special", "collect", "client",
              "coord", "dioc", "help", "ref", "ahp", "kreis", "stadt", "staat", "heritage", "local", "oficina", "atencion", "ufficio", "pisarnica", "kancel", "admin", "general")
# Read and refused: addresses that pass the rules below and still name a person (a surname alone, an initial and a surname) or are cut short.
# Kept as the SHA-256 of the lower-cased address, so the list publishes nobody. To refuse one:
#     python3 -c "import hashlib,sys; print(hashlib.sha256(sys.argv[1].lower().encode()).hexdigest())" someone@example.org
REFUSED = {
    "74a6d150fff690ca38b24e40306a9153c9f8307b087ff0ba0354062e372d3752",
    "69c4029bb3f10fa312c73930ac8b3959027519ed90f861e589149d0efcd94c0c",
    "30bb83521645aa66051a056edcf1b224f8e4d04b5280fe4109a7a246043b5e7f",
}


def _fold(s):
    s = (s or "").lower().replace("ł", "l").replace("ß", "ss").replace("ø", "o")
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def names_institution(local, institution_words):
    """True where a mailbox name names this institution: every part of it is accounted for (an office word, «sv», a word of the institution's
    name or address, digits aside), with at least one office word AND at least one word that is this institution's own. «opcina.sv.ilija» and
    «gradskimuzejomis» are; «ivan.zupan», «muzej.horvat» (of a museum not so called), a bare surname and a bare «arhiv» are not.
    institution_words None: only ask for an office word (the data check; the harvest asked fully)."""
    parts = [p for p in re.split(r"[^a-z]+", _fold(local)) if p]
    if institution_words is None:
        return any(w in p for p in parts for w in OFFICE_WORDS if len(w) >= 4)
    named = set()
    for text in (institution_words, institution_words.lower().replace("đ", "dj")):
        for w in re.split(r"[^a-z]+", _fold(text.lower().replace("đ", "d"))):
            if len(w) >= 3:
                named.add(w)
                # the clerk's grammar: a church «svete Ane» writes «zupasvetaana»
                if w[-1] in "aeiou":
                    named.update(w[:-1] + v for v in "aeiou")
    own = named - OFFICE_WORDS - FILLER
    words = named | OFFICE_WORDS | FILLER
    found = {(False, False)}   # (an office word seen, a word of its own seen), over the spellings of the parts so far
    for part in parts:
        reach = [found] + [set() for _ in part]
        for end in range(1, len(part) + 1):
            for start in range(end):
                word = part[start:end]
                if word in words:
                    reach[end] |= {(office or word in OFFICE_WORDS, mine or word in own) for office, mine in reach[start]}
        found = reach[-1]
    return (True, True) in found


def why_not(address, institution_words=""):
    """None where the address may be kept, else the reason. `institution_words`: the institution's names, for «od_chelm@», whose parts name the place.
    Pass None to skip the rules that depend on those names: the data check does, so that renaming a provider cannot fail a build."""
    if not ADDRESS.fullmatch(address):
        return "not an address"
    local, host = address.lower().split("@")
    if hashlib.sha256(address.lower().encode()).hexdigest() in REFUSED:
        return "refused by hand"
    if re.match(r"(dr|prof|mgr|ing)[._-]", local):
        return "names a person"
    if FREE_MAIL.fullmatch(host):
        return None if names_institution(local, institution_words) else "free mail that does not name the institution"
    parts = [p for p in re.split(r"[._-]+", local) if p]
    if institution_words is None or len(parts) < 2 or not all(p.isalpha() for p in parts) or len(parts[-1]) < 3 or all(len(p) <= 3 for p in parts):
        return None
    named = _fold(institution_words) + " " + host
    for p in parts:
        if p.startswith(ROLE_STEMS) or (len(p) >= 4 and p in named):
            return None
    return "names a person"


def emails_in(values, institution_words=""):
    """Every usable address among Wikidata's values (one value may hold two), shortest first; ties by spelling, so two runs agree."""
    found = {}
    for v in values:
        for a in re.split(r"[,;\s]+", v.replace("mailto:", "")):
            if a and not why_not(a, institution_words):
                found.setdefault(a.lower(), a)
    return sorted(found.values(), key=lambda a: (len(a), a))
