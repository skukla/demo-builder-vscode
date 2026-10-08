---
name: decompose-god-file
description: Split an oversized multi-responsibility file (service, component, handler, hook, util) into single-responsibility units without breaking its public API or tests. Use when a file trips the eslint max-lines warning or the per-type thresholds, or when a scan flags a god file. This is the FIX; the *-scan skills are the FIND.
---
# Decompose a God File

Full pattern catalog, worked examples, and anti-patterns: `docs/development/sop/god-file-decomposition.md`.
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
   — `createEntityCollaborators` WIRES the extracted services and hands them back; callers use
   the one that owns the job. Note what is not there: a class of forwarding methods. See step 6.
   For hook extraction, the wizard hooks (`useProjectBuilder` et al.).
3. **Extract leaf-first, TDD each unit.** Extract the dependency with no internal deps first, write
   its unit tests, confirm green in isolation BEFORE touching the original:
   `npm run test:file -- tests/<path-to-extracted>.test.ts`. Then extract its dependents, then the
   facade last.
4. **Integrate via facade, keep the public API.** The original file imports the extracted units and
   delegates through thin methods — consumers and their tests don't change. Run the feature's full
   suite after each extraction.
5. **Keep tests in sync** (project rule): moving a method moves its tests to the new unit's test
   file; the facade keeps a delegation/integration test. Don't leave orphaned tests behind.
6. **Then retire the forwarding.** Step 4's thin methods are scaffolding: they keep everything
   green WHILE you extract. They are not the finished shape. Once the units are out, move the
   callers onto the unit that owns each job and delete the forwarders, keeping only the wiring
   (a `create...` function that builds the units and returns them).

   Why this is a step and not a nicety, measured: the 2026-08-23 decomposition of
   `adobeEntityFetcher.ts` stopped at step 4, and left a class whose 24 of 25 methods only
   passed calls on. On 2026-09-21 adding ONE optional parameter to the org-services fetch
   meant editing five signatures, three of them only to forward it. Removing the facade took
   one sitting: 25 production call sites and 154 test call sites, found by `tsc` — see the
   `ask-the-tool` skill for the method.

## Gotchas
- **Premature extraction**: don't extract a helper with a single use case. This said "Rule
  of Three — inline until 2+ real callers", which is two thresholds in one sentence: 2+
  includes two, and the Rule of Three waits for the third. The rule is the handbook's, and
  it is three.
- **Facade accumulation**: NEW behavior goes into the appropriate specialized service, never as a
  new method bolted onto the facade — that just recreates the god file behind a thin front.
  Its quieter cousin is the facade that never shrinks: nothing new added, nothing old removed,
  every call paying a layer of forwarding forever. Step 6 exists for that one.
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
3. `tests/sop/import-cycles.test.ts` is green — extraction is the classic way to introduce an
   import cycle, and since 2026-10-08 a new one fails the build. `circular-dependency-scan`
   explains how to break one.
4. Full feature suite passes through the UNCHANGED public API (regression proof that the facade
   delegates correctly).

## The per-file routine (EDS-8, the owner's standing order of 2026-10-08)

**Every file over its limit gets split by job, one file per sitting, one commit per file**, until
`godFileCandidates` reads 0. The two-number rule above still decides HOW: a file a reader judges
to be one job (`edsPipeline.ts`: 976 lines, one export) is not cut to move a number; it gets a
dated verdict on `EDS-8` saying what was read and why it stays whole, and the next re-measure
can revisit it. The routine exists because each of the first nine cuts rediscovered the same
bookkeeping, and because "the tests passed" cannot see a line no test constrains.

0. **Re-measure first.** `python3 .claude/skills/decompose-god-file/worklist.py` prints every
   file over its limit, worst first, with the same signals the ratchet counts. EDS-8's own
   lesson: it tracked files somebody touched, not files measurement condemns.
1. **Split by job** (steps 1–6 above). Callers move to the owning unit; forwarders are deleted.
   Where retiring a forwarder needs an interface decision (an object passed whole into a guard
   that also needs another method on it), keep it, name the decision in the commit, and move on.
2. **Prove it was a move.** The suite passing unchanged proves what the suite constrains. For the
   rest, diff each moved function against the pre-split commit:
   ```bash
   python3 .claude/skills/decompose-god-file/proveMove.py HEAD~1 <old-file> <new-file>... \
       [--rename oldName=newName] [--control]
   ```
   It ignores whitespace, `this.x`/`deps.x`, the `deps` destructure and wrapped commas, and
   prints a diff for anything else. **Every `DIFFERS` is read by a person and named in the
   commit message** — on the first run (2026-10-08) two of three were real: a timing wrapper
   that moved off two reads, which the agent's report had described as a side effect.
   `--control` plants a one-token change and must report `DIFFERS`.
3. **Full checks, not the scoped gate alone:** full jest, `tsc --noEmit`, `typecheck:tests`,
   whole-repo lint, compile. State each exit code.
4. **Mutation score before and after**, so the tests still guard what moved:
   ```bash
   node scripts/focusModule.mjs <old-file> <new-file>...   # one run, every piece
   npm run test:mutation:focus
   node scripts/checkMutationBaseline.mjs --report reports/mutation/focus.json
   ```
   The old file has a baseline row; compare per module, never on the total. A new file has no
   row, and the check reports it as a regression until one exists: read its survivors first
   (`reports/mutation/focus.json`, by `mutatorName`: string and log mutants are text, the
   rest are decisions), fix what is a real gap, THEN `checkMutationBaseline.mjs --write
   "<why>"`. **A new file also needs a suite of its own**, `tests/<mirror>/<name>.test.ts`;
   a baseline row with no mirrored suite fails `mutation-config-pairing`. On the first run of
   this routine the moved sign-in flow scored 43% through the service suites alone: three
   decisions no test constrained (a forced sign-in clears caches before the browser opens;
   a failed sign-in answers false), all older than the split and found only because the
   code was measured on its own. A score that fell is a test that stopped reaching the code
   (a mock now answering for the unit), not a reason to pad.
5. **The bookkeeping that moves with the code** — check each, every time:
   - `tests/sop/architecture-rules.exemptions.json`: `godFileCandidates` and `godFileCoupled`
     lowered by what was achieved, each `_note` prefixed with a dated sentence.
   - `scripts/mutation-equivalents.ledger.json`: rows keyed by module and line; re-home them
     (Python `json.dumps(indent=4)`, never Node's stringify).
   - `tests/sop/user-facing-errors.ledger.json`, `tests/sop/progress-surface.ledger.json`,
     `tests/sop/derived-fields` keys: `file:line`.
   - `tests/core/utils/operationStages.test.ts` `STAGE_REPORTERS`; `test-family-setup`; the
     jscpd ceiling; `tests/templates/spine-chokepoints.test.ts` doors.
   - Hook proofs and probes that name an example oversized file (`49-god-file.proof.sh`,
     `writtenPaths.probe.py` `HANDLER`, `router.test.ts`): point them at the next one.
   - `jest.pl22.config.js` / `stryker.*.config.json` naming a suite you deleted.
   - Every doc, skill, `CLAUDE.md` and comment naming the moved symbols — `cited-identifiers`
     and `doc-module-refs` catch the ones under test; `grep` the rest.
6. **Commit, log, record.** One commit, `Backlog: EDS-8`, then `backlog.mjs unlogged --write`
   and a log line with before/after lines and pins. Append anything that needs a LIVE check
   (a sign-in, a deploy, a publish) to the "Needs a live check" list on EDS-8, so the owner
   tests several at once rather than after every file.

_If this skill was wrong or incomplete, fix it before closing the task._
