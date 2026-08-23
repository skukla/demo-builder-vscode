# Step 05 — The Bodea round trip, live

**Gated on:** step 04. This is the proof, not a smoke test.

## The scenario

From [`../../backlog/2026-08-17-bodea-shared-catalogs-are-undifferentiated.md`](../../backlog/2026-08-17-bodea-shared-catalogs-are-undifferentiated.md):
Bodea's three shared catalogs assign the same 11 categories, so a catalog-driven nav renders
identically for every company. The differentiation is to drop `software`, `wi-fi` and
`critical-power-equipment` from ServerSavvy Solutions — keeping the structural `bodea` root
and `products` container in every catalog, since dropping a structural ancestor can hide its
children from tree queries, and leaving Default and Platinum Buyer untouched so the
tier-price demo stays unconfounded.

The user is applying the instance edits himself on a running Bodea-connected demo. This step
is the round trip back into a pack.

## The run

1. **Read the source rows.** `batch_get_datapack_items` against `bodea@main` for the
   shared-catalog types.
2. **Create the private pack.** `create_datapack` — `bodea-differentiated`, `shared: false`,
   an explicit version. **Never a new version of the shared `bodea`.**
3. **Write the edited rows.** The three category assignments removed from ServerSavvy
   Solutions; everything else carried across unchanged.
4. **Promote.** One commit, not one per row.
5. **Verify by import.** `validate_datapack_import`, then `start_datapack_import` onto a
   disposable scope, then confirm the differentiation survived — the three categories absent
   from ServerSavvy Solutions and present in Default.
6. **Every step driven through the skill**, from an agent in the project, not by hand. If a
   step needs a tool name the skill does not mention, that is a step-04 defect.

## What counts as passing

- The pack exists, is private, and imports cleanly.
- The imported instance shows differentiated catalogs.
- An agent given only the skill can reproduce it. **That** is the acceptance criterion —
  the loop existing is not the same as the loop being reachable.

## What this step does NOT prove

Route A. Export is still blocked at the service's store step, so a successful Route B round
trip says nothing about instance-first capture. Leave the skill's Route A gate in place
until an export succeeds against a configured endpoint.

## Write-up

Record the result in this plan directory. **Redact before committing** — this repo is
public and `.rptc/` is tracked: no colleague names, no internal endpoints or Runtime
namespace ids, no live activation/datapack/tenant ids. Keep the finding, drop the
identifier.

## Then

Move the plan to `.rptc/complete/datapack-authoring-loop/` and update the backlog index —
the item stays only while the work is live.
