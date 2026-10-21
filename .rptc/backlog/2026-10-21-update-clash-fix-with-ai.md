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
