---
id: AB-1d
kind: feature
area: app-builder
needs: []
value: med
status: backlog
---

# Build Commerce integrations FROM the integration starter kit, not a blank shell

When a demo needs an Adobe Commerce integration, scaffold it from
`adobe/commerce-integration-starter-kit` — Adobe's own template — instead of
the blank shell we ship today.

## What we do now

`app-builder-components.json` has exactly one entry:

```json
{ "id": "app-builder-shell", "name": "Custom Integration", "blank": true,
  "source": { "owner": "skukla", "repo": "app-builder-shell", "branch": "main" } }
```

That repo is "Minimal Adobe App Builder app for Demo Builder's blank-shell
integration". Its whole tree is `actions/hello`, `app.config.yaml`,
`package.json`, plus AGENTS.md/CLAUDE.md.

Adobe's starter kit (`adobe/commerce-integration-starter-kit`, verified via the
GitHub API 2026-08-26) is a different shape entirely: `src/`,
`app.commerce.config.ts`, `install.yaml`, `EVENTS_SCHEMA.json`, `test/`,
`docker-compose.yaml`, husky hooks, CI.

## Why this matters beyond "use the official thing"

We already ship the starter kit's seven agent skills to these projects. They
instruct the agent to work "following Adobe Developer App Builder patterns and
the Integration Starter Kit blueprint" and to use "the 6-file handler
structure" — conventions the blank shell does not have. So the guidance is
already written for a project shape we do not produce.

Scaffolding from the real kit makes those seven skills correct rather than
aspirational. That is the reason to do it, and it is why this is worth more
than the sum of "official template" plus "nicer starting code".

## Open

- **Keep the blank shell?** It exists for "starts from a working deploy, then
  grows into whatever your demo needs". A starter-kit project is heavier and
  opinionated. Probably both entries, with the kit as the default for anything
  touching Commerce — but that is a product call.
- **Onboarding.** The kit has `install.yaml` and an onboarding script that
  registers Adobe I/O event providers. Our creation flow does its own I/O
  provisioning (`AB-2` territory). Find out which one wins before wiring it.
- **Does it deploy from our spine unchanged?** The deploy/subscribe guard chain
  in `appbuilder-component-authoring` assumes the shell's layout.

Filed 2026-08-26 — from the naming investigation that found the skills and the
scaffold describe different projects. See [[AI-1o]] and [[AI-1p]].

## Shipped so far

- 2026-08-27  OWNER DECISION (2026-08-27, live): build App Management support — option B from the research. The kit on main is the v4 App Management generation: an extension app our standalone gate refuses, with service-side provisioning declared in app.commerce.config.ts and executed by Adobe's install step, plus an S2S env contract we do not inject. Research: .rptc/research/starter-kit-integration/research.md. The entity question is settled by the decision — a NEW kind (extension app, service-managed lifecycle), not a variant catalog entry. Next: architecture phase. Also fixed in reach: ioEventsClient's false 'the extension creates' comment.
- 2026-08-27  LIVE TEST (owner-directed, 2026-08-27): drove the kit through the real MCP spine — set_project_destination (Kukla Bodea Mesh/Stage), catalog entry authored (layout extension, lifecycle app-management — the catalog's first pre-built integration, gallery pin updated deliberately), add_integration. RESULTS: the step-2 layout gate ACCEPTED the extension app live; clone worked; npm install refused (kit engine-strict node ^24 vs system v20 — filed as AB-3, fail-fast fix) ; with deps installed under node 24 by hand, aio app build FAILS with 3x webpack 'Self-reference dependency has unused export name' — one per generated app-management action — under BOTH node 20 and node 24, with latest released aio-cli 11.1.2 / plugin-app 14.8.1, generate step run or not. UPSTREAM BLOCKER: the kit cannot currently be built with Adobe's stock public toolchain; deploy (and the base-URL confirmation) blocked behind it. Step-5 remainder confirmed by measurement: per-component node version via fnm. Kit left attached to bodea in status:error as the test bench.
