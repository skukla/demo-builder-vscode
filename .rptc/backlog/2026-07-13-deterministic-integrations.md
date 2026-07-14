# Deterministic integrations + custom-app lifecycle

## Provenance

Designed 2026-07-13 with the user while testing the Add-Integration flow. **Supersedes**
`2026-07-13-kind-aware-api-access.md` (the mesh-informational / catalog-advanced / custom-picker
model) — this is simpler and resolves what that one only worked around.

> **Direction change (2026-07-14):** Layer 1 originally removed the API-access picker for *every*
> kind. That was walked back for **custom/import** — a greenfield or imported app's APIs aren't
> declared in a catalog, so the user must pick them (the taxonomy below already says so). The
> deterministic simplification holds for **mesh + catalog** (no picker; APIs shown, not picked);
> custom/import ship an **interactive picker** (add + re-edit). Layer 1 and the Constraints below are
> updated to match what shipped.

## The core insight

An integration is a **deterministic unit**. Adding one should add *exactly that thing* — not "that
thing plus some APIs you bolt on." For a **finished** integration (mesh, catalog) the APIs are
fixed/declared, so the add-journey *shows* them rather than asking the user to pick. A **custom**
app (blank shell or imported repo) is the exception the taxonomy calls out: its APIs aren't known to
a catalog, so the user picks them up front. If you want a Mesh *and* something else, you add the
Mesh, then add another integration.

Second insight: the **App Builder shell was mis-filed as a catalog entry.** A catalog integration
is finished and deterministic; the shell is a *blank starting point you build out*. They are
different kinds of things and shouldn't share a bucket.

## Taxonomy — what you can add

| Add | Nature | APIs |
|---|---|---|
| **API Mesh** | Data/gateway layer (infra, one per project) | Fixed (`GraphQLServiceSDK`), auto at deploy |
| **Pre-built integration** | Finished, purpose-built App Builder app from the catalog | Declared `requiredApis`, auto at deploy |
| **Custom app → start blank** | Greenfield; build out via AI in-project (today's `app-builder-shell`) | Any the user has access to; granted as you build |
| **Custom app → import repo** | An app already built (yours or third-party), imported as-is | Whatever it needs; granted after import |

Blank-shell and import-repo are the **two ends of one lifecycle**, bridged by promote-to-repo:

```
start blank (shell)  →  build via AI  →  PROMOTE TO REPO ("save it")  →  import repo (later/elsewhere)
```

## Three layers of work (different sizes)

### Layer 1 — Deterministic api-access — ✅ SHIPPED (mesh/catalog `48f637d3`; enable-in-modal `5aa064c8`; custom/import picker + re-edit `feature/mcp-affordance-coverage`)
The api-access step is **informational for deterministic kinds and interactive for custom kinds**.
Required APIs still auto-subscribe at deploy (`ensureMeshApiSubscribed` / `subscribeRequiredApis`).
- **API Mesh / Pre-built integration** — NO picker. The step *shows* the required APIs
  (`stages/ApiAccessStage.tsx`): mesh enables them in-modal (the `5aa064c8` enable-in-modal flow),
  catalog subscribes them at deploy. The user never picks.
- **Build custom / Import a repo** — an **interactive picker** (`stages/ApiPickerStage.tsx` wrapping
  the shared `ApiAccessPicker`): the user picks any entitled API up front, and can **re-edit** the
  picks later from the result row (modal `api-edit` mode → `saveEditedPicks`, writing
  `selectedConsoleApis[componentId]`, union-subscribed at deploy).
- **Kept in the flow (NOT dropped):** the `'api-access'` stage id, `FlowDraft.selectedApis`, its
  `CONTINUE_GATES` entry, and the trailing `'api-access'` in `deriveStageOrder` — they drive the
  custom/import picker. `AddIntegrationFlowModal`/`useIntegrationFlow` keep `selectedApis`/`toggleApi`.
- **Shared code serves both surfaces:** `ApiAccessPicker`, `buildApiAccessCatalog`, gating, chips
  back both the custom/import picker AND dashboard **Manage APIs** (deployed integrations).
- Locked (already-covered) APIs render as a quiet "Already provided by this project" footnote in the
  picker, not as uninteractive checkbox rows.

### Layer 2 — Regroup the kind picker (UI/flow) — ✅ SHIPPED
`KindStage` offers **4 flat cards**: API Mesh · Pre-built integration · Build custom · Import
a repo (the user picked flat over a Custom-app sub-step). The catalog gallery lists only *finished*
apps — `app-builder-shell` carries a `blank: true` marker, is excluded from the gallery, and is
committed via the "Build custom" (`kind: 'blank'`) card. `IntegrationKind` gained `'blank'`
(no source stage); the modal threads a `blankComponent`; `commitSelection` toggles it.

### Layer 3 — Promote a custom app to a repo (new capability, larger)
**Scoped out to its own item:** [`2026-07-13-promote-app-to-repo.md`](2026-07-13-promote-app-to-repo.md).
A per-integration dashboard action on a shell-built custom app that creates a new GitHub repo and
pushes the app's local files (fresh history, secrets excluded), so it can later be imported as
"Import a repo". Reuses the existing GitHub plumbing; the real forks are public-vs-private and
secrets hygiene. Gated on the shell build-out maturing.

## Constraints
- Required-API auto-subscribe at deploy is unchanged.
- **Deterministic kinds (mesh, catalog) show APIs, never pick them.** Custom/import DO pick (any
  entitled API) — a greenfield or imported app's needs aren't declared in a catalog.
- **Manage APIs (dashboard)** owns API management for **deployed** integrations; the **add/edit
  flow** owns pre-deploy picks for **custom/import**. Both go through the one shared `ApiAccessPicker`.

## Status
Layers 1 and 2 SHIPPED (see the ✅ headings — note Layer 1's custom/import picker + re-edit revision).
Only **Layer 3 (promote a custom app to a repo)** remains, scoped out to
[`2026-07-13-promote-app-to-repo.md`](2026-07-13-promote-app-to-repo.md).
