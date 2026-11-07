// Importazione unica: riconosce da sola se il file è un backup di questa app
// o di Money Manager, prepara un riepilogo e importa solo dopo la conferma.
//
// Come si riconosce il tipo: un file ZIP comincia sempre con le lettere "PK".
//   - backup di questa app: è uno ZIP, quindi "PK" all'inizio
//   - backup di Money Manager: 8 byte iniziali e poi uno ZIP, quindi "PK" dal nono byte

import { apriBackup, leggi, salva, sostituisciDatabase } from "./database.js";
import { apriMoneyManager, importaMoneyManager, riepilogoMoneyManager } from "./importa-mm.js";

/**
 * Legge il file senza cambiare niente e restituisce:
 * { tipo, riepilogo: {conti, categorie, movimenti, dal, al}, messaggio, importa(), annulla() }
 */
export async function analizzaFile(file) {
    const byte = new Uint8Array(await file.arrayBuffer());
    if (comincaConZip(byte, 0)) return analizzaBackup(byte);
    if (comincaConZip(byte, 8)) return analizzaMoneyManager(byte);
    throw new Error("Questo file non è un backup di questa app (.zip) né di Money Manager (.mmbackup).");
}

function comincaConZip(byte, inizio) {
    return byte[inizio] === 0x50 && byte[inizio + 1] === 0x4b; // 0x50 = "P", 0x4b = "K"
}

async function analizzaBackup(byte) {
    const zip = await JSZip.loadAsync(byte).catch(() => null);
    const voce = zip?.file("finanza.db");
    if (!voce) throw new Error("Questo file ZIP non è un backup di questa app.");

    const candidato = apriBackup(await voce.async("uint8array"));
    const riepilogo = leggi(`
        select (select count(*) from conti) as conti,
               (select count(*) from categorie) as categorie,
               count(*) as movimenti, min(data) as dal, max(data) as al
        from movimenti
    `, [], candidato)[0];

    return {
        tipo: "Backup di questa app",
        riepilogo,
        messaggio: "Backup ripristinato.",
        importa: async () => {
            sostituisciDatabase(candidato);
            await salva();
        },
        annulla: () => candidato.close(),
    };
}

async function analizzaMoneyManager(byte) {
    const mm = await apriMoneyManager(byte);
    const riepilogo = riepilogoMoneyManager(mm);
    return {
        tipo: "Backup di Money Manager",
        riepilogo,
        messaggio: `Importati ${riepilogo.movimenti} movimenti. I saldi coincidono con quelli di Money Manager.`,
        importa: async () => {
            try {
                await importaMoneyManager(mm);
            } finally {
                mm.close();
            }
        },
        annulla: () => mm.close(),
    };
}
