---
name: code-duplication-scan
description: Find copy-paste LOGIC duplication — the same non-trivial code block pasted across ≥2 sites that should be one shared function/module (Rule of Three). Use when reviewing for DRY violations, right after pasting a block you tweaked, or when asked "haven't we written this already?". The logic counterpart to component-extraction-scan (which covers UI markup).
---

# Code-Duplication Scan

Detect where the SAME logic is pasted across files and should collapse into one shared
function or module. This is the LOGIC counterpart to `component-extraction-scan`, which
covers duplicated UI markup — use that skill for JSX/CSS, this one for `.ts` logic. It does
NOT overlap `/sop-scan` (God files, complexity, mixed patterns) — cross-reference that.

## When to use
- Reviewing for DRY violations, or before a refactor.
- Right after pasting a block into a 2nd/3rd place and tweaking a value.
- Answering "haven't we written this already?".

## When NOT to use
- Duplicated UI markup / shared CSS classes — use `component-extraction-scan` instead.
- A block at only 1–2 sites where extraction adds a worse abstraction — apply Rule of Three.

## Procedure

1. **Shortlist** the mechanical signal:
   ```bash
   bash .claude/skills/code-duplication-scan/scan.sh src 8
   ```
   Runs jscpd (min 8 lines / 60 tokens) and prints each clone pair with both locations.
   Tests/specs are ignored. Raise the line floor (2nd arg) to focus on larger clones.

2. **Triage** each clone — extract ONLY when ALL hold:
   - **Genuine logic** — real behavior (parsing, validation, a transform), not incidental
     structural similarity (two switch statements that merely look alike).
   - **Same job** — the sites do the SAME thing, so one shared function truly serves both;
     divergent needs that happen to share shape do not.
   - **Rule of Three** — a 3rd occurrence justifies extraction; two may not yet.

3. **Confirm not a false positive** — jscpd flags these, none of which are targets:
   - Generated / vendored code, config maps, large literal tables.
   - Parallel test fixtures or data-driven cases (already `--ignore`d, but watch helpers).

4. **Extract** the shared logic into ONE function/module with a minimal signature — params
   model only what VARIES; import it at each former site and delete the copies.

## Heuristics
- Extract behavior, not coincidence: if two blocks would need different edits next month,
  they are not the same logic — leave them.
- One home: the shared function lives in the nearest common `core/util` or feature module,
  not duplicated as a re-export.
- Don't over-DRY: a helper with 6 flags to reconcile two callers is worse than two clear copies.

## Output format
```
## Code-duplication opportunities
### <what the block does> → <sharedFn>  (N sites, ~M lines each)
- Sites: src/a/foo.ts:20-33, src/b/bar.ts:88-101
- Extract to: src/core/util/<file>.ts  (params: only what differs)
- Skip (false positive): src/x/generated.ts — generated table
```

## Worked example (this repo)
Run against `src`, jscpd surfaces clone pairs across the feature services. The judgment is
per-pair: an identical validation/transform block pasted in three handlers is a real
extract-to-`core/util` opportunity; a pair that only shares a switch skeleton over different
domains is incidental and left alone. The scan lists candidates; Rule of Three decides.
