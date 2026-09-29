---
id: AB-16j
kind: feature
area: app-builder
needs: []
value: med
status: active
parent: AB-16
---

# An agent tool for an ERP's own settings (ownership, sales-org per website)

Filed 2026-09-28 (overnight loop), splitting a discovery out of [[AB-16c]] into its own
item as the owner asked (validate every item; file discoveries as their own item).

## The gap (verified 2026-09-28)

The integration's Admin page has a **Settings** tab that writes an ERP's own runtime
settings — which products an ERP owns (the ownership attribute), and the sales
organisation per website, with Commerce's "Use Default" inheritance — scoped per ERP
entry and per website. That surface has **no purpose-built agent tool**.

- `get_integration_settings` / `set_integration_settings` reach only the extension's
  **component-level** settings modal: `componentSettingsHandlers.ts`
  (`loadProjectComponentSettings` over `componentConfigs[id]`), i.e. deploy-time text
  values and secrets. Not the per-ERP / per-website runtime settings.
- The human Settings tab writes those through the integration's `erp/settings` action
  (per ERP, per website scope). The only agent path there today is
  `invoke_runtime_action` — the generic, confirm-gated escape hatch — not a tool.

So this is a human-surface / agent-surface gap: a button an SC has, that an agent
cannot reach except by hand-driving a raw Runtime action.

## Shape (to design, not yet decided)

A read tool and a write tool mirroring the Settings tab — e.g. `get_erp_settings` and
`set_erp_settings` taking `(integration id, erp id, website scope)`, returning /
accepting the same fields the tab shows, with "Use Default" inheritance preserved and
secrets never passed as arguments. Follows `mcp-tool-authoring` (headless-safe handler,
descriptor row, narration, read/write declaration, count-pinned tests, `mcp-server.md`
sync). Whether it is one tool per scope or a scoped list is a design question for the
build.

## Done when

An agent can read and set an ERP's ownership and per-website sales-organisation
settings through purpose-built tools, proven against the running server
(`mcp-live-probe`), with the human Settings tab and the tools reaching the same state.

## Shipped so far

- 2026-09-29  2026-09-29 (loop) DESIGN settled (validated the surface). Per-ERP/per-website settings are the integration's erp/settings action (commerce-erp-integration src/commerce-extensibility-1/actions/erp/settings + lib/settings.js settingsPage/resolvedSettings/saveSettings + lib/erp-settings.js PER_ERP_KEYS/WEBSITE_KEYS/withErpSettings/applyErpSettingChanges), scoped by params.erp and website. This is OUTSIDE the demo-builder extension — the human path is the Commerce-Admin webview calling that action directly; get/set_integration_settings only reach componentConfigs. TOOL SHAPE (two tools, extends the ErpIntegrationClient/callErpApi pattern used by get_erp_status/run_erp_rest): get_erp_settings(id, erp, website?) -> GET erp/settings, returns the resolved per-ERP/per-website settings (withErpSettings shape); set_erp_settings(id, erp, website, changes) -> PUT erp/settings, applyErpSettingChanges, write-only text (no secrets as args), confirm:true. Follows mcp-tool-authoring: headless handler, READ/WRITE descriptors, TOOL_NARRATION, agent-alert for the write, count-pinned tests, realSdkRegistration + mcp-server.md sync. BUILD is the next fire(s), RED-first, verified with mcp-live-probe.
- 2026-09-29  2026-09-29 (loop) DESIGN CORRECTION (caught before building — read the erp/settings action fully). There are TWO settings surfaces, which the prior design conflated: (1) the INTEGRATION's per-scope settings (Default Config / each website) — erp/settings GET ?scope= returns settingsPage; PATCH {scope, values} -> saveSettings (lib/settings.js). (2) the PER-ERP settings (ownership, per-website sales-org overrides on the ERP's list entry) — erp-settings.js applyErpSettingChanges + PER_ERP_KEYS/WEBSITE_KEYS, surfaced by erp/settings GET ?websites=&erp= (settingsForErp -> withErpSettings + ownershipOf), but WRITTEN via a different path (the ERP list, erp/erps replace-whole, or a per-ERP save) — NOT the PATCH above. AB-16j's gap ('an ERP's own settings: ownership, sales-org per website') is surface (2). BEFORE building: pin down surface (2)'s WRITE path (which action/handler persists applyErpSettingChanges to an ERP's entry, and how the webview Settings switcher saves a per-ERP value). Only then is get/set_erp_settings buildable. Not build-ready yet.
- 2026-09-29  2026-09-29 (loop) DESIGN NOW COMPLETE / build-ready. Per-ERP write path found: the erp/erps action (src/commerce-extensibility-1/actions/erp/erps) PATCH { id, website?, values: { <per-ERP setting>: value|null } } -> lib/erps.js updateErpSettings -> applyErpSettingChanges + replaceErps. READ path: erp/settings GET ?websites=<code>&erp=<id> -> the ERP's settings in force (ownership + sales-org per website); ErpIntegrationClient already has resolvedSettings(websiteCodes, erpId) for this. FINAL TOOL SHAPE: get_erp_settings(id, erp, website?) = client.resolvedSettings([website], erp) (READ_DESCRIPTORS, readOnly). set_erp_settings(id, erp, website?, values) = NEW client method PATCH erp/erps {id, website, values} (ACTION_DESCRIPTORS, confirm:true, AGENT_ALERT_COPY, write-only text no secrets). Build steps, RED-first: (1) add ErpIntegrationClient.updateErpSettings(id, website, values) + unit test; (2) handleGetErpSettings/handleSetErpSettings in erpIntegrationHandlers + tests; (3) descriptor rows + TOOL_NARRATION + agentAlert + readOnly; (4) count-pins (dashboardHandlers-map, inExtensionMcpServer), realSdkRegistration, mcp-server.md; (5) mcp-live-probe verify.
