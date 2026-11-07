// Il modulo per inserire o modificare una spesa, un'entrata o un trasferimento.
// Indirizzi: #/movimento/nuovo?tipo=spesa   oppure   #/movimento/<id> per modificarne uno.

import { impostazione, leggi, modifica, scrivi } from "../database.js";
import { centesimi, esc, oggi, perCampo, spostaGiorni } from "../utili.js";
import { alSalvataggio, bollino, campiIconaColore, chiediConferma, collegaIconaColore, erroreModulo, impostaTitolo, schede, torna, unaAllaVolta } from "./comuni.js";

const TIPI = { spesa: "Spesa", entrata: "Entrata", trasferimento: "Trasferimento" };
const SCORCIATOIE_DATA = { 0: "Oggi", 1: "Ieri", 2: "2 giorni fa" };

export function mostraMovimento(main, id, parametri) {
    const esistente = id === "nuovo" ? null : leggi("select * from movimenti where id = ?", [id])[0];
    if (id !== "nuovo" && !esistente) return torna();

    const m = esistente ?? {
        // hasOwn: solo le chiavi scritte in TIPI (TIPI["constructor"] esiste in ogni oggetto)
        tipo: Object.hasOwn(TIPI, parametri.get("tipo")) ? parametri.get("tipo") : "spesa",
        data: oggi(),
        importo: null,
        conto_id: contoProposto(),
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
        <form class="modulo" data-tipo="${esc(m.tipo)}" novalidate>
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
                <select name="conto">
                    ${m.conto_id === null ? `<option value="">Scegli…</option>` : ""}
                    ${opzioniConti(conti, m.conto_id)}
                </select>
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
                        ${categorie.filter(c => c.tipo === tipo).map(c => cellaCategoria(c, m.categoria_id)).join("")}
                        <button type="button" class="cella" data-nuova-categoria>
                            ${bollino("＋", "#f4b81f")}
                            <span class="nome">Nuova</span>
                        </button>
                    </div>`).join("")}
            </div>

            <div class="campo">Data
                <div class="chips">${Object.entries(SCORCIATOIE_DATA).map(([giorni, nome]) =>
                    `<button type="button" data-giorni="${giorni}">${nome}</button>`).join("")}
                </div>
                <!-- max: il calendario non lascia scegliere i giorni dopo oggi -->
                <input type="date" name="data" value="${esc(m.data)}" max="${oggi()}">
            </div>

            <label class="campo">Nota
                <input name="nota" value="${esc(m.nota)}" autocomplete="off" placeholder="Facoltativa">
            </label>

            <p class="errore-modulo" hidden></p>
            <button type="submit">Salva</button>
            ${esistente ? `<button type="button" class="pericolo" id="elimina">Elimina movimento</button>` : ""}
        </form>

        <!-- Finestra per creare una categoria senza lasciare il movimento.
             Sta fuori dal modulo principale: un form non può contenerne un altro. -->
        <dialog>
            <form class="modulo" novalidate>
                <h2 class="titolo-finestra"></h2>
                <label class="campo">Nome
                    <input name="nome" autocomplete="off">
                </label>
                ${campiIconaColore("🛒", "#43a047")}
                <p class="errore-modulo" hidden></p>
                <div class="azioni">
                    <button type="button" class="bottone secondario" id="annulla">Annulla</button>
                    <button type="submit">Crea</button>
                </div>
            </form>
        </dialog>`;

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

    // "+ Nuova": apre la finestra, crea la categoria e la sceglie subito.
    // Il modulo del movimento non viene ridisegnato, quindi quanto già scritto resta lì.
    const finestra = main.querySelector("dialog");
    const moduloCategoria = finestra.querySelector("form");
    collegaIconaColore(moduloCategoria);
    modulo.querySelectorAll("[data-nuova-categoria]").forEach(b => b.onclick = () => {
        moduloCategoria.reset();
        moduloCategoria.querySelector(".errore-modulo").hidden = true;
        finestra.querySelector(".titolo-finestra").textContent =
            modulo.dataset.tipo === "spesa" ? "Nuova categoria di spesa" : "Nuova categoria di entrata";
        finestra.showModal();
        moduloCategoria.nome.focus();
    });
    finestra.querySelector("#annulla").onclick = () => finestra.close();

    alSalvataggio(moduloCategoria, async () => {
        const nuova = {
            id: crypto.randomUUID(),
            tipo: modulo.dataset.tipo,
            nome: moduloCategoria.nome.value.trim(),
            icona: moduloCategoria.icona.value.trim(),
            colore: moduloCategoria.colore.value,
        };
        if (!nuova.nome) return erroreModulo(moduloCategoria, "Dai un nome alla categoria.");
        if (!nuova.icona) return erroreModulo(moduloCategoria, "Scegli un'icona.");

        await modifica(() => scrivi(`
            insert into categorie (id, tipo, nome, icona, colore, posizione)
            values (?, ?, ?, ?, ?, (select coalesce(max(posizione), 0) + 1 from categorie))
        `, [nuova.id, nuova.tipo, nuova.nome, nuova.icona, nuova.colore]));

        // La nuova cella va prima di "+ Nuova", nella griglia del tipo giusto
        const piu = modulo.querySelector(`.solo-${nuova.tipo} [data-nuova-categoria]`);
        piu.insertAdjacentHTML("beforebegin", cellaCategoria(nuova, null));
        piu.previousElementSibling.onclick = () => scegliCategoria(nuova.id);
        tipoDi[nuova.id] = nuova.tipo;
        scegliCategoria(nuova.id);
        finestra.close();
    });

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

    alSalvataggio(modulo, async () => {
        const tipo = modulo.dataset.tipo;
        const trasferimento = tipo === "trasferimento";
        const importo = centesimi(modulo.importo.value);

        const errore =
            !importo ? "Scrivi un importo valido, per esempio 12,50." :
            !modulo.conto.value ? "Scegli il conto." :
            !modulo.data.value ? "Scegli una data." :
            // Le date "AAAA-MM-GG" si confrontano come testi: "2026-11-04" > "2026-11-03"
            modulo.data.value > oggi() ? "La data non può essere nel futuro." :
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
    });

    if (esistente) {
        modulo.querySelector("#elimina").onclick = unaAllaVolta(async () => {
            if (!await chiediConferma("Eliminare questo movimento?")) return;
            await modifica(() => scrivi("delete from movimenti where id = ?", [esistente.id]));
            torna();
        });
    }
}

function cellaCategoria(c, scelta) {
    return `
        <button type="button" class="cella ${c.id === scelta ? "scelta" : ""}" data-categoria="${esc(c.id)}">
            ${bollino(c.icona, c.colore)}
            <span class="nome">${esc(c.nome)}</span>
        </button>`;
}

function opzioniConti(conti, scelto) {
    return conti.map(c =>
        `<option value="${esc(c.id)}" ${c.id === scelto ? "selected" : ""}>${esc(c.icona)} ${esc(c.nome)}</option>`
    ).join("");
}

/**
 * Il conto già scelto in un movimento nuovo, secondo l'impostazione scelta in Impostazioni:
 * "nessuno" (predefinito: il conto si sceglie ogni volta), "ultimo", oppure l'id del conto principale.
 */
function contoProposto() {
    const scelta = impostazione("conto_proposto", "nessuno");
    if (scelta === "nessuno") return null;
    if (scelta === "ultimo") return ultimoContoUsato();
    // Se il conto principale è stato archiviato o eliminato, non si propone niente
    return leggi("select id from conti where id = ? and archiviato = 0", [scelta])[0]?.id ?? null;
}

function ultimoContoUsato() {
    return leggi(`
        select m.conto_id from movimenti m join conti c on c.id = m.conto_id
        where c.archiviato = 0 and m.tipo != 'trasferimento'
        order by m.creato_il desc limit 1
    `)[0]?.conto_id ?? null;
}
