// Pezzi di interfaccia usati da più pagine.

import { coloreSicuro, esc } from "../utili.js";

// Emoji e colori proposti quando si crea o modifica un conto o una categoria
const EMOJI = [
    "🛒", "🍔", "🍕", "🥐", "☕", "🍺", "🍷", "🍸", "🚌", "🚗", "⛽", "🅿️", "✈️", "🏨",
    "🏠", "💡", "📱", "💻", "👕", "💇", "💊", "🎓", "📚", "🎵", "🎬", "🎮", "🎁", "🐾",
    "💪", "⚽", "🚬", "🧾", "🏛️", "🤝", "🔁", "⭐", "💰", "💵", "💳", "🏦", "🐷", "📈",
    "💎", "👛", "❓",
];
const COLORI = [
    "#e53935", "#d81b60", "#8e24aa", "#5e35b1", "#3949ab", "#1e88e5", "#039be5", "#00897b",
    "#43a047", "#7cb342", "#fdd835", "#fb8c00", "#f4511e", "#6d4c41", "#757575", "#546e7a",
];

export function impostaTitolo(testo, conIndietro = false) {
    document.querySelector("#titolo").textContent = testo;
    document.querySelector("#indietro").hidden = !conIndietro;
}

// --- Tornare indietro -------------------------------------------------------
// Se si è arrivati alla pagina da un'altra pagina dell'app si usa la cronologia
// (come il tasto Indietro), altrimenti si va alla Home.

let haCronologia = false;

export function segnaNavigazione() {
    haCronologia = true;
}

export function torna() {
    if (haCronologia) history.back();
    else location.hash = "#/";
}

// --- Messaggi ---------------------------------------------------------------

export function avvisa(messaggio, errore = false) {
    const avviso = document.querySelector("#avviso");
    avviso.textContent = messaggio;
    avviso.className = errore ? "errore" : "";
    avviso.hidden = false;
    window.scrollTo(0, 0);
}

export function nascondiAvviso() {
    document.querySelector("#avviso").hidden = true;
}

// --- Elementi ricorrenti ----------------------------------------------------

/** Una riga di elenco: icona colorata, titolo, sottotitolo, importo. Con link diventa cliccabile. */
export function riga({ icona = null, colore, titolo, sotto = "", importo = "", classe = "", link = null, attenuata = false }) {
    const tag = link ? "a" : "div";
    return `
        <${tag} class="riga${attenuata ? " attenuata" : ""}" ${link ? `href="${esc(link)}"` : ""}>
            ${icona === null ? "" : bollino(icona, colore)}
            <span class="testi">
                <span class="titolo">${esc(titolo)}</span>
                ${sotto ? `<span class="sotto">${esc(sotto)}</span>` : ""}
            </span>
            <span class="importo ${classe}">${esc(importo)}</span>
        </${tag}>`;
}

/** Il cerchio colorato con l'emoji dentro */
export function bollino(icona, colore) {
    return `<span class="icona" style="background: ${coloreSicuro(colore)}33">${esc(icona)}</span>`;
}

/** Bottoni a schede (es. Spese | Entrate). La scheda scelta ha la classe "attiva". */
export function schede(nomeDato, voci, scelta) {
    return `<div class="schede">${Object.entries(voci).map(([valore, etichetta]) =>
        `<button type="button" data-${nomeDato}="${valore}" class="${valore === scelta ? "attiva" : ""}">${etichetta}</button>`
    ).join("")}</div>`;
}

/** Campi per scegliere icona e colore (nei moduli di conti e categorie) */
export function campiIconaColore(icona, colore) {
    return `
        <label class="campo">Icona
            <input name="icona" value="${esc(icona)}" maxlength="8" class="input-icona" required autocomplete="off">
        </label>
        <div class="tavolozza">${EMOJI.map(e => `<button type="button" data-emoji="${e}">${e}</button>`).join("")}</div>
        <label class="campo">Colore
            <input type="color" name="colore" value="${coloreSicuro(colore)}">
        </label>
        <div class="tavolozza colori">${COLORI.map(c =>
            `<button type="button" data-colore="${c}" style="background: ${c}" aria-label="${c}"></button>`
        ).join("")}</div>`;
}

