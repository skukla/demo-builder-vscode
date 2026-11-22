# An integration's settings live on its tile

Status: approved 2026-09-18; built on `feature/erp-integration` except step 4, which moved to AB-22. Backlog: AB-21.

## The rule (owner, 2026-09-18)

Everything about one integration is set from that integration's tile on the Integrations
surface. Configure Project keeps only project settings. This covers every App Builder
component that has settings (`envSchema` in `app-builder-components.json`), not only the ERP.

## Today

- Configure Project builds one tab per catalog entry the stack allows, installed or not
  (`configure.ts:205-235`, `appBuilderComponentFieldModel.ts`, `AppBuilderComponentFieldsSection.tsx`,
  `configureSections.ts:227-234`, `ConfigureSectionBody.tsx:301-315`).
- Save writes text values to `componentConfigs[<id>][VAR]` in the manifest and secrets to
  SecretStorage (`configure.ts:279-358`, `appBuilderComponentSecrets.ts`). Nothing redeploys.
- The deploy reads text values (own, then the bound partner's, then the default) and skips
  secrets (`deployInputs.ts:35-78`).
- Adding an entry whose settings have no default sends the SC to Configure Project
  (`appBuilderComponentHandlers.ts:464-488`); the agent preflight does the same
  (`actionDescriptors.ts:63-103`, `handoff.ts:20-33`). No shipped entry reaches this today.
- The drawer (`IntegrationDetailPanel.tsx`, integrations bundle only) has no settings section.

## Design

1. **Remove the App Builder sections from Configure Project.** Delete them rather than hide
   them: the field model, the section component, its rail tabs, the three initial-data
   fields, and the App Builder split in Save. Configure's own project fields are untouched.
2. **A Settings modal, opened from the tile's actions menu** (owner, 2026-09-18: the drawer
   is already crowded). It follows Manage APIs, which is a menu item that opens
   `ManageApisModal` (`IntegrationActionsMenu.tsx:49`, `IntegrationsGrid.tsx:201,286`). The
   "Settings" item appears only on a component that has settings. The modal holds a text
   field per text setting, a masked field per secret (showing only whether it is set), and a
   read-only row per setting another component provides ("ERP address — from ERP"). Save is
   disabled until something changes.
   **The drawer also gets one row, "Settings"**, listing the current values in a line
   ("ERP name: Acme ERP") with an "Edit settings" link that opens the same modal (owner,
   2026-09-18: a menu item alone is not obvious). It uses the drawer's existing link-row
   style (`PanelRow`, as "Open Commerce Admin" does) and appears only on a component with
   settings. This follows `.rptc/research/card-face-buttons-vs-kebab/`: every verb in the
   menu, and the drawer is where a visible action belongs. The drawer's header menu is the
   same menu with the same handler (`IntegrationDetailPanel.tsx:120`, `IntegrationsGrid.tsx:273`),
   so the item is there too.
3. **Saving asks, then redeploys.** A setting reaches the app only through a deploy, and a
   deploy is a cloud operation. So Save says what it will do ("Save and redeploy ERP
   integration and ERP?") and runs the redeploy on yes. It reuses the existing redeploy
   path, so progress and failure look like any redeploy. Cancel keeps nothing.
4. **One setting, one place.** A setting both apps of a pair use (the ERP name) is edited on
   the integration's tile only, and the bound system reads the integration's value. Today the
   system reads its own first; the order flips so an old value set on the ERP's tab cannot
   win. The ERP has no other setting, so its tile gets no Settings item; a bound system that
   did have its own would show the shared one read-only, "set on ERP integration". Saving
   the name redeploys both.
5. **Secrets reach the deploy.** The deploy reads secret settings from SecretStorage into
   the deploy's process env, as the ERP's screen key does today. Without this the modal
   would offer a field that does nothing. Never in the manifest, `.env`, logs or a webview.
6. **Adding an integration that needs values — moved to AB-22** (owner, 2026-09-18). The Add
   Integration window is also project creation's, so a settings step there would have to carry
   values through creation too, and nothing shipped needs it. The real case is importing a
   colleague's integration, researched in `.rptc/research/integration-import-settings/`.
   Here: the route to Configure Project is deleted; the add refuses such an entry in plain
   words, and a build check fails if a catalog entry ever declares a setting with no default.
7. **The agent surface.**
   - A new MCP tool, `set_integration_settings`, sets text settings on one integration and
     redeploys it, confirming first like the other deploy tools. It refuses secrets and hands
     off to the tile, since a secret must never be a tool argument.
   - The integration's details, as agents read them, list its settings: names, text values,
     and for secrets only whether they are set.
   - `configure_project` refuses App Builder component ids and points to the new tool.
   - The add preflight is deleted: it existed so an agent's call would not open Configure,
     and the add now opens nothing.
8. **Existing projects keep working.** Values stay where they are
   (`componentConfigs[<id>]`), so nothing migrates. The only change in what an old project
   deploys is step 4's order, and it matters only where the two ERP names were set apart.

**Not in scope:**
- The ERP's own settings inside Commerce Admin (AB-10, `.rptc/plans/erp-integration-settings/`).
  Those are the merchant's, not the SC's.
- The workspace per integration (`.rptc/research/workspace-per-integration/`).

## Steps

Each step lands green with its tests, in this order.

1. **Deploy inputs:** the bound system reads its partner's value first; secrets are read from
   SecretStorage. Unit tests on `resolveDeployInputs`.
2. **Settings modal:** the menu item, the form, the save message, and the confirm-and-
   redeploy flow. The integrations bundle now receives settings and secret flags in its
   initial data.
3. **Remove the Configure sections** and their save path. Delete or rewrite the Configure
   tests that pinned them.
4. **Add flow — moved to AB-22.** Here: the refusal and the catalog build check.
5. **Agent surface:** `get_integration_settings`, `set_integration_settings`,
   `configure_project`'s refusal, and the deleted preflight. Tool counts and `docs/systems/mcp-server.md` move with it.
6. **Docs:** `docs/systems/erp-integration.md`, the `appbuilder-component-authoring` skill,
   the stale "text → .env" comments (`AppBuilderComponentFieldsSection.tsx`,
   `appBuilderComponentFieldModel.ts`, `appBuilderComponentSecrets.ts`, `src/types/appBuilderComponents.ts`),
   and ERP plan decision 10.

## Every surface

| Surface | Applies |
|---|---|
| Webview bundles | Configure (loses sections); integrations (gains the Settings menu item, the flyout row and the modal). The menu's actions are handled in `IntegrationsGrid`, which only the integrations bundle renders; the wizard reuses the card (`IntegrationsStep.tsx:49`) and must not show the item. |
| Creation and regeneration | No change: the wizard collects no integration settings, and the deploy reads defaults as before. |
| AI bundle | No change. |
| Human and agent | Both get it: the Settings modal, and `set_integration_settings`. |
| Config in three places | The catalog, schema and types are unchanged; no new catalog field. |
| Mocks | Configure's initial-data fakes lose three fields; the integrations initial-data fixture gains them. |
| Docs | Step 6. |

## Checks

- Unit and component tests per step; `gate` before each commit.
- One live check at the end, confirmed first: change the ERP name on Bodea's tile and see it
  on the ERP's screen after the redeploy. It waits on the Adobe permissions fix, like the
  other Bodea deploys.

## Open for the owner

Settled 2026-09-18: Save redeploys straight after confirming (3); the Add stage moved to
AB-22 (6). Still open: the live check above.
