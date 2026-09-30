---
id: AB-16j
kind: feature
area: app-builder
needs: []
value: med
status: built
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
- 2026-09-29  2026-09-29 (loop) BUILD step 1 DONE (loop/2026-09-29-ab-16j-erp-settings-tool, 1f5bd3cc2): ErpIntegrationClient.updateErpSettings(id, website?, values) -> PATCH erp/erps; widened the client's call() to allow PATCH (callWithIms already did). 2 unit tests (website scope; defaults + null-clear). tsc 0, eslint 0, 20 client tests pass. Read half already exists (resolvedSettings). NEXT: step 2 handlers handleGetErpSettings/handleSetErpSettings in erpIntegrationHandlers + tests, then descriptors/narration/alert, count-pins, mcp-server.md.
- 2026-09-29  2026-09-29 (loop) BUILD step 2 DONE (351556d8c): handleGetErpSettings (read, no guard, resolvedSettings) + handleSetErpSettings (write, updateErpSettings PATCH erp/erps; refuses without erp or values) in erpIntegrationHandlers; registered on dashboardHandlers (getErpSettings/setErpSettings); count pin 73->75; client+handler mocks + exports in testUtils; 44 handler+map tests pass; tsc/typecheck:tests/eslint 0. NEXT step 3: descriptor rows (readDescriptors get_erp_settings readOnly; actionDescriptors set_erp_settings confirm+inputSchema), TOOL_NARRATION for both, AGENT_ALERT_COPY for set, then count-pins (inExtensionMcpServer) + realSdkRegistration + mcp-server.md, then mcp-live-probe.
- 2026-09-29  2026-09-29 (loop) BUILD steps 3-4 DONE but BLOCKED at the gate. Done + committed (step 2, 351556d8c) and in the working tree (step 3, uncommitted): descriptor rows (get_erp_settings readOnly READ_DESCRIPTORS; set_erp_settings confirm ACTION_DESCRIPTORS), TOOL_NARRATION both, AGENT_ALERT_COPY set, and every pin updated (readDescriptors-catalog, actionDescriptors gated set, actionDescriptors-schema NEEDS_AUTH/INPUT_KEYS, responseSize NO_SAFETY_NET+EXEMPT, tool-auth-declarations 144->146 + adobe 51->52 + none 56->57, battery prompt erp-settings, docs:tools regenerated). Extracted the two handlers to src/features/dashboard/handlers/erpSettingsHandlers.ts (99L). AI-server (1677) + handler/map + client tests all pass. BLOCKER: tests/sop/god-file-ratchet.test.ts fails — erpIntegrationHandlers.ts is 610L on this branch (>500 handler limit, 20 imports = coupled), because the branch is based on DEVELOP (where the file is 458L) but the working tree carries the ERP feature's handlers (getErpStatus/openErpScreen/readErpApi/writeErpApi) that develop lacks; the god-file ledger (candidates 68 / coupled 31) is develop-based. My settings handlers are extracted (net-zero on that file). NOTE/CORRECTION: I committed step 2 after only a scoped check (handler+map+tsc+eslint), not the full SOP suite, so the branch is already red at 696L from that commit — a gate-shortcut mistake. NEEDS OWNER: rebase AB-16j onto feature/erp-integration (where erpIntegrationHandlers legitimately has these handlers and the god-file baseline matches), OR decompose erpIntegrationHandlers under 500 (e.g. extract resetErp), OR update the god-file ledger for the ERP branch. Do not merge until green.
- 2026-09-29  feat(erp-settings): descriptors, narration, consent, pins (AB-16j step 3) [GATE-RED, DO NOT PUSH] (`b57d1cc1c`)
- 2026-09-29  docs(loop): AB-16j build step 2 logged (handlers) (`a999f4616`)
- 2026-09-29  docs(loop): AB-16j build step 1 logged (`b75fb6a6f`)
- 2026-09-29  docs(loop): AB-16j build-ready — per-ERP write path is erp/erps PATCH (`491bf5ea1`)
- 2026-09-29  docs(loop): AB-16j design corrected — two settings surfaces, not one (`7a4cd02a1`)
- 2026-09-29  docs(loop): AB-16j design settled — two tools over the erp/settings action (`012f44e84`)
- 2026-09-28  docs(loop): file AB-16j for the ERP-settings agent tool; loop validate/split rules (`651ed4cc8`)
- 2026-09-30  2026-09-30 (loop) BUILT + gate-green. The tools get_erp_settings/set_erp_settings already existed on this branch (b57d1cc1c) and the god-file-ratchet blocker was resolved by decomposing erpIntegrationHandlers (45e952db8); the whole branch passes the full gate (confirmed by the AB-44 push: jest 30815, tsc, typecheck:tests, lint, validators, dead-code). Design correction confirmed: the write is erp/erps PATCH, not erp/settings. FIXED a verified footgun: the set_erp_settings schema + client + payload accepted booleans, but the integration only accepts strings — narrowed the zod union + types to string|null. REMAINING (edge): mcp-live-probe against the running server (human Settings tab and the tools reaching the same state).
