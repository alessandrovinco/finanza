// Il database dell'app: un file SQLite che vive dentro il browser.
//
// - sql.js è SQLite compilato per il browser: stesse tabelle e stesse query
//   che vedi in DB Browser for SQLite.
// - Il browser non ha una cartella dove salvare file, quindi teniamo il
//   database (un blocco di byte) in IndexedDB, la "memoria" del sito.
// - Ogni modifica va salvata con salva(), altrimenti si perde chiudendo l'app.

// La versione delle tabelle è scritta dentro il database (pragma user_version).
// SCHEMA crea le tabelle della versione 1; ogni voce di AGGIORNAMENTI porta un
// database dalla versione precedente a quella indicata. Così un database vecchio
// (o un backup vecchio) viene aggiornato da solo, un passo alla volta.
const AGGIORNAMENTI = {
    // Versione 2: le impostazioni dell'app (es. quale conto proporre nei movimenti nuovi).
    // Stanno nel database, così viaggiano insieme al backup.
    2: `
        create table impostazioni (
            chiave  text primary key,
            valore  text not null
        );
    `,
};
const VERSIONE_SCHEMA = Math.max(...Object.keys(AGGIORNAMENTI).map(Number));

const SCHEMA = `
    create table conti (
        id                  text primary key,
        nome                text not null,
        icona               text not null,              -- un'emoji
        colore              text not null,              -- es. '#4caf50'
        escluso_dal_totale  integer not null default 0, -- 1 = non conta nel saldo totale
        archiviato          integer not null default 0, -- 1 = nascosto dagli elenchi
        posizione           integer not null default 0  -- ordine in cui mostrarli
    );

    create table categorie (
        id          text primary key,
        nome        text not null,
        tipo        text not null check (tipo in ('spesa', 'entrata')),
        icona       text not null,
        colore      text not null,
        archiviata  integer not null default 0,
        posizione   integer not null default 0
    );

    -- Spese, entrate e trasferimenti stanno tutti qui: conto e categoria sono
    -- colonne del movimento, non serve una tabella di collegamento come sync_link.
    create table movimenti (
        id                     text primary key,
        tipo                   text not null check (tipo in ('spesa', 'entrata', 'trasferimento')),
        data                   text not null,               -- 'AAAA-MM-GG'
        importo                integer not null check (importo >= 0), -- in centesimi: 1275 = 12,75 €
        conto_id               text not null references conti(id),
        conto_destinazione_id  text references conti(id),     -- solo per i trasferimenti
        categoria_id           text references categorie(id), -- vuota per i trasferimenti
        nota                   text not null default '',
        creato_il              text not null,
        modificato_il          text not null
    );

    create index movimenti_per_data on movimenti(data);

    -- Il saldo non è salvato da nessuna parte: si calcola sempre dai movimenti,
    -- così non può mai "disallinearsi". Una view è una query con un nome,
    -- che si interroga come se fosse una tabella.
    create view saldi as
    select c.id, coalesce(sum(case
               when m.tipo = 'entrata' then m.importo
               when m.tipo = 'spesa' then -m.importo
               when m.conto_id = c.id then -m.importo  -- trasferimento in uscita
               else m.importo                          -- trasferimento in entrata
           end), 0) as saldo
    from conti c
    left join movimenti m on m.conto_id = c.id or m.conto_destinazione_id = c.id
    group by c.id;
`;

let SQL; // il motore sql.js, caricato una volta sola
let db;  // il database aperto

export async function apriDatabase() {
    SQL = await initSqlJs({ locateFile: nome => `lib/${nome}` });
    const salvato = await memoria("get", "database");
    db = salvato ? new SQL.Database(salvato) : nuovoDatabase();
    aggiornaSchema(db);
}

function nuovoDatabase() {
    const nuovo = new SQL.Database();
    nuovo.exec(SCHEMA);
    nuovo.exec("pragma user_version = 1");
    return nuovo;
}

