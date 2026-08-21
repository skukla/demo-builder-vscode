# parseJSON's 33 call sites are each an unchecked cast

**Filed:** 2026-08-21
**Origin:** The call-site-signal discussion after the seam work: raw fan-in is
healthy, but fan-in × weak contract is the multiplier — and `parseJSON<T>`
(`src/types/typeGuards.ts`) is the repo's largest instance.

## The claim

`parseJSON<T>(text)` parses and CASTS: the generic is a promise nobody
verifies, so every call site is the manifest-validation seam in miniature.
Measured 2026-08-21: **33 call sites** (`grep -rn "parseJSON<" src`), among
them registry loads, workspace JSON from `aio`, mesh responses, MCP config
reads. Three are now check-backed (the project manifest via
`manifestValidation.ts`; wizard-steps via `isWizardStepDefinition`; bundled
configs indirectly via the contract suites since their data is
build-shipped). The other ~30 trust whatever the file or process emitted.

## Why filed rather than done

Per-site triage, not a mechanical pass — the payload-typing lesson. For each
site the question is: what WRITES this JSON, and can it drift?

- **Build-shipped data** (config already covered by contract suites): the
  cast is check-backed; annotate, don't change.
- **Our own writes read back** (state files, caches): schema-generation is
  cheap now (`ts-json-schema-generator` + the manifest precedent) — but only
  worth it where a drifted read has a silent failure mode.
- **External-process output** (`aio ... --json`, service responses): the
  HIGH-VALUE class — the writer is not in this repo, so drift is guaranteed
  eventually. These deserve real validation or at least field-presence
  guards with loud logs.

## Method (one slice, or a few sites at a time)

1. `grep -rn "parseJSON<" src --include='*.ts'` — bucket each site by writer
   (shipped / our-write / external).
2. External bucket first. For each: does any code path dispatch on a field
   that could be absent? If yes, guard-or-validate + a test with a
   real-capture fixture (never an invented shape — the fixture rule).
3. Record verdicts per site in this file as they land, so the audit converges
   instead of re-deriving.

## Constraint

Do NOT "fix" this by making `parseJSON` throw on schema mismatch globally —
33 sites have 33 failure-tolerance policies (some best-effort by design).
The contract weakness is per-site; the verdicts must be too.
