# Finanza – prova 1

Web app per gestire spese, entrate e trasferimenti, ispirata a Money Manager.
Funziona tutta nel browser: niente server, niente account. I dati restano sul dispositivo.

## Avviarla sul PC

Da questa cartella:

```
py servi.py
```

poi apri http://localhost:8000/app/ nel browser.

## Cosa fa

| Pagina | Cosa contiene |
|---|---|
| **Home** | Spese o entrate del periodo (giorno, settimana, mese, anno) divise per categoria, con la ciambella. Si può filtrare per conto. Toccando una categoria si vedono i suoi movimenti; toccando un movimento lo si modifica. Il tasto **+** aggiunge un movimento. |
| **Conti** | Saldi, nuovo trasferimento, ultimi trasferimenti, creazione e modifica dei conti. |
| **Categorie** | Spese ed entrate, creazione e modifica (nome, emoji, colore, archiviazione). |
| **Dati** | Backup in `.zip`, ripristino, importazione da Money Manager. |

## Com'è fatta

| File | Cosa fa |
|---|---|
| `app/index.html` | La pagina: intestazione, contenuto, barra in basso |
| `app/stile.css` | L'aspetto grafico |
| `app/js/app.js` | Avvio e "router": sceglie la pagina in base all'indirizzo (`#/conti`, ...) |
| `app/js/database.js` | Lo schema delle tabelle e le funzioni per leggere e scrivere |
| `app/js/utili.js` | Formattazione di importi e date |
| `app/js/backup.js` | Backup e ripristino: uno ZIP che contiene `finanza.db` |
| `app/js/importa-mm.js` | L'importazione dei backup di Money Manager |
| `app/js/viste/` | Un file per pagina: `home.js`, `movimento.js`, `conti.js`, `categorie.js`, `dati.js`, più `comuni.js` con i pezzi condivisi |
| `app/lib/` | Librerie esterne: sql.js (SQLite nel browser) e JSZip |
| `app/manifest.webmanifest`, `app/icona-*.png` | Nome e icona dell'app quando la aggiungi alla schermata Home |
| `app/sw.js` | Service worker: fa aprire l'app anche senza internet. Se aggiungi o rinomini un file, aggiorna il suo elenco |
| `servi.py` | Server di prova per il PC |

### Il database

Tre tabelle, che si possono guardare con DB Browser for SQLite aprendo il `finanza.db` di un backup:

- `conti`: nome, icona, colore, escluso dal totale, archiviato
- `categorie`: nome, tipo (spesa/entrata), icona, colore, archiviata
- `movimenti`: tipo (spesa/entrata/trasferimento), data, importo **in centesimi**, conto,
  conto di destinazione (solo trasferimenti), categoria (non per i trasferimenti), nota

Il saldo dei conti non è salvato: lo calcola la view `saldi` a partire dai movimenti.
