#!/usr/bin/env python3
"""THE ONE PLACE A GIVEN NAME'S FORMS ARE KEPT: Ivan, Johann, Giovanni, Zuane, John and Joannes are one name.

The same tool, rules and statuses as the surname catalogue (read the head of scripts/surname_variants.py), pointed at
data/given-name-families.json. A family is a NAME across languages; each member form carries `lang` (latin, italian,
venetian, croatian, german, hungarian, english...). What differs from a surname:

  - most of a family is `lead`: «Nane is Venetian for Giovanni» is a fact about the language, not a record, so it tells a
    searcher what to try and never licenses a data row. `attested` means an archive met the form on a record of its own.
  - `slip` is a form a clerk or indexer wrote once by mistake (ZORAFKO for Zdravko). It is not a spelling and is never
    searched for; the evidence names the kind of document, place and period, never the person.
  - NOTHING ABOUT A PERSON GOES IN. No name of the one who bore it, no birth year, no document title that carries a
    name. Living people never.

    python3 scripts/given_name_variants.py terms Ivan
    python3 scripts/given_name_variants.py cover Giovanni --tried "Giovanni, Joannes, Ivan"
    python3 scripts/given_name_variants.py add --family giovanni Zuane --status lead --kind note --lang venetian \\
        --what "Venetian form of the name, in the archive's lookup table" --ref archive:Defranceski
    python3 scripts/given_name_variants.py check
    python3 scripts/given_name_variants.py publish
"""
import os, runpy, sys

os.environ["NAME_CATALOGUE"] = "given"
sys.argv[0] = os.path.join(os.path.dirname(os.path.abspath(__file__)), "surname_variants.py")
runpy.run_path(sys.argv[0], run_name="__main__")
