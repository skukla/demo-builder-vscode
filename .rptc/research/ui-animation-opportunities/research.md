# UI Animation Opportunities — research pass

**Date:** 2026-06-26
**Scope:** Subtle, tasteful motion to improve the wizard UX (Build Your Project + dashboard). Reuse the existing CSS-driven vocabulary; expand where motion aids comprehension, not decoration.
**Constraint:** No JS animation libraries (the app is pure CSS + class-toggle orchestration); keep it that way. Every addition must honor the global reduced-motion reset.

## Status — shipped 2026-06-26
Starter set implemented. **Two research claims were wrong** (based on truncated reads) and are corrected here:
- §5 P2 #4 "finish the main wizard step transition" — it was **already implemented** (`.step-content.transitioning.forward/backward` translateX + opacity in WizardContainer). No work needed.
- §3 #3 the modal `.forward` rule was **not** an empty stub — it has `translateX(-20px)` (and `.backward` +20px). No work needed.

Delivered: motion tokens (`--db-motion-*`), sub-step view crossfade (`.step-view-anim` keyed on the active sub-step, reusing `fadeInUp`), summary ✓ pop (`sum-check-in`), the `fadeIn` dedupe (renamed the shadowed slide variant to `fadeInDown`, which **restored** the brand-card architecture slide), and a shared **`useEnterExit`** hook extracted from TimelineNav (which now uses it) and reused by the sub-step strip. The strip is **enter-only** (reveal animates; removal is instant — a lingering exit read as click lag), unlike the timeline which keeps enter+exit.

---

## 1. What we already have (inventory)

All motion is CSS — no framer-motion / react-spring / react-transition-group. Orchestration is JS class toggles (`enteringSteps`/`isExiting` in TimelineNav, `transitioning` on the modal, `isTransitioning` in WizardContainer).

| Keyframe / pattern | File | Motion | Used by |
|---|---|---|---|
| `timeline-enter` / `timeline-exit` | custom-spectrum.css:1812/1832 | opacity + max-height + margin, 0.3s ease-out | rail step rows appearing/collapsing (area children) |
| `modal-step-content` crossfade | custom-spectrum.css:1461 | opacity + translateX, 0.2s | ArchitectureModal step ↔ step (has a **stubbed empty `.forward`** rule) |
| `fadeInUp` | custom-spectrum.css:3321 | opacity + translateY(4px) | (defined; light use) |
| `org-context-fade-in` | custom-spectrum.css:2012 | opacity + translateY(-4px) | org-context banner "drops in" |
| `slide-down` | custom-spectrum.css:1679 | reveal | disclosure |
| `fadeIn` | index.css:152 **and** custom-spectrum.css:1239 **and** :1381 | opacity | **defined 3×** (dupe) |
| `pulse`, `spin`, `loading-overlay-spin` | index.css / wizard.css / custom-spectrum.css | loaders | spinners / overlays |
| `timeline-step-tooltip-fade` | custom-spectrum.css:855 | tooltip | collapsed-rail tooltips |
| progress-bar fill | custom-spectrum.css | width 0.3s | prerequisite progress |
| prerequisite status icon | custom-spectrum.css | opacity/transform/color | check results |
| hover transitions | `.choice-card` (0.15s), `.vsteplist-step` (0.15s) | bg/color | cards + sub-step tabs |

**Durations in use:** 0.15s (hover), 0.2s (crossfade), 0.3s (entrances/progress). All inline literals — **no motion tokens.**

## 2. Discipline already in place (preserve it)

- **Global reduced-motion reset** (reset.css:66) zeroes ALL animation/transition durations under `prefers-reduced-motion`. New *CSS* animations are auto-covered. ✅
- Targeted `prefers-reduced-motion` blocks for `.vsteplist-step` and `.choice-card`.
- **Implication:** any JS-driven motion (e.g. the new `scrollIntoView` in VerticalStepList, future class-toggle fades) must independently respect reduced-motion — the CSS reset doesn't reach `scrollIntoView({behavior})` or JS timing.

## 3. Foundation cleanup (do first — enables consistent expansion)

1. **Motion tokens** in tokens.css: `--motion-fast: 150ms`, `--motion-base: 200ms`, `--motion-slow: 300ms`, `--motion-ease: cubic-bezier(0.2, 0, 0, 1)` (Spectrum-ish ease-out). Replace inline literals as touched. One source → consistent, tunable.
2. **Dedupe `fadeIn`** (3 definitions → 1 canonical in custom-spectrum.css; delete the others).
3. **Resolve the empty `.modal-step-content.transitioning.forward`** rule — either implement the directional slide or delete the stub.

