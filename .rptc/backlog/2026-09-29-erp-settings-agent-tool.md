---
id: AB-16j
kind: feature
area: app-builder
needs: []
value: med
status: backlog
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
