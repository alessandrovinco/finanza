// Il backup è uno ZIP che contiene il file del database (finanza.db).
// Si può aprire anche con DB Browser for SQLite. Il ripristino sta in importa.js.

import { esportaDatabase } from "./database.js";
import { daTesto, oggi } from "./utili.js";

// La data dell'ultimo backup sta nel localStorage, la piccola memoria chiave-valore
// del browser: non è un dato finanziario, quindi non serve metterla nel database.
const CHIAVE_ULTIMO_BACKUP = "ultimoBackup";

/** La data dell'ultimo backup ("AAAA-MM-GG"), o null se non è mai stato fatto */
export function ultimoBackup() {
    try { return localStorage.getItem(CHIAVE_ULTIMO_BACKUP); } catch { return null; }
}

/** Quanti giorni sono passati dall'ultimo backup, o null se non è mai stato fatto */
export function giorniDallUltimoBackup() {
    const ultimo = ultimoBackup();
    if (!ultimo) return null;
    const millisecondiAlGiorno = 24 * 60 * 60 * 1000;
    return Math.round((daTesto(oggi()) - daTesto(ultimo)) / millisecondiAlGiorno);
}

function segnaBackup() {
    try { localStorage.setItem(CHIAVE_ULTIMO_BACKUP, oggi()); } catch { }
}

/** Crea il backup e lo consegna all'utente. Restituisce false se l'utente ha annullato. */
export async function creaBackup() {
    const zip = new JSZip();
    zip.file("finanza.db", esportaDatabase());
    const contenuto = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    const file = new File([contenuto], `finanza-backup-${oggi()}.zip`, { type: "application/zip" });

    // Sul telefono si apre il menu Condividi (da lì: "Salva su File" → iCloud Drive).
    // Sul PC, o se il menu non è disponibile, il file viene scaricato.
    const touch = matchMedia("(pointer: coarse)").matches; // vero su telefoni e tablet
    if (touch && navigator.canShare?.({ files: [file] })) {
        try {
            await navigator.share({ files: [file] });
            segnaBackup();
            return true;
        } catch (errore) {
            if (errore.name === "AbortError") return false; // l'utente ha chiuso il menu
        }
    }
    scarica(file);
    segnaBackup();
    return true;
}

// Per far "scaricare" un file creato dalla pagina si crea un link invisibile e lo si clicca
function scarica(file) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(file);
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