## 4. Principles for this app

- **Purposeful, not decorative** — animate state *changes* (step swap, completion, reveal), never idle elements.
- **Fast** — 150–250ms; entrances ≤300ms. Anything slower feels laggy in a tool.
- **Transform + opacity only** — GPU-friendly; avoid animating layout (width/height/top) except the existing max-height rail collapse.
- **One thing at a time** — don't stack a fade + slide + scale on the same element; pick one.
- **Always reduced-motion safe.**

## 5. Opportunities (prioritized)

### P1 — high value, low effort, direct reuse
| # | Opportunity | Where | Reuse | Effort | Notes |
|---|---|---|---|---|---|
| 1 | **Sub-step view crossfade** — fade/slide-up the `.step-view` body when the active tab changes (instant swap feels abrupt now that the strip is the focal point) | Build areas (Commerce/Storefront/Integrations) | `fadeInUp` keyed on `activeStep`, or the `modal-step-content` crossfade pattern | S | Key the view container on the active id so React remounts → CSS entrance fires. Covered by reduced-motion reset. |
| 2 | **Summary completion feedback** — when a `.sum-row` flips to done (✓ + value appear), fade+slide it in | "Your project" summary | `org-context-fade-in` (opacity + translateY(-4px)) on `.sum-row.done .sum-check` + `.sum-value` | S | Subtle reward as each sub-step completes. |
| 3 | **Active-tab underline transition** — the strip's bottom underline eases in/position rather than snapping | sub-step strip (`.vsteplist-step.active`) | transition on the underline; or a shared sliding indicator (medium) | S (fade) / M (true slide) | Start with fade-in of the underline; a sliding shared indicator is a nicer-but-bigger follow-up. |

### P2 — medium value/effort
| # | Opportunity | Where | Reuse | Effort | Notes |
|---|---|---|---|---|---|
| 4 | **Finish main wizard step transition** — `isTransitioning` + `TIMEOUTS.STEP_TRANSITION` already exist but aren't wired to a visible crossfade/directional slide; the `.forward` hook is stubbed | WizardContainer step container | `modal-step-content` crossfade (+ directional translateX for forward/back) | M | Makes Continue/Back feel connected step-to-step. Reuses an existing half-built hook. |
| 5 | **Dot completion pop** — when a timeline dot becomes completed, a small scale-in on the ✓ | TimelineNav dots | new tiny `scale(0.6→1)` + opacity keyframe | S–M | Tasteful "checked" confirmation; keep ≤200ms, ease-out. |
| 6 | **Card hover lift** — `.choice-card` / brand cards: add `translateY(-2px)` + slightly stronger shadow on hover | choice/brand cards | extend existing `.choice-card` transition | S | Already transition bg; add transform. Reduced-motion block already exists for choice-card. |

### P3 — polish / later
| # | Opportunity | Where | Notes |
|---|---|---|---|
| 7 | **List entrance stagger** — repo list / picker / block-library items fade-up staggered on load | RepoSelectionInline, BlockLibraries | `fadeInUp` + per-item delay; cap stagger so it doesn't drag |
| 8 | **Connector "draw"** — the rail's dotted connector animates downward as a step completes | TimelineNav connector | higher effort (animate gradient/clip); low priority |
| 9 | **"Not set" → value crossfade** in the summary | summary rows | micro; folds into #2 |

## 6. Anti-patterns to avoid

- No bouncy/springy easings or >300ms — reads as toy-like in a setup tool.
- No animating the SETUP PROGRESS rail position or the summary column on every keystroke.
- No simultaneous multi-property stacks on one element.
- Don't reintroduce per-step layout (height) animation beyond the existing rail collapse.

## 7. Recommended starter set (smallest set, biggest lift)

1. **Foundation:** motion tokens + dedupe `fadeIn` + resolve the `.forward` stub (§3).
2. **P1 #1 — sub-step view crossfade** (the new strip's companion; biggest perceived-polish win).
3. **P1 #2 — summary completion feedback** (rewards progress; ties the summary to the strip).
4. **P2 #4 — finish the main step transition** (the hook already exists; completes the Continue/Back feel).

That set is all reuse + small new CSS, fully reduced-motion-safe, and touches the exact surfaces we just rebuilt. P1 #3 (sliding underline), P2 #5 (dot pop), and P2 #6 (card lift) are good fast-follows.

## Open questions
- Sub-step swaps: plain **crossfade** (calmest) vs **directional slide** (forward/back conveys direction)? Recommend crossfade for sub-steps, directional only for the main wizard steps (#4).
- Underline: ship the simple fade now, or invest in the shared sliding indicator?
