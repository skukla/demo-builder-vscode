# Configure's tabs name services; the user is doing tasks

Promoted from `.rptc/research/configure-field-grouping/research.md` (2026-08-10). Read it
first — the inventory, the load-bearing couplings and the measured tab counts are there
and are not repeated here.

## Step 0: RPTC re-initialization (ALWAYS FIRST)

```
/rptc:feat Plan is approved, continue to implementation — configure commerce subsections
```

Then work from this file and `step-01..04.md`.

## Goal

Configure's rail is named after **services** — Adobe Commerce Cloud Service, Catalog
Service, API Mesh, Adobe Assets. The wizard's Commerce rail is named after **tasks** —
Connection, Business Structure, Catalog. Same fields, two taxonomies, and the wizard's is
the one a user can act on.

On the commonest shape (EDS + ACCS + mesh) Configure shows five tabs of which **four hold
exactly one control**. The one tab anybody opened the screen for holds four fields.

This plan brings Configure's grouping in line with the wizard's, and deletes the tabs that
exist only because a service exists.

## Why this was not done before

It was deferred, not rejected. `.rptc/complete/configure-step-rail/overview.md:130-141`
lists reusing the wizard's sliced body as out of scope, on **data-source** grounds:
`ConnectStoreStepContent` derives config from `useComponentConfig` (stack-driven,
pre-creation) while Configure uses `useSelectedComponents` (project-driven). The rail work
was plumbing; `configureSections.ts:11-13` says it "adds nothing" to the existing order.

That reason still holds, and this plan does **not** attempt to converge the two data
sources. It reuses the wizard's *taxonomy*, not its component.

## The lever, and its limit

`group` is a property of the variable in `components.json`, and in Configure **group id is
the section id**. Moving a field between tabs is a one-line JSON edit.

What that does NOT buy:

- A new tab must also be declared in `SERVICE_GROUP_DEFINITIONS`
  (`serviceGroupTransforms.ts:74-117`) or its fields vanish from **both** surfaces.
- Group ids are executable. `StoreSelectionRow.getFieldKeys(group.id)` decides which three
  env keys the store cascade writes; `useAutoStoreDetect.groupIdFromKey` picks the PaaS vs
  ACCS discovery shape; `useStoreDiscovery.isStoreGroup` is what makes progressive
  disclosure apply at all. A store-code var moved out of `accs`/`adobe-commerce` orphans
  the cascade.

So: retagging within the existing group set is free; inventing groups is not.

## Target

| Shape | Today | After |
|---|---|---|
| EDS + ACCS + mesh | Project · ACCS · API Mesh · Adobe Assets · Authoring | Project · Commerce · Adobe Assets · Authoring |
| EDS + PaaS + mesh | Project · Adobe Commerce · Catalog Service · API Mesh · Adobe Assets · Authoring | Project · Commerce · Catalog · Adobe Assets · Authoring |

**Revised 2026-08-11.** The target used to end in a merged "Storefront" tab. Step 03 was
dropped once its premise was checked — `AEM_ASSETS_ENABLED` has no code relationship to the
AEM settings value the merge was justified by. See `step-03.md`. Commerce still gains
Connection / Business Structure sub-sections (step 04); the tab COUNT gain is now step 02's
alone.

Catalog Service is PaaS-only — all three of its values are `isAccs ? undefined : …` —
which is why EDS+ACCS reaches three tabs and EDS+PaaS four.

Commerce carries Connection and Business Structure as **sub-sections within one tab**, not
as two tabs. Configure is an edit surface for an existing project, not a guided sequence —
the wizard's lock-and-advance model does not belong here, and every Configure tab is
deliberately always reachable (`configureSections.ts:181-188`).

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Connection / Business Structure | Sub-sections inside one Commerce tab | Configure edits; it does not sequence. Two tabs would import the wizard's gating, which this plan explicitly avoids |
| API Mesh tab | **Delete** | Its one field is optional, auto-supplied and display-locked; the mesh's real controls are the Integrations grid. Deleting it also removes the display-vs-validation dead end |
| Adobe Assets + Authoring | **Leave separate** | The merge's stated prerequisite-coupling does not exist in the code; a data-source flag and a tooling choice are not one concern. Dropped 2026-08-11, see `step-03.md` |
| `ADOBE_COMMERCE_ENVIRONMENT_ID` | **Leave in `catalog-service`** | Its name says instance, its description and its use say Catalog Service dataspace. An earlier draft proposed retagging it; see step-01's correction note |
| Unreachable sections (ACO / Experience Platform / Additional Settings) | **Leave** | Out of scope. They render for nobody, so they cost nobody. Filed in the research |
| Wizard's taxonomy | Copy the names, not the component | The data-source divergence that deferred this in the first place is untouched |

## Steps

| Step | What | Depends on |
|---|---|---|
| `step-01` | Put the two Catalog endpoints together; settle the derived field | — |
| `step-02` | Delete the API Mesh tab; remove the `MESH_ENDPOINT` display/validate dead end | — |
| `step-03` | ~~Merge Adobe Assets + Authoring~~ — **DROPPED**, premise disproved | — |
| `step-04` | Connection / Business Structure sub-sections inside the Commerce tab | 02 — **shipped 2026-08-11** |

**All steps resolved.** 01 and 02 shipped and take EDS+ACCS from five tabs to four while
removing two defects; 03 was dropped once its premise was disproved; 04 shipped and gives
the Commerce tab two named sub-sections. Nothing outstanding in this plan.

## Out of scope

- Converging `useComponentConfig` and `useSelectedComponents`. Named as the reason this
  was deferred; still true, still separate.
- The three sections that can never render.
- The App Builder tabs (no catalog entry has an `envSchema`).
- The wizard side. It already has this taxonomy; this plan moves Configure toward it.

## Verification

The two defects folded in here were code-derived and never observed
(`research.md` §Defects 2–4). **Confirm both in a Dev Host before writing the fix**, or the
plan is building on an inference:

1. On any project, type into the API Mesh field. Expect: the displayed value does not
   change, an error appears beneath it, Save disables.
2. Open Configure on a project with a required-but-empty field. Expect: a red dot on the
   tab and no error visible on the field itself.
