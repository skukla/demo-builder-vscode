# Wizard integrations — share the dashboard card, hoist the destination

> **Shipped 2026-08-15** on `fix/wizard-integrations-parity`; archived here from
> `.rptc/plans/`. Gate green at the time of the move: whole-repo lint, both
> typechecks, and the full suite. Verified by `/rptc:verify-loop` (code-review +
> docs agents), whose findings are folded into the code — see "Verify-loop
> outcome" at the end.

> **Step 0 — RPTC re-initialization (ALWAYS FIRST on re-entry):** if context was cleared,
> re-invoke `/rptc:fix "Plan is approved, continue to implementation"`. Work happens in the
> worktree `…/demo-builder-vscode.worktrees/fix/wizard-integrations-parity` (branch
> `fix/wizard-integrations-parity`, created off `develop` @ `5d3cccf6`).

## Provenance

User compared the shipped dashboard integrations grid against the wizard's Integrations area
and asked for alignment. Triage found the question already had an answer on the record, and
that the answer had drifted from what shipped.

## What the record said, and what is true now

| Claim | State |
|---|---|
| Backlog item 6 (`2026-07-15-custom-integration-language-and-model.md`) — dashboard grid | **Shipped** (`.rptc/complete/integrations-grid/`, then re-hosted by `.rptc/complete/integrations-surface/`) |
| Item 6 — wizard "calm single-column list" | Shipped as `IntegrationResultRow` |
| Item 6 — "shared destination shown once" | **Never met.** The wizard repeats it per row |
| Full visual parity | **Explicitly rejected** — `integrations-surface/overview.md:97-105`, sourced to `prototype-integrations-wizard.html` |

The rejection's three reasons hold up under measurement:

1. **Width.** `.int-results` is capped at `max-width: 720px`; `.integrations-grid` is
   `repeat(auto-fill, minmax(240px, 1fr))`. A literal grid port yields 2–3 columns.
2. **Data.** Pre-deploy, every load-bearing dashboard card field is empty — `status`,
   `statusLabel`, `dotVariant`, `url`, `deployedUrls`, `lastDeployed`.
3. **Actions.** `IntegrationsGrid.handleAction` posts `deployAppBuilderComponent`,
   `removeAppBuilderComponent`, `openLiveSite`, `renameAppBuilderComponent` — none of which
   exist before a project is built.

The same document lists `IntegrationCard` and the card model as **"surface-agnostic"** and
carrying over. So the card is sanctioned for reuse; the grid, drawer, and live-action layer
are not.

**User decision (this session):** share the card, skip the grid and drawer.

## Goal

The wizard's Integrations area reads as the same card family as the dashboard, without
inventing status it does not have:

- one destination line for the surface, not one per row;
- the dashboard's `IntegrationCard` rendering each integration;
- edit and API changes routed to the Add-Integration modal that already exists.

## Design

### 1. Extract the card to `core/ui` (do not cross-import features)

`src/features/CLAUDE.md` forbids feature→feature imports, and `project-creation/ui/` currently
has zero of them. `reuse-first` prescribes the alternative: *"A peer FEATURE does the job,
shared does not → Extract to `core/ui`, then both use it."*

New `src/core/ui/components/integrations/`:

| File | Contents |
|---|---|
| `integrationCardModel.types.ts` | `IntegrationCardModel`, `CardAction`, `CardStatus`, `CommerceScopePart` — moved verbatim |
| `IntegrationCard.tsx` | Moved from dashboard, plus one new prop (below) |
| `IntegrationActionsMenu.tsx` | Moved from dashboard `IntegrationActions.tsx` |
| `index.ts` | Barrel |

The dashboard's `integrationCardModel.ts` **re-exports** the moved types under their existing
names and keeps every derivation function (`deriveIntegrationCard`, `deriveMeshCard`,
`buildIntegrationCards`, the matrices). Those depend on `useDashboardStatus` and
`@/features/app-builder/*` and are correctly dashboard-only. Existing dashboard imports and
their test suites keep compiling unchanged.

### 2. A new prop on the shared card

```ts
/** Replaces the status line. Omit for the dashboard's dot + statusLabel. */
subline?: React.ReactNode;
```

Rationale: the card has exactly one quiet line under the name. The dashboard wants
`StatusDot + statusLabel`; the wizard, which has no status, wants its source line. A single
optional slot gives the wizard control of its own content and leaves the dashboard render path
untouched by default — no emergent rule that depends on `statusLabel` never being empty.

Note: `IntegrationCard`'s docstring claimed it renders "a source line WHEN THERE IS ONE". It
did not — the JSX has head + statusline only, and a comment in `integrationCardModel.ts` says
so ("`statusLabel` and nothing else"). ✅ Corrected while moving the file.

(That comment was cited here by line number at planning time. The number was stale within the
same change — adding the type re-exports shifted the file — which is the half-life this repo's
own backlog README warns about. Cite the symbol or the quote, not the line.)

### 3. Wizard pre-deploy card derivation

New `src/features/project-creation/ui/components/integration-flow/integrationCards.ts` — pure,
React-free, mirroring `integrationRows.ts`:

