# Step 04 — Connection and Business Structure inside the Commerce tab

**SHIPPED 2026-08-11.** Notes below are the as-built record; the two items marked
DONE differ slightly from what was planned, and the differences are the point.

Depended on 02 (03 was dropped). The only step with real design content.

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

1. **DONE.** Render the Commerce tab body as two `ConfigSection`s — "Connection" and
   "Business Structure" — using `filterGroupsForSection`.

   Two things the plan did not anticipate:

   - `filterGroupsForSection` lived in `features/project-creation`, and Configure is in
     `features/dashboard`. Features do not import each other, so the splitter moved to
     `features/components/config/storeFieldHelpers.ts` — beside the field predicates it
     already used, and a module both surfaces already depend on. It is generic over
     `{ id, fields: [{ key }] }` because the two surfaces have structurally identical but
     separately declared `ServiceGroup` types.
   - `ServiceGroupList` could not be reused: it keys each `ConfigSection` by `group.id`,
     and both halves share one id here. `ConfigSection` is used directly instead — which
     is what `ServiceGroupList` itself does, so no chrome is re-implemented.
2. **DONE, and it fixed the wizard too.** `ADOBE_COMMERCE_ADMIN_URL` is in a connection
   group but is neither a `CONNECTION_FIELD` nor a store code, so the wizard rendered it
   nowhere.

   Rather than special-casing it, the `connection` predicate flipped from a membership
   test (`CONNECTION_FIELDS.has(key)`) to a negation (`!isStoreCodeField(key)`). Every
   field in a connection group now lands in exactly one sub-section by construction, so
   no future field can be orphaned the same way. Pinned by
   `tests/features/components/config/storeFieldSections.test.ts` — "every field lands in
   exactly one section — no orphans, no duplicates".

   Because the splitter is shared, the wizard picked the fix up as well.
3. **DONE.** The store cascade is untouched. `renderFieldRow` receives the ORIGINAL
   group, never a relabelled one — `StoreSelectionRow.getFieldKeys` and the disclosure
   gate both branch on `group.id`, so a synthetic `connection` id would have orphaned the
   pickers. Pinned by a test asserting every row still receives `adobe-commerce`.

4. **ADDED, not planned.** Business Structure is hidden until store discovery can run.
   Its fields already render `null` before then (StoreConfigFieldRow's own gate), so the
   split would otherwise have put a heading above nothing. Gated on the same
   `autoDetectKey` the fields use, so heading and content appear together.

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
