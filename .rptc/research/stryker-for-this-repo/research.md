# How to use Stryker for THIS repo

**Question.** Mutation testing here produces a number that is hard to act on: the
representative sample sits at 70.73%, one module reads 54.43%, and 63% of all
survivors are string literals. What is Stryker actually offering that we are not
using, and what should the instrument be FOR?

**Mode.** External (StrykerJS 9.6.1 docs) checked against our measured behaviour.
Every claim below names its source. Where I could not establish something, it says so.

**Provenance.** `stryker-mutator.io/docs/stryker-js/{configuration,disable-mutants,incremental,typescript-checker}`,
fetched 2026-09-02. Our numbers come from `reports/mutation/baseline.json` and the
2026-09-01/02 sample runs.

---

## 1. The finding that reframes everything: mutants can be IGNORED, not just excluded

`// Stryker disable` comments have existed since 5.4 and we use none.

> "Disabled mutants will remain in your report but will get the ignored status.
> Mutants with this status in your report **don't influence your mutation score**
> but are still visible if you want to look for them."
> — disable-mutants

Syntax: `// Stryker [disable|restore] [next-line] <mutatorList>[: reason]`, where the
reason lands in the report.

**Why this matters here specifically.** `siteTools.ts` scores 54.43% because it is a
DECLARATION TABLE — it registers ~20 tools with metadata. Its 105 survivors are 12
`needsAuth`, 18 annotations, 6 titles/descriptions, and 68 more in the registration
bodies. Those values ARE constrained — by `tests/sop/tool-auth-declarations.test.ts`
and `tool-catalog-gating.test.ts` — but by source-scanning enforcers, which
mutation testing structurally cannot credit (see §4).

A disable comment with a reason resolves that honestly: the metadata stops dragging
the score down, the mutants stay visible in the report, and the reason names the
enforcer that actually constrains them. That is strictly better than the workaround
we chose yesterday, which was to accept a depressed baseline and explain it in a note.

**Three mechanisms, in order of precision:**

| Mechanism | Scope | Use it when |
|---|---|---|
| `// Stryker disable ... : reason` | line / region / file | a specific block is constrained elsewhere |
| ignore-plugin (`@stryker-mutator/api`) | a code PATTERN, repo-wide | the same shape recurs — e.g. every `registerTool` metadata object |
| `mutator.excludedMutations: [...]` | global, all files | a mutator is never informative here |

The docs call the third a "shotgun approach" and steer to comments. That reads right
for us: `StringLiteral` is noise in a declaration table and signal in
`errorFormatters.ts`, where the strings ARE the behaviour.

**The ignore-plugin is the scalable answer** if we go further: one plugin that ignores
mutants inside tool-registration metadata would cover `siteTools` and every other
registrar at once, rather than sprinkling comments.

---

## 2. `ignoreStatic` — the run has been telling us this every time

Our own log says:

> "Detected 39 static mutants (2% of total) that are estimated to take **41% of the
> time** running the tests!"

`ignoreStatic: true` drops them. It requires `coverageAnalysis: "perTest"`, which both
our configs already set.

> "Static mutants are mutants which are only executed during the loading of a file.
> Testing these mutants come with a big performance penalty."
> — configuration

For a declaration-heavy module a static mutant is usually a top-level constant — which
is exactly the class we do not want to pay for. **Not yet measured here**: whether the
score moves when they are ignored rather than mostly surviving. It should be measured
before adopting, because ignoring 39 mutants that currently mostly SURVIVE would RAISE
the score without any test improving — precisely the thing `highValueSurvivors` exists
to catch.

---

## 3. `incremental` — and Jest is the best-supported runner for it

Since 6.2, and we do not use it. Stryker diffs code and tests against a stored report
and re-runs only what changed.

The support table rates Jest **"✅ Full"** — the only rating that gets exact test
locations and therefore accurate reuse. Mocha, Karma, Vitest and Tap are all degraded.

> "If a mutation testing run is interrupted (for example by pressing CTRL+C),
> StrykerJS saves the partial results collected so far to the incremental report file."
> — incremental

That last line also addresses the orphan problem: an interrupted run currently costs a
1.0GB sandbox AND all its work. With incremental, the work survives.

**Caveat that matters for us**: "Stryker will not detect any changes you've made in
files other than mutated files and test files." Our enforcers read config JSON and
docs — changes there would not invalidate cached results. Incremental is right for the
inner loop, and a periodic `--force` run is what keeps it honest.

