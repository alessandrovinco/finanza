// Piccole funzioni di formattazione usate in tutta l'app.
// Le date sono sempre testi "AAAA-MM-GG": si confrontano e si ordinano facilmente,
// anche in SQL, e non hanno problemi di fuso orario.

// useGrouping "always": senza, l'italiano scrive 1011,39 € invece di 1.011,39 €
const formatoEuro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" });
const formatoData = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric" });
const formatoGiornoMese = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" });
const formatoMeseAnno = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" });

/** 1275 -> "12,75 €" */
export function euro(centesimi) {
    return formatoEuro.format(centesimi / 100);
}

/** 1275 -> "12,75", il formato da mettere in un campo di testo */
export function perCampo(centesimi) {
    return (centesimi / 100).toFixed(2).replace(".", ",");
}

/**
 * Il contrario: "12,75" -> 1275. Accetta anche "12.75", "1.250,00" e "12".
 * Restituisce null se il testo non è un importo valido.
 */
export function centesimi(testo) {
    let pulito = testo.replace(/[\s€]/g, "");
    // Se c'è la virgola, i punti sono separatori delle migliaia
    if (pulito.includes(",")) pulito = pulito.replace(/\./g, "").replace(",", ".");
    if (!/^\d+(\.\d{1,2})?$/.test(pulito)) return null;
    return Math.round(Number(pulito) * 100);
}

/** "2026-11-01" -> "1 nov 2026" */
export function dataLeggibile(data) {
    return formatoData.format(daTesto(data));
}

/** "2026-11-01" -> "1 nov" */
export function giornoMese(data) {
    return formatoGiornoMese.format(daTesto(data));
}

/** "2026-11-01" -> "Novembre 2026" */
export function meseAnno(data) {
    const testo = formatoMeseAnno.format(daTesto(data));
    return testo[0].toUpperCase() + testo.slice(1);
}

/** Da oggetto Date a "AAAA-MM-GG", nel fuso orario del telefono */
export function testoData(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Da "AAAA-MM-GG" a oggetto Date (a mezzanotte, ora locale) */
export function daTesto(data) {
    const [anno, mese, giorno] = data.split("-").map(Number);
    return new Date(anno, mese - 1, giorno);
}

export function oggi() {
    return testoData(new Date());
}

/** spostaGiorni("2026-11-01", -1) -> "2026-10-31" */
export function spostaGiorni(data, giorni) {
    const d = daTesto(data);
    d.setDate(d.getDate() + giorni);
    return testoData(d);
}

/** Rende innocuo un testo scritto dall'utente prima di inserirlo nella pagina. */
export function esc(testo) {
    const sostituti = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return String(testo ?? "").replace(/[&<>"']/g, c => sostituti[c]);
}