```ts
export function toIntegrationCards(rows: IntegrationRow[]): IntegrationCardModel[]
```

| Model field | Pre-deploy value |
|---|---|
| `id`, `name` | from the row |
| `isMesh` | `row.kind === 'mesh'` |
| `sourceLine`, `sourceIsAi` | from the row (`kind === 'blank'` → AI) |
| `status` / `statusLabel` / `dotVariant` | `'not-deployed'` / `''` / neutral — never rendered; the wizard passes `subline` |
| `kindLabel` | A display label via `KIND_LABELS`, word-for-word the dashboard's. **Shipped as the raw kind enum and corrected in verify-loop iteration 2** |
| `urlLabel` | `'App URL'` — shape-satisfying; the wizard has no detail view to render a URL in |
| `menuActions` | `['manage-apis', 'remove']` for `blank`/`custom`; `['remove']` for `mesh`/`catalog` (deterministic APIs are not editable — the existing `isApiEditable` rule, one home) |
| `canRename` | `row.renamable === true` |
| `apis` | from the row |
| `url`, `deployedUrls`, `lastDeployed`, `commerceScope` | omitted |

### 4. The API count keeps its place

The row today carries a collapsible "APIs in use · N" list. The card family has no expander,
and the names are one click away in the picker (kebab → Manage APIs). **Decision: keep the
count in the subline, drop the inline expander** — losing an at-a-glance count would be a
regression; losing the expanded names is not, since Manage APIs shows them.

Subline reads: `{sourceLine} · {n} APIs`.

### 5. Destination, once

`DestinationContext` (`core/ui/components/ui/DestinationContext.tsx`) already exists, already
says in its own docstring that it renders "one line for the whole surface, never per card",
and is already used by `IntegrationsScreen` and `AddIntegrationFlowModal`. Use it above the
card list.

It returns `null` when either half is missing, so the needs-setup case keeps an explicit
branch: `Deploys to — Not set` + `Set up`, opening the modal in destination mode (unchanged
routing).

### 6. Deletions (no soft deprecation)

- `src/features/dashboard/ui/components/integrations/IntegrationCard.tsx` — moved
- `src/features/dashboard/ui/components/integrations/IntegrationActions.tsx` — moved
- `src/features/project-creation/ui/components/integration-flow/IntegrationResultRow.tsx` — superseded

## TDD steps (RED first; test files only during RED)

1. **Move the card to core.** Relocate `IntegrationCard.test.tsx` to
   `tests/core/ui/components/integrations/`, repoint imports, run it against the moved
   component. Behaviour-preserving: the existing assertions must pass **unedited** apart from
   the import path. Then add the `subline` cases (provided → renders it, no status line;
   omitted → dot + statusLabel exactly as today).
2. **`integrationCards.ts`** (pure). Matrix: every `IntegrationKind` → `menuActions`,
   `canRename`, `isMesh`, subline inputs; mesh/catalog get no `manage-apis`; API count.
3. **`IntegrationsStep`.** Destination rendered once (assert exactly one, both committed and
   needs-setup branches); one card per row; kebab Remove routes to the existing remove
   handler; Manage APIs opens the picker; rename affordance only on renamable rows. Port the
   surviving scenarios from `IntegrationResultRow.test.tsx`, then delete it with its component.
4. **CSS + index.** Wizard list styling reusing `.integration-card`; add the row to
   `src/core/ui/components/CLAUDE.md`.
5. **`gate`** — scoped jest, `tsc --noEmit`, `npm run typecheck:tests`, whole-repo `npm run lint`.
6. **Dev Host pass** — light/dark, the needs-setup and committed destination branches, kebab
   actions, inline rename, card hover/focus, and a stack with no mesh.

## Risks

- **Dashboard regression while moving the card.** Mitigated by step 1's rule: the existing
  suite passes with only its import path changed. Any assertion that needs editing is a
  behaviour change and must be justified, not absorbed.
- **`CardStatus = DisplayStatus`** is an alias over a shared vocabulary type; confirm where
  `DisplayStatus` lives before moving the alias, so `core/ui` does not end up importing from a
  feature.
- **Test-count pins.** Dashboard suites may pin handler/registry counts; moving files should
  not touch those, but check if a count assertion fails.

## Verification

Scoped jest per step → full `gate` before commit → Dev Host pass (step 6). Then update backlog
item 6 and the `.rptc/backlog/README.md` index to record the wizard half as done and to remove
the now-false "gated on D3" framing.

## Verify-loop outcome

`/rptc:verify-loop` ran the code-review and documentation agents over the change. **Four
iterations, 24 findings, all fixed. Stopped at iteration 4 by the user, not by convergence** —
see "Why it stopped where it did" below. Recorded because several are the kind that ship
silently: no test could fail, and no reviewer reading the diff alone would see them.

### Iteration 1 — 9 findings

The two that mattered were regressions this change introduced, both invisible to the suite:

