---
id: EDS-57
kind: feature
area: eds
needs: []
value: high
status: active
---

# A storefront update that stops on a clash can be fixed with AI, from the builder

Filed 2026-10-20, owner: "how does an end user resolve it with nothing but the builder? Or
is this an edge case?", then "Should be Fix with AI (and defer to the chosen AI engine)",
and "no SCs are comfortable with code". Plan:
`.rptc/plans/update-clash-fix-with-ai/`.

## Why

A template update (the colleague's changes) or the Adobe boilerplate update (EDS-56) is a
3-way apply in a throwaway clone. When a file clashes with an edit in the storefront, the
clone is wiped and deleted and the SC is left with a sentence naming the files. The
template row can only "Reset to template" (losing the edits) or keep the storefront as it
is; the Adobe row has no choice at all. Nothing an SC who does not read code can use.

## Measured 2026-10-20

- JustRite (`skukla/kukla-justrite`, from `kmanns/justrite`), Adobe 71a67e0 to the tested
  48bed04: one clash, `blocks/header/header.js`, with the update's own keep-list (the
  label sheets under `placeholders/` are already left alone; without that list a second
  clash appears in `placeholders/checkout.json`). The clash is about 10 lines: Khalil's
  AEMY Studio edit tags the "Request a Quote" nav item, Adobe adds accessibility
  attributes to the line above. Keeping both is correct.
- Adobe changed `blocks/header/header.js` 21 times in the year to 2026-10-20 (in 7
  different months) in `adobe-commerce/boilerplate-b2b-template`, and `scripts/scripts.js`
  20 times. Both of Khalil's AEMY Studio commits touch only the header. So: rare today
  (nothing is pending for Bodea or the canary), recurring whenever Adobe ships.

## Decided (owner, 2026-10-20)

- One way to fix a clash: **Fix with AI**, opening the SC's chosen engine
  (`demoBuilder.ai.engine`), never naming one.
- No "fix it myself": no SC is comfortable with code, so a conflict-marker editor is not
  an option for them.
- The other ways out never involve code: "Leave it as it is" (nothing changes, the update
  stays offered), and on the colleague's row "Reset to template" as today.
- Whether the Sync Storefront button stays is its own question: EDS-58.

## Shipped so far

- 2026-10-20  feat(updates): a storefront's local copy is brought up to GitHub after an update (`d5e06e558`)
- 2026-10-20  docs(backlog): plan Fix with AI for a storefront update that clashes (`cc90205fe`)
- 2026-10-21  Built steps 1-5 on feature/update-clash-fix-with-ai: local copy refresh, keep the clash, the three-way question, Fix with AI opening the chosen engine, finish_storefront_update with its checks, Sync Storefront refusal. Not yet run live: release test plan rows 1.19 (JustRite, owner present) and 1.20.
- 2026-10-20  feat(updates): a kept clash is offered as a Finish row (`89ce669a2`)
- 2026-10-20  feat(updates): Fix with AI opens the chosen AI on a kept clash (`97cf24324`)
- 2026-10-20  feat(ai): finish_storefront_update finishes a clash fixed with AI (`5db61f426`)
- 2026-10-20  feat(updates): a clash fixed with AI can be finished, or left (`953b67c02`)
- 2026-10-20  feat(eds): Sync Storefront refuses while an update's clash is kept (`67c2cfb1b`)
- 2026-10-20  feat(updates): a clashing update asks Fix with AI, Leave it, or Reset (`72d063ae4`)
- 2026-10-20  feat(updates): a stopped update's clash can be kept in the local copy (`fc1345248`)
