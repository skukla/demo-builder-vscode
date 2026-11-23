# Resolution of review loop-pl112

Date: 2026-11-23
Reviewer: rptc:code-review-agent
Model: opus
Scope: eslint.config.mjs, scripts/convention-proofs.mjs, scripts/overnight/watch.py, tests/sop/architectureScan.ts, tests/sop/no-builtin-namespace-mock-assignment.test.ts, tests/sop/src-erases-no-types.test.ts, tests/sop/type-erasing-casts.test.ts, tests/sop/type-erasing-casts.ledger.json, CLAUDE.md, docs/development/handbook.md, docs/development/conventions.md, scripts/generate-convention-index.mjs

3 findings.

| Finding | Severity | Claim | Verdict | Note |
|---|---|---|---|---|
| F1 | medium | Correctness: the new no-restricted-syntax selectors match only a bare `any`/`never` cast type, so `as any[]` and `as never[]` now pass although the deleted ceiling suite (regex `\bas\s+any\b`, `\bas\s+never\b`) counted and failed them, and the handbook's 'fails any `as any` or `as never` in tests/' overstates the rule. | PROPOSE FIX | Fixed: both selectors also match a keyword's array and array of arrays (`as any[]`, `as any[][]`, `<any[]>`), the forms the ceiling's regex counted; `as Record<string, any>`, which it never counted, stays allowed. Probe: lines with `{} as any`, `<never>{}`, `1 as unknown as never`, `[] as any[]`, `[] as never[]`, `[] as any[][]` flagged; `Record<string, any>`, `as unknown as string` and `const i: any` not. `npx eslint tests` still has 0 hits. The handbook now says 'as any, as never and their arrays', and the proof plant carries `[] as never[]` too. |
| F2 | low | Correctness: the global eslint ignore 'tests/fixtures/**' leaves tests/fixtures/unstable-hook-args/probe.tsx outside the ban, although the deleted suite walked every .ts/.tsx under tests/ with no fixtures exclusion. | PROPOSE FIX | Fixed by stating it: the handbook names tests/fixtures/ as outside the ban, lint-ignored, with its one TypeScript file a hook probe. |
| F3 | medium | Fit: the new wording 'when it became an eslint ban' in the needsAuth callout makes the convention-index generator list eslint.config.mjs as the enforcer of the needsAuth convention, which eslint does not enforce. | PROPOSE FIX | Fixed: the needsAuth callout says 'the one the type-erasing-cast ceiling finished on 2026-11-23 (PL-112)' with no 'eslint'; after regenerating, conventions.md's only change against HEAD is the type-erasing row. |
