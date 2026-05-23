# Structural Baseline — Codebase Measurement Pass

## Provenance

Deferred 2026-05-21. After ~1 year of AI-assisted development, the maintainer raised a paranoia signal about codebase size and growing complexity. Symptoms cited:

- 30 real soft-deprecation items inventoried in the parallel deferred doc ([`2026-05-21-legacy-soft-deprecation.md`](2026-05-21-legacy-soft-deprecation.md)), suggesting consistent additive growth without compensating deletion
- Wizard step type carrying 8 "legacy" variants alongside 8 current ones (incomplete refactor)
- v2.0 → v3.0 component registry migration only partially completed
- Cross-feature `Kept for backward compatibility` re-exports — feature isolation leaking
- ~7,054 tests for a single VS Code extension (test growth tracking code growth, not necessarily complexity)

The user's instinct: the codebase may have grown beyond what the maintainer can reason about end-to-end. The legacy cleanup is a symptom; this baseline measures the disease.

## Decision (2026-05-21)

User chose to ship Cycle D first, then run this baseline. Rationale: user-visible value of Cycle D is high; the baseline informs cleanup cycles after, not Cycle D itself. Risk acknowledged: Cycle D may add ~500+ lines of UI to a codebase whose surface area we have not yet measured.

This doc captures the baseline plan so it survives the gap.

## Goal

Produce a **numbers-first** structural report. Not interpretation, not recommendations — just measurements, laid out so the maintainer can see where the pain actually lives versus where it merely *feels* like it lives.

The report becomes the input to a prioritized series of trim cycles (smaller and more frequent than feature cycles), in the spirit of Cycle A of the AI Layer Pivot, which deleted more than it added.

## Measurements to capture

### File-level

For every `.ts` / `.tsx` file in `src/` (excluding tests):

- Line count
- Function count + average function length
- Maximum function length
- Cyclomatic complexity (max + average across functions)
- Number of exports (the file's public surface)
- Number of unique features/modules it imports from
- Imports that cross feature boundaries (counted, with destinations)

Flag any file that exceeds the SOPs (CLAUDE.md):

- File length > 500 lines
- Function length > 50 lines
- Cyclomatic complexity > 10 per function
- Imports per file > 15 (excluding types)

### Feature-level

For each feature under `src/features/*`:

- Total LOC (production code, excluding tests)
- Number of files
- Size of `index.ts` barrel (number of exports, lines)
- Number of files outside this feature that import from this feature's `index.ts`
- Number of files outside this feature that import via **deep paths** (bypassing the barrel)
- Test:code LOC ratio for the feature

### Repo-level

- Total production LOC vs total test LOC
- Total exported symbols per layer (`core/`, `features/`, `commands/`, `types/`)
- Cross-feature import graph (directed graph; ideally a DAG; flag cycles)
- Files with no incoming imports (orphan candidates) excluding entry points + test setups
- Files with > 20 incoming imports (high coupling)
- Per-feature `*.md` documentation file count

### Pattern hits

- Total count of `@deprecated`
- Total count of `backward compat` / `backwards compat`
- Total count of `legacy` (excluding the legitimate-use list from `2026-05-21-legacy-soft-deprecation.md`)
- Total count of `TODO` / `FIXME` / `XXX` comments
- Total count of `eslint-disable` comments

## Output format

Single markdown report at `docs/research/<date>-structural-baseline.md` with:

1. Headline numbers (top of report)
2. SOP-violations table (files over the size/complexity thresholds)
3. Per-feature size + coupling table
4. Per-layer export surface table
5. Cross-feature import graph (text representation acceptable; visualization optional)
6. Pattern-hit totals
7. Orphan/high-coupling candidates

**No recommendations in the report.** That's the next step — a separate session where the maintainer reads the numbers and decides priorities.

## Execution constraints

1. **Measurement only.** Do not refactor anything during the baseline pass. Edits during measurement contaminate the snapshot.
2. **Tools first; AI inference second.** Prefer programmatic counts (`tsc`'s AST, `ts-morph`, `find` + `wc`, `grep -c`) over agent estimation. Agents stitch the tool output into the report.
3. **Reproducible.** The agent that runs this should produce a `scripts/measure-structure.sh` (or `.ts`) so the baseline can be re-run at any future commit and diffed.

## Kickoff prompt (paste into `/rptc:feat` after Cycle D ships)

```text
/rptc:feat "Execute the structural-baseline measurement pass defined at
.rptc/backlog/2026-05-21-structural-baseline.md. Produce a numbers-first
report at docs/research/<today>-structural-baseline.md. No refactoring
during this pass. Also drop a reproducible measurement script under
scripts/ so the baseline can be re-run and diffed at any future commit.
After delivering the report, propose the top 3-5 trim cycles based on the
data — but do not execute them."
```

## Open questions

1. Whether to use `ts-morph` (richer AST queries, new dependency) or stick to `tsc --noEmit --emitDeclarationOnly` + ad-hoc scripts. Decide at kickoff based on what's already installed.
2. Cyclomatic complexity tools: `eslint-plugin-complexity` is already in the toolchain via standard ESLint config; check first.
3. Whether to include `webview-ui/` in scope (it's frontend; same drift pressures likely apply).
4. Whether to track baseline over time (commit the report + diff future runs) or just take one-shot snapshots. Recommend: commit, diff later.
