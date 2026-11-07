// La pagina dei conti (#/conti) e il modulo per crearne o modificarne uno (#/conto/<id>).

import { impostazione, leggi, modifica, scrivi } from "../database.js";
import { dataLeggibile, esc, euro } from "../utili.js";
import { alSalvataggio, campiIconaColore, chiediConferma, collegaIconaColore, erroreModulo, impostaTitolo, riga, torna, unaAllaVolta } from "./comuni.js";

export function mostraConti(main) {
    impostaTitolo("Conti");

    const conti = leggi(`
        select c.*, s.saldo from conti c join saldi s on s.id = c.id
        order by c.posizione
    `);
    const attivi = conti.filter(c => !c.archiviato);
    const archiviati = conti.filter(c => c.archiviato);
    const totale = attivi.filter(c => !c.escluso_dal_totale).reduce((somma, c) => somma + c.saldo, 0);

    const trasferimenti = leggi(`
        select m.id, m.data, m.importo, m.nota, da.nome as da, a.nome as a
        from movimenti m
        join conti da on da.id = m.conto_id
        join conti a on a.id = m.conto_destinazione_id
        where m.tipo = 'trasferimento'
        order by m.data desc, m.creato_il desc
        limit 20
    `);

    // "nessuno", "ultimo" oppure l'id del conto principale: si sceglie in Impostazioni
    // (vedi anche contoProposto in movimento.js)
    const proposto = impostazione("conto_proposto", "nessuno");

    const rigaConto = c => riga({
        icona: c.icona, colore: c.colore, titolo: c.nome,
        sotto: [c.id === proposto && !c.archiviato && "⭐ Principale",
                c.escluso_dal_totale && "Escluso dal totale"].filter(Boolean).join(" · "),
        importo: euro(c.saldo), link: `#/conto/${c.id}`, attenuata: c.archiviato,
    });

    main.innerHTML = `
        <div class="scheda riepilogo">
            <span>Totale</span>
            <strong>${euro(totale)}</strong>
        </div>
        <div class="azioni">
            <a class="bottone" href="#/movimento/nuovo?tipo=trasferimento">🔁 Trasferimento</a>
            <a class="bottone secondario" href="#/conto/nuovo">＋ Nuovo conto</a>
        </div>

        <h2>I tuoi conti</h2>
        ${attivi.map(rigaConto).join("") || `<p class="vuoto">Nessun conto.</p>`}

        ${archiviati.length ? `<h2>Archiviati</h2>${archiviati.map(rigaConto).join("")}` : ""}

        <h2>Ultimi trasferimenti</h2>
        ${trasferimenti.map(t => riga({
            icona: "🔁", colore: "#9e9e9e",
            titolo: `${t.da} → ${t.a}`,
            sotto: [dataLeggibile(t.data), t.nota].filter(Boolean).join(" · "),
            importo: euro(t.importo), link: `#/movimento/${t.id}`,
        })).join("") || `<p class="vuoto">Ancora nessun trasferimento.</p>`}
    `;
}

export function mostraConto(main, id) {
    const nuovo = id === "nuovo";
    const conto = nuovo
        ? { nome: "", icona: "💳", colore: "#1e88e5", escluso_dal_totale: 0, archiviato: 0 }
        : leggi("select c.*, s.saldo from conti c join saldi s on s.id = c.id where c.id = ?", [id])[0];
    if (!conto) return torna();
    impostaTitolo(nuovo ? "Nuovo conto" : conto.nome, true);

    const movimenti = nuovo ? 0 : leggi(
        "select count(*) as n from movimenti where conto_id = ? or conto_destinazione_id = ?", [id, id])[0].n;

    main.innerHTML = `
        <form class="modulo" novalidate>
            ${nuovo ? "" : `<div class="scheda riepilogo"><span>Saldo</span><strong>${euro(conto.saldo)}</strong></div>`}

            <label class="campo">Nome
                <input name="nome" value="${esc(conto.nome)}" autocomplete="off" required>
            </label>
            ${campiIconaColore(conto.icona, conto.colore)}

            <label class="interruttore">
                <input type="checkbox" name="escluso" ${conto.escluso_dal_totale ? "checked" : ""}>
                Non includere nel saldo totale
            </label>
            ${nuovo ? "" : `
                <label class="interruttore">
                    <input type="checkbox" name="archiviato" ${conto.archiviato ? "checked" : ""}>
                    Archiviato (nascosto quando inserisci un movimento)
                </label>`}

            <p class="errore-modulo" hidden></p>
            <button type="submit">Salva</button>
            ${nuovo ? "" : movimenti
                ? `<p class="nota-piccola">Questo conto ha ${movimenti} movimenti, quindi non si può eliminare:
                   se non lo usi più, archivialo.</p>`
                : `<button type="button" class="pericolo" id="elimina">Elimina conto</button>`}
        </form>`;

    const modulo = main.querySelector("form");
    collegaIconaColore(modulo);
    if (nuovo) modulo.nome.focus();

    alSalvataggio(modulo, async () => {
        const nome = modulo.nome.value.trim();
        if (!nome) return erroreModulo(modulo, "Dai un nome al conto.");
        if (!modulo.icona.value.trim()) return erroreModulo(modulo, "Scegli un'icona.");

        const valori = [nome, modulo.icona.value.trim(), modulo.colore.value, modulo.escluso.checked ? 1 : 0];
        await modifica(() => {
            if (nuovo) {
                scrivi(`insert into conti (nome, icona, colore, escluso_dal_totale, id, posizione)
                        values (?, ?, ?, ?, ?, (select coalesce(max(posizione), 0) + 1 from conti))`,
                    [...valori, crypto.randomUUID()]);
            } else {
                scrivi(`update conti set nome = ?, icona = ?, colore = ?, escluso_dal_totale = ?, archiviato = ?
                        where id = ?`, [...valori, modulo.archiviato.checked ? 1 : 0, id]);
            }
        });
        torna();
    });

    modulo.querySelector("#elimina")?.addEventListener("click", unaAllaVolta(async () => {
        if (!await chiediConferma(`Eliminare il conto "${conto.nome}"?`)) return;
        await modifica(() => {
            // Controllo rifatto al momento di eliminare: la pagina potrebbe essere vecchia
            // (es. un movimento aggiunto da un'altra scheda) e un movimento senza conto non si vedrebbe più
            if (leggi("select 1 from movimenti where conto_id = ? or conto_destinazione_id = ? limit 1", [id, id]).length) {
                throw new Error("Questo conto ha dei movimenti, quindi non si può eliminare.");
            }
            scrivi("delete from conti where id = ?", [id]);
        });
        torna();
    }));
}
