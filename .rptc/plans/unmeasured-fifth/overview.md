# The unmeasured fifth — what PL-22's zero does not cover

[[PL-22]] drove **628 modules** to zero open gaps and closed on its own condition: every
INCLUDED module measured and ratcheted. [[PL-50]] establishes what "included" meant. The set
is defined by the filename-mirror rule, and it covers **628 of 788 modules that carry real
behaviour — about 80%**.

The zero is real. It covers four-fifths of the code that does something.

**And the fifth it misses is materially weaker.** Measured against the suites that actually
reach them, the four exercised modules probed average **51%**, against 90%+ for the measured
set. That is not coincidence: the measured set got good partly BECAUSE measuring it created
the work. Nothing ever counted the rest.

## Why this is not another burn-down

**~4,700 gaps** (step 2, measured 2026-09-08; the ~18,600 this plan opened with came from the
five LARGEST modules and was four times too high). Still days of loop runs. The evidence from
2026-09-07 argues against spending them that way:

| approach | effort | real defects found |
|---|---|---|
| Burn-down (400 gaps closed over three runs) | ~3 hours of loop | 3 |
| Reading 11 suites under [[PL-48]] | ~2 hours | a production defect, 4 dead modules, an uncovered ternary, 8 assertions that could not fail |

**Reading finds defects. Driving a score to zero mostly writes tests.** So this plan is
ordered by CONSEQUENCE, not by score.

## Step 1 — the module nothing runs at all (highest consequence)

`daLiveBlockLibraryOperations.ts` is **852 lines and 386 mutants that no measurement has ever
counted**. It has no suite under its own name, so `focusModule` refuses it.

**The stronger claim this plan opened with — "executed by NO test" — was wrong.** Checked
2026-09-08 with jest coverage driven by only the five `daLiveContentOperations-*` suites that
construct the real facade: 90.22% statements, 75.86% branch, 96.96% functions. The 0.00% came
from the delegation suite, which does inject a double; the other five run the real code. This
is the same misreading the backlog item already retracted for `storefrontRepublishService`, so
none of the five probed modules is unexecuted — all five are unattributed, which is step 3's
problem, not a coverage hole.

STATUS 2026-09-08 (part one): six mirrored suites added (92 tests), baseline row written at
**81.87%**, 42 open gaps.

STATUS 2026-09-08 (part two): **83.42%**, survivors 62 -> 58, uncovered 8 -> 6, openGaps
**42 -> 36**. 92 -> 97 tests. Six behavioural mutants killed — a null sheet body the optional
chain guards; the two rewrite-failure throws, which must carry DA.live's own status rather
than the `'unknown error'` placeholder; the ensure pass minting no token when no block has an
example; the stub loop's batch slice (7 blocks wrote every page TWICE without it); and a
`components` fallback that would write a stub page called `undefined.html` into a customer's
site. The seventh addition covers a rejected stub write, which no test drove before.

**Every remaining behavioural mutant is triaged, and none of the 36 is a missing test:**

| how many | what | why it is not worth a test |
|---|---|---|
| 22 | log-only branches (`if (result.success)`, `if (!configResult.success)`, `if (copiedCount > 0)`, the two `catch` blocks, `copiedCount++`) | the ONLY difference the mutant makes is which log line is written; the ratchet exists to refuse to reward asserting log text |
| 7 | the duplicate `blocks.length === 0` guard in `createBlockLibrary` (L441-442) and the mutants of the outer guard it makes equivalent (L173) | **unreachable code — see the finding below** |
| 4 | `(parsed.groups ?? [])`, and the two `i <= missing.length` loop bounds | provably equivalent: the fallback array flat-maps to nothing, and an extra loop pass slices an empty batch |
| 3 | `blocksNeedingCdnCopy.length === 0`, `missing.length === 0` (CDN copy), `candidates.length === 0` | killable ONLY by pinning an exact `getImsToken` call count — an implementation detail that any refactor moves |

### Finding: `createBlockLibrary`'s empty-blocks guard is unreachable (not fixed — needs a decision)

