# Dedup-sweep report — 2026-08-27 (late evening)

The sweep the owner queued after the quality passes: the eight pre-boundary
clone families (PL-8), the twin service cards (EDS-7), and the first-ever
scan of the tests tree. Branch `loop/2026-08-27-dedup-sweep`, seven commits,
pushed. Full gate green after everything: 1,165 suites / 15,144 tests, zero
lint errors, no cycles, and the repo's production clone count down 74 → 66.

## The short version

Six real extractions shipped, every one proven by its consumers' tests
passing unchanged. Three findings were better than their scan hits: the
"35-line DA.live clone" was a copied DOCBLOCK on a facade (logic was never
duplicated); the GitHub family had FOUR Octokit factories of which the one
shared helper had zero callers; and the tests-tree's worst cluster existed
because its testUtils helper was silently broken — returned callbacks by
value — so every spec copied the working inline version. Five pairs were
adjudicated as deliberate variants or two-instance cases and recorded, not
forced. EDS-7 and PL-8 shipped; PL-9 filed with the tests-tree census.

## Shipped (on the branch, awaiting merge)

1. `d34d7e6eb` — projects-dashboard: 7 copies of the resolve-project
   prologue → one `resolveProjectFromPath` (347 tests unchanged;
   `handleSelectProject` stays out on purpose — it persists the pointer).
2. `3d75d23c0` — ai/server: the path-tool opener ×3 → `openPathCall`
   (delete_page and write_page stated variants, reasons in their
   docstrings); the EDS-tool guard triple → a new `edsToolGuards` module
   (731 tests unchanged).
3. `8ab4fc00a` — one authenticated-Octokit factory: the dead shared helper
   gained its three callers; the facade docblock became a pointer at the
   real docs (120 tests unchanged).
4. `ace1bc32f` — updates: the `as 'enabled' | 'disabled'` boundary cast
   replaced with narrowing the compiler proves.
5. `62893d786` — EDS-7: `ServiceCardShell` + `ServiceCardStatus` behind
   both service cards, DA.live's token form on the customState slot
   (207 tests, zero edits — the item's own success test).
6. `8002fe208` — the tests-tree reference fix: PrerequisitesStep's broken
   testUtils helpers repaired (trampolines + `renderLoadedStep`), both
   progress specs converted, 14 clones gone (23 tests, count unchanged).

## Adjudicated as variants / recorded at two (PL-8's log has file detail)

- prerequisites check/continue pair — AND a possible real inconsistency:
  continue lacks check's `resolveRequiredMajors` id-mapping refinement.
  That is a behavior question, not a dedup; flagged on PL-8.
- auth project/workspace create prologues (deliberate entity mirror).
- updates' pre-dialog lookup guard (removing it changes UX).
- repoOperations' internal response-mapper pair.
- **the config-hook `updateField` pair** — the drift-dangerous one: the
  PAAS_URL→GraphQL linked-field rule lives in both the wizard and
  Configure hooks. Standing instruction recorded: whoever touches either
  next extracts `buildFieldWrites` first.

## Filed

- **PL-9** — the tests-tree census: 174 clones at 2.66% (src: 0.62%),
  eight remaining clusters listed largest-first, the fixed
  PrerequisitesStep cluster as the reference, and the 90 warning-zone
  file sizes noted. Most tests-tree duplication is convention (per-suite
  Spectrum mocks) and deliberately not a target.

## Corrected along the way

- The duplication scan ignores `*.test.*` by design — right for src,
  bypassed deliberately for the tests pass (stated, not silently changed).
- The scan-time line numbers had drifted for the DA.live clone; re-read
  before acting, which is how the docblock finding replaced the wrong
  "listing walk" theory.

## Your decision

**Merge `loop/2026-08-27-dedup-sweep` into develop?** Seven commits, gate
green, behavior-preserving by construction (every consumer suite passed
without edits; the one test-file rewrite kept its count at 23).
