// Il tasto "Importa" e la finestra di riepilogo che compare prima di importare.
// Lo usano la pagina Impostazioni e la schermata di benvenuto.

import { leggi } from "../database.js";
import { analizzaFile } from "../importa.js";
import { dataLeggibile, esc } from "../utili.js";
import { aspettaRisposta, avvisa, unaAllaVolta } from "./comuni.js";

/** Un bottone che apre la scelta del file. Va poi collegato con collegaImporta(). */
export function bottoneImporta(etichetta, classe = "bottone") {
    // Niente "accept": sull'iPhone i file .mmbackup risulterebbero non selezionabili
    return `<label class="${classe}">${etichetta}<input type="file" data-importa hidden></label>`;
}

/** Dopo un'importazione riuscita chiama dopo(analisi): analisi.messaggio dice cosa è successo. */
export function collegaImporta(contenitore, dopo) {
    contenitore.querySelectorAll("[data-importa]").forEach(input => input.onchange = unaAllaVolta(async () => {
        const file = input.files[0];
        input.value = ""; // così si può scegliere di nuovo lo stesso file
        if (!file) return;
        try {
            const analisi = await analizzaFile(file);
            if (!await conferma(analisi, file.name)) return analisi.annulla();
            await analisi.importa();
            dopo(analisi);
        } catch (errore) {
            avvisa(errore.message, true);
        }
    }));
}

// Mostra cosa contiene il file e aspetta la risposta: true = Importa, false = Annulla
function conferma(analisi, nomeFile) {
    const r = analisi.riepilogo;
    // Anche senza movimenti, conti e categorie già creati (es. con "Inizia da zero") verrebbero sostituiti
    const attuali = leggi(`select (select count(*) from movimenti) as movimenti,
                                  (select count(*) from conti) + (select count(*) from categorie) as altri`)[0];

    const finestra = document.createElement("dialog");
    finestra.innerHTML = `
        <div class="modulo">
            <h2 class="titolo-finestra">Importare questo file?</h2>
            <div class="scheda">
                <strong>${esc(analisi.tipo)}</strong>
                <p class="nota-piccola">${esc(nomeFile)}</p>
                <ul class="elenco-riepilogo">
                    <li>${r.conti} conti</li>
                    <li>${r.categorie} categorie</li>
                    <li>${r.movimenti
                        ? `${r.movimenti} movimenti, dal ${dataLeggibile(r.dal)} al ${dataLeggibile(r.al)}`
                        : "nessun movimento"}</li>
                </ul>
            </div>
            ${attuali.movimenti || attuali.altri ? `<p class="attenzione">⚠️ Sostituisce tutti i dati attuali
                (${attuali.movimenti ? `${attuali.movimenti} movimenti` : "conti e categorie"}).
                Se vuoi poterli recuperare, annulla e fai prima un backup.</p>` : ""}
            <div class="azioni">
                <button type="button" class="bottone secondario" data-risposta="">Annulla</button>
                <button type="button" data-risposta="si">Importa</button>
            </div>
        </div>`;
    return aspettaRisposta(finestra);
}
