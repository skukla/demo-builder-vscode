# Block authoring has no oracle — the type scale exists and nothing points at it

> ## TIER 1 SHIPPED 2026-08-23 — now gated on field feedback
>
> The guidance exists in three places (AI bundle v18): AGENTS.md's Storefront
> section carries the standing rule (read the `--type-*` properties in
> `styles/styles.css`, style text with `font: var(--type-…)`, never invent a
> size, and don't copy from the inconsistent neighbouring blocks);
> `commerce-block-mapper` maps a scraped type scale ONTO the shipped properties
> instead of raw values; `refine-visual-match` fixes typography deltas by
> editing the scale or snapping to it, never by nudging literals. Phrased as
> "read the properties" per this item's own constraint — no token list to rot.
>
> **What remains is the MEASURE step, and it needs the field:** the failure was
> inferred from mechanism, never observed (no Claude-authored block existed to
> inspect). Next "fonts are too small" complaint — or next authored block —
> check whether its CSS uses `var(--type-…)`. If the complaint recurs WITH the
> guidance in place, tier 2 (a Playwright `getComputedStyle` check) is the next
> step, bounded so it does not become a fourth iteration loop.

## Provenance

Asked 2026-08-13: "Should Playwright also verify EDS block appearance? I often get complaints
that fonts are too small, and Claude spins a lot trying to create the blocks. Would Playwright
help? Or a tool like SLICC?"

Researched the same day. **The tool is not the problem**, and the answer changed the question.

## The mechanism, measured

1. **Every generated storefront ships a complete type scale.** `styles/styles.css` in
   `aem-boilerplate-commerce` defines **36 `--type-*` custom properties** —
   `--type-display-1-font` through `--type-body-2-*`, each a full `font` shorthand with size
   and line-height (`normal normal 300 1.6rem/2.4rem …`), plus matching letter-spacing.
   Verified against a real generated project.
2. **No generated skill mentions them.** Zero hits for `--type-`, `type-headline`, `type-body`
   or `type-display` across `templates/skills/`. Control: "design token" appears in two of
   those skills, so the files are being read — the absence is real.
3. **So an agent authoring a block picks sizes by eye.** It has no reason to know the scale
   exists.
4. **`refine-visual-match` cannot correct it.** Its "When to use" requires
   `.scraped/<domain>/` reference screenshots. Outside the scrape flow there is no reference,
   so there is no oracle and no loop.
5. **The result is unbounded iteration against taste** — which is exactly "Claude spins a lot",
   and exactly what the skill's own 3-round cap exists to prevent when a reference IS present.

## Why Playwright is not the question

**Playwright already does visual verification.** `refine-visual-match` drives it: navigate to
the local dev server, full-page screenshot at 1440px and 375px, classify deltas by priority
(brand identity and layout structure fixed in round 1), stop at 3 rounds. The browser is
installed, wired, and drift-detected.

Adding a browser tool cannot fix a missing standard. **The gap is the oracle, not the
instrument.**

## Why not SLICC

Already evaluated and ruled out on 2026-05-28 — see
[`2026-05-28-eds-site-scraping.md`](2026-05-28-eds-site-scraping.md): *"third-party,
LLM-key BYOT configuration friction incompatible with Demo Builder's auto-install philosophy;
Playwright MCP with stored auth state covers the auth-wall case more cleanly."*

**Caveat worth stating:** that assessment was scoped to SCRAPING. The BYOT-key objection and
the auto-install argument both still apply to a verification use, but nobody has assessed it
for that specifically. If this item's cheap fix fails, re-assessing SLICC for verification is a
legitimate second question — do not treat the 2026-05-28 note as having closed it.

## The likely fix, cheapest first

**Tier 1 — tell the agent the scale exists.** A section in the block-authoring skills naming
the `--type-*` tokens and requiring `var(--type-headline-1-font)` over a hand-picked
`font-size`. If the complaint is "the agent invented 14px", this alone may end it, and it costs
one skill edit.

**Tier 2 — make it checkable.** Playwright can read `getComputedStyle` from the rendered block.
That turns "the fonts look small" into an assertion: *this `h2` computes to 14px; the scale
says `--type-headline-1-font` is 2.4rem*. Mechanical, bounded, and it needs no reference site —
precisely the case that has no oracle now.

**Tier 3 — only if 1 and 2 fail.** Re-open the tool question.

Do tier 1 first and measure. Building a computed-style verifier for a problem that a paragraph
of guidance would have solved is the expensive way round.

## What could NOT be measured, and must be before building

**No Claude-authored blocks were available to inspect.** The generated project on this machine
has no `.scraped/` and its 83 block directories are all boilerplate. So the failure mode is
inferred from the mechanism, not observed. **Step 1 is reproducing it**: author a block from a
plain description and look at what font-size lands in its CSS.

**The boilerplate itself is not consistent**, which weakens "just follow the convention": of 83
shipped block stylesheets, 13 use `var(--type-*)` and 6 hardcode a `font-size` (`tabs`,
`product-teaser`, `hero-v2`, `carousel`, `product-list-page`, `header`). An agent reading
neighbouring blocks for the house style will find both. That may itself be part of the answer —
the examples in front of it disagree.

## Constraints

- Skill-template changes are generated content: `AI_CONTEXT_VERSION` must be bumped, which
  re-prompts every existing project. Batch with other bundle work — see
  [`2026-08-13-tier-the-ai-bundle-refresh.md`](2026-08-13-tier-the-ai-bundle-refresh.md).
- The type scale belongs to `aem-boilerplate-commerce`, not to us. Naming specific tokens in a
  skill couples the bundle to that template's vocabulary; if it re-versions, the guidance rots.
  Prefer "read the `--type-*` properties in `styles/styles.css` and use them" over hardcoding a
  list of 36 names.
- Tier 2 must not become a fourth visual-iteration loop. `refine-visual-match` already caps at
  3 rounds for good reason.

## Kickoff prompt

> Read `.rptc/backlog/2026-08-13-block-authoring-has-no-type-scale-oracle.md`. Step 1 is
> reproducing the failure — author an EDS block from a plain description and look at whether
> the CSS uses `var(--type-*)` or an invented `font-size`. The whole item rests on that, and it
> was inferred rather than observed. If it reproduces, try tier 1 (tell the skills the scale
> exists) and measure before building anything that reads computed styles.
