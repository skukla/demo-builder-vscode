# Configure's sections are named after services; users configure tasks

Researched 2026-08-10, three parallel agents (inventory / mechanism / friction) plus
direct verification of the sharpest claims. Prompted by: "see if there's a more
reasonable grouping of fields within the rail sections".

**The short answer: yes, and the codebase already contains it.** The wizard's Commerce
rail groups these same fields by task — Connection, Business Structure, Catalog.
Configure groups them by service. That divergence was *deferred*, not rejected: the
step-rail plan's out-of-scope list names reusing the wizard's sliced body and gives a
data-source reason for skipping it, and `configureSections.ts` says in its own docstring
that it "adds nothing" to the existing order.

## The cheap lever

`group` is a property of the VARIABLE, assigned once in `components.json`'s `envVars`
dictionary. Components only reference keys; they never assign a group. In Configure,
**group id IS the section id** (`configureSections.ts:102-110`).

Moving a field between Configure tabs is a one-line JSON edit. No code, no mapping layer.

Adding a NEW tab costs more: the id must also be declared in `SERVICE_GROUP_DEFINITIONS`
(`serviceGroupTransforms.ts:74-117`), which is the only source of group id → label →
order → intra-group field order. A group id absent from that list is dropped silently
from both surfaces, because the transform maps over the definitions, not the data.

## What the rail actually shows

Derived from `components.json` × `stacks.json` × `demo-packages.json`. Field counts are
static-analysis counts, not observed.

| Project shape | Rail |
|---|---|
| EDS + ACCS + mesh | Project (1) · Adobe Commerce Cloud Service (4) · API Mesh (1) · Adobe Assets (1) · Authoring (1) |
| EDS + PaaS + mesh | Project (1) · Adobe Commerce (8) · Catalog Service (4) · API Mesh (1) · Adobe Assets (1) · Authoring (1) |
| Headless + PaaS + mesh | Project (1) · Adobe Commerce (8) · Catalog Service (4) · API Mesh (1) · Adobe Assets (1) |

On the commonest shape, four of five tabs hold exactly one control, and one tab is the
reason anyone opened the screen.

`headless-accs` is declared in `stacks.json` but **no demo package offers it**. It is the
one combination that would surface the ACCS and PaaS store cascades together — latent,
not live. (An earlier pass in this session called it live; that was wrong.)

### Sections that can never render

| Section | Why |
|---|---|
| Adobe Commerce Optimizer | `ACO_*` are declared only by the `adobe-commerce-aco` **addon**, and `addons` never enters `registry.components` or the Configure payload |
| Experience Platform | needs `componentSelections.integrations`, hardcoded `[]` at creation (`wizardHelpers.ts:744`) |
| Additional Settings (`other`) | every one of the 28 vars carries a `group` |
| App Builder component sections | no catalog entry has an `envSchema`, so `buildAppBuilderComponentFieldGroups` always returns `[]` |

Same reason `ACCS_CUSTOMER_GROUP`, `ADOBE_COMMERCE_CUSTOMER_GROUP` and
`ACCS_CATALOG_SERVICE_ENDPOINT` are defined but orphaned — no component declares them.

## Where Configure and the wizard disagree

Both read the same `group` field and the same definitions. But the wizard does not use
groups as sections at all — it slices them with **key sets**:

| Wizard sub-step | Filter | Configure equivalent |
|---|---|---|
| Connection | groups `accs`/`adobe-commerce`, limited to `CONNECTION_FIELDS` | *half* of one tab |
| Business Structure | same groups, limited to `isStoreCodeField` | *the other half of that tab* |
| Catalog | `!CONNECTION_GROUPS.has(id)` — a negation | **five** separate tabs |

Three consequences:

1. One group is split across two wizard steps; Configure keeps all nine
   `adobe-commerce` fields in one tab.
2. Five groups collapse into a step labelled "Catalog". On ACCS the catalog-service
   group is empty, so that step renders only Adobe Assets. The label already lies.
3. The store-group id pair (`accs`, `adobe-commerce`) is hardcoded in three places:
   `STORE_GROUP_IDS`, `CONNECTION_GROUPS`, and `useStoreDiscovery`'s `isStoreGroup`.

## What is load-bearing — read before regrouping

Group ids are executable, not cosmetic:

- `StoreSelectionRow.tsx:51-58` — `getFieldKeys(group.id)` decides which three env-var
  keys the website/store/view cascade writes. Move a store-code var out of
  `adobe-commerce`/`accs` and the cascade is orphaned.
- `useAutoStoreDetect.ts:29-31` — `groupIdFromKey` picks the PaaS vs ACCS discovery
  request shape.
