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

~18,600 gaps by a biased-high estimate, which would be weeks of loop runs. The evidence from
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

## Done when

Step 1's module is covered and ratcheted, step 2 has produced a defensible number, and step 3
has a proposal the owner can accept or reject. Steps 1 and 2 are executable unattended; step 3
ends at a document.
