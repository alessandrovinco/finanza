// La pagina Impostazioni (#/impostazioni): tutte le scelte dell'app in un posto solo,
// più backup e importazione (che prima stavano nella pagina Dati).

import { cancellaTutto, impostazione, leggi, modifica, salvaImpostazione } from "../database.js";
import { creaBackup, ultimoBackup } from "../backup.js";
import { dataLeggibile, esc, nascondiImporti } from "../utili.js";
import { avvisa, chiediConferma, impostaTitolo, unaAllaVolta } from "./comuni.js";
import { bottoneImporta, collegaImporta } from "./importazione.js";

export function mostraImpostazioni(main) {
    impostaTitolo("Impostazioni");

    const conti = leggi("select id, nome, icona from conti where archiviato = 0 order by posizione");
    const r = leggi("select count(*) as movimenti, min(data) as dal, max(data) as al from movimenti")[0];
    const ultimo = ultimoBackup();

    main.innerHTML = `
        <h2>Movimenti</h2>
        <div class="scheda modulo">
            <label class="campo">Conto già scelto quando aggiungi un movimento
                <select id="conto-proposto">
                    <option value="nessuno">Nessuno, lo scelgo ogni volta</option>
                    <option value="ultimo">L'ultimo conto usato</option>
                    ${conti.map(c => `<option value="${esc(c.id)}">⭐ ${esc(c.icona)} ${esc(c.nome)}</option>`).join("")}
                </select>
            </label>
        </div>

        <h2>Privacy</h2>
        <div class="scheda modulo">
            <label class="campo">Quando apri l'app
                <select id="privacy-apertura">
                    <option value="ricorda">Importi come li avevo lasciati</option>
                    <option value="nascondi">Importi sempre nascosti</option>
                </select>
            </label>
            <p class="nota-piccola">Con l'occhio in alto a destra nascondi o mostri saldi e importi
               (diventano •••••&nbsp;€), per usare l'app davanti ad altre persone.</p>
        </div>

        <h2>Dati</h2>
        <div class="scheda">
            <p>${r.movimenti
                ? `<strong>${r.movimenti}</strong> movimenti, dal ${dataLeggibile(r.dal)} al ${dataLeggibile(r.al)}.`
                : "Ancora nessun movimento."}</p>
            <p>Ultimo backup: <strong>${ultimo ? dataLeggibile(ultimo) : "mai"}</strong></p>
            <p class="nota-piccola">I dati esistono solo su questo dispositivo. Fai un backup ogni tanto e salvalo
               in una cartella sul cloud (iCloud Drive, Google Drive…): se cambi telefono, lo importi da qui.</p>
        </div>
        <div class="strumenti">
            <button id="bottone-backup">💾 Crea backup (.zip)</button>
            ${bottoneImporta("📥 Importa dati", "bottone secondario")}
        </div>
        <p class="nota-piccola">"Importa dati" accetta sia i backup di questa app (.zip) sia quelli di
           Money Manager (.mmbackup) e riconosce da solo il tipo di file. Prima di caricare qualcosa
           ti mostra un riepilogo e ti chiede conferma.</p>
        <button class="pericolo" id="elimina-tutto">🗑️ Elimina tutti i dati e ricomincia</button>

        <!-- Lo stesso avviso del file LICENSE nel repository -->
        <p class="copyright">© 2026 AV – Tutti i diritti riservati</p>`;

    // Le due scelte: si salvano appena cambiano
    const contoProposto = main.querySelector("#conto-proposto");
    contoProposto.value = impostazione("conto_proposto", "nessuno");
    // Se il conto principale è stato archiviato non è tra le voci: vale "Nessuno" (vedi contoProposto in movimento.js)
    if (!contoProposto.value) contoProposto.value = "nessuno";
    contoProposto.onchange = () => modifica(() => salvaImpostazione("conto_proposto", contoProposto.value));

    const privacy = main.querySelector("#privacy-apertura");
    privacy.value = impostazione("privacy_apertura", "ricorda");
    privacy.onchange = () => modifica(() => salvaImpostazione("privacy_apertura", privacy.value));

    main.querySelector("#bottone-backup").onclick = unaAllaVolta(async () => {
        try {
            if (await creaBackup()) mostraImpostazioni(main);
        } catch (errore) {
            avvisa(errore.message, true);
        }
    });

    collegaImporta(main, analisi => {
        mostraImpostazioni(main);
        avvisa(analisi.messaggio);
    });

    // Riporta l'app come al primo avvio: database vuoto e preferenze del dispositivo cancellate
    main.querySelector("#elimina-tutto").onclick = unaAllaVolta(async () => {
        if (!await chiediConferma("Eliminare tutti i conti, le categorie, i movimenti e le impostazioni?\n\n" +
                "Non si può annullare: se vuoi poterli recuperare, annulla e fai prima un backup.",
                "Elimina tutto")) return;
        await cancellaTutto();
        // Data dell'ultimo backup e scelta dell'occhio (stanno nel localStorage, vedi backup.js e app.js).
        // Solo le nostre chiavi, non localStorage.clear(): su GitHub Pages tutti i siti di uno stesso
        // utente condividono lo stesso localStorage, e si cancellerebbero anche i dati degli altri.
        try {
            for (const chiave of ["ultimoBackup", "importiNascosti"]) localStorage.removeItem(chiave);
        } catch { }
        nascondiImporti(false);
        location.hash = "#/"; // la Home, senza conti, mostra la configurazione iniziale
    });
}