- `useStoreDiscovery.ts:120` — `isStoreGroup`, consumed by `StoreConfigFieldRow.tsx:78`,
  is what makes progressive disclosure apply. A field in a non-store group is always
  rendered, skipping the "hide until connection is ready" gate.
- `useComponentConfig.ts:292-330` — validity is a **whole-form** verdict, ignoring the
  visible section. It becomes `commerceConnectValid`, which unlocks Business Structure
  and Catalog. Any regrouping has to reckon with this.

`.env` grouping is a third, independent ordering (`envFileGenerator.ts:106-116`) with its
own default bucket (`general`, not `other`) and its own header text. Nothing parses those
headers back, so they are safe to change.

Tests pinning group names: `serviceGroupTransforms.test.ts:106-136` (all 8 ids, unique
orders), `ConfigureScreen-rendering.test.tsx:179` (exact rail label sequence),
`ConnectStoreStepContent.sections.test.tsx:154-386` (the whole filter semantics).

## Defects found

Ordered by cost. The first blocks project creation and is unrelated to the grouping
question except that the grouping causes it.

### 1. PaaS wizard deadlock

Two required fields can only be filled in a step that stays locked *because* they are
empty.

| Link | Evidence | Verified |
|---|---|---|
| `ADOBE_CATALOG_API_KEY`, `ADOBE_COMMERCE_ENVIRONMENT_ID` required for PaaS | `components.json` PaaS `requiredEnvVars` | yes |
| Neither has a default | `default: undefined` for both | yes |
| No package seeds them | `configDefaults` covers only the six website/store/view codes | yes |
| They render only in the Catalog sub-step | group `catalog-service`; `filterGroupsForSection('catalog')` is a negation | yes |
| Validation is whole-form | `useComponentConfig.ts` `serviceGroups.forEach`, no section filter | yes |
| That verdict gates Connection | `commerceSections.ts:183` | yes |
| Catalog locks until Connection is done | `commerceSections.ts:336` `'Connect to Commerce first'` | yes |
| Locked tabs are unreachable | `StepRail.tsx:112` `onClick={reachable ? … : undefined}`; Continue gates on the same boolean | yes |

**Traced, not run.** Repro: start a project on `eds-paas` or `headless-paas`, fill
Connection, see whether Catalog ever unlocks. Probably unreported because ACCS is the
common path and leaves `catalog-service` empty.

### 2. `MESH_ENDPOINT` shows one value and validates another

`getFieldValue` returns the deployed endpoint before the touched check
(`useConfigureFieldValues.ts:108-113`); validation reads `getValueFromConfigs`
(`ConfigureScreen.tsx:180`), which has no such override. Type garbage → the field still
displays a valid URL, an error appears beneath it, Save is disabled, and the typed value
is submitted. The wizard sidesteps this by filtering the field out entirely.

### 3. Red dot on first open with nothing marked wrong

`validateServiceGroups` flags required-but-empty immediately; `ConfigFieldRenderer.tsx:29`
only shows an error when `error && isTouched`. The tab is flagged, the form looks fine.

### 4. Two Catalog endpoint fields, separated

`PAAS_CATALOG_SERVICE_ENDPOINT` is absent from `fieldOrder`
(`serviceGroupTransforms.ts:105`) so it sorts last, while the generic
`ADOBE_CATALOG_SERVICE_ENDPOINT` sorts first and renders blank and editable — its
`derivedFrom` is honoured only at `.env` generation, never in the UI.

## Recommendation

Split the work. The deadlock is a blocker and is small; the regrouping is a design change.

| # | Change | Effort |
|---|---|---|
| 1 | Fix the PaaS deadlock | small, do first |
| 2 | Put the two Catalog endpoints adjacent; settle the derived one | small |
| 3 | Drop the API Mesh tab — read-only field, real controls live on Integrations, and it removes defect 2 | small |
| 4 | ~~Merge Adobe Assets + Authoring~~ — **withdrawn 2026-08-11**: no code ties `AEM_ASSETS_ENABLED` to the AEM settings value this was justified by | — |
| 5 | Adopt the wizard's Connection / Business Structure split *inside* the Commerce tab, as sub-sections | its own plan — touches the gating |

With item 4 withdrawn, items 2–3 take EDS+ACCS from 5 tabs to 4 and EDS+PaaS from 6 to 5.
Item 5 changes structure inside the Commerce tab rather than the tab count.

## Confidence

High on everything read directly from config and traced through code. Defects 2 and 3 are
inferences from the display-vs-validation lookup split and have not been observed. The
deadlock's every precondition is verified but the deadlock itself has not been reproduced
live. Field counts are static; the extension was not run.
