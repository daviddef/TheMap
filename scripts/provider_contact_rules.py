"""What may go into data/provider-contacts.json. Shared by scripts/harvest-provider-contacts.py (which drops what fails) and
scripts/check-data.py (which refuses a file that holds it), so the two cannot disagree.

Wikidata is edited by anyone. Its P968 carries two addresses in one value, addresses cut short, and the mailboxes of named members of staff.
data/provider-emails.json already keeps role mailboxes only; this applies the same rule to the harvest. A dropped address costs a contact and
leaves the postal address and telephone; a kept personal one puts a person in the catalogue. So where the two cannot be told apart, it is dropped."""
import hashlib
import re
import unicodedata

ADDRESS = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")
FREE_MAIL = {"gmail.com", "googlemail.com", "me.com", "icloud.com", "hotmail.com", "outlook.com", "yahoo.com", "live.com"}
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
    return "".join(c for c in unicodedata.normalize("NFKD", (s or "").lower().replace("ł", "l")) if not unicodedata.combining(c))


def why_not(address, institution_words=""):
    """None where the address may be kept, else the reason. `institution_words`: the providers' names, for «od_chelm@», whose parts name the place.
    Pass None to skip the given.surname rule, which depends on those names: the data check does, so that renaming a provider cannot fail a build."""
    if not ADDRESS.fullmatch(address):
        return "not an address"
    local, host = address.lower().split("@")
    if hashlib.sha256(address.lower().encode()).hexdigest() in REFUSED:
        return "refused by hand"
    if host in FREE_MAIL:
        return "free mail"
    if re.match(r"(dr|prof|mgr|ing)[._-]", local):
        return "names a person"
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
