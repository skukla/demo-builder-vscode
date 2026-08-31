# Track 3 convergence loop — resume state

**Written 2026-08-31 when the owner went to bed.** This file exists so a cold wakeup
can resume without re-deriving anything. Read it first, then continue.

Branch: `loop/2026-08-30-track3-convergence` (7 commits ahead of develop, all pushed).

## The job

Convert all **28 test suites** that module-mock a stateless collaborator
(`HelixService`, `ConfigurationService`, `GitHubAppService`) so the collaborator arrives
through a seam instead. ADR-016 lists this as the largest test-design win available.

The owner asked explicitly for **all 28, reading each one** — after being told the scope
is 9,440 lines and 17 suites over 300 lines. That is a decision, not an oversight.

## Progress: 8 of 28 walls down

Done: `publishKeyRegistrar` · `refreshBlockLibraryHeadless` · `storefrontRepublishContent`
· `contentAuthoringTools` (×2 specs) · `edsResetUI.testUtils` (frees 6 suites) ·
`catalogPrewarmPhase`. Seams also added to `storefrontSetupPhases` and
`edsResetConfigStep`.

Re-measure what is left rather than trusting this list:

```bash
python3 - <<'PY'
import subprocess, re
ts=[t for t in subprocess.run(['git','ls-files','tests'],capture_output=True,text=True).stdout.split() if t.endswith('.ts')]
for t in ts:
    s=open(t,encoding='utf-8',errors='replace').read()
    w=[x for x in ('helixService','configurationService','githubAppService') if re.search(r"jest\.mock\([^)]*"+x, s)]
    if w: print(len(s.splitlines()), t, w)
PY
```

## The conversion pattern

1. Read the suite **in full** and the source it tests.
2. Add an optional seam to the source, defaulting to the real construction. Production
   callers pass nothing and stay untouched.
3. Delete the `jest.mock` of the service module; hand the fake in.
4. Run the suite, then the neighbouring tree.
5. `npm run gate`, and commit ONLY on exit 0.

**Instance or factory?** Use a FACTORY when the suite asserts that nothing is
constructed on a skip path — an injected instance is built by the caller regardless, so
the laziness stops being observable and the test silently goes vacuous.
`catalogPrewarmPhase` is the worked example.

## Three things learned that will recur

- **Every wall that comes down exposes what it was hiding.** Three times so far tsc
  refused something the mock had concealed — 11 `as never` casts, a partial fake, an
  `expect.anything()` that could not name its subject. Expect this; it is the point.
- **A partial fake is cast INTO the real type at the boundary, once** (ADR-016 rule 2,
  now handbook law). Never `as never` on the builder itself.
- **A module mock that asserts CONSTRUCTION is not a wall to remove carelessly.**
  `edsResetConfigStep` asserts Helix is built with the `tokenProvider` — the check that
  exists because its absence caused a live 401 on 2026-08-15. Convert it by keeping one
  test on the DEFAULT path so that assertion survives.

## Rails (owner is asleep — these are not optional)

- No cloud writes. No sign-ins. No UI-opening tools. Tests and source only.
- Commit to the loop branch, never develop. Push each commit for backup.
- Every commit conditional on `npm run gate` exit 0, captured in a variable.
- Never pipe jest through `tail`/`head`/`grep` — redirect to `$SCRATCH`, then read.
- Verify every edit LANDED (count replacements) before believing a green run. Three
  silent no-op edits have already happened in this session.

## When the 28 are done

Then, in order:

1. **PL-16** — shared fixture builders. StateManager: 49 suites hand-roll, 27 distinct
   shapes, 18 used once. Project: 38 / 32 / 25. Both UNMOVED since the August baseline.
   HandlerContext is the proof the cure works — 83 import the shared builder, 4
   hand-roll, because one exists and is findable.
2. **The family-extraction worklist** — ~20 real targets, ~2,446 removable lines,
   ranked in `.rptc/complete/architecture-test-convergence/family-worklist.json`.
3. **PL-14's last artifact** — `webview-test-authoring` carries zero ADR-016 pointers.
4. **PL-22** — the owner asked for this AFTER the loop (2026-08-31). Run
   `npm run test:mutation:sample` and read the result against the pilot: 93% on four
   easy modules, 59% on a representative sample, and the score falls almost
   monotonically as `await` count rises. The QUESTION is what that means for policy,
   and the honest headline is the 59%. Produce the evidence and a recommendation;
   the ruling itself is the owner's.

Still the owner's, not the loop's: the rewrite of `tests/README.md` and the splitting
playbook, which stay provisional until the test strategy settles.

## Merging

The owner merged the first 8 conversions into develop on 2026-08-31 and asked for the
work to continue. Keep committing to the loop branch — the unattended rail stands — and
say in the report when a batch is ready to merge.

## The report

Append findings to `.rptc/handoff/2026-08-31-track3-loop-report.md` as they happen, so
the morning read is a document rather than a scrollback.
