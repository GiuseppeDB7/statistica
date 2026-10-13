# Statistica · Homework

Questa repository è la raccolta degli homework per il corso di **Statistica**, anno accademico **2026/2027**.

- **Studente:** Giuseppe Di Biase · Matricola 2334106
- **Corso di laurea:** LM-66 Cybersecurity
- **Sito:** https://giuseppedb7.github.io/statistica/

Il sito è statico e pubblicato con GitHub Pages: solo HTML, CSS e un po' di JavaScript, senza passaggi di build.

## Struttura

```
index.html                  home page (intestazione con pioggia Matrix + elenco homework)
assets/style.css            colori, font e impaginazione (tema verde su nero)
assets/site.js              elenco homework (array HOMEWORK), pioggia Matrix, effetti di testo
assets/grafico-esempio.svg  grafico segnaposto usato nel modello di pagina homework
homework/hw1/               una cartella per ogni homework; index.html è la pagina
```

## Aggiungere un homework

1. Copia `homework/hw1` in `homework/hw2`.
2. Modifica `homework/hw2/index.html`: titolo, data, testo, e imposta `data-id="hw2"` sull'elemento `#pager`.
3. Metti nella stessa cartella PDF, immagini e codice di quell'homework.
4. In `assets/site.js` aggiungi (o aggiorna) la voce in `HOMEWORK` con `status: "pubblicato"`.

## Formule e codice

- Formule LaTeX con KaTeX: `$...$` in linea, `$$...$$` a blocco.
- Codice: `<pre><code class="language-r">...</code></pre>` (oppure `language-python`).

## Anteprima in locale

```
npx http-server . -p 8080
```

Poi apri http://localhost:8080 nel browser.

## Pubblicazione

Il workflow `.github/workflows/deploy.yml` pubblica il sito su GitHub Pages a ogni push su `main`.
Si può avviare anche a mano dalla scheda Actions (**Deploy site** → **Run workflow**).
Nelle impostazioni del repository, Settings → Pages → Source deve essere **GitHub Actions**.
