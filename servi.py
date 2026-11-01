"""
Avvia l'app sul PC per provarla: http://localhost:8000/app/

Uso (da questa cartella):
    py servi.py

È il server di Python (http.server) con una sola differenza: dice al browser
di non tenere copie vecchie dei file, così ogni modifica al codice si vede
subito ricaricando la pagina.
"""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORTA = 8000
CARTELLA = Path(__file__).parent


class SenzaCache(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=CARTELLA, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    print(f"App su http://localhost:{PORTA}/app/  (Ctrl+C per fermare)")
    ThreadingHTTPServer(("127.0.0.1", PORTA), SenzaCache).serve_forever()