/** Applica gli aggiornamenti che mancano a questo database (nessuno, se è già all'ultima versione). */
function aggiornaSchema(database) {
    const versione = leggi("pragma user_version", [], database)[0].user_version;
    for (let v = versione + 1; v <= VERSIONE_SCHEMA; v++) {
        database.exec("begin");
        database.exec(AGGIORNAMENTI[v]);
        database.exec(`pragma user_version = ${v}`);
        database.exec("commit");
    }
}

/** Apre un altro file SQLite (es. quello di Money Manager) senza toccare il nostro. */
export function apriFileSqlite(byte) {
    return new SQL.Database(byte);
}

/**
 * Apre il database di un backup, controlla che sia dei nostri e lo porta all'ultima versione.
 * Non tocca i dati attuali: per usarlo davvero serve sostituisciDatabase().
 */
export function apriBackup(byte) {
    const candidato = new SQL.Database(byte);
    let versione, tabelle;
    try {
        versione = leggi("pragma user_version", [], candidato)[0].user_version;
        tabelle = leggi("select name from sqlite_master where name = 'movimenti'", [], candidato);
    } catch {
        tabelle = []; // non è nemmeno un file SQLite
    }
    if (tabelle.length === 0 || versione < 1) {
        candidato.close();
        throw new Error("Questo file non è un backup valido di questa app.");
    }
    if (versione > VERSIONE_SCHEMA) {
        candidato.close();
        throw new Error("Questo backup è stato fatto con una versione più recente dell'app.");
    }
    aggiornaSchema(candidato); // un backup fatto con una versione precedente dell'app
    return candidato;
}

/** Mette al posto del database attuale uno aperto con apriBackup(). */
export function sostituisciDatabase(candidato) {
    db.close();
    db = candidato;
}

export function esportaDatabase() {
    return db.export();
}

/** Esegue una query e restituisce le righe come oggetti: [{nome: "cash", saldo: 0}, ...] */
export function leggi(sql, parametri = [], database = db) {
    const istruzione = database.prepare(sql);
    istruzione.bind(parametri);
    const righe = [];
    while (istruzione.step()) righe.push(istruzione.getAsObject());
    istruzione.free();
    return righe;
}

export function scrivi(sql, parametri = []) {
    db.run(sql, parametri);
}

/** Legge un'impostazione; se non è mai stata scelta restituisce il valore predefinito. */
export function impostazione(chiave, predefinito) {
    return leggi("select valore from impostazioni where chiave = ?", [chiave])[0]?.valore ?? predefinito;
}

/** Da usare dentro modifica(), come scrivi() */
export function salvaImpostazione(chiave, valore) {
    scrivi("insert or replace into impostazioni (chiave, valore) values (?, ?)", [chiave, valore]);
}

/** Esegue più scritture "tutte o nessuna": se una fallisce, il database torna com'era. */
export function inTransazione(operazioni) {
    db.exec("begin");
    try {
        operazioni();
        db.exec("commit");
    } catch (errore) {
        db.exec("rollback");
        throw errore;
    }
}

/** Esegue delle scritture in una transazione e salva subito il risultato. */
export async function modifica(operazioni) {
    inTransazione(operazioni);
    await salva();
}

export async function salva() {
    await memoria("put", "database", db.export());
}

// IndexedDB ha un'interfaccia antiquata basata su eventi: questa funzione
// la trasforma in una Promise, così si può usare con await.
function memoria(azione, chiave, valore) {
    return new Promise((ok, errore) => {
        const apertura = indexedDB.open("finanza", 1);
        apertura.onupgradeneeded = () => apertura.result.createObjectStore("file");
        apertura.onerror = () => errore(apertura.error);
        apertura.onsuccess = () => {
            const archivio = apertura.result.transaction("file", "readwrite").objectStore("file");
            const richiesta = azione === "get" ? archivio.get(chiave) : archivio.put(valore, chiave);
            richiesta.onsuccess = () => ok(richiesta.result);
            richiesta.onerror = () => errore(richiesta.error);
        };
    });
}
