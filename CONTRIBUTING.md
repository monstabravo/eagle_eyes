# Contributing to Eagle Eyes

Thanks for your interest in improving Eagle Eyes. This project deliberately stays small and auditable, so contributions are held to a simple bar.

## Ground rules

- **Stay dependency-free at runtime.** The extension ships as plain JavaScript with no bundler and no `npm install` for end users. Tooling-only dev dependencies (ESLint, the test runner) are fine.
- **Keep it readable in an afternoon.** If a feature can be a small, isolated module, prefer that over weaving it through the data flow.
- **Manifest V3, no remote code.** What gets loaded must be what runs.

## Before opening a PR

1. Run the checks locally:
   ```bash
   npm install        # dev deps only (ESLint, etc.)
   npm test           # manifest check + JS syntax check + unit tests + lint
   ```
2. Make sure `npm test` passes and there are no new lint warnings.
3. If you change capture or code-generation behaviour, add or update a unit test under `test/`.
4. Keep commit messages in English and scoped (e.g. `fix:`, `feat:`, `docs:`).

## Reporting issues

When filing a bug, include the target site type (SPA / static), what you expected in the exported report, and what you got. Never paste real captured data (it contains raw tokens and cookies) into a public issue — strip secrets first.

## Security

Eagle Eyes captures unmasked credentials by design. If you find a way it leaks data off the local machine (any outbound network call beyond the user's own downloads), please open an issue marked **security** rather than a public PR.