1. **The keyboard focus ring died on every integration card, dashboard included.** Scoping
   the hover rule to `[role='button']` lifted `outline: none` to specificity (0,3,0), which
   out-ranks the (0,2,0) `:focus-visible` ring that had been winning on source order. There
   is no CSS coverage, so nothing failed. Fixed by giving the ring rule the same attribute
   selector, putting source order back in charge.
2. **`aria-label="ERP Sync, "`** on every wizard card — `statusLabel` is empty here, and
   `aria-label` REPLACES an element's text rather than falling back to it, so the dangling
   comma was the entire announcement. Now `statusLabel ? "name, status" : "name"`.

The rest: `apiLabel`/`API_LABELS` were dead once the row went (deleted with their suite);
three assertions queried `.integration-card-foot` / `.integration-card-src`, classes no
component renders, so they could not fail in either direction; a dead CSS rule for the same
class; two rules this change re-derived instead of reading (`needsSetup`, card openability);
four stale doc citations.

### Iteration 2 — 6 findings

3. **`KIND_LABELS` shipped untested.** Proven by reverting it to the raw enum and watching
   all 1004 suites stay green. That gap also hid the next one.
4. **`blank` was labelled `'Custom integration'` where the dashboard says
   `'Custom · blank starter'`.** Not cosmetic: the dashboard's wording is a deliberate
   refusal to say "built with AI", because a blank starter is an empty shell you build out
   later and the other phrasing describes the intended workflow as though it had happened
   (reported 2026-07-31). Aligned, and pinned by a test that asserts the phrase stays out.

Plus: a `?? 'mesh'` sentinel whose safety depended on which kinds happen to be editable
(replaced with a guard on the row); the barrel docstring omitting `isApiEditable`; a LIVE
backlog item naming the deleted `IntegrationResultRow` in the present tense.

### Iterations 3 and 4 — 9 findings, and one approved scope expansion

Iteration 3's code review came back CLEAN on the change, having verified the new tests by
MUTATION rather than by reading them: reverting `kindLabel` to the raw enum failed 5 tests,
and flipping the blank label to "built with AI" failed 2. It also cleared four things nobody
had examined — `sublineFor` with an undefined source, the `handleCardAction` early return,
`rowsById` staleness, and whether the async rename races `updateState` (it does not;
`commitRename` has no `await`, so React batches the write and the exit into one render).

**The scope expansion, approved by the user:** the same pass found that
`core/ui/components/forms/InlineRenameField` hardcoded `aria-label="New project name"`, so
renaming an INTEGRATION announced "New project name" — on the dashboard too, since the card
shipped. Pre-existing, and this change added a fifth consumer to it. Fixed with an optional
`label` prop defaulting to the original string, so the three project surfaces are byte-
identical and the two integration surfaces pass their own. That is the SECOND new prop this
change adds to a core component, alongside the card's `subline`.

Two things that fix taught, both recorded because they recur:

- **The test helper silently dropped the new prop.** `renderField` enumerated props by hand,
  so `label` never reached the component and the failure presented as "element not found",
  pointing at the implementation instead of the helper. It spreads now.
- **A count in prose is a claim, and it was wrong twice in a row.** The docstring said "two
  consumers"; corrected to four, which was still short — the detail panel is a fifth. It is
  now an enumerated list of five named files, verified against every `<IntegrationCard`-style
  render site rather than counted by hand. The docstring itself calls the count load-bearing,
  which is exactly why it had to stop being a number.

Iteration 4's documentation pass then caught three more, all in text carried forward without
re-reading it against the world it now describes: this section's own iteration count, the
absence of the a11y fix from this record, and a sentence in `integrationCardModel.types.ts`
claiming "the card typesets it in mono" — true of the detail panel, never of the card, moved
here verbatim from a file where it was already stale.

### Why it stopped where it did

Not a clean exit, and the distinction matters to anyone reading this later.

**Code review returned CLEAN on iterations 3 and 4.** Every finding after iteration 2 was
documentation. That is the real signal: the shipped behaviour was settled two passes before
the loop ended.

The loop was stopped deliberately rather than run to zero, because this section is
self-referential — it documents the loop, so every pass can correctly observe that it does not
yet mention that pass. Iteration 4 flagged exactly that (its findings C and D). Continuing
would have kept producing true findings about the record's account of itself while the code
stayed clean, which is motion, not convergence.

So: **treat the code as verified and this section as a snapshot taken at iteration 4.** If a
later pass finds something here understated, that is expected and cheap to fix; it is not
evidence the change is unsound.

### Visual verification

**Checked in the Extension Dev Host by the user before the release cut** (2026-08-15). That
covers the parts no suite reaches: the reduced card height in the 720px column, hover, the
keyboard focus ring, and dark mode. Worth noting because the focus-ring fix was argued from
CSS specificity rather than observed — reading a cascade is not the same as tabbing to a card,
and this is what closed that gap.

### Still open, deliberately

The wizard's blank-instance SOURCE LINE reads `Custom integration · built with AI`
(`integrationRows.ts`), which is the same wording the dashboard rejected in the 2026-07-31
report — and this change put it on the card face, where it is now more visible. It is
pre-existing wizard copy, and changing user-facing product language is a product decision,
so it was left alone rather than folded into a refactor. Worth settling.
