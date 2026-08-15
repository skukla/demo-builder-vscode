# MCP tools for Configuration Service site access

**Filed:** 2026-08-14, during the `config-service-admin-grant` verify loop.
**Depends on:** `.rptc/plans/config-service-admin-grant/` (steps 01–04 shipped).

## Goal

Give an AI agent the same Configuration Service access repair a human now gets
from `Demo Builder: Manage Site Access`. The logic is already UI-free and waiting
for a caller — `siteAccessManagerHeadless` was built to this shape deliberately,
mirroring `refreshBlockLibraryHeadless`, so the command and an MCP tool can share
one implementation.

## Why it matters

The `diagnose-demo` skill routes a symptom to the check that answers it, and a
403 from `/config/*` is now one of the best-understood symptoms in the codebase —
but an agent hitting it can only *describe* the remedy. Every other repair of
comparable weight (`refresh_block_library`, `deploy_mesh`, `redeploy_integration`)
is a tool. This is the gap.

It also closes a diagnostic asymmetry: an agent can already read the roster
indirectly through Diagnostics, but cannot act on it.

## Scope

Three tools over the existing headless core, no new logic:

| Tool | Core call | Kind |
|---|---|---|
| `get_site_access` | `listSiteAccess` | read |
| `grant_site_admin` | `addSiteAdmin` | action |
| `revoke_site_admin` | `removeSiteAdmin` | action |
| `repair_site_config` | `repairSiteConfig` | action |

`repair_site_config` was added to this list on 2026-08-14, when
`repairSiteConfigHeadless` shipped for the `Repair Site Configuration` command.
It is deliberately UI-free for the same reason as the others, and it already
reports `verified` separately from `status` — the constraint below. Note it does
NOT republish; the command composes that separately, so an agent calling the tool
repairs the configuration without republishing a demo out from under someone.

Follow `.claude/skills/mcp-tool-authoring` — headless-safe handler + descriptor
row, zod input schema, guard placement, the count-pinned tests that move, and the
`docs/systems/mcp-server.md` sync. Descriptors live in
`src/features/ai/server/actionDescriptors.ts`; the reads/actions split is already
established there (`start_demo`, `refresh_block_library`, … are the siblings).

## Constraints — do not soften these

- **Report `verified` separately from `status`.** Every mutation in the core
  re-reads the role list; a write the service accepted but that does not appear
  on re-read must surface to the agent as unverified, never as success. This is
  the property the whole feature was built around.
- **`not_authorized` is not retryable.** The access endpoint sits behind the same
  `[admin]` gate as the config read, so an agent that is refused cannot fix it by
  trying again — surface the org admins instead (`listSiteAccess.orgAdmins`).
- **Never remove the last admin.** Already refused in `revokeSiteAdmin`; the tool
  must surface that refusal rather than retrying or forcing.
- **Mask emails in anything that could be echoed into a transcript**, consistent
  with the diagnostics report (`maskEmail`). Interactive UI keeps full addresses;
  an agent tool's output is closer to a log than to a QuickPick.

## Established facts (measured 2026-08-14 — do not re-derive)

- A freshly registered site has **no** access doc: `PUT .../sites/{site}.json` →
  201 leaves `access/admin.json` at 404 and no `access` key on the site config.
  `POST` onto that 404 → 200 and creates it. So 404 means *no grants yet*.
- Authorization is per-ORG; an admin of one org cannot grant into another.
- `grantSiteAdmin` REPLACES the role list and is module-private for that reason —
  go through `ensureSiteAdmin` / `revokeSiteAdmin`.

## Kickoff prompt

> Add `get_site_access`, `grant_site_admin` and `revoke_site_admin` MCP tools over
> `src/features/eds/services/siteAccessManagerHeadless.ts`, following the
> `mcp-tool-authoring` skill. Preserve the verified-vs-status distinction and the
> non-retryable `not_authorized` outcome. Read
> `.rptc/plans/config-service-admin-grant/overview.md` first — the constraints
> section there is load-bearing and measured, not assumed.

## Prerequisite for testing it end-to-end

The demo-builder MCP reaches an agent through a generated project's `.mcp.json`,
or through the opt-in global registration (`demoBuilder.registerGlobalMcp`,
palette: "Demo Builder: Register Global MCP"). A session opened in the extension
REPO has neither, which is why the 2026-08-14 verification had to hit the
Configuration Service API directly instead of driving `create_project`. Register
the global MCP and start a fresh session before attempting an end-to-end test.