`daLiveBlockLibraryOperations.ts:441-443` returns early on `blocks.length === 0`.
`createBlockLibrary` is private and has exactly one caller,
`createBlockLibraryFromTemplate:173`, which has ALREADY returned on the same condition three
lines earlier. Nothing can reach it. It is also redundant twice over: falling through
produces the byte-identical `{ success: true, blocksCount: 0, paths: [] }` at L476-478,
because every downstream pass filters to an empty list.

Deleting it drops 4 uncovered mutants and makes the outer guard's 2 survivors killable
(with the inner guard gone, a definition with no blocks is observably different from one
with blocks). That is 7 of the 36. It is a source change, and this step is tests-only, so it
was left alone. **Fix now or defer?**

Its methods are `createBlockLibrary`, `createBlockLibraryFromTemplate`, `deleteBlockDocPage`,
`removeBlockFromLibrary`, `removeBlockLibraryRow`, `copyBlockDocPagesFromSources` — DA.live
writes against real customer sites. The repo's fifth non-negotiable is that cloud operations
are real and consequential. This is not a metric problem.

**Two sessions**, because 386 mutants is roughly four times the largest single session the
burn-down handled. Tests only; no cloud writes, no live calls.

## Step 2 — size the rest honestly

The ~18,600 figure comes from five modules chosen as the LARGEST, with a crude gap count
(survivors + uncovered − string mutants, where the real `openGaps` also subtracts ledgered
equivalents). Both biases push it high.

Take **15–20 modules sampled across the size range**, measure each against the full set of
suites that reach it, and report real `openGaps`. That turns "large and real" into a number
worth planning against.

**The trap this costs an hour to relearn:** a probe config must live in the repo ROOT and use
a relative `require('./jest.config.js')` with `**/tests/…` globs, so it resolves inside
Stryker's sandbox. A config in `/tmp` with an absolute `rootDir` runs jest against the
ORIGINAL source while Stryker mutates a copy — every mutant "survives" and the module reads
0.00%. **A 0% where every mutant survives means the module never ran, until proven
otherwise.**

Sample the full suite list per module, never a truncation: three suites sampled from a module
whose ten other consumers mock it reported 0.00% for a module that actually scores 31%.

### DONE 2026-09-08 — the number is **~4,700, not ~18,600**

**Roughly a quarter of the figure this plan opened with.** 18 modules probed across the size
range, 1,938 mutants, 741 real `openGaps` measured. Stratified over the population that is
**4,657 open gaps** (standard error 881; a rough 95% interval of 2,900–6,400), a mean of
**26 per module** against the 116 the largest-five probe reported.

#### The population is 180 modules, not 160 — and how it was built

Three predicates, each measured:

1. **Carries real behaviour**, decided by the TypeScript AST rather than a regex: at least
   one function-like body holding a statement (function, arrow, **class method**,
   constructor, accessor), or a top-level statement that is not a declaration. 804 of 857
   source files.
2. **No baseline row** in `reports/mutation/baseline.json` (629 rows). Leaves 180.
3. **No mirroring suite** — `focusModule.suitesFor()` returns nothing, which is the rule that
   makes `focusModule` refuse the module. Leaves the same 180: every module with a mirroring
   suite and no row is type-only or a barrel, and every one of the 629 rows has a mirroring
   suite.

Two things the earlier 160 dropped, both of which the AST filter keeps:

- **Modules that export no function or class.** The old pattern asked for an exported
  `function`/`class`/arrow-const, so a class with async methods and no branches fell out.
- **Files named `index.tsx`, excluded as "barrels" by filename.** Eight are in the
  population and they are not barrels: `projects-dashboard/ui/index.tsx` is **365 lines** of
  webview entry point, `sidebar/ui/index.tsx` 126.

The population holds **16,495 code lines**. That alone refutes the old estimate: 18,600 gaps
would have been more than one open gap per line of code in it.

#### Method

