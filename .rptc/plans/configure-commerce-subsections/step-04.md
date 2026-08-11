# Step 04 — Connection and Business Structure inside the Commerce tab

Depends on 03. The only step with real design content; also the only one that can be
dropped without leaving the rail half-changed.

## Why

The PaaS Commerce tab holds **eight** fields with no internal structure: three URLs (one of
which silently auto-derives from another two rows above it), two credentials, and the
three-picker store cascade. The ACCS tab holds four.

It also changes size invisibly. Until `autoDetectKey` resolves, every non-connection field
in a store group returns `null` (`StoreConfigFieldRow.tsx:83-86`), so the Commerce tab grows
from five fields to eight as credentials are filled. Nothing in the rail signals that.

The wizard already names this split — Connection and Business Structure — and the field
sets already exist as `CONNECTION_FIELDS` and `isStoreCodeField`
(`storeFieldHelpers.ts:36-50`), now reachable through `filterGroupsForSection` in
`features/project-creation/ui/components/commerceSectionValidity.ts` (extracted during the
PaaS deadlock fix, 2026-08-10).

## Sub-sections, not tabs

Configure is an edit surface for an existing project. Every tab is deliberately always
reachable (`configureSections.ts:181-188` marks every non-active tab `done`), and there is
no lock vocabulary. Two tabs would either import the wizard's gating — the thing that
deadlocked PaaS — or be two tabs with no ordering, which is worse than two headings.

So: one Commerce tab, two labelled sub-sections stacked in it. `ConfigSection` already
renders a labelled block with an optional divider and is used for exactly this.

## Change

1. Render the Commerce tab body as two `ConfigSection`s — "Connection" and "Business
   Structure" — using `filterGroupsForSection` to split the group's fields.
2. Handle the field that belongs to **neither**: `ADOBE_COMMERCE_ADMIN_URL` is in a
   connection group but is neither a `CONNECTION_FIELD` nor a store code, so the wizard
   renders it nowhere. Configure must not inherit that hole — give it a home (Connection is
   the honest one) or the field disappears from the only surface that still shows it.
3. Keep the store cascade exactly where it is. It renders at the website-code field's
   position inside Business Structure, which is where it already logically sits.

## Do not

- Do not add locks, `lockReason`, or ordering between the sub-sections.
- Do not touch `useSelectedComponents` / `useComponentConfig`. Converging those is the
  deferred work this plan explicitly avoids (`overview.md` → Out of scope).
- Do not reuse `ConnectStoreStepContent` itself — same reason.

## Tests

- PaaS Commerce tab renders two labelled sub-sections with the right fields in each.
- `ADOBE_COMMERCE_ADMIN_URL` renders somewhere — the regression this step could
  accidentally introduce.
- ACCS Commerce tab: same two sub-sections, its four fields split correctly.
- Progressive disclosure still applies — before `autoDetectKey`, Business Structure is
  empty or hidden, and Connection is unaffected.
- The store cascade still writes the right three env keys (it branches on `group.id`,
  which this step does not change — control that it still does).

## Done when

- The Commerce tab reads as two named tasks, not eight fields
- No field is orphaned by the split
- No lock vocabulary entered Configure
- `gate` green
