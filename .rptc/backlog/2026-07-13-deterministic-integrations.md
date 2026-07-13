# Deterministic integrations + custom-app lifecycle

## Provenance

Designed 2026-07-13 with the user while testing the Add-Integration flow. **Supersedes**
`2026-07-13-kind-aware-api-access.md` (the mesh-informational / catalog-advanced / custom-picker
model) — this is simpler and resolves what that one only worked around.

## The core insight

An integration is a **deterministic unit**. Adding one should add *exactly that thing* — not "that
thing plus some APIs you bolt on." The optional-API picker wedged into every add-journey muddies
what an integration *is* and confuses the catalog's purpose. If you want a Mesh *and* something
else, you add the Mesh, then add another integration.

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

### Layer 1 — Deterministic simplification (near-term, contained)
Remove the **API-access step from the Add-Integration flow entirely**, for every kind. Integrations
add atomically. Required APIs still auto-subscribe at deploy (`ensureMeshApiSubscribed` /
`subscribeRequiredApis`) — the user never picks them. Optional API access lives ONLY in the
dashboard **Manage APIs** modal (which now does add + remove).
- `flowStages.ts`: drop the `'api-access'` stage id, `FlowDraft.selectedApis`, its `CONTINUE_GATES`
  entry, and the trailing `'api-access'` in `deriveStageOrder`. Last stage becomes the destination
  summary → label stays "Add Integration" / "Save".
- `AddIntegrationFlowModal.tsx`: remove the api-access stage render, the `useOrgConsoleApis`
  prefetch, and the `required`/`suggested`/`selected`/`toggleApi` wiring.
- `useIntegrationFlow.ts`: remove `selectedApis`/`toggleApi` and the on-finish optional-pick
  union-subscribe.
- **Delete** (add-flow-only): `stages/ApiAccessStage.tsx` + test, `useOrgConsoleApis.ts` + test.
- **Keep**: the shared `ApiAccessPicker`, `buildApiAccessCatalog`, `apiAccessCatalog`, gating,
  chips — all still used by Manage APIs. Not wasted.
- **Drop** `suggestedApis` display (pick-and-choose contradicts determinism; dormant anyway) — the
  catalog field can stay unread or be removed with its consumers.

### Layer 2 — Regroup the kind picker (UI/flow)
`KindStage` offers **API Mesh · Pre-built integration · Custom app**. The catalog card lists only
*finished* apps — the `app-builder-shell` moves OUT of the catalog into **Custom app → start
blank**. Custom app is a two-option choice: **Start blank** (seeds the shell entry, no source URL)
or **Import a repo** (today's `source-custom` URL path). Update `IntegrationKind` and the
source-stage derivation accordingly.

### Layer 3 — Promote a custom app to a repo (new capability, larger)
A per-integration **dashboard action** (alongside deploy / redeploy / remove) on a deployed custom
app that started from the shell: publish/export its local files to a **new GitHub repo**, so it can
later be imported as a "Custom app → import repo". Turns an in-project build into a reusable
artifact. Depends on the shell build-out story maturing; scope the git-publish mechanics (repo
create, push, auth) when picked up.

## Constraints
- Required-API auto-subscribe at deploy is unchanged — determinism means the user never *picks*
  APIs, not that integrations lose their APIs.
- Manage APIs (dashboard) is the single API-management surface; don't reintroduce an API picker in
  the add flow.
- The shared picker/catalog/gating code stays (Manage APIs consumer) — Layer 1 only removes the
  add-flow *wrapper*.

## Kickoff prompt
> Implement Layer 1 of `.rptc/backlog/2026-07-13-deterministic-integrations.md`: remove the
> API-access step from the Add-Integration flow (flowStages, modal, useIntegrationFlow; delete
> ApiAccessStage + useOrgConsoleApis + tests), keeping the shared picker for the dashboard Manage
> APIs. TDD; required APIs still auto-subscribe at deploy. Then Layer 2 (regroup the kind picker,
> move the shell into Custom app).
