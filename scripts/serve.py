#!/usr/bin/env python3
"""Dev server for pointbreak, with caching OFF.

`python3 -m http.server` sends no Cache-Control at all, so Chrome applies its
own heuristic and holds ES modules across reloads. On 2026-08-11 that produced
four separate false signals in one session: a HUD field that "didn't work"
(stale main.js), a SyntaxError naming an export that was present on disk and
served correctly, and two rounds of "not seeing changes". The tell is
`performance.getEntriesByType('resource')` reporting transferSize 0.

    python3 scripts/serve.py [port]      # default 8127

Same directory root as `python3 -m http.server`, so every existing URL works.
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):        # quieter than the default
        if '404' in (fmt % args):
            super().log_message(fmt, *args)


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8127
    print(f'pointbreak dev server (no-store) on http://localhost:{port}/web-three/')
    ThreadingHTTPServer(('', port), partial(NoCacheHandler)).serve_forever()
