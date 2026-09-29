"""What KIND of record is this — church, civil, census, and so on.

David asked for a church-records filter: "many people really want to look at
church records, do we know which are which". Nothing in this project knew.
The collections carry titles and nothing else structured, so the kind has to
be read out of the title.

ONE CLASSIFIER, USED EVERYWHERE. The FamilySearch collections, the volumes and
the contributed directory all pass through here, so a filter set to «church»
means the same thing on the map, on a country page and in the directory. The
alternative — a keyword list per consumer — is how three places end up
disagreeing about what a parish register is.

IT IS A READING OF A TITLE, NOT A FACT ABOUT THE PAPER. «Marriages» in a
civil register and «Marriages» in a parish register are the same word, so
ordering matters: an explicit church word wins over a generic vital-record
one. Roughly one collection in six matches nothing and is left unclassified
rather than guessed at, because a filter that silently invents a kind is
worse than one that admits it does not know.
"""
import re

# Order is significant: the first list to match a title claims it for that
# kind, and the church words are checked before the generic vital-record ones
# so "Church Records, Baptisms and Marriages" is church, not civil.
KINDS = [
    ("church", "Church and parish registers",
     r"church|parish|baptis|christening|banns|diocese|catholic|lutheran|"
     r"reformed|orthodox|methodist|presbyterian|congregation|synagog|"
     r"anglican|evangelical|episcopal|jewish record|kirk session|"
     r"bishop'?s transcript|matricul|libri|confirmation"),
    ("cemetery", "Cemeteries and burials",
     r"cemeter|burial|grave|tombstone|monumental inscription|interment|"
     r"funeral|crematio"),
    ("census", "Censuses and population lists",
     r"census|revision list|population register|population card|"
     r"electoral|poll book|voter|tax list|head of household"),
    ("military", "Military and wartime",
     r"military|army|navy|air force|war |wartime|conscript|regiment|"
     r"veteran|draft|soldier|prisoner of war|service record|muster"),
    ("migration", "Immigration and emigration",
     r"emigra|immigra|passenger|naturaliz|border cross|passport|"
     r"arrival|departure|ship manifest|alien regist"),
    ("probate", "Probate, land and notarial",
     r"probate|\bwills?\b|estate|testament|land record|deed|notar|"
     r"cadastr|property|mortgage|seigniorial|court record"),
    ("civil", "Civil registration and vital records",
     r"civil regist|vital record|\bbirths?\b|\bdeaths?\b|\bmarriages?\b|"
     r"divorce|register office|state registration"),
    # LAST, AND THE POSITION IS THE POINT. Trove's 2,014 Australian papers are
    # a genealogical source of the first rank — Australian papers printed
    # births, marriages, deaths and obituaries in volume, and for most
    # Australian ancestors before 1950 the newspaper IS the record, because
    # civil registration is state-by-state and closed for a lifetime.
    #
    # The pattern is deliberately two words rather than the obvious list of
    # mastheads. «advertiser», «chronicle», «courier», «herald», «times» and
    # «journal» would each have reclassified existing church and probate
    # collections that merely carry the word, and this list is ordered so that
    # the FIRST match wins. Sitting last, with a narrow pattern, it can only
    # claim a title nothing else wanted. Trove's own rows do not rely on it at
    # all: build.py sets `rk` explicitly, because «Molong Argus» contains no
    # word any classifier could recognise and it is a newspaper regardless.
    ("newspaper", "Newspapers and gazettes",
     r"\bnewspapers?\b|\bgazette\b"),
]
RX = [(k, label, re.compile(p, re.I)) for k, label, p in KINDS]
LABEL = {k: label for k, label, _ in KINDS}
ORDER = [k for k, _, _ in KINDS]

# A CONFESSION IS NOT A HINT, IT IS THE ANSWER. The classifier reads titles,
# and a FamilySearch parish register is titled «Births (Rođeni) 1734-1756» —
# three generic vital words and nothing a church pattern can see. So Senj's
# ten Roman Catholic parish books were filed as CIVIL REGISTRATION, its `k`
# bitmask came out 64, and ticking «Church and parish registers» hid the town
# whose entire holding is parish registers. David found it from the other end:
# «0 of 21,754 places shown… something more central is wrong here».
#
# The row already carried the answer in a field nobody passed in. `denom` is
# the confession the register was kept by, and a register kept by a confession
# IS a church register — that is not an inference from a title, it is what the
# word means. Sampled across 1,308 collections: every one had no kind, and 859
# carried a denomination.
#
# «civil» and «mil» are here so they are not silently treated as churches:
# they map to the kinds they actually are.
DENOM = {
    "rc": "Roman Catholic church parish",
    "orth": "Orthodox church parish",
    "gc": "Greek Catholic church parish",
    "ref": "Reformed church parish",
    "ev": "Evangelical Lutheran church parish",
    "jew": "Jewish synagogue congregation",
    "civil": "civil registration",
    "mil": "military",
}


# The confessions that make a register a CHURCH register. «civil» and «mil»
# are deliberately not here: they are confessions in the same field and they
# say the opposite.
CHURCH_DENOM = {"rc", "orth", "gc", "ref", "ev", "jew"}


def denom_text(code):
    """The words a confession code stands for, or '' — never a guess."""
    return DENOM.get((code or "").strip().lower(), "")


def kinds_for(title, denom=None):
    """A collection's kinds, with its confession taken into account.

    AND «CIVIL» IS DROPPED WHEN A CONFESSION CLAIMS IT. «Births (Rođeni)» is
    read as a vital record by the generic pattern, which is how it ended up as
    civil registration in the first place; adding the confession makes it
    church AND civil, and a Roman Catholic parish register is not civil
    registration. Left in, Senj would answer a filter for records it does not
    hold — the same fault as before, pointing the other way.
    A title that names both — «Church and civil registers» — keeps both,
    because there the second kind is in the title rather than inferred from
    the first one's words.
    """
    got = kinds_of(title, denom_text(denom))
    if (denom or "").strip().lower() in CHURCH_DENOM and "church" in got:
        if not re.search(r"\bcivil\b|\bstato civile\b|\bstandesamt\b", title or "", re.I):
            got = [k for k in got if k != "civil"]
    return got


def kinds_of(*texts):
    """Every kind a title plausibly is, most specific first. May be empty."""
    hay = " ".join(t for t in texts if t)
    if not hay:
        return []
    return [k for k, _, rx in RX if rx.search(hay)]

def primary(*texts):
    """The single kind to colour or group by. None when nothing matched."""
    got = kinds_of(*texts)
    return got[0] if got else None

# A BIT PER KIND, so a place can carry every kind it holds in one small
# integer on a 7,391-row index with an 800 KB budget. The mapping is published
# in index.json rather than hard-coded in the client: two copies of a derived
# constant is exactly how the shard keys came to disagree, and that cost
# 10,962 surnames their own spelling.
BIT = {k: 1 << i for i, k in enumerate(ORDER)}
