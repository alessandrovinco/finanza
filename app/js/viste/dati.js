// La pagina Dati (#/dati): backup, ripristino e importazione da Money Manager.

import { leggi } from "../database.js";
import { creaBackup, ripristinaBackup, ultimoBackup } from "../backup.js";
import { importaMoneyManager } from "../importa-mm.js";
import { dataLeggibile } from "../utili.js";
import { avvisa, impostaTitolo } from "./comuni.js";

export function mostraDati(main) {
    impostaTitolo("Dati");

    const r = leggi("select count(*) as movimenti, min(data) as dal, max(data) as al from movimenti")[0];
    const ultimo = ultimoBackup();

    main.innerHTML = `
        <div class="scheda">
            <p>${r.movimenti
                ? `<strong>${r.movimenti}</strong> movimenti, dal ${dataLeggibile(r.dal)} al ${dataLeggibile(r.al)}.`
                : "Ancora nessun movimento."}</p>
            <p>Ultimo backup: <strong>${ultimo ? dataLeggibile(ultimo) : "mai"}</strong></p>
            <p class="nota-piccola">I dati esistono solo su questo dispositivo. Fai un backup ogni tanto e salvalo
               in una cartella sul cloud (iCloud Drive, Google Drive…): se cambi telefono, lo ripristini da qui.</p>
        </div>

        <div class="strumenti">
            <button id="bottone-backup">💾 Crea backup (.zip)</button>
            <label class="bottone secondario">
                ♻️ Ripristina un backup
                <input id="file-ripristino" type="file" accept=".zip" hidden>
            </label>
            <label class="bottone secondario">
                📥 Importa da Money Manager
                <input id="file-money-manager" type="file" hidden>
            </label>
        </div>`;

    main.querySelector("#bottone-backup").onclick = () => esegui(async () => {
        if (await creaBackup()) mostraDati(main);
    });

    main.querySelector("#file-ripristino").onchange = evento => conFile(evento,
        "Il ripristino sostituisce tutti i dati attuali con quelli del backup.", async file => {
            await ripristinaBackup(file);
            mostraDati(main);
            avvisa("Backup ripristinato.");
        });

    main.querySelector("#file-money-manager").onchange = evento => conFile(evento,
        "L'importazione sostituisce tutti i dati attuali con quelli di Money Manager.", async file => {
            const r = await importaMoneyManager(file);
            mostraDati(main);
            avvisa(`Importati ${r.movimenti} movimenti. I saldi coincidono con quelli di Money Manager.`);
        });
}

// Prende il file scelto, chiede conferma se ci sono già dati, poi esegue l'azione
function conFile(evento, avvertenza, azione) {
    const file = evento.target.files[0];
    evento.target.value = ""; // così si può scegliere di nuovo lo stesso file
    if (!file) return;
    const ciSonoDati = leggi("select count(*) as n from movimenti")[0].n > 0;
    if (ciSonoDati && !confirm(`${avvertenza} Continuare?`)) return;
    esegui(() => azione(file));
}

// Esegue un'azione e, se qualcosa va storto, mostra il messaggio invece di bloccarsi
async function esegui(azione) {
    try {
        await azione();
    } catch (errore) {
        avvisa(errore.message, true);
    }
}
