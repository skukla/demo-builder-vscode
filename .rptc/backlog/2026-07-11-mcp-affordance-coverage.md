# MCP affordance coverage — close the agent-tool gaps

**Status**: ready

## Provenance

2026-07-11 audit (`.rptc/research/mcp-affordance-coverage/research.md`), prompted by the
`rename_project` gap: an agent asked to rename a project had no sanctioned path and could
only shell-`mv` the folder, stranding the extension's baked paths. `rename_project`
shipped the same day; this item covers the remaining gaps the audit found.

## Goal / Scope

Give agents a sanctioned tool for every project affordance they can plausibly be asked to
perform, per the validated tiering: tool descriptions are the affordance layer; AGENTS.md
sections are cross-tool loops; generated skills are multi-step-with-traps only. **No new
generated skills** — the audit confirmed every gap is a single tool once it exists.

In priority order (full rationale + caveats in the research doc):

1. **`get_project_urls`** (read) — one tool returning `{ storefront?, liveSite?, daLive?,
   commerceAdmin?, devConsole? }` from the existing validated URL logic behind the five
   open-browser affordances. Extraction-only; the admin URL path must return null rather
   than trigger the Configure prompt (no writes/prompts hiding in a read).
2. **`export_project_settings`** (read) — return the serialized settings JSON
   (`extractSettingsFromProject` is pure); sidesteps the save-dialog entirely.
3. **`deploy_mesh`** (action) — a HEADLESS handler over `withOrgContext(deployMeshComponent)`
   with DeployMeshCommand's guard order (lock → auth → org-mismatch), returning the real
   result. The existing `handleDeployMesh` is an `executeCommand` shim that returns before
   anything runs — do NOT expose it as-is.
4. **App Builder `deploy/redeploy/remove` descriptor rows** — after verifying the D1-runner
   handlers are headless-safe; `remove` is `confirm: true` (remote undeploy). If these land,
   extend the generated `extend-app-builder-app` skill (`ai-context-authoring` +
   AI_CONTEXT_VERSION bump).
5. **`refresh_block_library`** (action) — same service-layer lift as deploy_mesh; lowest
   priority.

## Constraints

- Follow `.claude/skills/mcp-tool-authoring` per tool: descriptor row (reads vs actions),
  zod inputSchema, handler still validates, count-pinned descriptor tests,
  `docs/systems/mcp-server.md` §9 sync, short when-to-use description (the agent's
  search surface).
- Explicitly out of scope (audited, skipped deliberately): pin/unpin, copy path, view
  mode, edit-project (interactive wizard), import/copy-from dialogs, open-AI/help/settings.

## Kickoff prompt

> Implement the MCP affordance-coverage backlog item
> (`.rptc/backlog/2026-07-11-mcp-affordance-coverage.md`). Read
> `.rptc/research/mcp-affordance-coverage/research.md` first — the coverage matrix,
> headless-safety notes, and per-tool caveats are there. Work the priority order;
> items 1–2 are small reads and can ship together; item 3 needs a new headless
> handler; item 4 starts with a headless-safety verification pass.
