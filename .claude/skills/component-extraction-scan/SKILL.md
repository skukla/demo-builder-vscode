---
name: component-extraction-scan
description: Find component-extraction opportunities — the same hand-written markup / shared CSS class rendered across ≥3 sites with no owning component (Rule of Three). Use when reviewing UI for duplication, right after writing a 3rd near-identical card/row/tile/badge, or when asked "should this be a component?" / "why are we editing CSS instead of a component?". The inverse of the SOP scan's God-file / oversized-component checks.
---

# Component-Extraction Scan

Detect where the SAME UI markup is hand-written across enough places to deserve a shared component. The SOP scan flags components that are too BIG; this flags markup that is too DUPLICATED — the other half of "right-sized component".

## When to use
- Reviewing UI / webview code for duplication, or before a UI refactor.
- Right after writing a 3rd near-identical card / row / tile / badge / pill.
- Answering "should this be a component?" or "why edit CSS instead of a component?".

## When NOT to use
- Non-UI duplication (logic/util) — that is ordinary DRY; use judgment, not this skill.
- A pattern at only 1–2 sites — YAGNI; wait for the 3rd (Rule of Three).
- A class already owned by a shared component — the component IS the abstraction; its
  class legitimately appears wherever the component renders.

## Procedure

1. **Shortlist** the mechanical signal — CSS classes rendered as raw markup across many files:
   ```bash
   bash .claude/skills/component-extraction-scan/scan-classnames.sh src 3
   ```
   Prints each class token used in ≥3 `.tsx` files, most-used first, with the files.
   Utility/layout classes (Tailwind-ish, flex/grid/spacing) are filtered out — they are
   meant to be reused and are never candidates. Caveats: matches double-quoted
   `className="…"` only (misses `className={cn(...)}` / template literals), so treat a
   low count as a floor, not a ceiling.

2. **Triage** each candidate — it is a real opportunity ONLY when ALL hold:
   - **Hand-written, not componentized** — the sites render the class inline
     (`<button className="foo">…spans…</button>`), NOT through a shared `<Foo>`. If a
     component already owns it, skip (or, if a few raw stragglers remain beside an owner,
     the action is "migrate the stragglers", not "create a component").
   - **Near-identical structure** — the surrounding JSX shape repeats (same element +
     child spans/props), not just an incidental shared class on unrelated markup.
   - **≥3 distinct sites** (Rule of Three). Two is not yet enough.

3. **Confirm no owner** — check whether a component already renders the class family
   (`grep -rln 'className="foo"' src` and look for a `Foo.tsx`). A base class with sibling
   children (`foo`, `foo-name`, `foo-note`) rendered raw at 3+ sites is the strongest signal.

4. **Recommend** — for each real opportunity, propose a component with a MINIMAL prop API:
   props model only what VARIES across sites (label/name, description, variant, selected,
   disabled, note, handlers); everything identical becomes internal markup. The component
   OWNS its `.foo*` CSS classes — callers pass props and never reference the classes.

## Heuristics
- Props = what DIFFERS between sites. Everything identical is internal.
- Variants (`row`/`tile`, `selected`, `disabled`) are props, not CSS classes callers must know.
- CSS still exists — it becomes an implementation detail of ONE component instead of scattered.
- Don't over-abstract: if the 3 sites diverge more than they share, a component with 8
  props is worse than 3 tailored blocks. Extract only the genuine common shape.

## Output format
```
## Component-extraction opportunities
### <class-family> → <SuggestedComponent>  (N sites)
- Sites: fileA.tsx, fileB.tsx, fileC.tsx
- Proposed API: <Component {name, description?, variant?, selected?, disabled?, note?, onSelect?}>
- Owns: .foo, .foo-name, .foo-note
- Migration: all now  |  new site + migrate <ExistingRawSite> next (incremental)
```

## Worked example (this repo)
`.choice-card` was hand-written at three sites — the Commerce backend picker (`BackendCard`),
the block-libraries step, and the add-integration flow — with no owner. Extracted `ChoiceCard`
(`variant: 'row' | 'tile'`, `selected`, `disabled`, `note`, `onSelect`) which now owns the
`.choice-card*` classes; callers pass props. After extraction the scan no longer lists
`choice-card` at ≥3 (only the two not-yet-migrated sites remain) — the shortlist tracks the fix.
