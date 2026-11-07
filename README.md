# Finanza – versione 2 (V2)

© 2026 AV – Tutti i diritti riservati (vedi `LICENSE`).

Web app per gestire spese, entrate e trasferimenti, ispirata a Money Manager.
Funziona tutta nel browser: niente server, niente account. I dati restano sul dispositivo.

## Avviarla sul PC

Da questa cartella:

```
py servi.py
```

poi apri http://localhost:8002/app/ nel browser.

## Cosa fa

| Pagina | Cosa contiene |
|---|---|
| **Home** | Spese o entrate del periodo (giorno, settimana, mese, anno) divise per categoria, con la ciambella. Si può filtrare per conto. Toccando una categoria si vedono i suoi movimenti; toccando un movimento lo si modifica. Il tasto **+** aggiunge un movimento. Al primo avvio: configurazione iniziale (importa dati oppure inizia da zero). |
| **Conti** | Saldi, nuovo trasferimento, ultimi trasferimenti, creazione e modifica dei conti. ⭐ indica il conto principale. |
| **Categorie** | Spese ed entrate, creazione e modifica (nome, emoji, colore, archiviazione). |
| **Impostazioni** | Conto proposto nei movimenti nuovi, modalità privacy all'apertura, backup in `.zip` e un unico tasto Importa (backup dell'app o di Money Manager, con riepilogo prima di importare). |

L'occhio in alto a destra nasconde saldi e importi (modalità privacy).

## Com'è fatta

| File | Cosa fa |
|---|---|
| `app/index.html` | La pagina: intestazione, contenuto, barra in basso |
| `app/stile.css` | L'aspetto grafico |
| `app/js/app.js` | Avvio e "router": sceglie la pagina in base all'indirizzo (`#/conti`, ...) |
| `app/js/database.js` | Lo schema delle tabelle e le funzioni per leggere e scrivere |
| `app/js/utili.js` | Formattazione di importi e date |
| `app/js/backup.js` | Creazione del backup: uno ZIP che contiene `finanza.db` |
| `app/js/importa.js` | Importazione unica: riconosce il tipo di file e prepara il riepilogo |
| `app/js/importa-mm.js` | L'importazione dei backup di Money Manager |
| `app/js/viste/` | Un file per pagina: `home.js`, `movimento.js`, `conti.js`, `categorie.js`, `impostazioni.js`, più `comuni.js` con i pezzi condivisi e `importazione.js` (tasto Importa e finestra di riepilogo) |
| `app/lib/` | Librerie esterne: sql.js (SQLite nel browser) e JSZip |
| `app/manifest.webmanifest`, `app/icona-*.png` | Nome e icona dell'app quando la aggiungi alla schermata Home |
| `app/sw.js` | Service worker: fa aprire l'app anche senza internet. Se aggiungi o rinomini un file, aggiorna il suo elenco |
| `servi.py` | Server di prova per il PC |
| `strumenti/crea_demo.py` | Crea `demo/finanza-demo.zip`: un backup con 6 mesi di dati inventati, per mostrare l'app senza i propri dati (`py strumenti/crea_demo.py`) |

### Il database

Quattro tabelle, che si possono guardare con DB Browser for SQLite aprendo il `finanza.db` di un backup
(la versione delle tabelle è la 2; i database e i backup della versione 1 vengono aggiornati da soli):

- `conti`: nome, icona, colore, escluso dal totale, archiviato
- `categorie`: nome, tipo (spesa/entrata), icona, colore, archiviata
- `movimenti`: tipo (spesa/entrata/trasferimento), data, importo **in centesimi**, conto,
  conto di destinazione (solo trasferimenti), categoria (non per i trasferimenti), nota
- `impostazioni`: coppie chiave/valore (es. `conto_proposto`, `privacy_apertura`)

Il saldo dei conti non è salvato: lo calcola la view `saldi` a partire dai movimenti.
