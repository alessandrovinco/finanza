// Importa un backup di Money Manager (.mmbackup) nel database dell'app.
//
// È la stessa logica di strumenti/converti_backup.py, ma invece di scrivere
// i CSV riempie le nostre tabelle. Promemoria su com'è fatto il backup:
//   - 8 byte iniziali da saltare, poi uno ZIP che contiene MyFinance.db
//   - le righe cancellate restano, marcate con isRemoved = 1
//   - conto e categoria di un movimento stanno nella tabella sync_link

import { apriFileSqlite, inTransazione, leggi, scrivi, salva } from "./database.js";
import { euro } from "./utili.js";

// Le categorie predefinite di Money Manager hanno il nome vuoto
const NOMI_CATEGORIE_PREDEFINITE = {
    DefaultSalary: "Stipendio",
    DefaultPresent: "Regali",
    DefaultPercents: "Interessi",
    other_expense: "Altro",
    other_income: "Altro",
};

// Money Manager usa icone disegnate, identificate da un nome: le traduciamo in emoji
const ICONE = {
    alcohol: "🍸", bank: "🏦", beer: "🍺", bill: "🧾", bonus: "⭐", book: "📚",
    british_pound: "💷", burger: "🍔", canister: "⛽", cards: "💳", cards_play: "🃏",
    cash: "💵", cigarettes: "🚬", city: "🏨", coins: "🪙", credit_card: "💳",
    croissant: "🥐", dancing: "💃", envelope_money: "✉️", ethereum: "💎", graph: "📈",
    haircut: "💇", hanger: "👕", investing: "💰", investments: "📊", meat: "🍖",
    medicine: "💊", mobile1: "📱", music: "🎵", online_wallet: "👛", other: "❓",
    parking: "🅿️", payment: "🤝", paypal: "🅿️", percent: "🏛️", pets: "🐾",
    piggy_bank: "🐷", pizza: "🍕", prepaid: "💼", present: "🎁", rent: "🏠",
    return: "🔁", road: "🛣️", safe: "🔐", sport: "💪", transport: "🚌",
    travels: "✈️", university: "🎓", washer: "🧺", water: "💧", wine: "🍷",
    world_map: "🌍",
};

const TIPI = { Expense: "spesa", Income: "entrata" };

/** Sostituisce tutti i dati dell'app con quelli del backup. Restituisce un riepilogo. */
export async function importaMoneyManager(file) {
    const byte = new Uint8Array(await file.arrayBuffer());
    const zip = await JSZip.loadAsync(byte.slice(8)).catch(() => null);
    const voce = zip?.file("MyFinance.db");
    if (!voce) throw new Error("Questo file non sembra un backup di Money Manager.");

    const mm = apriFileSqlite(await voce.async("uint8array"));
    try {
        // Se qualcosa va storto (anche la verifica dei saldi) non cambia niente
        inTransazione(() => {
            scrivi("delete from movimenti");
            scrivi("delete from categorie");
            scrivi("delete from conti");
            copiaConti(mm);
            copiaCategorie(mm);
            copiaMovimenti(mm);
            verificaSaldi(mm);
        });
    } finally {
        mm.close();
    }
    await salva();
    return leggi("select count(*) as movimenti, min(data) as dal, max(data) as al from movimenti")[0];
}

function copiaConti(mm) {
    const conti = leggi(`
        select uid, title, icon, color, ignoreInBalance, isArchived, position
        from account where isRemoved = 0
    `, [], mm);
    for (const c of conti) {
        scrivi(`insert into conti (id, nome, icona, colore, escluso_dal_totale, archiviato, posizione)
                values (?, ?, ?, ?, ?, ?, ?)`,
            [c.uid, c.title, icona(c.icon), colore(c.color), c.ignoreInBalance, c.isArchived, c.position]);
    }
}

function copiaCategorie(mm) {
    // Anche le categorie cancellate che però sono ancora usate da qualche movimento:
    // le importiamo come archiviate, così quei movimenti non perdono la categoria.
    const categorie = leggi(`
        select uid, title, type, icon, color, position, max(isArchived, isRemoved) as archiviata
        from category
        where isRemoved = 0 or uid in (
            select l.otherUid from sync_link l join "transaction" t on t.uid = l.entityUid
            where l.otherType = 'Category' and l.isRemoved = 0 and t.isRemoved = 0
        )
    `, [], mm);
    for (const c of categorie) {
        scrivi(`insert into categorie (id, nome, tipo, icona, colore, archiviata, posizione)
                values (?, ?, ?, ?, ?, ?, ?)`,
            [c.uid, c.title || NOMI_CATEGORIE_PREDEFINITE[c.uid] || c.uid, TIPI[c.type],
             icona(c.icon), colore(c.color), c.archiviata, c.position]);
    }
}

function copiaMovimenti(mm) {
    // Per ogni movimento: { Account: ..., Category: ... } oppure { FromAccount: ..., ToAccount: ... }
    const collegamenti = {};
    for (const l of leggi(`
        select entityUid, otherType, otherUid from sync_link
        where isRemoved = 0 and entityType in ('Transaction', 'Transfer')
    `, [], mm)) {
        (collegamenti[l.entityUid] ??= {})[l.otherType] = l.otherUid;
    }

    const inserisci = `insert into movimenti
        (id, tipo, data, importo, conto_id, conto_destinazione_id, categoria_id, nota, creato_il, modificato_il)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    for (const t of leggi(`
        select uid, type, amountInAccountCurrency as importo, date, comment, created, modified
        from "transaction" where isRemoved = 0
    `, [], mm)) {
        const link = collegamenti[t.uid] ?? {};
        scrivi(inserisci, [t.uid, TIPI[t.type], t.date, t.importo, link.Account, null,
                           link.Category ?? null, t.comment ?? "", t.created, t.modified]);
    }

    for (const t of leggi(`
        select uid, fromAmount as importo, date, comment, created, modified
        from transfer where isRemoved = 0
    `, [], mm)) {
        const link = collegamenti[t.uid] ?? {};
        scrivi(inserisci, [t.uid, "trasferimento", t.date, t.importo, link.FromAccount, link.ToAccount,
                           null, t.comment ?? "", t.created, t.modified]);
    }
}

/** I saldi ricalcolati dai nostri movimenti devono coincidere con quelli dell'app. */
function verificaSaldi(mm) {
    const attesi = {};
    for (const b of leggi("select uid, value from account_balance", [], mm)) attesi[b.uid] = b.value;

    const sbagliati = leggi("select c.nome, s.id, s.saldo from saldi s join conti c on c.id = s.id")
        .filter(s => s.saldo !== (attesi[s.id] ?? 0))
        .map(s => `${s.nome} (${euro(s.saldo)} invece di ${euro(attesi[s.id] ?? 0)})`);
    if (sbagliati.length) {
        throw new Error(`I saldi non tornano per: ${sbagliati.join(", ")}. Nessun dato importato.`);
    }
}

function icona(nome) {
    return ICONE[nome] ?? "💰";
}

/** Money Manager salva i colori come numero (es. 4290273313): ci servono in formato '#rrggbb'. */
function colore(numero) {
    return "#" + (numero & 0xffffff).toString(16).padStart(6, "0");
}
