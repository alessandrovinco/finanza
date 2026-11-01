// Il modulo per inserire o modificare una spesa, un'entrata o un trasferimento.
// Indirizzi: #/movimento/nuovo?tipo=spesa   oppure   #/movimento/<id> per modificarne uno.

import { leggi, modifica, scrivi } from "../database.js";
import { centesimi, esc, oggi, perCampo, spostaGiorni } from "../utili.js";
import { bollino, erroreModulo, impostaTitolo, schede, torna } from "./comuni.js";

const TIPI = { spesa: "Spesa", entrata: "Entrata", trasferimento: "Trasferimento" };
const SCORCIATOIE_DATA = { 0: "Oggi", 1: "Ieri", 2: "2 giorni fa" };

export function mostraMovimento(main, id, parametri) {
    const esistente = id === "nuovo" ? null : leggi("select * from movimenti where id = ?", [id])[0];
    if (id !== "nuovo" && !esistente) return torna();

    const m = esistente ?? {
        tipo: TIPI[parametri.get("tipo")] ? parametri.get("tipo") : "spesa",
        data: oggi(),
        importo: null,
        conto_id: ultimoContoUsato(),
        conto_destinazione_id: null,
        categoria_id: null,
        nota: "",
    };
    impostaTitolo(esistente ? "Modifica movimento" : "Nuovo movimento", true);

    // Conti e categorie archiviati non si propongono, a meno che non siano quelli già scelti
    const conti = leggi(`
        select id, nome, icona from conti
        where archiviato = 0 or id in (?, ?)
        order by posizione
    `, [m.conto_id, m.conto_destinazione_id]);
    if (conti.length === 0) {
        main.innerHTML = `<p class="vuoto">Per inserire un movimento serve almeno un conto.<br>
            <a href="#/conto/nuovo">Crea il primo conto</a></p>`;
        return;
    }
    const categorie = leggi(`
        select id, nome, tipo, icona, colore from categorie
        where archiviata = 0 or id = ?
        order by posizione
    `, [m.categoria_id]);

    main.innerHTML = `
        <form class="modulo" data-tipo="${m.tipo}" novalidate>
            ${schede("scegli-tipo", TIPI, m.tipo)}

            <label class="campo importo-grande">Importo
                <span class="con-euro">
                    <input name="importo" inputmode="decimal" autocomplete="off" placeholder="0,00"
                           value="${m.importo === null ? "" : perCampo(m.importo)}">
                    <span>€</span>
                </span>
            </label>

            <label class="campo">
                <span class="non-trasferimento">Conto</span>
                <span class="solo-trasferimento">Dal conto</span>
                <select name="conto">${opzioniConti(conti, m.conto_id)}</select>
            </label>

            <label class="campo solo-trasferimento">Al conto
                <select name="destinazione">
                    <option value="">Scegli…</option>
                    ${opzioniConti(conti, m.conto_destinazione_id)}
                </select>
            </label>

            <div class="campo non-trasferimento">Categoria
                ${["spesa", "entrata"].map(tipo => `
                    <div class="griglia solo-${tipo}">
                        ${categorie.filter(c => c.tipo === tipo).map(c => `
                            <button type="button" class="cella ${c.id === m.categoria_id ? "scelta" : ""}" data-categoria="${esc(c.id)}">
                                ${bollino(c.icona, c.colore)}
                                <span class="nome">${esc(c.nome)}</span>
                            </button>`).join("")}
                    </div>`).join("")}
            </div>

            <div class="campo">Data
                <div class="chips">${Object.entries(SCORCIATOIE_DATA).map(([giorni, nome]) =>
                    `<button type="button" data-giorni="${giorni}">${nome}</button>`).join("")}
                </div>
                <input type="date" name="data" value="${m.data}">
            </div>

            <label class="campo">Nota
                <input name="nota" value="${esc(m.nota)}" autocomplete="off" placeholder="Facoltativa">
            </label>

            <p class="errore-modulo" hidden></p>
            <button type="submit">Salva</button>
            ${esistente ? `<button type="button" class="pericolo" id="elimina">Elimina movimento</button>` : ""}
        </form>`;

    const modulo = main.querySelector("form");
    let categoria = m.categoria_id;
    const tipoDi = Object.fromEntries(categorie.map(c => [c.id, c.tipo]));

    // Cambiare tipo mostra/nasconde i campi giusti (lo fa il CSS guardando data-tipo)
    modulo.querySelectorAll("[data-scegli-tipo]").forEach(b => b.onclick = () => {
        modulo.dataset.tipo = b.dataset.scegliTipo;
        modulo.querySelectorAll("[data-scegli-tipo]").forEach(x => x.classList.toggle("attiva", x === b));
        if (tipoDi[categoria] !== modulo.dataset.tipo) scegliCategoria(null);
    });

    function scegliCategoria(nuova) {
        categoria = nuova;
        modulo.querySelectorAll("[data-categoria]").forEach(c => c.classList.toggle("scelta", c.dataset.categoria === nuova));
    }
    modulo.querySelectorAll("[data-categoria]").forEach(c => c.onclick = () => scegliCategoria(c.dataset.categoria));

    // Le scorciatoie Oggi / Ieri / 2 giorni fa, evidenziate se corrispondono alla data scelta
    function evidenziaData() {
        modulo.querySelectorAll("[data-giorni]").forEach(b =>
            b.classList.toggle("attiva", modulo.data.value === spostaGiorni(oggi(), -b.dataset.giorni)));
    }
    modulo.querySelectorAll("[data-giorni]").forEach(b => b.onclick = () => {
        modulo.data.value = spostaGiorni(oggi(), -b.dataset.giorni);
        evidenziaData();
    });
    modulo.data.onchange = evidenziaData;
    evidenziaData();

    if (!esistente) modulo.importo.focus();

    modulo.onsubmit = async evento => {
        evento.preventDefault();
        const tipo = modulo.dataset.tipo;
        const trasferimento = tipo === "trasferimento";
        const importo = centesimi(modulo.importo.value);

        const errore =
            !importo ? "Scrivi un importo valido, per esempio 12,50." :
            !modulo.data.value ? "Scegli una data." :
            trasferimento && !modulo.destinazione.value ? "Scegli il conto che riceve i soldi." :
            trasferimento && modulo.destinazione.value === modulo.conto.value ? "I due conti devono essere diversi." :
            !trasferimento && !categoria ? "Scegli una categoria." :
            null;
        if (errore) return erroreModulo(modulo, errore);

        const ora = new Date().toISOString();
        const valori = [
            tipo, modulo.data.value, importo, modulo.conto.value,
            trasferimento ? modulo.destinazione.value : null,
            trasferimento ? null : categoria,
            modulo.nota.value.trim(), ora,
        ];
        await modifica(() => {
            if (esistente) {
                scrivi(`update movimenti set tipo = ?, data = ?, importo = ?, conto_id = ?,
                        conto_destinazione_id = ?, categoria_id = ?, nota = ?, modificato_il = ?
                        where id = ?`, [...valori, esistente.id]);
            } else {
                scrivi(`insert into movimenti (tipo, data, importo, conto_id, conto_destinazione_id,
                        categoria_id, nota, modificato_il, creato_il, id)
                        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [...valori, ora, crypto.randomUUID()]);
            }
        });
        torna();
    };

    if (esistente) {
        modulo.querySelector("#elimina").onclick = async () => {
            if (!confirm("Eliminare questo movimento?")) return;
            await modifica(() => scrivi("delete from movimenti where id = ?", [esistente.id]));
            torna();
        };
    }
}

function opzioniConti(conti, scelto) {
    return conti.map(c =>
        `<option value="${esc(c.id)}" ${c.id === scelto ? "selected" : ""}>${esc(c.icona)} ${esc(c.nome)}</option>`
    ).join("");
}

/** Per un movimento nuovo proponiamo il conto usato l'ultima volta */
function ultimoContoUsato() {
    return leggi(`
        select m.conto_id from movimenti m join conti c on c.id = m.conto_id
        where c.archiviato = 0 and m.tipo != 'trasferimento'
        order by m.creato_il desc limit 1
    `)[0]?.conto_id ?? null;
}
