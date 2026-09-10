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
   - **A pair whose two ranges OVERLAP inside one file.** See below — this one is
     not a judgment call, it is arithmetic, and it costs hours if you miss it.

### The overlapping-range false positive (measured 2026-08-30)

A clone pair reported **within a single file** whose ranges overlap, and whose two
spans differ in length, is NOT duplication. There is nothing to extract, and reading
the file will not tell you that — the code looks repetitive because it *is* uniform.

Check it mechanically before opening anything:

```python
a, b = c['firstFile'], c['secondFile']
overlap = a['name'] == b['name'] and not (a['end'] < b['start'] or b['end'] < a['start'])
mismatched = (a['end'] - a['start']) != (b['end'] - b['start'])
# overlap and mismatched  ->  false positive, skip it
```

The confirming test, which needs no interpretation: strip all whitespace from the file
and from the reported `fragment`, then count occurrences. **Real duplication yields ≥2.
This class yields exactly 1.**

**Why it happens** — established by experiment, not inferred: a file of N tests that
share one skeleton and differ only in their literals has a *periodic* token stream, so
a long window matches the same stream shifted by roughly one test block. A synthetic
file of 30 structurally identical, textually distinct tests (every name, id and string
different — zero copy-paste available to remove) reproduces the signature exactly: one
self-clone, overlapping ranges, mismatched spans. So this fires on uniform test files
by design; it is not a jscpd bug and there is no threshold that fixes it.

This cost a real detour. A duplication sweep across `tests/` reported 15 self-clones;
12 were genuine and were extracted, and the last 3 — the three LARGEST, at 251, 178 and
344 reported lines — were all this. They were queued as "large, likely whole-test-body
duplication needing care". They were nothing at all.

**The general lesson, and the fourth instance of it in this codebase:** a count of
what code LOOKS like is not a count of what is WRONG with it. Before working a scan's
worklist, confirm the metric measures the defect you intend to fix.

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
