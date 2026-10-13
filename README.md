# Statistica · Homework

Static site for the Statistics course homework, published with GitHub Pages.
No build step: plain HTML, CSS and a little JavaScript.

## Structure

```
index.html            home page (Matrix rain header + homework list)
assets/style.css      colors, fonts, layout (green-on-black theme)
assets/site.js        homework list (HOMEWORK array), Matrix rain, text effects
assets/grafico-esempio.svg  placeholder chart used in the homework template
homework/hw1/         one folder per homework; index.html is the page
```

## Add a new homework

1. Copy `homework/hw1` to `homework/hw2`.
2. Edit `homework/hw2/index.html`: title, date, text, and set `data-id="hw2"` on the `#pager` element.
3. Put PDFs, images and code for that homework in the same folder.
4. In `assets/site.js`, add (or update) the entry in `HOMEWORK` with `status: "pubblicato"`.

## Formulas and code

- LaTeX via KaTeX: `$...$` inline, `$$...$$` display.
- Code: `<pre><code class="language-r">...</code></pre>` (or `language-python`).

## Preview locally

```
npx http-server . -p 8080
```

## Publish on GitHub Pages

1. Create a public repository named `statistica` on GitHub and push this folder to `main`.
2. Repository Settings > Pages > Source: "GitHub Actions". The workflow in `.github/workflows/deploy.yml` publishes the site on every push to `main` (it can also be started by hand from the Actions tab).
3. The site goes live at `https://giuseppedb7.github.io/statistica/`.
