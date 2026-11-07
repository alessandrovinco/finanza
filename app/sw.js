// Service worker: un piccolo programma che il browser tiene da parte e che
// intercetta le richieste dei file dell'app. Serve a farla aprire anche offline.
//
// Strategia "prima la rete": se c'è connessione scarica sempre la versione più
// recente (così gli aggiornamenti arrivano subito) e ne mette una copia da parte;
// se non c'è connessione usa la copia.
//
// "no-cache" chiede ogni volta al server se il file è cambiato (se non lo è, la risposta
// è piccolissima). Senza, il browser potrebbe usare una sua copia vecchia di qualche file
// (GitHub Pages gli dice di tenerle 10 minuti): subito dopo un aggiornamento si
// mescolerebbero file nuovi e vecchi, e l'app potrebbe non partire.

const CACHE = "finanza";

// I file da mettere da parte subito, alla prima apertura.
// ATTENZIONE: se aggiungi, rinomini o elimini un file dell'app, aggiorna questo elenco
// (se un file elencato non esiste, il service worker non si installa).
const FILE_APP = [
    "./", "index.html", "stile.css", "manifest.webmanifest", "icona-180.png", "icona-192.png", "icona-512.png",
    "lib/sql-wasm.js", "lib/sql-wasm.wasm", "lib/jszip.min.js",
    "js/app.js", "js/database.js", "js/utili.js", "js/backup.js", "js/importa.js", "js/importa-mm.js",
    "js/viste/comuni.js", "js/viste/home.js", "js/viste/movimento.js", "js/viste/conti.js",
    "js/viste/categorie.js", "js/viste/impostazioni.js", "js/viste/importazione.js",
];

self.addEventListener("install", evento => {
    evento.waitUntil(caches.open(CACHE).then(cache =>
        cache.addAll(FILE_APP.map(file => new Request(file, { cache: "no-cache" })))));
    self.skipWaiting();
});

self.addEventListener("activate", evento => evento.waitUntil(self.clients.claim()));

self.addEventListener("fetch", evento => {
    const richiesta = evento.request;
    // Solo i file dell'app: niente da fare per richieste verso altri siti
    if (richiesta.method !== "GET" || new URL(richiesta.url).origin !== location.origin) return;
    evento.respondWith(
        fetch(richiesta.url, { cache: "no-cache" })
            .then(risposta => {
                // Solo le risposte riuscite: un errore del server (es. 404) non deve
                // sostituire la copia buona che serve quando si è offline
                if (risposta.ok) {
                    const copia = risposta.clone();
                    caches.open(CACHE).then(cache => cache.put(richiesta, copia));
                }
                return risposta;
            })
            .catch(() => caches.match(richiesta, { ignoreSearch: true }))
    );
});
