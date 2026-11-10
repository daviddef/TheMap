#!/usr/bin/env python3
"""r2_sync against a folder standing in for the bucket: first run sends everything, a second sends nothing, a changed file sends one,
a removed file is deleted, and one part never deletes another part's files."""
import os, sys, tempfile, unittest
sys.path.insert(0, os.path.dirname(__file__))
import r2_sync as R


def write(root, rel, text):
    p = os.path.join(root, rel); os.makedirs(os.path.dirname(p), exist_ok=True); open(p, "w").write(text)


class T(unittest.TestCase):
    def setUp(self):
        self.d, self.b = tempfile.mkdtemp(), tempfile.mkdtemp()
        write(self.d, "place/a/index.html", "A"); write(self.d, "place/b/index.html", "B")
        write(self.d, "surname/x/index.html", "X"); write(self.d, "about/index.html", "about"); write(self.d, "p/a.json", "{}")
        self.be = R.DirBackend(self.b); self.q = lambda *_: None

    def run_part(self, part, only=(), skip=()):
        return R.sync(self.be, self.d, part, list(only), list(skip), jobs=2, log=self.q)

    def test_incremental(self):
        r = self.run_part("slice-0", only=["place", "surname"])
        self.assertEqual(sorted(r["upload"]), ["place/a/index.html", "place/b/index.html", "surname/x/index.html"])
        self.assertEqual(self.run_part("slice-0", only=["place", "surname"]), {"upload": [], "delete": []})
        write(self.d, "place/a/index.html", "A2")
        self.assertEqual(self.run_part("slice-0", only=["place", "surname"])["upload"], ["place/a/index.html"])
        os.remove(os.path.join(self.d, "place/b/index.html"))
        self.assertEqual(self.run_part("slice-0", only=["place", "surname"])["delete"], ["place/b/index.html"])
        self.assertIsNone(self.be.get("place/b/index.html"))

    def test_parts_do_not_touch_each_other(self):
        self.run_part("slice-0", only=["place"]); self.run_part("static", skip=["place", "surname"])
        os.remove(os.path.join(self.d, "place/a/index.html"))
        self.run_part("slice-0", only=["place"])
        self.assertEqual(self.be.get("about/index.html"), b"about")   # the static part's file survives
        self.assertEqual(self.be.get("p/a.json"), b"{}")

    def test_content_types(self):
        self.assertEqual(R.ctype("a/index.html"), "text/html; charset=utf-8")
        self.assertEqual(R.ctype("p/x.json"), "application/json; charset=utf-8")
        self.assertEqual(R.ctype("x.png"), "image/png")

    def test_empty_part_is_an_error(self):
        with self.assertRaises(SystemExit): self.run_part("slice-9", only=["nothing-here"])


if __name__ == "__main__":
    unittest.main()
