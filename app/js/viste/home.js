// La Home: quanto hai speso (o incassato) nel periodo scelto, diviso per categoria.

import { leggi, modifica, scrivi } from "../database.js";
import { giorniDallUltimoBackup } from "../backup.js";
import { daTesto, dataLeggibile, esc, euro, giornoMese, meseAnno, oggi, spostaGiorni, testoData } from "../utili.js";
import { avvisa, bollino, impostaTitolo, riga, schede } from "./comuni.js";
import { bottoneImporta, collegaImporta } from "./importazione.js";

const TIPI = { spesa: "Spese", entrata: "Entrate" };
const PERIODI = { giorno: "Giorno", settimana: "Settimana", mese: "Mese", anno: "Anno" };

// Cosa crea "Inizia da zero" nella schermata di benvenuto: [nome, icona, colore]
const CONTI_INIZIALI = [
    ["Conto corrente", "🏦", "#1e88e5"],
    ["Contanti", "💵", "#43a047"],
];
const CATEGORIE_INIZIALI = {
    spesa: [
        ["Spesa", "🛒", "#43a047"],
        ["Ristoranti", "🍕", "#fb8c00"],
        ["Trasporti", "🚌", "#1e88e5"],
        ["Casa", "🏠", "#8e24aa"],
        ["Altro", "❓", "#757575"],
    ],
    entrata: [
        ["Stipendio", "💵", "#43a047"],
        ["Regali", "🎁", "#d81b60"],
        ["Rimborsi", "🔁", "#039be5"],
        ["Interessi", "🏛️", "#fdd835"],
        ["Altro", "💰", "#757575"],
    ],
};

// Dopo quanti giorni senza backup compare il promemoria in cima alla Home
const GIORNI_PROMEMORIA_BACKUP = 3;

// Le scelte fatte nella Home. Stanno fuori dalla funzione, così restano
// uguali quando si torna alla Home da un'altra pagina.
const stato = {
    tipo: "spesa",
    periodo: "mese",
    ancora: oggi(),     // un giorno qualsiasi dentro il periodo mostrato
    conto: "",          // "" = tutti i conti
    aperta: null,       // la categoria di cui si vedono i movimenti
};

let main;

export function mostraHome(contenitore) {
    main = contenitore;
    impostaTitolo("Finanza");

    const conti = leggi(`
        select c.id, c.nome, c.icona, c.escluso_dal_totale, s.saldo
        from conti c join saldi s on s.id = c.id
        where c.archiviato = 0
        order by c.posizione
    `);
    if (conti.length === 0) {
        // Nessun conto attivo: è il primo avvio, oppure sono tutti archiviati
        const archiviati = leggi("select count(*) as n from conti")[0].n;
        return archiviati ? mostraTuttiArchiviati() : mostraBenvenuto();
    }
    if (!conti.some(c => c.id === stato.conto)) stato.conto = "";

    const saldo = stato.conto
        ? conti.find(c => c.id === stato.conto).saldo
        : conti.filter(c => !c.escluso_dal_totale).reduce((somma, c) => somma + c.saldo, 0);

    // La stessa condizione serve sia per i totali sia per l'elenco dei movimenti
    const { dal, al, etichetta } = intervallo();
    const filtro = "m.tipo = ? and m.data between ? and ?" + (stato.conto ? " and m.conto_id = ?" : "");
    const parametri = [stato.tipo, dal, al, ...(stato.conto ? [stato.conto] : [])];

    const voci = leggi(`
        select m.categoria_id as id, k.nome, k.icona, k.colore, sum(m.importo) as totale
        from movimenti m left join categorie k on k.id = m.categoria_id
        where ${filtro}
        group by m.categoria_id
        order by totale desc
    `, parametri);
    const totale = voci.reduce((somma, v) => somma + v.totale, 0);

    main.innerHTML = `
        ${promemoriaBackup()}
        <div class="scheda">
            ${schede("tipo", TIPI, stato.tipo)}
            <div class="filtro-conto">
                <select id="filtro-conto" aria-label="Conto">
                    <option value="">Tutti i conti</option>
                    ${conti.map(c => `<option value="${esc(c.id)}" ${c.id === stato.conto ? "selected" : ""}>${esc(c.icona)} ${esc(c.nome)}</option>`).join("")}
                </select>
                <span class="saldo">Saldo <strong>${euro(saldo)}</strong></span>
            </div>
            ${schede("periodo", PERIODI, stato.periodo)}
            <div class="naviga-periodo">
                <button id="periodo-prima" aria-label="Periodo precedente">‹</button>
                <button id="periodo-oggi" class="etichetta" title="Torna a oggi">${etichetta}</button>
                <button id="periodo-dopo" aria-label="Periodo successivo">›</button>
            </div>
            <div class="ciambella">
                ${ciambella(voci, totale)}
                <div class="centro">${totale
                    ? `<strong>${euro(totale)}</strong>`
                    : `Nessuna ${stato.tipo} in questo periodo`}</div>
            </div>
        </div>
        <div class="elenco">${voci.map(v => voce(v, totale, filtro, parametri)).join("")}</div>
        <a class="fab" href="#/movimento/nuovo?tipo=${stato.tipo}" aria-label="Aggiungi">+</a>
    `;
    collega();
}

