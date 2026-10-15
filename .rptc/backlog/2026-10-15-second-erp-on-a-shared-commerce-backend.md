---
id: AB-78
kind: feature
area: app-builder
needs: []
value: med
status: built
---

# One Commerce instance runs one ERP integration

Filed 2026-10-15, from the release-candidate test walk.

## What the SC did

The SC created a new Demo Builder project, with its own new Adobe I/O project, and
pointed it at the Commerce backend that another project already uses. That other
project (Justrite) has the ERP integration installed, with its own companion ERPs.
The SC then added an ERP integration to the new project.

The add failed for a different reason (fixed in `4abfcf1d7`: the add ran in the
cached Adobe project, Justrite's, instead of the one the SC had just chosen). That
failure hid the real question this item asks.

## The question

1. **Is it possible?** Can Commerce hold two installs of the ERP integration at
   once, each from a different Adobe I/O project? The ERP plan says Commerce holds
   one install per store. Nobody has checked that since each copy got its own
   app id (`fix/per-copy-app-id`, `fix/first-copy-commerce-app-id`).
2. **If yes, what should the Commerce Admin show?** Two "ERP Integration" menu
   entries? Two sets of order-grid columns? Two webhook sets on the same events,
   where a failing one breaks the cart for both (webhooks run as required on the
   sandbox)? Two event subscriptions writing back to the same orders?
3. **If no, fail early.** Before anything is created, tell the SC that this store
   already runs the ERP integration from another project, and name that project.

## What is known

- The existing guard (`replaceDeployedElsewhere.ts`, `pairWithSameErpElsewhere.ts`)
  catches the same ERP name in the same Adobe project only. It cannot see a second
  Adobe project pointed at the same store.
- Commerce installs come through App Management, which is separate from the Adobe
  I/O project the code runs in.

## Research (2026-10-15)

`.rptc/research/second-erp-shared-commerce/research.md`. Short version: possible
but harmful. On this release the second install damages the first; even with
per-project app ids, both apps claim every order and two placement webhooks gate
checkout. Recommended: refuse the add early, name the project that already runs
the integration on that store.

## Decided (owner, 2026-10-15)

One Commerce instance runs one ERP integration; more ERPs join it ("Add another
ERP") in the project that owns it. A second project bringing one is refused,
before anything is made, with one line: "<project> already has an ERP
integration on this Commerce instance. Add your ERP there instead."

## Built

- The check: `erpIntegrationOnSameCommerce.ts`, over local projects, matched on the
  Commerce address; "is this the ERP integration" is `bringsSystem` in
  `appBuilderComponentLinks.ts`, shared by every caller.
- The Add Integration modal (wizard and dashboard): the ERP integration's tile is
  greyed out with "<project> already has one on this Commerce instance", the API
  Mesh tile's treatment. One question, `check-erp-integration-holder`, registered in
  both handler maps (the dashboard sends nothing: the open project); one hook,
  `useErpIntegrationHolder`, used by both modal hosts. To make room, the modal's
  stage switch moved to `FlowStageBody.tsx` and the dashboard's commit-to-add
  callbacks to `liveAddBuilder.ts` (behaviour unchanged; their suites unedited).
- Wizard fallback: an ERP integration picked before the instance was known shows the
  one-line message on Integrations and holds Continue (the Build step owns both).
- Add doors (dashboard add, ERP add, agent add tools): refused in
  `replaceDeployedElsewhere`, before anything is recorded or removed.
- Creation: `refuseSecondErpIntegration` pre-flight, before any directory is made;
  covers an agent's `create_project`.
- Every message names a project by its title (`getProjectDisplayName`), including the
  existing "Replacing <project>'s ERP" line, which showed the folder name.

Not covered: projects on other machines (would need a read of the instance's
webhooks or event providers).

## How to answer it

Read-only first: ask the store which apps are installed, and read the App
Management and webhook docs. Any live second install is a cloud write on a shared
store and needs the owner's go-ahead.

## Shipped so far

- 2026-10-15  feat(app-builder): one ERP integration per Commerce instance (`85b7abbef`)
