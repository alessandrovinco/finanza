// Service worker: un piccolo programma che il browser tiene da parte e che
// intercetta le richieste dei file dell'app. Serve a farla aprire anche offline.
//
// Strategia "prima la rete": se c'è connessione scarica sempre la versione più
// recente (così gli aggiornamenti arrivano subito) e ne mette una copia da parte;
// se non c'è connessione usa la copia.

const CACHE = "finanza";

// I file da mettere da parte subito, alla prima apertura.
// ATTENZIONE: se aggiungi, rinomini o elimini un file dell'app, aggiorna questo elenco
// (se un file elencato non esiste, il service worker non si installa).
const FILE_APP = [
    "./", "index.html", "stile.css", "manifest.webmanifest", "icona-180.png", "icona-192.png",
    "lib/sql-wasm.js", "lib/sql-wasm.wasm", "lib/jszip.min.js",
    "js/app.js", "js/database.js", "js/utili.js", "js/backup.js", "js/importa-mm.js",
    "js/viste/comuni.js", "js/viste/home.js", "js/viste/movimento.js",
    "js/viste/conti.js", "js/viste/categorie.js", "js/viste/dati.js",
];

self.addEventListener("install", evento => {
    evento.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILE_APP)));
    self.skipWaiting();
});

self.addEventListener("activate", evento => evento.waitUntil(self.clients.claim()));

self.addEventListener("fetch", evento => {
    if (evento.request.method !== "GET") return;
    evento.respondWith(
        fetch(evento.request)
            .then(risposta => {
                const copia = risposta.clone();
                caches.open(CACHE).then(cache => cache.put(evento.request, copia));
                return risposta;
            })
            .catch(() => caches.match(evento.request, { ignoreSearch: true }))
    );
});
