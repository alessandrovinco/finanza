// La pagina delle categorie (#/categorie) e il modulo per crearne o modificarne una (#/categoria/<id>).

import { leggi, modifica, scrivi } from "../database.js";
import { esc } from "../utili.js";
import { alSalvataggio, bollino, campiIconaColore, chiediConferma, collegaIconaColore, erroreModulo, impostaTitolo, schede, torna, unaAllaVolta } from "./comuni.js";

const TIPI = { spesa: "Spese", entrata: "Entrate" };

const stato = { tipo: "spesa" };

export function mostraCategorie(main) {
    impostaTitolo("Categorie");

    const categorie = leggi(`
        select id, nome, icona, colore, archiviata from categorie
        where tipo = ?
        order by archiviata, posizione
    `, [stato.tipo]);

    main.innerHTML = `
        <div class="scheda">
            ${schede("tipo", TIPI, stato.tipo)}
            <div class="griglia">
                ${categorie.map(c => `
                    <a class="cella ${c.archiviata ? "attenuata" : ""}" href="#/categoria/${esc(c.id)}">
                        ${bollino(c.icona, c.colore)}
                        <span class="nome">${esc(c.nome)}</span>
                    </a>`).join("")}
                <a class="cella" href="#/categoria/nuova?tipo=${stato.tipo}">
                    ${bollino("＋", "#f4b81f")}
                    <span class="nome">Nuova</span>
                </a>
            </div>
        </div>
        <p class="nota-piccola">Le categorie sbiadite sono archiviate: non compaiono quando inserisci un movimento.</p>`;

    main.querySelectorAll("[data-tipo]").forEach(b => b.onclick = () => {
        stato.tipo = b.dataset.tipo;
        mostraCategorie(main);
    });
}

export function mostraCategoria(main, id, parametri) {
    const nuova = id === "nuova";
    const categoria = nuova
        ? { nome: "", tipo: parametri.get("tipo") === "entrata" ? "entrata" : "spesa", icona: "🛒", colore: "#43a047", archiviata: 0 }
        : leggi("select * from categorie where id = ?", [id])[0];
    if (!categoria) return torna();
    impostaTitolo(nuova ? "Nuova categoria" : categoria.nome, true);

    const movimenti = nuova ? 0 : leggi("select count(*) as n from movimenti where categoria_id = ?", [id])[0].n;

    main.innerHTML = `
        <form class="modulo" novalidate>
            ${nuova ? schede("tipo", TIPI, categoria.tipo) : `<p class="nota-piccola">Categoria di ${categoria.tipo === "spesa" ? "spesa" : "entrata"}</p>`}

            <label class="campo">Nome
                <input name="nome" value="${esc(categoria.nome)}" autocomplete="off" required>
            </label>
            ${campiIconaColore(categoria.icona, categoria.colore)}

            ${nuova ? "" : `
                <label class="interruttore">
                    <input type="checkbox" name="archiviata" ${categoria.archiviata ? "checked" : ""}>
                    Archiviata (nascosta quando inserisci un movimento)
                </label>`}

            <p class="errore-modulo" hidden></p>
            <button type="submit">Salva</button>
            ${nuova ? "" : movimenti
                ? `<p class="nota-piccola">Questa categoria è usata da ${movimenti} movimenti, quindi non si può
                   eliminare: se non la usi più, archiviala.</p>`
                : `<button type="button" class="pericolo" id="elimina">Elimina categoria</button>`}
        </form>`;

    const modulo = main.querySelector("form");
    collegaIconaColore(modulo);
    let tipo = categoria.tipo;
    modulo.querySelectorAll("[data-tipo]").forEach(b => b.onclick = () => {
        tipo = b.dataset.tipo;
        modulo.querySelectorAll("[data-tipo]").forEach(x => x.classList.toggle("attiva", x === b));
    });
    if (nuova) modulo.nome.focus();

    alSalvataggio(modulo, async () => {
        const nome = modulo.nome.value.trim();
        if (!nome) return erroreModulo(modulo, "Dai un nome alla categoria.");
        if (!modulo.icona.value.trim()) return erroreModulo(modulo, "Scegli un'icona.");

        const valori = [nome, modulo.icona.value.trim(), modulo.colore.value];
        await modifica(() => {
            if (nuova) {
                scrivi(`insert into categorie (nome, icona, colore, tipo, id, posizione)
                        values (?, ?, ?, ?, ?, (select coalesce(max(posizione), 0) + 1 from categorie))`,
                    [...valori, tipo, crypto.randomUUID()]);
            } else {
                scrivi("update categorie set nome = ?, icona = ?, colore = ?, archiviata = ? where id = ?",
                    [...valori, modulo.archiviata.checked ? 1 : 0, id]);
            }
        });
        torna();
    });

    modulo.querySelector("#elimina")?.addEventListener("click", unaAllaVolta(async () => {
        if (!await chiediConferma(`Eliminare la categoria "${categoria.nome}"?`)) return;
        await modifica(() => {
            // Controllo rifatto al momento di eliminare (vedi lo stesso controllo in conti.js)
            if (leggi("select 1 from movimenti where categoria_id = ? limit 1", [id]).length) {
                throw new Error("Questa categoria è usata da dei movimenti, quindi non si può eliminare.");
            }
            scrivi("delete from categorie where id = ?", [id]);
        });
        torna();
    }));
}