Sampled **3 modules from each of 6 size strata** (`<25`, `25-49`, `50-99`, `100-199`,
`200-299`, `300+`), drawn by an even stride through each stratum sorted by path — not the top,
not the first three alphabetically. The estimate is the stratified total ΣNₕ·ȳₕ, so each
stratum contributes its own mean weighted by how many modules are actually in it. That is the
bias the old figure had: it multiplied the mean of the five LARGEST modules by the whole
population.

**Suites came from jest's own resolver**, `jest --listTests --findRelatedTests <module>` — every
suite whose transitive dependency graph contains the module, computed by the thing that will
run them. A hand-rolled import graph over-counted it 585 against jest's 33 for one module, so
the tool won. No module in the sample mixed node and React suites, so no run had to collapse
two jest projects into one.

**The probe harness was proved before it was trusted.** `claudeCodeFootprint.ts`, which has a
pinned baseline row, was run through it first and reproduced 92.36% / 133 killed / 6 survived /
5 uncovered / 0 open gaps — its baseline row exactly.

| stratum | in population | sampled | mean score | mean openGaps | stratum total |
|---|---|---|---|---|---|
| `<25` lines | 41 | 3 | 43.3% | 2.0 | 82 |
| `25-49` | 31 | 3 | 55.1% | 12.3 | 382 |
| `50-99` | 48 | 3 | 43.2% | 19.3 | 928 |
| `100-199` | 39 | 3 | 46.1% | 37.3 | 1,456 |
| `200-299` | 14 | 3 | 27.1% | 82.3 | 1,153 |
| `300+` | 7 | 3 | 53.1% | 93.7 | 656 |
| **total** | **180** | **18** | | **25.9** | **4,657** |

#### Every module measured

| score | mutants | killed | surv | uncov | openGaps | suites | lines | module |
|---|---|---|---|---|---|---|---|---|
| 50.00% | 4 | 2 | 0 | 2 | 0 | 51 | 8 | `core/utils/projectsRoot.ts` |
| 80.00% | 5 | 4 | 1 | 0 | 1 | 160 | 18 | `core/auth/browserSignInNotice.ts` |
| **0.00%** | 7 | 0 | 0 | 7 | 5 | **0** | 20 | `features/dashboard/ui/integrationsSurface/index.tsx` |
| 66.67% | 3 | 2 | 1 | 0 | 0 | 93 | 40 | `commands/handlerContextFactory.ts` |
| 23.53% | 51 | 12 | 17 | 22 | 35 | 84 | 42 | `core/ui/utils/webviewLogger.ts` |
| 75.00% | 32 | 23 | 5 | 3 | 2 | 131 | 47 | `features/eds/services/daLive/daLiveAuthRetry.ts` |
| 73.33% | 45 | 33 | 12 | 0 | 6 | 144 | 51 | `features/eds/services/configService/siteGrantPreservation.ts` |
| 56.16% | 73 | 41 | 18 | 14 | 23 | 22 | 55 | `features/ai/server/consentText.ts` |
| **0.00%** | 42 | 0 | 1 | 41 | 29 | 11 | 62 | `commands/showPromptsPicker.ts` |
| **0.00%** | 107 | 0 | 107 | 0 | 67 | 11 | 120 | `commands/configure.ts` |
| 82.22% | 90 | 74 | 13 | 3 | 6 | 86 | 122 | `features/dashboard/handlers/projectManagementHandlers.ts` |
| 56.03% | 116 | 65 | 39 | 12 | 39 | 19 | 163 | `features/prerequisites/ui/steps/hooks/usePrerequisiteState.ts` |
| 33.61% | 122 | 40 | 51 | 30 | 74 | 10 | 201 | `features/project-creation/ui/wizard/hooks/useWizardNavigation.ts` |
| 47.62% | 147 | 70 | 19 | 58 | 48 | 86 | 203 | `features/dashboard/handlers/openUrlHandlers.ts` |
| **0.00%** | 194 | 0 | 194 | 0 | 125 | 11 | 228 | `commands/manageSiteAccess.ts` |
| 35.58% | 163 | 54 | 59 | 46 | 70 | 110 | 302 | `features/eds/services/storefront/storefrontRepublishService.ts` |
| 79.82% | 337 | 265 | 41 | 27 | 40 | 25 | 484 | `features/eds/ui/steps/repoSelectionInline.helpers.tsx` |
| 44.00% | 400 | 160 | 164 | 60 | 171 | 99 | 485 | `core/utils/progressUnifier/ProgressUnifier.ts` |

