# How to contribute

Thank you for your interest. This guide covers the basics so your contribution can be reviewed and accepted quickly.

## Before writing code

- For large changes, or changes to current behavior, open an issue first (use the feature request template) to agree on the approach before investing time.
- For specific bugs or small improvements, you can go straight to a pull request.

## How the project works

The whole application is one file, `script/bitacora-dev.html`. The rules that keep it that way:

1. **One change, one commit, its tests.** A change is not finished until its tests pass.
2. **No new dependencies** in the app. Data stays in `localStorage`; the stored schema only gains optional fields.
3. **Every interface text goes in both `I18N.es` and `I18N.en`.**
4. **Animations are subtle** and always respect `prefers-reduced-motion`.
5. **Anything the interface can do, an agent can do** through `window.BitacoraAPI`.

## Running the tests

The suite uses Playwright with Chromium and `node:test`. It needs Node 22 or later (the version CI uses).

```text
npm i --prefix .. --no-save playwright@1.56.0
npx --prefix .. playwright install chromium
node --test --test-concurrency=2 tests/*.test.mjs
```

Use the `tests/*.test.mjs` pattern: from Node 21 on, `node --test tests/` does not accept a folder. Playwright goes in the folder above the repository (Node finds it from there), so the repository needs no `package.json` or `.gitignore`.

Tests live in `tests/`, one `fNN-*.test.mjs` file per area, and each test name starts with its ID (for example `T44.3`). `tests/helpers.mjs` opens the app with clean storage and offers a simulated AI provider. The same suite runs in CI (`.github/workflows/tests.yml`) on every push and pull request that touches `script/`, `tests/` or the workflow itself.

## Demo data and documentation

- `assets/demo/*.json` are the sources of truth for the demo databases. The Spanish and English files must keep the same structure, ids and dates; only the texts differ.
- `README.md` and `README_es.md` stay symmetrical. What's new goes at the top of each README, and the project has no changelog file.

## Sending the pull request

1. Fork the repository and create a branch for your change.
2. Make the change together with its tests.
3. Run the whole suite and make sure it passes.
4. Open the pull request and fill in the template.

By contributing you agree that your work is released under the project's license, GPLv3 (`LICENSE.txt`).

## Reporting bugs or proposing ideas

Use the issue templates; they open automatically when you create a new issue. The more context (app version, browser, exact steps), the faster a problem can be diagnosed.

For security problems, see [`SECURITY.md`](SECURITY.md).
