---
id: PL-62
kind: feature
area: platform
needs: []
value: low
status: backlog
---

# Adding something is a card, everywhere

A card grid offers "add another" as a dashed card with a plus, at the end of the
grid — not as a button in the header. One pattern, one component, on every grid
where an SC adds to a set.

Owner decision, 2026-09-21, looking at the Integrations screen: a single API Mesh
card, a lot of empty grid, and the only way to add sitting as a blue "Add
integration" button in the corner. The demo-package gallery on
`feature/colleague-storefront` already does it the other way — "Add a demo
package" is a dashed card in the grid — and the owner chose that as the pattern
for all of them.

## Where "add" lives today

Measured 2026-09-21 across develop and `feature/colleague-storefront`:

| Surface | What adds | Today | Where |
|---|---|---|---|
| Wizard Welcome grid | a demo package | **dashed card** "Add a demo package" | `BrandGallery.tsx`, `add-demo.css` — colleague-storefront only, not on develop yet |
| AI surface, prompt library | a prompt | **dashed tile** "+ New prompt" | `PromptGrid.tsx`, `ai.css` (the `1px dashed` rule) |
| Your Projects | a project | accent **"New" button** opening a menu | `ProjectsDashboard.tsx` |
| Integrations | an integration | accent **"Add integration" button** | `IntegrationsScreen.tsx` (the `actions` entry) |

Two of the four already use a card — and they are **two separate implementations**
of it (`.add-demo-card` and the prompt tile's own dashed rule). That is the drift
this item ends: extract ONE shared add-card into `core/ui/components`, then move
all four onto it. `reuse-first` applies; add its row to
`src/core/ui/components/CLAUDE.md`.

Not in scope, deliberately: the "New" buttons in the wizard's **repository picker**
(`RepoSelectionInline.tsx`) and **Adobe project/workspace picker**
(`AdobeEntityFields.tsx`). Those are selection LISTS inside a step, not card grids;
a card there would be a different pattern. Say so in the item if that changes.

## What has to be decided while building it

These are why the button is not a one-line swap:

1. **A filter is on.** A card that is not an item cannot match a search. Hide it
   while a filter narrows the grid, or keep it last regardless? Whichever — the
   same rule on all four grids.
2. **Counts exclude it.** "1 integration" must not read as two cards.
3. **Your Projects' "New" is a MENU**, not a single action (it offers more than one
   way to start). The card then opens the same choices, or the card grid gains one
   card per way. Read the menu's items before choosing.
4. **Empty grid.** With nothing in it, is the add-card the whole empty state, or
   does the existing empty-state view stay with the card inside it?
5. **Keyboard and screen readers.** The card is a button: focusable, a real
   accessible name ("Add an integration"), and in tab order where the header button
   was.
6. **Remove the header buttons** it replaces — no "accepted but unused" leftover
   (no soft deprecation).

## Before it is done

- The demo-package card has to reach develop first (it lives on
  `feature/colleague-storefront`).
- `webview-visual-baseline` before and after: this moves layout on four surfaces,
  across at least three bundles (wizard, dashboard/integrations, projectsList,
  aiOverview).
- The agent surface is unaffected — adding is already a tool (`add_integration`,
  `create_project`, `save_ai_prompt`), not a button the agent presses. Say so in
  the commit.

Filed 2026-09-21.