`storefrontRepublishService` re-measured at **35.58%** here against 31.29% recorded above; the
suite set is jest's, which is a superset of the twelve that name it.

#### All four zeros were checked, and all four are real

The standing rule is that a 0% means the module never ran until proven otherwise. Each was
settled by a command, not by reading the report:

- **`configure.ts` and `manageSiteAccess.ts`** — `execute()` was made to throw on its first
  line and their **11 suites and 176 tests all still passed**, twice. `commandManager.testUtils.ts`
  bare-automocks both (lines 29 and 31), and the one suite that imports the real class asserts
  only that the mock's `execute` was called. Sources restored; nothing committed.
- **`showPromptsPicker.ts`** — same automock (line 39), same registration-only assertion.
- **`integrationsSurface/index.tsx`** — no suite reaches it at all, so it was run beside
  `projectsRoot.ts` as an in-run positive control. The control scored 50% with 2 mutants
  killed in the same measurement while the entry point read 0% with all 7 uncovered, which is
  what proves the run executed tests.

**The zeros concentrate, and they are cheap to fix.** 226 of the sample's 741 gaps sit in four
modules, three of them command classes that one shared `testUtils` preamble automocks.
**19 modules in the population are bare-automocked somewhere in `tests/`** — including
`daLiveOrgOperations.ts` (194 lines), `PathSafetyValidator.ts` and `URLValidator.ts`. That
list is a lead, not a finding: only the three above were verified. It is also the same shape
`dead-mock-scan` exists for.

#### What this does to the plan

4,657 is still real work, but it is a quarter of what step 2 was written to disprove, and it
is not evenly spread: 41 modules under 25 lines hold about 82 gaps between them. The
consequence ordering this plan already argues for holds — and the concentration above says
where to look first.

## Step 3 — design the attribution fix (DESIGN ONLY, no code)

Every attribution shape found on 2026-09-07 came from one rule: a module is measured against
the suites that share its FILENAME.

- a suite scored against a module it never runs (re-exports)
- a suite carrying a module's name that tests something else (a stylesheet)
- a module tested only through a consumer's suite, so never measured at all

**Not to be implemented unattended.** Every measurement in the repo rests on this rule, and a
wrong change is one that still produces plausible numbers. The deliverable is a written
proposal: what to key attribution on, what it costs to run, how to prove the new set is right,
and what it does to the 628 rows already in the baseline.

### DONE 2026-09-08 — [attribution-design.md](attribution-design.md)

**Recommended: keep the filename rule, and fall back to jest's `--findRelatedTests` only where
it finds nothing. SAFE-TO-LAND.** That makes 165 of the 180 refused modules measurable
(~20 hours of sweep, once), leaves all 629 existing rows byte-identical, and is provable by an
equality check that runs in seconds rather than by re-measuring anything.

**Keying EVERYTHING on jest's graph is NEEDS-THE-OWNER, on cost.** A census over all 809
modules puts the mean suite set at 2.2 -> 81.6, and a cost model fitted to four real Stryker
runs — controlled against the sweep log's measured 289.7 minutes, 6% error — puts a full sweep
at **~76 hours against 4.8 today**. It also buys no accuracy where a row already exists: two
modules re-measured under BOTH rules returned identical scores and identical open gaps
(`addonUpdateChecker` 72.86% / 0, `configSyncService` 71.30% / 0) for 7.9x and 40.9x the wall
time.

The mechanical finding under all of it: every Stryker config here runs with
`enableFindRelatedTests`, so jest already drops a selected suite that does not import the
mutated module. **The filename rule's errors of inclusion are free; only its omissions cost
anything.** That is why the fix is additive.

## Done when

Step 1's module is covered and ratcheted, step 2 has produced a defensible number, and step 3
has a proposal the owner can accept or reject. Steps 1 and 2 are executable unattended; step 3
ends at a document.
