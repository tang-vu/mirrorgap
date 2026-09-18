# Code standards

- TypeScript strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), ESM, `.js` import specifiers
- zod at every boundary: CMC responses, config, receipts, API inputs — never trust the wire
- `packages/core` is pure: no IO, no clock reads, no `process.env` — inputs in, results out
- Files > ~200 lines: consider splitting by concern (kebab-case descriptive names)
- Compact idiomatic code; comments only where semantics are non-obvious
- Tests: vitest, colocated `test/*.test.ts`; engine invariants + end-to-end scan pipeline covered
- Never commit secrets; `.env` git-ignored; diagnostics redact keys
- No fake data outside `FixtureDataSource`; fixture mode labeled in every provenance record + UI badge
- pnpm workspaces; dependency builds allowlisted in `pnpm-workspace.yaml` (`allowBuilds`)
