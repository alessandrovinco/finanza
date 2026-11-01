// Il punto di partenza dell'app: apre il database e mostra la pagina giusta.
//
// L'app è una sola pagina HTML. La parte dopo il # nell'indirizzo dice quale
// "pagina" disegnare dentro <main>: #/conti, #/movimento/nuovo?tipo=spesa, ...
// Così il tasto Indietro del telefono funziona come in un sito normale.

import { apriDatabase } from "./database.js";
import { mostraHome } from "./viste/home.js";
import { mostraMovimento } from "./viste/movimento.js";
import { mostraConti, mostraConto } from "./viste/conti.js";
import { mostraCategorie, mostraCategoria } from "./viste/categorie.js";
import { mostraDati } from "./viste/dati.js";
import { nascondiAvviso, segnaNavigazione, torna } from "./viste/comuni.js";

// A quale voce della barra in basso appartiene ogni pagina
const SEZIONE = { conto: "conti", categoria: "categorie", movimento: "home" };

const main = document.querySelector("main");

await apriDatabase();
navigator.storage?.persist?.(); // chiede al browser di non cancellare mai i dati del sito
navigator.serviceWorker?.register("sw.js"); // per aprire l'app anche offline (vedi sw.js)

document.querySelector("#indietro").onclick = torna;
window.addEventListener("hashchange", () => {
    segnaNavigazione();
    mostraPagina();
});
mostraPagina();

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
            case "dati": mostraDati(main); break;
            default: mostraHome(main);
        }
    } catch (errore) {
        main.innerHTML = `<p class="vuoto">Si è verificato un errore: ${errore.message}</p>`;
        console.error(errore);
    }

    const sezione = SEZIONE[pagina] ?? pagina;
    document.querySelectorAll("nav a").forEach(a => a.classList.toggle("attiva", a.dataset.sezione === sezione));
    window.scrollTo(0, 0);
}
