// Il punto di partenza dell'app: apre il database e mostra la pagina giusta.
//
// L'app è una sola pagina HTML. La parte dopo il # nell'indirizzo dice quale
// "pagina" disegnare dentro <main>: #/conti, #/movimento/nuovo?tipo=spesa, ...
// Così il tasto Indietro del telefono funziona come in un sito normale.

import { apriDatabase, impostazione } from "./database.js";
import { esc, importiSonoNascosti, nascondiImporti } from "./utili.js";
import { mostraHome } from "./viste/home.js";
import { mostraMovimento } from "./viste/movimento.js";
import { mostraConti, mostraConto } from "./viste/conti.js";
import { mostraCategorie, mostraCategoria } from "./viste/categorie.js";
import { mostraImpostazioni } from "./viste/impostazioni.js";
import { nascondiAvviso, segnaNavigazione, torna } from "./viste/comuni.js";

// A quale voce della barra in basso appartiene ogni pagina
const SEZIONE = { conto: "conti", categoria: "categorie", movimento: "home", dati: "impostazioni" };

// Nelle pagine con un modulo da compilare l'occhio non c'è: ridisegnarle
// per nascondere gli importi cancellerebbe quello che si sta scrivendo
const PAGINE_CON_MODULO = ["movimento", "conto", "categoria"];

// L'ultima scelta fatta con l'occhio. Sta nel localStorage (come la data dell'ultimo
// backup in backup.js): è una preferenza di questo dispositivo, non un dato da salvare nel backup.
const CHIAVE_IMPORTI_NASCOSTI = "importiNascosti";

const main = document.querySelector("main");
const occhio = document.querySelector("#occhio");

await apriDatabase();
navigator.storage?.persist?.(); // chiede al browser di non cancellare mai i dati del sito
navigator.serviceWorker?.register("sw.js"); // per aprire l'app anche offline (vedi sw.js)

// Modalità privacy all'apertura: sempre nascosti, oppure come li si era lasciati
nascondiImporti(impostazione("privacy_apertura", "ricorda") === "nascondi" || leggiUltimaScelta());

document.querySelector("#indietro").onclick = torna;
occhio.onclick = () => {
    nascondiImporti(!importiSonoNascosti());
    try { localStorage.setItem(CHIAVE_IMPORTI_NASCOSTI, importiSonoNascosti() ? "1" : "0"); } catch { }
    mostraPagina();
};
window.addEventListener("hashchange", () => {
    segnaNavigazione();
    mostraPagina();
});
mostraPagina();

function leggiUltimaScelta() {
    try { return localStorage.getItem(CHIAVE_IMPORTI_NASCOSTI) === "1"; } catch { return false; }
}

function mostraPagina() {
    const [percorso, query = ""] = location.hash.slice(1).split("?");
    const [pagina = "home", id] = percorso.split("/").filter(Boolean);
    const parametri = new URLSearchParams(query);

    nascondiAvviso();
    main.innerHTML = "";
    try {
        switch (pagina) {
            case "movimento": mostraMovimento(main, id, parametri); break;
            case "conti": mostraConti(main); break;
            case "conto": mostraConto(main, id); break;
            case "categorie": mostraCategorie(main); break;
            case "categoria": mostraCategoria(main, id, parametri); break;
            case "impostazioni":
            case "dati": mostraImpostazioni(main); break; // "dati": il vecchio nome della pagina
            default: mostraHome(main);
        }
    } catch (errore) {
        main.innerHTML = `<p class="vuoto">Si è verificato un errore: ${esc(errore.message)}</p>`;
        console.error(errore);
    }

    const nascosti = importiSonoNascosti();
    occhio.hidden = PAGINE_CON_MODULO.includes(pagina);
    occhio.textContent = nascosti ? "🙈" : "👁️";
    occhio.setAttribute("aria-label", nascosti ? "Mostra gli importi" : "Nascondi gli importi");

    const sezione = SEZIONE[pagina] ?? pagina;
    document.querySelectorAll("nav a").forEach(a => a.classList.toggle("attiva", a.dataset.sezione === sezione));
    window.scrollTo(0, 0);
}
