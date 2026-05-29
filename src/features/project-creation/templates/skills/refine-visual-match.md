---
name: refine-visual-match
description: Drives the iteration loop that closes the visual gap between the locally-rendered demo and the reference screenshots. Capped at 3 rounds with honest reporting of remaining deltas. Use after blocks have been authored and you need to tighten the visual match to demo quality.
---

# Refine the visual match against the reference

Use this skill after blocks have been authored (via `aem-block-developer` and the specialization skills) and the demo renders locally. Goal: close the visual gap against the reference screenshots captured by `scrape-reference-site`.

This skill applies to the **Playwright MCP workflow only**. If the scrape went through the Mod Agent, that web console handles its own conversational refinement; you don't need this skill.

## When to use

- Local dev server is running with the new blocks.
- `.scraped/<domain>/` contains the reference screenshots at 1440px and 375px.
- The first-pass render is in place and looks roughly right but has visible deltas.

## The iteration cap

**3 rounds maximum.** If you hit round 3 and the demo isn't where it needs to be, **stop iterating and report what's left**. Don't loop forever; don't quietly accept a worse result. Cap and report honestly.

The reason: chasing the last 10% of pixel-perfection can burn hours for marginal visual return. The demo audience cares about brand identity, layout structure, and major sections looking right. Sub-pixel spacing rarely matters at the demo bar.

## Loop structure

For each round:

### 1. Capture the candidate render

- Use Playwright MCP to navigate to the local dev server URL.
- Take a full-page screenshot at 1440px viewport.
- Take a full-page screenshot at 375px viewport.
- Save to `.scraped/<domain>/candidate-round-N.1440.png` and `.candidate-round-N.375.png`.

### 2. Compare against the reference

- Open both candidate screenshots and the corresponding reference screenshots.
- Compare section by section, not pixel by pixel.

For each section, classify the delta:

| Delta category | Examples | Iteration priority |
|---|---|---|
| **Brand identity** | Wrong primary color, wrong font, wrong logo placement | HIGH — fix in round 1 |
| **Layout structure** | Missing section, wrong section order, section split | HIGH — fix in round 1 |
| **Section presence** | Reference has hero+grid+CTA; demo only has hero+grid | HIGH — add the missing block |
| **Spacing scale** | Hero padding too tight, grid gaps off | MEDIUM — fix in round 2 |
| **Typography scale** | Heading weight too light, line-height off | MEDIUM — fix in round 2 |
| **Color shade variance** | Brand red is the right hue but slightly off saturation | LOW — accept or fix in round 3 |
| **Animation / motion** | Reference has a slide-in; demo is static | LOW — usually accept (EDS is static-first) |
| **Pixel-level positioning** | Element 4px lower than reference | LOWEST — usually accept |

### 3. Apply targeted fixes

For each HIGH/MEDIUM delta worth fixing:

- Identify the affected block (header, hero, product-grid, etc.).
- Apply the smallest CSS/JS change that addresses the delta.
- Don't restructure blocks mid-iteration; tune them.
- Save the changes; let the dev server hot-reload.

### 4. Decide whether to iterate again

After fixes are in:

- If remaining deltas are all LOW or LOWEST → **stop**. Demo quality is acceptable; report.
- If remaining HIGH/MEDIUM deltas → **iterate** (subject to the 3-round cap).
- If round 3 ends with HIGH deltas still present → **stop and escalate**. Tell the user honestly what the gap is.

## Reporting at the cap

When the loop ends (whether at round 1 or round 3), produce a final report:

```markdown
## Visual match report

**Reference**: <URL>
**Rounds run**: <N> of 3
**Final state**: <one-line summary>

### Resolved
- <delta 1 fixed in round X>
- <delta 2 fixed in round X>

### Accepted gaps
- <delta — why accepted (LOW priority, or animation that doesn't translate to EDS)>

### Remaining (if any HIGH/MEDIUM not resolved at cap)
- <delta> — proposed next step: <one-sentence>
```

Honesty here matters more than completeness. Demo audiences trust a "the brand is right, layout matches, hero CTA position is 12px off" report more than a silent ship with the 12px gap unmentioned.

## What NOT to do

- **Don't restructure blocks mid-iteration.** If a block has the wrong structure, fix it in the AUTHORING phase, not refinement.
- **Don't chase pixel-perfect.** EDS is static-first; some animations and complex interactions can't be replicated. Accept those at LOW/LOWEST.
- **Don't disable the cap.** Bypassing the 3-round limit means an unbounded loop. Trust the cap.
- **Don't paper over remaining gaps.** Report them. If round 3 didn't converge, that's a signal — maybe the block authoring needs revisiting, or this section needs a different approach.
- **Don't run this skill for the Mod Agent workflow.** Mod Agent has its own refinement loop in the web console; this skill is for Playwright-driven scrapes only.

## When delta survives the cap

If round 3 ends with a HIGH delta still present, the right move is one of:

- **Hand off to `aem-block-developer`** for a structural rewrite of the affected block.
- **Hand off to `commerce-block-mapper`** if the issue is a commerce drop-in customization ceiling.
- **Accept and document** if the delta is a brand-policy or licensing constraint (e.g., wrong font because the right one is paid).
- **Pivot the scrape approach** — if Playwright can't get the right output, the user may want to switch to the Mod Agent workflow for this page.

Whichever you choose, surface it explicitly. Don't quietly retry.