// La configurazione iniziale: importare dei dati oppure partire con conti e categorie di base
function mostraBenvenuto() {
    main.innerHTML = `
        <div class="scheda benvenuto">
            <h2>Benvenuto!</h2>
            <p>Come vuoi iniziare?</p>
            ${bottoneImporta("📥 Ho già dei dati")}
            <p class="nota-piccola">Un backup di questa app o di Money Manager.</p>
            <button class="bottone secondario" id="inizia-da-zero">✨ Inizia da zero</button>
            <p class="nota-piccola">Crea i conti Conto corrente e Contanti, 5 categorie di spesa e 5 di entrata:
               potrai modificarli quando vuoi.</p>
        </div>`;

    collegaImporta(main, analisi => {
        mostraHome(main);
        avvisa(analisi.messaggio);
    });
    main.querySelector("#inizia-da-zero").onclick = async () => {
        await modifica(creaDatiIniziali);
        mostraHome(main);
    };
}

function creaDatiIniziali() {
    let posizione = 0;
    for (const [nome, icona, colore] of CONTI_INIZIALI) {
        scrivi("insert into conti (id, nome, icona, colore, posizione) values (?, ?, ?, ?, ?)",
            [crypto.randomUUID(), nome, icona, colore, ++posizione]);
    }
    // Le categorie solo se non ce ne sono già, per non crearle doppie
    if (leggi("select count(*) as n from categorie")[0].n > 0) return;
    for (const [tipo, categorie] of Object.entries(CATEGORIE_INIZIALI)) {
        for (const [nome, icona, colore] of categorie) {
            scrivi("insert into categorie (id, tipo, nome, icona, colore, posizione) values (?, ?, ?, ?, ?, ?)",
                [crypto.randomUUID(), tipo, nome, icona, colore, ++posizione]);
        }
    }
}

function mostraTuttiArchiviati() {
    main.innerHTML = `
        <p class="vuoto">Tutti i tuoi conti sono archiviati.<br>
            <a href="#/conti">Vai ai conti</a> per riattivarne uno, oppure crea un conto nuovo.</p>`;
}

/** Un avviso che porta alle Impostazioni, se il backup è vecchio o non è mai stato fatto */
function promemoriaBackup() {
    const giorni = giorniDallUltimoBackup();
    if (giorni !== null && giorni < GIORNI_PROMEMORIA_BACKUP) return "";
    const testo = giorni === null ? "Non hai ancora fatto un backup." : `Ultimo backup ${giorni} giorni fa.`;
    return `<a class="promemoria" href="#/impostazioni">💾 ${testo} <strong>Fallo ora ›</strong></a>`;
}

/** Una categoria nell'elenco sotto la ciambella. Toccandola si vedono i suoi movimenti. */
function voce(v, totale, filtro, parametri) {
    const chiave = v.id ?? "nessuna";
    const aperta = stato.aperta === chiave;
    let movimenti = "";
    if (aperta) {
        // "is" invece di "=": funziona anche per i movimenti senza categoria (null)
        movimenti = leggi(`
            select m.id, m.data, m.importo, m.nota, c.nome as conto
            from movimenti m join conti c on c.id = m.conto_id
            where ${filtro} and m.categoria_id is ?
            order by m.data desc, m.creato_il desc
        `, [...parametri, v.id]).map(m => riga({
            titolo: dataLeggibile(m.data),
            sotto: [m.conto, m.nota].filter(Boolean).join(" · "),
            importo: euro(m.importo),
            link: `#/movimento/${m.id}`,
        })).join("");
    }
    return `
        <button class="voce ${aperta ? "aperta" : ""}" data-voce="${esc(chiave)}">
            ${bollino(v.icona ?? "❔", v.colore ?? "#9e9e9e")}
            <span class="nome">${esc(v.nome ?? "Senza categoria")}</span>
            <span class="percentuale">${Math.round(v.totale / totale * 100)}%</span>
            <span class="importo">${euro(v.totale)}</span>
        </button>
        ${aperta ? `<div class="movimenti-voce">${movimenti}</div>` : ""}`;
}

