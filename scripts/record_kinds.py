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
]
RX = [(k, label, re.compile(p, re.I)) for k, label, p in KINDS]
LABEL = {k: label for k, label, _ in KINDS}
ORDER = [k for k, _, _ in KINDS]

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
