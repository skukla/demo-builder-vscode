---
name: circular-dependency-scan
description: Find import cycles — modules that import each other directly or through a chain (a → b → c → a). Use when init order feels fragile, a symbol is undefined-at-import, a refactor is blocked by tangled imports, or before extracting a module. Cycles cause load-order bugs and resist decomposition.
---

# Circular-Dependency Scan

Detect import cycles among the `.ts`/`.tsx` modules. Cycles hurt: they make **init order
fragile** (whichever module loads first sees the other half-initialized), cause
**undefined-at-import** bugs (a value is `undefined` because its module hasn't finished
evaluating), and **block refactors** (you can't move or lazy-load one file without the
other). This does NOT overlap `/sop-scan` (God files, complexity) — cross-reference that.

## When to use
- A symbol is unexpectedly `undefined` at module load, or init order feels fragile.
- A refactor / extraction is blocked because two files won't separate.
- Before extracting or moving a module — check you aren't formalizing a cycle.

## When NOT to use
- File-size / complexity smells — that is `/sop-scan`.
- A single missing import or a plain type error — that is `tsc`, not a cycle.

## Procedure

1. **Shortlist** the cycles:
   ```bash
   bash .claude/skills/circular-dependency-scan/scan.sh src
   ```
   Prints each circular chain, or "No circular dependency found".

2. **Classify** each cycle:
   - **Runtime value cycle** — modules import each other's functions/values/classes. High
     risk: init order and undefined-at-import bugs live here. Fix promptly.
   - **Type-only cycle** — the only edges are types/interfaces. Lower risk (types erase at
     compile), but still noise; convert to `import type` to drop the runtime edge entirely.

3. **Break** the cycle by the cheapest cut:
   - **Extract shared code to a leaf** — pull the types/util both sides need into a new
     module with no back-edge; both import the leaf, the cycle is gone.
   - **Invert one dependency** — pass the needed value in as a parameter / inject it, rather
     than importing back up the chain.
   - **`import type`** — if a runtime edge only carries a type, mark it type-only; the
     runtime cycle disappears with no code move.

4. **Re-run** the scan to confirm the chain is gone (and no new one appeared).

## Heuristics
- Cut at the weakest edge — the one import that's easiest to relocate or invert, not the
  whole chain.
- A leaf module of shared types/util is the durable fix; ad-hoc lazy `require()` hides the
  cycle without removing it.
- Type-only edges are safe to leave short-term, but `import type` costs nothing — do it.

## Output format
```
## Import cycles
### <n>-module cycle
- a.ts → b.ts → c.ts → a.ts
- Kind: runtime value  |  type-only
- Break: extract shared <X> to leaf <new-file>.ts  |  invert edge b→a via param  |  import type
```

## Worked example (this repo)
madge flags a 3-module runtime cycle in `src/features/app-builder/services/`:
`allowedDomain.ts ↔ ensureMeshApiSubscribed.ts ↔ appBuilderComponentRunnerDeps.ts`. The
three form a value cycle through their mutual imports. The fix is to lift the shared piece
each side reaches for into a leaf module (or inject it via `appBuilderComponentRunnerDeps`)
so the back-edge disappears — then re-run to confirm the chain is gone.