// Il grafico a ciambella in SVG. Il trucco: un cerchio di raggio 15,915 è lungo
// esattamente 100, quindi ogni categoria è un tratto lungo quanto la sua percentuale.
function ciambella(voci, totale) {
    const r = 15.915;
    if (!totale) {
        return `<svg viewBox="0 0 42 42"><circle cx="21" cy="21" r="${r}" fill="none" stroke="#e3e1db" stroke-width="5"/></svg>`;
    }
    let fatto = 0;
    const tratti = voci.map(v => {
        const parte = v.totale / totale * 100;
        // dashoffset 25 = si parte dall'alto (ore 12) invece che da destra
        const tratto = `<circle cx="21" cy="21" r="${r}" fill="none" stroke="${esc(v.colore ?? "#9e9e9e")}"
            stroke-width="5" stroke-dasharray="${parte} ${100 - parte}" stroke-dashoffset="${25 - fatto}"/>`;
        fatto += parte;
        return tratto;
    });
    return `<svg viewBox="0 0 42 42">${tratti.join("")}</svg>`;
}

/** Primo e ultimo giorno del periodo scelto, e come scriverlo. */
function intervallo() {
    const d = daTesto(stato.ancora);
    const anno = d.getFullYear();
    switch (stato.periodo) {
        case "giorno":
            return { dal: stato.ancora, al: stato.ancora, etichetta: dataLeggibile(stato.ancora) };
        case "settimana": {
            const lunedi = spostaGiorni(stato.ancora, -((d.getDay() + 6) % 7)); // getDay(): domenica = 0
            const domenica = spostaGiorni(lunedi, 6);
            return { dal: lunedi, al: domenica, etichetta: `${giornoMese(lunedi)} – ${dataLeggibile(domenica)}` };
        }
        case "mese":
            return {
                dal: testoData(new Date(anno, d.getMonth(), 1)),
                al: testoData(new Date(anno, d.getMonth() + 1, 0)), // il giorno 0 del mese dopo = l'ultimo di questo
                etichetta: meseAnno(stato.ancora),
            };
        default:
            return { dal: `${anno}-01-01`, al: `${anno}-12-31`, etichetta: String(anno) };
    }
}

function spostaPeriodo(verso) {
    const d = daTesto(stato.ancora);
    if (stato.periodo === "giorno") d.setDate(d.getDate() + verso);
    if (stato.periodo === "settimana") d.setDate(d.getDate() + 7 * verso);
    if (stato.periodo === "mese") d.setMonth(d.getMonth() + verso, 1);
    if (stato.periodo === "anno") d.setFullYear(d.getFullYear() + verso);
    stato.ancora = testoData(d);
    ridisegna();
}

function collega() {
    main.querySelectorAll("[data-tipo]").forEach(b => b.onclick = () => {
        stato.tipo = b.dataset.tipo;
        ridisegna();
    });
    main.querySelectorAll("[data-periodo]").forEach(b => b.onclick = () => {
        stato.periodo = b.dataset.periodo;
        ridisegna();
    });
    main.querySelector("#filtro-conto").onchange = evento => {
        stato.conto = evento.target.value;
        ridisegna();
    };
    main.querySelector("#periodo-prima").onclick = () => spostaPeriodo(-1);
    main.querySelector("#periodo-dopo").onclick = () => spostaPeriodo(1);
    main.querySelector("#periodo-oggi").onclick = () => {
        stato.ancora = oggi();
        ridisegna();
    };
    main.querySelectorAll("[data-voce]").forEach(b => b.onclick = () => {
        stato.aperta = stato.aperta === b.dataset.voce ? null : b.dataset.voce;
        mostraHome(main);
    });
}

// Cambiando filtro si chiude la categoria aperta: i suoi movimenti non sarebbero più quelli
function ridisegna() {
    stato.aperta = null;
    mostraHome(main);
}
