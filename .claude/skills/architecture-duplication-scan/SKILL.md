---
name: architecture-duplication-scan
description: Find two code paths that must AGREE about one fact while nothing makes them — competing models, a resolver bypassed at a call site, one policy implemented twice. RUN IT AFTER any bug diagnosed as "it acted on the wrong X" or "right on surface A, wrong on surface B" — a two-surface disagreement IS a competing-implementation report. Also for consolidating after a rewrite, or a singular API beside a keyed one. Guided review, not a clean scanner — the signals are leads, judgment decides.
---

# Architecture-Duplication Scan

Detect **competing implementations**: two code paths that do the SAME job for the SAME
caller, usually a fork left behind when a newer model superseded an older one but nobody
deleted the old. Under this repo's **no soft deprecation** rule, the resolution is to pick
ONE and delete/migrate the other — never leave both wired.

**This is guided review, not a scanner.** There is no reliable mechanical test for "same job
solved twice", so `signals.sh` emits candidate POINTERS only — most hits are false leads.
It does NOT overlap `/sop-scan` (God files, complexity, mixed patterns) — cross-reference that.

## When to use

**The mechanical trigger — this is the one that fires without you already suspecting the
answer.** Run this immediately after any bug diagnosed as:
- "it acted on the wrong X" (removed the wrong mesh, updated the wrong directory)
- "correct on surface A, wrong on surface B" (card says Deployed, dashboard says none)
- "the fix worked here but not there" (a policy reversed in one of two places)

All six instances found on 2026-08-04 were reported in exactly that form. A two-surface
disagreement IS a competing-implementation report — treat it as one before writing the fix,
because the fix belongs at whatever both surfaces should have shared.

Also worth running when:
- A feature appears to have two models / two ways to do one thing.
- You find a singular API (`fooState`, `addFoo`) beside a keyed one (`fooComponents`).
- Consolidating after a rewrite or supersession — hunt the abandoned fork.
- You are about to add a SECOND implementation of something deliberately (a headless twin, a
  vscode-free variant). Write the contract test then, not after it drifts.

## When NOT to use
- Ordinary DRY / pasted blocks — that is `code-duplication-scan`.
- File-size / complexity / mixed-handler smells — that is `/sop-scan`.

## Procedure

1. **Gather leads** — pointers, not findings:
   ```bash
   bash .claude/skills/architecture-duplication-scan/signals.sh src
   ```
   Section 1 = explicit fork markers. Section 2 = singular-vs-keyed state twins. Section 3 =
   sibling verb twins. Every hit is a lead to investigate; expect mostly false positives.

2. **Test each lead against the real bar: ONE FACT, DECIDED TWICE.** Two sites must agree
   about a single thing — *which component is the mesh*, *what a deploy record contains*,
   *where progress steps go*, *what an installed instance carries* — and nothing makes them.

   **Different callers are the normal case, not a rejection.** An earlier version of this
   skill required "the SAME job for the SAME caller", and that bar rejected three of the six
   instances found on 2026-08-04: their callers were a webview screen vs a dashboard handler,
   an MCP tool vs a command, a wizard orchestrator vs a dashboard add. Shared provenance is
   not the invariant — AGREEMENT is.

   Similar NAMES are still not enough: `addAppComponent` and `addMeshComponent` add different
   things. Ask "what one fact would both have to get right?" If there isn't one, move on.

3. **Confirm the fork** — trace both paths to a shared caller/entry and check the fork is
   live-but-redundant (both reachable) or leftover (one dead). `git log -S` on each side
   shows which superseded which.

4. **Resolve** — pick the surviving model, migrate any remaining callers to it, and DELETE
   the other outright (no `(Deprecated)` stub, no accepted-but-ignored path). Then rerun the
   dead-code-scan to sweep the orphaned symbols.

   When the two paths CANNOT merge — genuinely different channels, one vscode-free — extract
   the shared DECISION and leave the rest, then make the agreement executable. A comment
   saying "these must match" is what failed last time; a test that fails on both surfaces is
   what replaced it. `core/vscode/progressRegister.ts` is the reference: one edit to the
   shared rule now fails 12 tests across 5 suites, where before it failed nothing on the
   second surface.

## Heuristics
- One fact decided twice = real finding. Same verb, different object = not a finding.
- Different callers do NOT disqualify a lead — most of these span two surfaces, which is
  precisely why each site looks correct on its own.
- The duplicated thing is often a DECISION with almost no shared text, so `code-duplication-scan`
  (jscpd) will be silent. Measured 2026-08-04: zero cross-file clones for four of six known
  instances even at 3 lines / 10 tokens. Silence there is not evidence of absence here.
- The newer/keyed model usually wins over the older/singular one; confirm before assuming.
- A fork almost always leaves dead exports — pair this with `dead-code-scan` to finish.
- Do not "unify" two paths that serve genuinely different callers — that invents an abstraction.

## Output format
```
## Competing-implementation candidates
### <job> — two models
- Model A (singular): appState, addAppComponent, DeployAppCommand — src/...
- Model B (keyed):    appBuilderComponents, appBuilderComponentRunner, dashboard handlers — src/...
- Shared caller: <entry point both reach>
- Verdict: B superseded A → migrate callers to B, delete A (+ its tests)
- Not a fork (rejected lead): addFoo vs addBar — different objects
```

## Worked example — the shape that keeps recurring (2026-08-04)

`getIdentifiedMeshAppBuilderComponent` owns a two-step resolution: the canonical `mesh` key
first, then first-by-kind. `IntegrationsScreen` re-ran only the fallback half inline —
`listAppBuilderComponents(project).find(c => c.kind === 'mesh')`. Three lines, sharing no
token run with the seven-line original.

On a project holding two mesh entries the card showed one mesh and Remove tore down the
other. **Live data loss.** Section 4 of `signals.sh` now surfaces exactly this: narrowed to
one fact it returns a five-site shortlist — the owner plus four re-derivations, one of which
was the defect.

The same day produced five more of this shape: a deploy-record writer bypassed, a status dot
re-implemented, a mesh catalog duplicated, one progress policy implemented twice, and an
installed instance dropped by one of two consumers. Every one was found by a user reporting a
symptom. None was found by tooling.

## Earlier worked example (resolved in ADR-011 D3, 2026-07)
Two App Builder models coexisted: the **slice-1 singular** model (`appState`,
`DeployAppCommand`, the singular `addApp`/`deployApp`/`redeployApp`/`removeApp` dashboard
handlers, the `AppBuilderCard`) and **Model B keyed** (`appBuilderComponents`,
`appBuilderComponentRunner`, the per-id `*AppBuilderComponent` handlers). They solved the
same job — managing App Builder components for the same dashboard/wizard caller — a genuine
fork. Resolved in ADR-011 D3: callers migrated onto the keyed model; `DeployAppCommand`,
the singular handlers, and `AppBuilderCard` were deleted with their tests (no soft
deprecation); `addAppComponent` survived by becoming the keyed per-id add; the singular
`appState`/`meshState` fields remain legacy-read-only (manifests migrate on load), with a
guard test pinning the few allowed accesses.
