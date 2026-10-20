---
id: AI-75
kind: feature
area: ai
parent: AI-1
needs: []
value: high
status: backlog
---

# An agent can look at the storefront it is changing, and judge the design

Filed 2026-10-20 from the owner's answer to AI-1a: "I do want agents to be able to help
with visual design feedback." AI-1a's reachability question is answered; this is the axis
it left open, and the reason the Bodea redesign was sequenced behind it (2026-08-24).

## What already exists (read 2026-10-20)

- EDS projects ship the Playwright MCP (`ai-defaults.json`, `requires: eds-storefront`),
  which drives the machine's own Chrome: an agent can open a page and take a screenshot.
- The scraping skills use it, `refine-visual-match` included, to compare a built page
  against a REFERENCE site.
- The block tools write and publish pages (`write_page`, `publish_page`) and read a
  block's authoring shape (`get_block_authoring_shape`).

## What is missing

The loop a designer runs: change a block's style or content, see it rendered on the
preview host, judge it against the brand and the rest of the page, change again. Nothing
teaches an agent that loop or gives it a judgement to make: `refine-visual-match` asks
"does this match that site", not "is this good, and on-brand".

## Questions for the design pass (lane 3: research and a plan first)

- Is this a generated skill (a design-review loop over Playwright) or a tool, by the
  AI-1l rule: a tool must remove work, not add vocabulary the agent has to guess?
- Where does "good" come from: the demo package's brand assets (`brandAssets`), the
  boilerplate's design tokens, the dropins' `list_design_tokens`?
- Desktop and mobile widths; before-and-after on the preview host without publishing live.
- What the SC sees: the screenshots, the agent's critique, or both.
