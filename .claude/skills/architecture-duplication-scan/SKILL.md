---
name: architecture-duplication-scan
description: Find competing / parallel implementations — two code paths that solve the SAME job for the SAME caller (a genuine fork left after a supersession). Use when a feature seems to have two models, you find a singular API beside a keyed one, or you're consolidating after a rewrite. Guided review, not a clean scanner — the signals are leads, judgment decides.
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
- A feature appears to have two models / two ways to do one thing.
- You find a singular API (`fooState`, `addFoo`) beside a keyed one (`fooComponents`).
- Consolidating after a rewrite or supersession — hunt the abandoned fork.

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

2. **Test each lead against the real bar** — an opportunity is real ONLY when TWO
   implementations solve the SAME job for the SAME caller (a genuine fork). Similar NAMES
   are not enough: `addAppComponent` and `addMeshComponent` add different things — not a fork.

3. **Confirm the fork** — trace both paths to a shared caller/entry and check the fork is
   live-but-redundant (both reachable) or leftover (one dead). `git log -S` on each side
   shows which superseded which.

4. **Resolve** — pick the surviving model, migrate any remaining callers to it, and DELETE
   the other outright (no `(Deprecated)` stub, no accepted-but-ignored path). Then rerun the
   dead-code-scan to sweep the orphaned symbols.

## Heuristics
- Same job + same caller = real fork. Same verb, different object = not a fork.
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

## Worked example (this repo — resolved in ADR-011 D3, 2026-07)
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
