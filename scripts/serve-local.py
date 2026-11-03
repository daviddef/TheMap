#!/usr/bin/env python3
"""Serve site/public on this machine only, with caching switched off.

Python's plain `http.server` lets the browser keep old copies of the page's scripts, so after a change you can be looking at the old code
(the Roots & Routes page loads a worker and a dozen modules, and a worker's imports are not refreshed by a hard reload).
Use:  python3 scripts/serve-local.py [port]     then open http://127.0.0.1:<port>/roots/index.html
Bound to 127.0.0.1: nothing else on the network can reach it."""
import functools, http.server, os, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'site', 'public')


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8767
    handler = functools.partial(NoCache, directory=os.path.abspath(ROOT))
    with http.server.ThreadingHTTPServer(('127.0.0.1', port), handler) as srv:
        print('Serving %s on http://127.0.0.1:%d/ (no caching). Ctrl+C to stop.' % (os.path.abspath(ROOT), port))
        srv.serve_forever()
