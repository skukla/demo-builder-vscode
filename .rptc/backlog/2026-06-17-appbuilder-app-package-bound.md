# App Builder app — package-bound apps (auto-attach to a demo template)

> **Status: BLOCKED on slices 1 + 2** ([spine](2026-06-17-appbuilder-app-deploy-spine.md),
> [catalog](2026-06-17-appbuilder-app-curated-catalog.md)). Slice 3 of 5. Mostly config once the
> catalog exists.

## Provenance

Designed 2026-06-17 alongside the App Builder app-structure research
([`../research/app-builder-app-structure/research.md`](../research/app-builder-app-structure/research.md)).
Use case 3 from the design conversation: an app **purpose-built to support a specific demo template**
(e.g. the citisignal headless template), auto-included when that template is chosen.

## Goal / scope

Associate an App Builder app (a catalog entry from slice 2) with a demo package/stack so it is
**auto-attached** when the user picks that package — the same way block libraries bind to packages
via `nativeForPackages`.

**In scope:**
- An association field on the app catalog entry (mirror `block-libraries.json` `nativeForPackages` /
  `onlyForPackages` in `src/features/project-creation/config/block-libraries.json`).
- Auto-include the bound app in the install/deploy set when its package is selected
  (`demo-packages.json` → stack → component resolution in `executor.ts loadComponentDefinitions`).
- The bound app still deploys through the slice-1 spine; binding only changes *selection*, not
  mechanics.

**Out of scope:**
- New deploy mechanics or catalog mechanics (slices 1–2 own them).
- App-only projects (slice 5).

## UX / interaction

Minimal — a package-bound app shows as **auto-included** in the review/summary surfaces. Reuse the
existing native-block-library display (how `nativeForPackages` libraries render as included). No design
pass needed; mirror that pattern. Settle one behavior/copy point in planning: is a bound app removable,
or shown as fixed? Default to "shown as included," matching native block libraries.

## Reuse / refactor-for-reuse

- Reuse the block-library `nativeForPackages` / `onlyForPackages` association resolution rather than
  inventing a binding mechanism.
- Reuse slice-1 deploy + slice-2 catalog **unchanged**; this slice changes selection only.

## Execution plan (high level)

1. Add the package-association field to the catalog/registry entry.
2. Resolve bound apps into the install set during package selection (parallel to how
   `nativeForPackages` block libraries resolve).
3. Show the bound app in the review/summary surfaces as auto-included (not user-removable, or
   removable with a clear signal — settle in planning).

## Constraints / risk

- Reuse the block-library association resolution rather than inventing a new binding mechanism.
- Be explicit about whether a package-bound app is removable; default to "shown as included," matching
  how native block libraries behave.

## Kickoff prompt

`/rptc:feat "Add package-bound App Builder apps (slice 3). Associate a catalog app with a demo
package/stack via a nativeForPackages-style field (mirror block-libraries.json); auto-include the
bound app in the install/deploy set when its package is selected, deploying through the slice-1 spine.
Binding changes selection only, not deploy mechanics. See
.rptc/backlog/2026-06-17-appbuilder-app-package-bound.md and
.rptc/research/app-builder-app-structure/research.md."`
