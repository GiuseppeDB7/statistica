/*
 * Genera corpus.js a partire da due libri di pubblico dominio (Project Gutenberg).
 * Non serve a far girare la pagina: documenta come sono state ricavate le statistiche.
 *
 *   node build-corpus.js <cartella con it.txt e en.txt> <file di uscita corpus.js>
 *
 * Dal testo si tiene solo:
 *   - i conteggi di lettere, bigrammi e trigrammi (per attaccare Cesare);
 *   - le 600 parole più frequenti (per l'attacco a dizionario);
 *   - un tratto di 60 000 caratteri ESCLUSO dall'allenamento (per provare gli attacchi su testo mai visto).
 * I libri non sono inclusi nel sito.
 */
const fs = require("fs");
const [dir, out] = process.argv.slice(2);
const BOOKS = {
  it: { name: "Italiano", file: "it.txt", source: "Alessandro Manzoni, I promessi sposi (Project Gutenberg, eBook #45334)" },
  en: { name: "Inglese", file: "en.txt", source: "Jane Austen, Pride and Prejudice (Project Gutenberg, eBook #1342)" },
};

// Solo lettere a-z minuscole e spazi: via accenti, punteggiatura, cifre
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, " ").trim();

function body(raw) {
  const a = raw.search(/\*\*\* START OF (THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\n/);
  const b = raw.search(/\*\*\* END OF (THE|THIS) PROJECT GUTENBERG EBOOK/);
  const start = a >= 0 ? raw.indexOf("\n", a) + 1 : 0;
  return raw.slice(start, b >= 0 ? b : raw.length);
}

const result = {};
for (const [lang, info] of Object.entries(BOOKS)) {
  const text = norm(body(fs.readFileSync(`${dir}/${info.file}`, "utf8")));
  // Prova: blocco tra l'80% e il 90% del libro; allenamento: tutto il resto
  const a = Math.floor(text.length * 0.8), b = Math.floor(text.length * 0.9);
  const test = text.slice(a, a + 60000).replace(/^\S*\s/, ""); // inizia a un confine di parola
  const train = text.slice(0, a) + " " + text.slice(b);

  const uni = new Array(26).fill(0), bi = new Array(676).fill(0), tri = new Array(17576).fill(0);
  const letters = train.replace(/ /g, "");
  let prev1 = -1, prev2 = -1;
  for (let i = 0; i < letters.length; i++) {
    const c = letters.charCodeAt(i) - 97;
    uni[c]++;
    if (prev1 >= 0) bi[prev1 * 26 + c]++;
    if (prev2 >= 0) tri[(prev2 * 26 + prev1) * 26 + c]++;
    prev2 = prev1; prev1 = c;
  }
  const freq = new Map();
  for (const w of train.split(" ")) if (w) freq.set(w, (freq.get(w) || 0) + 1);
  const words = [...freq.entries()].sort((x, y) => y[1] - x[1]).slice(0, 600).map((e) => e[0]);

  result[lang] = { name: info.name, source: info.source, trainLetters: letters.length, uni, bi, tri, words: words.join(" "), test };
  console.log(lang, "lettere di allenamento:", letters.length, "| prova:", test.length, "caratteri | parole tenute:", words.length);
}

const header = "/*\n * Statistiche di due lingue ricavate da libri di pubblico dominio (Project Gutenberg).\n" +
  Object.values(BOOKS).map((b) => " *   - " + b.source).join("\n") +
  "\n * Contiene conteggi di lettere, bigrammi e trigrammi, le parole più frequenti e un tratto di testo non usato per l'allenamento.\n * Generato da build-corpus.js: non modificare a mano.\n */\n";
fs.writeFileSync(out, header + "const CORPUS = " + JSON.stringify(result) + ";\n\nif (typeof module !== \"undefined\") module.exports = CORPUS;\n");
console.log("scritto", out, (fs.statSync(out).size / 1024).toFixed(0), "KB");
