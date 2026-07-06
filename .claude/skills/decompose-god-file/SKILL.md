---
name: decompose-god-file
description: Split an oversized multi-responsibility file (service, component, handler, hook, util) into single-responsibility units without breaking its public API or tests. Use when a file trips the eslint max-lines warning or the per-type thresholds, or when a scan flags a god file. This is the FIX; the *-scan skills are the FIND.
---
# Decompose a God File

Full pattern catalog, worked examples, and anti-patterns: `.rptc/sop/god-file-decomposition.md`.
This skill is the tight workflow — read the SOP for the how of each pattern.

## When NOT to use
- The file is big because the SAME markup/logic is copy-pasted across it or across siblings —
  that's duplication: use `component-extraction-scan` (UI) or `code-duplication-scan` (logic).
- One overlong *function* or deep nesting inside an otherwise-fine file → `complexity-reduction`
  SOP, not a file split.
- Two files already do the same job (competing implementations) → `architecture-duplication-scan`
  (delete one), not decompose.

## Is it actually a god file?
Line count alone is not enough — it must ALSO show coupling. Thresholds (action-required):
service `.ts` >400 · component `.tsx` >350 · handler `.ts` >500 · util `.ts` >300 · hook `.ts` >200.
The eslint `max-lines` warn fires at 500 *code* lines (blanks/comments skipped). Coupling signals:
multiple entity domains (`getOrgs`/`getProjects`/`getWorkspaces`), mixed abstraction levels
(fetch + validate + cache + format), >15 non-type imports, >10 public methods, >7 constructor deps,
or the same fallback pattern 3+ times. Threshold WITHOUT coupling → leave it.

```bash
find src -name "*.ts" -not -name "*.test.ts" -exec wc -l {} + | awk '$1 > 400'
find src -name "*.tsx" -not -name "*.test.tsx" -exec wc -l {} + | awk '$1 > 350'
```

## Procedure
1. **Group by responsibility.** List public methods/exports; cluster by noun (entity domain) or
   verb (operation type). A cluster that changes for a different feature is a separate unit.
2. **Pick the pattern** (SOP §2 for structure + code):

   | Pattern | Use when | Result |
   |---|---|---|
   | Facade + Services | service spans multiple entity domains | facade + 2–4 specialized services |
   | Hook Extraction | component has 100+ lines of state/logic | thin component + 2–3 hooks |
   | Helper Extraction | handler carries shared helpers/type guards | handlers + helpers/typeGuards files |
   | Repository + Service | data access mixed with business logic | repository + service layers |

   Live reference for Facade + Services: `src/features/authentication/services/adobeEntityService.ts`
   delegating to `adobeEntityFetcher` / `adobeContextResolver` / `adobeEntitySelector` /
   `adobeEntityMapper`. For hook extraction, the wizard hooks (`useProjectBuilder` et al.).
3. **Extract leaf-first, TDD each unit.** Extract the dependency with no internal deps first, write
   its unit tests, confirm green in isolation BEFORE touching the original:
   `npm run test:file -- tests/<path-to-extracted>.test.ts`. Then extract its dependents, then the
   facade last.
4. **Integrate via facade, keep the public API.** The original file imports the extracted units and
   delegates through thin methods — consumers and their tests don't change. Run the feature's full
   suite after each extraction.
5. **Keep tests in sync** (project rule): moving a method moves its tests to the new unit's test
   file; the facade keeps a delegation/integration test. Don't leave orphaned tests behind.

## Gotchas (anti-patterns — SOP §4)
- **Premature extraction**: don't extract a helper with a single use case. Rule of Three — inline
  until 2+ real callers.
- **Facade accumulation**: NEW behavior goes into the appropriate specialized service, never as a
  new method bolted onto the facade — that just recreates the god file behind a thin front.
- **Shared mutable state**: extracted units must not reach into each other's private caches. Give
  state to a dedicated cache/manager passed by injection.
- **Circular deps**: if A needs B and B needs A, wire cross-cutting concerns via a callback/event at
  the composition root, not mutual constructor injection.
- **Extract by responsibility, not by size.** Size is the symptom; mixed reasons-to-change are the
  disease. Each resulting file should have exactly one reason to change.

## Verify
1. `gate` skill green (scoped jest + `tsc --noEmit` + eslint) — the extracted files carry no new
   lint/type errors and the `max-lines` warning is gone on the original.
2. Original file now under its per-type threshold; each new file has one responsibility.
3. Run `circular-dependency-scan` (madge) — extraction is the classic way to introduce an import
   cycle; confirm you added none.
4. Full feature suite passes through the UNCHANGED public API (regression proof that the facade
   delegates correctly).

_If this skill was wrong or incomplete, fix it before closing the task._
