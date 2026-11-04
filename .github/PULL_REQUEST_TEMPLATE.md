## Description

Explain what this pull request changes and why.

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Documentation (README, templates, demo data, etc.)
- [ ] Refactor or internal cleanup with no change in behavior

## How did you test it?

State the browser and screen widths you checked, and the cases you verified.

## Checklist

- [ ] `node --test --test-concurrency=2 tests/*.test.mjs` passes, and the change adds or updates its own tests in `tests/`
- [ ] Every new interface text is in both `I18N.es` and `I18N.en`
- [ ] Anything new in the interface can also be done through `window.BitacoraAPI`
- [ ] No new dependencies, and the stored data schema only gains optional fields
- [ ] Animations respect `prefers-reduced-motion`
- [ ] I updated `README.md` and `README_es.md` together if the change is visible to users
- [ ] I did not include generated files, temporary files or credentials
