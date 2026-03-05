# Contributing

## Setup

```bash
npm install
npm run check
npm run build
npm test
```

## Development rules

- Keep changes focused and minimal.
- Preserve existing command behavior unless intentionally versioned.
- Add or update README examples for user-facing command changes.
- Prefer direct AniList GraphQL queries in `src/anilist.ts`; keep CLI orchestration in `src/cli.ts`.
- Keep machine-friendly output stable for `--json` mode.

## Pull request checklist

- [ ] Typecheck passes (`npm run check`)
- [ ] Build passes (`npm run build`)
- [ ] Tests pass (`npm test`)
- [ ] New/changed commands documented in README
- [ ] No secrets or tokens committed
