# Strengthening what the tests actually constrain

Follows PL-22, which measured **59.29%** across a fair eight-module sample against the
pilot's 93.37%. This plan turns that number into work.

The ratchet is already in place (`reports/mutation/baseline.json`,
`scripts/checkMutationBaseline.mjs`), so every step below proves itself: a run that
raises a score without reducing branch/block survivors is REJECTED, not celebrated.

---

## Read the scores before trusting them

**Not all of the gap is equally real, and one module is mostly cosmetic.**

| Module | Score | Survivors | What they mostly are |
|---|---|---|---|
| `installHandler.ts` | 41.77% | 193 + 122 uncovered | 38% branches, 7% whole blocks — **real** |
| `siteTools.ts` | 57.33% | 93 | **54% are MCP tool titles and descriptions** |
| `daLiveAuthPrompt.ts` | 67.04% | 53 + 35 uncovered | spread across 9 functions |
| `mcpSocketPath.ts` | 77.78% | 2 | small, nearly clean |
| `claudeCodeFootprint.ts` | 83.33% | 16 | mostly log text |
| `codePatchRegistry.ts` | 84.54% | 14 | mostly log text |
| `commerceCredentialStore.ts` | 95.65% | 1 | done |
| `envMerge.ts` | 100% | 0 | done |

`siteTools` is the warning. Its 93 survivors sit in ONE function — an MCP tool
registrar — and half are prose: `title: 'Get Site Access'` and the descriptions
beneath it. Nothing asserts that text and arguably nothing should. Its honest signal
is ~32, not 93. **Anyone told to "raise siteTools' score" would go straight at
asserting descriptions, which is exactly the gaming shape the ratchet rejects.**

## Order of work, cheapest real win first

### 1. installHandler — the plugin path (89 uncovered mutants, ONE cause)

`resolvePluginNodeVersions` had 57 uncovered mutants and **zero survivors** — the
signature of a function no test enters. Root cause: no fixture defined `plugins`, so
`installPlugins` always hit `if (!prereq.plugins) return` and everything below was
unreachable.

It is not dead code. `aio-cli` ships one plugin, `api-mesh` — the API Mesh CLI plugin
the extension's mesh deployment depends on.

One detail the fixture must keep: the shipped plugin declares **no `requiredFor`**, so
production falls through to `targetVersions[0]`. A fixture that invents `requiredFor`
tests a path nothing uses.

*Status: fixture + 8 tests written (`installHandler-plugins.test.ts`), not yet
measured.*

### 2. installHandler — the remaining branches

| function | uncovered | survivors |
|---|---|---|
| `handleInstallPrerequisite` | 6 | 22 |
| `resolvePerNodeTargetVersions` | 7 | 14 |
| `executeInstallSteps` | 3 | 21 |
| `sendFinalInstallStatus` | 0 | 26 |
| `handleVerificationError` | 0 | 25 |
| `resolveNodeTargetVersions` | 0 | 22 |

The four with zero uncovered are reached but weakly asserted — the same shape as the
cache-invalidation gap already fixed: a collaborator is mocked, called, and never
checked.

### 3. daLiveAuthPrompt — 35 uncovered across `promptForToken` / `validateAndStoreToken`

Interactive auth prompts. Expect these to need more harness than assertions.

### 4. siteTools — the 32 that are not prose

16 branches + 16 object literals. Leave the descriptions alone.

## What "done" means

Not a target score. Each step re-runs `npm run test:mutation:sample`, and the ratchet
decides. The number to beat for step 1 is `installHandler.ts` at **41.77% / 89
branch-block / 122 uncovered**.

## Lessons already paid for

- **Assert that a planted mutation APPLIED before trusting the verdict.** A no-op
  plant reports "survived", which is indistinguishable from a weak test. Cost two
  wrong readings in one afternoon; one was shell backtick escaping.
- **Read the fixture, do not assume it.** `prereqId: 0` is npm, not node.
- **`checkMultipleNodeVersions` is called twice** — pre-check and verify. Returning
  one value makes the all-installed branch unreachable and the assertion reads
  `undefined`.
- **A survivor is a lead.** The `prerequisite-install-complete` string looked like
  "nobody asserts this message"; three tests do. The truth was narrower and more
  useful: one of two early-return paths is unasserted.
