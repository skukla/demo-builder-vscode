# Research: Test Dependency Strategy — config reads, DI, and cross-suite isolation

**Date:** 2026-05-31
**Trigger:** A ~1-in-4 intermittent full-suite failure traced to `edsResetParams.test.ts` reading the *real* `demo-packages.json` despite a `jest.mock`. Fixed tactically by injecting the config as a param. The PM asked: **is mock-free DI a best practice we should reuse across all tests, or should we standardize an approach?**

---

## 1. Problem statement

`extractResetParams` does a **direct static import**: `import demoPackagesConfig from '@/features/project-creation/config/demo-packages.json'`. Its test `jest.mock`'d that JSON module. Under multi-worker runs the mock was **order-dependent**: when a sibling suite in the same worker loaded the *real* JSON first, the function read real data → `byomOverlayUrl` undefined / `success === false` → 2 failures (~1/4 runs). `jest.isolateModules` did **not** fully fix it; injecting the data did.

Separately, this investigation also surfaced and fixed a **leaked OAuth timeout timer** in `githubOAuthService` (unhandled rejection that crashed `--runInBand`). That was a distinct bug, already fixed.

## 2. Current state (survey of 648 test files)

| Signal | Finding |
|---|---|
| `jest.mock` usage | 380/648 files (~58%), 1,349 declarations |
| Most-mocked | `vscode` (142, via `moduleNameMapper` + `tests/__mocks__/vscode.ts`), `@/core/logging` (82), `@/core/di` (66), `timeoutConfig` (65), `fs/promises` (56), `@/core/validation` (45), `ConfigurationLoader` (15) |
| **Bundled-JSON module mocks** | **Only `demo-packages.json`**, in **6 EDS suites** (+ the now-fixed `edsResetParams`). All other configs (`components.json`, `wizard-steps.json`, `prerequisites.json`, `logging.json`, `content-patches.json`) are **never** module-mocked |
| `{ virtual: true }` | 51 occurrences (legacy; the module exists, so it's inappropriate for `demo-packages.json`) |
| DI-for-testing in prod | **Rare.** `ProgressUnifier` is the mature exemplar (`IDateProvider`/`ITimerProvider`/`IProcessSpawner`, all defaulting to real impls). ~35 service classes otherwise use constructor params or `ServiceLocator`. |
| Isolation config | `clearMocks`/`resetMocks`/`restoreMocks` all `true` (these reset `jest.fn()` spies only). **`resetModules` is NOT set** → module registry persists across files within a worker. `maxWorkers: 25%`. |
| State resets | `sessionUIState.reset()` in 96 files; `ServiceLocator.reset()` in `node.ts` `afterEach`. |

### The decisive contrast
- **`components.json` is read through a seam** — `ComponentRegistryManager` → `ConfigurationLoader`. Tests **mock the loader** and feed a structure-validated `mockRawRegistry` (documented in `tests/README.md` "Mock Derivation Guidelines"). **No JSON-module mock → no flakiness.**
- **`demo-packages.json` is read by direct static import** (no seam) in `edsResetParams` + 6 `edsResetService-*` suites → they must `jest.mock` the **leaf JSON module**, and `componentSummaryUtils.ts:94` does a **runtime `require()`** of the same file → cross-worker contamination.

## 3. Root cause

Three things compound:
1. **No seam** at the `demo-packages.json` read site (direct static import) forces tests to mock the leaf module.
2. **`resetModules: false`** + a **runtime `require()`** of the real JSON elsewhere means a worker can hold the real module instance; a leaf-JSON `jest.mock` in another file does not reliably override an already-resolved instance across files.
3. `jest.isolateModules` re-evaluates the importer but doesn't defeat (1)+(2) reliably for a statically-imported JSON leaf.

This is **not** a generic "mocks are bad" problem — it is specific to **mocking a leaf data module that is read without a seam and also loaded for real elsewhere**.

## 4. The core question: should DI be reused across *all* tests?

**No.** Blanket DI is itself an anti-pattern the project's own `CLAUDE.md` flags ("dependencies hidden via DI magic", "8 auto-injected services" red flag; parameter bloat; test-induced design damage). The correct, narrow principle:

> **Inject a test seam only at boundaries to *non-deterministic or external* inputs** — clock, randomness, filesystem, network, env, **and bundled config read via static import**. Everywhere else, test through arguments or an already-mockable service. Prefer an *existing* seam over a new ad-hoc parameter.

Decision framework:

| Situation | Approach |
|---|---|
| Pure logic, inputs are arguments | Just call it. No mock, no DI. |
| Reads config/data through an existing **loader/service** | Mock the loader/service; feed structure-validated data (the `ComponentRegistryManager` pattern). |
| Reads non-determinism (time/rand/spawn) | Provider-interface DI with real defaults (the `ProgressUnifier` pattern). |
| Reads a bundled **JSON via direct static import**, no seam | **Add a seam** (preferred: a loader; acceptable: an optional injected-data param). Do **not** `jest.mock` the leaf JSON module. |
| Heavy/external module (vscode, spectrum, octokit) | Shared `tests/__mocks__` manual mock (already standard). |

So: DI is the right tool for a *minority* of tests (the boundary cases), and even then "DI" usually means **mock the seam**, not "add a param to every function."

## 5. Candidate standards for the config-read class (trade-offs)

| Option | Isolation-safe? | Prod change | Consistency w/ codebase | Notes |
|---|---|---|---|---|
| **A. `jest.mock` the JSON leaf** (status quo) | ❌ order-dependent | none | only EDS does this | The flaky pattern. Reject. |
| **B. Loader/service seam** (mock the loader, feed `testUtils` mock) | ✅ | small (introduce/loader-route) | ✅ matches `ConfigurationLoader`/`components.json` | Most consistent; needs a `demoPackageLoader` seam used by all consumers. |
| **C. Inject data param** (what `edsResetParams` now does) | ✅ | tiny (optional param) | partial (one-off) | Cheapest for a pure function; fine but not a universal pattern. |
| **D. Shared `__mocks__/demo-packages.json` fixture** | ⚠️ partial | none | ⚠️ global fixture, drift risk | Still a leaf-module mock; global shape may not suit every test; doesn't fix the runtime-`require` polluter. |
| **E. Enable `resetModules: true` globally** | ✅ (symptom) | jest config | n/a | Treats the symptom, not the cause; real perf cost across 8k tests; risky blast radius. Reject as the primary fix. |

## 6. Recommendation

1. **Adopt the principle in §4** as the documented standard (add to `tests/README.md` "Mock Derivation Guidelines" and/or the testing SOP): *test pure logic directly; mock at a service/loader seam for config; provider-DI for non-determinism; never `jest.mock` a leaf JSON config module.*
2. **Canonical pattern for config reads = the loader seam (Option B)**, matching `ComponentRegistryManager`. Where a pure function reads config directly and a loader is overkill, **Option C (inject data)** is an acceptable lightweight seam.
3. **`demo-packages.json` specifically:** introduce/normalize a `demoPackageLoader` seam used by *all* readers (including the runtime `require` in `componentSummaryUtils.ts`), then migrate the 6 `edsResetService-*` suites + `edsResetParams` to mock that seam. This removes the leaf-JSON mocks entirely and kills the contamination class. *(Larger; do as a dedicated follow-up.)*
4. **Do not** blanket-introduce DI, and **do not** flip `resetModules` globally.
5. Retire the 51 `{ virtual: true }` usages on real modules opportunistically (use `moduleNameMapper`/real resolution).

## 7. Open decisions for the PM

1. **Scope of retrofit:** (a) leave the 6 siblings (they pass today) and only enforce the standard going forward, (b) retrofit them to Option C now, or (c) build the `demoPackageLoader` seam (Option B) and migrate all 7.
2. **Where to document the standard:** `tests/README.md`, the testing SOP, or both.
3. **Is `edsResetParams`'s data-injection (Option C) acceptable as-is,** or should it be reshaped to the loader seam (Option B) for consistency once the seam exists?

## 8. Status of the immediate fixes (already shipped on `claude/soft-deprecation-cycle-4-54ZNO`)
- `edsResetParams` data injection (Option C) — full suite green across `--runInBand` + repeated multi-worker runs.
- `githubOAuthService` leaked-timer fix — eliminated the `--runInBand` crash.
These stand regardless of the standard chosen; `edsResetParams` can be re-shaped to Option B later if desired.
