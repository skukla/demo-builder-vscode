# MCP tools for Configuration Service site access

> ## CLOSED 2026-08-23 — shipped by AI-surface phase 4 (Group 6), better than specified
>
> `src/features/ai/server/siteTools.ts` carries the whole scope and more, verified
> live in the tree, the real-SDK registration suite, the built bundle, and
> `docs/systems/mcp-server.md`: `get_site_access` (read, no confirm gate),
> `set_site_admin` (the grant/revoke pair merged into ONE confirm-gated tool —
> the module docstring records why the split-by-mutation shape this item proposed
> was not used), and `repair_site_configuration` (confirm-gated; reports
> `nextStep: republish`). Every constraint below is honored in code: `verified`
> is a re-read, `not_authorized` surfaces `orgAdmins`, the last-admin refusal
> passes through. ONE deliberate deviation: emails are UNMASKED, with the
> rationale in the docstring — the tool's purpose is naming who can grant a
> role, and a masked address can neither be relayed nor passed to
> `set_site_admin`; the masking convention belongs to the diagnostics report.
> 36 tests in `siteTools.test.ts`.
>
> Archived when picked up for implementation and found already built — the
> index's own age rule ("re-measure the central claim before pickup") fired on
> the picker, not the filer.
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
