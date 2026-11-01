// La Home: quanto hai speso (o incassato) nel periodo scelto, diviso per categoria.

import { leggi } from "../database.js";
import { giorniDallUltimoBackup } from "../backup.js";
import { daTesto, dataLeggibile, esc, euro, giornoMese, meseAnno, oggi, spostaGiorni, testoData } from "../utili.js";
import { bollino, impostaTitolo, riga, schede } from "./comuni.js";

const TIPI = { spesa: "Spese", entrata: "Entrate" };
const PERIODI = { giorno: "Giorno", settimana: "Settimana", mese: "Mese", anno: "Anno" };

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
    if (conti.length === 0) return mostraBenvenuto();
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

function mostraBenvenuto() {
    main.innerHTML = `
        <div class="scheda benvenuto">
            <h2>Benvenuto!</h2>
            <p>Per iniziare importa i tuoi dati da Money Manager, oppure crea il primo conto.</p>
            <a class="bottone" href="#/dati">Importa da Money Manager</a>
            <a class="bottone secondario" href="#/conto/nuovo">Crea un conto</a>
        </div>`;
}

/** Un avviso che porta alla pagina Dati, se il backup è vecchio o non è mai stato fatto */
function promemoriaBackup() {
    const giorni = giorniDallUltimoBackup();
    if (giorni !== null && giorni < GIORNI_PROMEMORIA_BACKUP) return "";
    const testo = giorni === null ? "Non hai ancora fatto un backup." : `Ultimo backup ${giorni} giorni fa.`;
    return `<a class="promemoria" href="#/dati">💾 ${testo} <strong>Fallo ora ›</strong></a>`;
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