---

## 4. Why source-scanning enforcers cannot be added to the run (verified)

Both tool enforcers derive their file list with `git ls-files`. The sandbox has no
`.git` — verified 2026-09-02 by inspecting a live sandbox, and the docs say why:

> "These patterns are always ignored: `['node_modules', '.git', '*.tsbuildinfo',
> '/stryker.log']`."
> — configuration, ignorePatterns

So adding those suites to the mutation run would make them THROW for every mutant, and
a failing test counts as a killed mutant. The score would climb toward 100% and mean
nothing.

**There is an escape hatch and I do not recommend taking it.** The same section says
`!` undoes a default ignore — `"ignorePatterns": ["!.git"]` would copy `.git` into
every sandbox. That is a large copy per worker, on an instrument whose last
pathology was exactly "copying too much into sandboxes". Better: make the enforcers
not need git (glob the tree directly), IF we ever want them in scope. Filed, not done.

---

## 5. `cleanTempDir: 'always'` — a one-word fix for the orphan problem

Ours is `true`, which the docs define as "Delete the tmp dir after a **successful**
run". The third value is `'always'`: "Always delete the temp dir, regardless of whether
the run was successful."

That covers the failed-run case directly. It does NOT cover a hard kill (SIGKILL leaves
no chance to clean up), so the skill's "delete before re-running after an interruption"
note stays true — but the common case gets handled by the tool.

---

## 6. The TypeScript checker — plausible, unmeasured

`@stryker-mutator/typescript-checker` type-checks each mutant and marks non-compiling
ones `CompileError` instead of running them. We do not have it installed (only
`core` and `jest-runner`).

Relevance here is real but unproven: we set `disableTypeChecks: true`, so mutants that
break types currently RUN and can survive. Some fraction of our 412 survivors may be
mutants that could never compile — which would be noise inflating the denominator.

**Unestablished:** what that fraction is. Worth one measured trial, not adoption on
faith. Note the accuracy/performance switch (`prioritizePerformanceOverAccuracy`,
default `true`) trades exactly the accuracy we would be installing it for.

---

## 7. What the instrument is FOR — the answer to the original question

The score was never the goal, and `scripts/mutationBaseline.mjs` already says so:

> "A run may not score LOWER than these, and may not raise its score while leaving
> highValueSurvivors unchanged or higher — that combination is the signature of a
> score raised by asserting log strings."

`HIGH_VALUE = ['branch', 'block']` — a decision nothing constrains, or a body that can
be deleted whole. Today: **153 of 412 survivors**, concentrated in three modules
(`installHandler` 87, `daLiveAuthPrompt` 23, `siteTools` 16).

So the goal is three things, none of them the percentage:

1. **Per-module regression detection.** Already proved itself: it caught six
   unconstrained declarations hours after the instrument was repaired.
2. **A worklist of unconstrained decisions** — those 153, most of them in one module.
3. **A ratchet that cannot be gamed**, which the baseline already enforces.

The percentage's remaining job is to be *comparable per module*. It is not comparable
in aggregate, because the sample picks modules by stride and the set drifts as tests
are added (2026-09-01: 70.73% against a recorded 59.29%, with three modules swapped —
a meaningless comparison).

---

## Recommendation, in the order I would do it

1. **`cleanTempDir: 'always'`** in both configs. One word, removes a known failure mode.
2. **Disable comments on the tool-registration metadata**, each naming the enforcer that
   constrains it. Then re-baseline: `siteTools` should rise for an honest reason, and
   its `highValueSurvivors` should NOT move — which is the check that the change was
   honest.
3. **Measure `ignoreStatic: true`** before adopting. Expect a large runtime win and
   watch whether `highValueSurvivors` holds.
4. **`incremental: true`** for the inner loop, with a periodic `--force` run.
5. **Point the next work at `installHandler`'s 87 unconstrained branches**, not at any
   percentage.
6. **Not now:** the TypeScript checker (measure first), and `!.git` (a worse cure).

## What I could not establish

- Whether `ignoreStatic` moves our score, and in which direction.
- What share of our 412 survivors are mutants that could not compile.
- Whether an ignore-plugin can match "inside a `registerTool` metadata object"
  cleanly — the API takes a Babel path, and I did not prototype one.