export function collegaIconaColore(modulo) {
    modulo.querySelectorAll("[data-emoji]").forEach(b => b.onclick = () => modulo.icona.value = b.dataset.emoji);
    modulo.querySelectorAll("[data-colore]").forEach(b => b.onclick = () => modulo.colore.value = b.dataset.colore);
}

/**
 * Chiede conferma con una finestra dell'app e aspetta la risposta: true = conferma, false = Annulla.
 * Si usa al posto di confirm() del browser, che alcuni browser bloccano (rispondendo sempre "Annulla").
 * Il bottone di conferma è rosso: per ora serve solo per eliminare qualcosa.
 */
export function chiediConferma(messaggio, etichetta = "Elimina") {
    const finestra = document.createElement("dialog");
    finestra.innerHTML = `
        <div class="modulo">
            <p class="messaggio-conferma">${esc(messaggio)}</p>
            <div class="azioni">
                <button type="button" class="bottone secondario" data-risposta="">Annulla</button>
                <button type="button" class="conferma-pericolo" data-risposta="si">${esc(etichetta)}</button>
            </div>
        </div>`;
    return aspettaRisposta(finestra);
}

/**
 * Mostra una finestra con dei bottoni data-risposta e aspetta quale viene toccato:
 * true per quello con data-risposta="si", false per gli altri.
 * Il tasto Esc, o la finestra chiusa perché si è cambiata pagina, valgono come Annulla.
 */
export function aspettaRisposta(finestra) {
    document.body.append(finestra);
    return new Promise(risolvi => {
        const rispondi = si => {
            finestra.onclose = null; // si risponde una volta sola
            finestra.close();
            finestra.remove();
            risolvi(si);
        };
        // La risposta arriva direttamente dal bottone, senza aspettare l'evento "close":
        // alcuni browser lo mandano in ritardo (o per niente, se la pagina non è in primo piano)
        finestra.querySelectorAll("[data-risposta]").forEach(b => b.onclick = () => rispondi(b.dataset.risposta === "si"));
        finestra.onclose = () => rispondi(false);
        finestra.showModal();
    });
}

/**
 * Avvolge un'azione che salva qualcosa: finché non ha finito, gli altri tocchi vengono ignorati.
 * Senza, su un telefono lento due tocchi veloci su "Salva" creerebbero due movimenti uguali.
 */
export function unaAllaVolta(azione) {
    let inCorso = false;
    return async (...argomenti) => {
        if (inCorso) return;
        inCorso = true;
        try {
            return await azione(...argomenti);
        } finally {
            inCorso = false;
        }
    };
}

/** Collega il tasto Salva di un modulo all'azione, una volta sola alla volta (vedi unaAllaVolta). */
export function alSalvataggio(modulo, azione) {
    const salva = unaAllaVolta(azione);
    modulo.onsubmit = evento => {
        evento.preventDefault(); // subito, anche se il tocco viene ignorato: il modulo non deve ricaricare la pagina
        return salva();
    };
}

/** Chiude le finestre ancora aperte (es. una conferma) quando si cambia pagina. */
export function chiudiFinestre() {
    document.querySelectorAll("dialog[open]").forEach(finestra => {
        finestra.close();
        finestra.onclose?.(); // le conferme rispondono subito "Annulla" (vedi aspettaRisposta)
    });
}

/** Mostra un errore in fondo a un modulo, sopra il tasto Salva */
export function erroreModulo(modulo, messaggio) {
    const p = modulo.querySelector(".errore-modulo");
    p.textContent = messaggio;
    p.hidden = false;
}
