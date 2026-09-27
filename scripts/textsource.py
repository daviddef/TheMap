"""Decode bytes from an outside publisher, strictly, or stop.

WHY THIS EXISTS. `bytes.decode(enc, "replace")` does not fail when the
encoding is wrong. It substitutes U+FFFD for every byte it cannot read and
carries on, so a single wrong argument becomes thousands of quietly damaged
rows that pass every later check — they are, after all, perfectly valid
strings by then.

That is not hypothetical here. data/frequencies/be.json was read as UTF-8
with errors="replace" when Statbel in fact publish CP1252. The result was
4,836 replacement characters in that file and 4,066 surnames whose OWN NAME
was damaged on the live site: «Abandonn?» for Abandonné, «Aba?ch» for Abaïch,
«Abel?» for Abelé. Nothing failed. Nothing warned. The names were simply
wrong for as long as nobody looked.

WHAT THIS DOES INSTEAD. Try each candidate encoding strictly, in order, and
return the first that decodes the whole input cleanly. If none does, raise —
because at that point the publisher has changed something and a human should
look at it, rather than a script inventing characters.

UTF-8 always goes first, even for a source known to ship CP1252, so that the
day a publisher fixes their export we notice and follow them rather than
carrying on decoding correct bytes as something else.

NEVER PUT latin-1 IN THE LIST. It maps all 256 byte values to characters and
therefore cannot fail, which makes it the same silent-success trap wearing a
different coat: it would always «succeed» and always be the answer.
"""

DEFAULT = ("utf-8", "cp1252")


def decode(raw, encodings=DEFAULT, what="the source"):
    """Return (text, encoding_used). Raises ValueError if none fit."""
    for enc in encodings:
        if enc.lower().replace("_", "-") in ("latin-1", "iso-8859-1"):
            raise ValueError(
                "latin-1 cannot fail and so proves nothing; see textsource.py")
        try:
            text = raw.decode(enc)
        except UnicodeDecodeError:
            continue
        if "�" in text:
            # The bytes already contained an encoded U+FFFD: the damage is
            # upstream, not ours, and repairing it here would be a guess.
            raise ValueError(
                "%s decoded as %s but already contains replacement characters "
                "— the damage is in the source, not in this decode" % (what, enc))
        return text, enc
    raise ValueError(
        "%s decoded as none of %s. The publisher has changed the export; "
        "look at it before guessing." % (what, ", ".join(encodings)))
