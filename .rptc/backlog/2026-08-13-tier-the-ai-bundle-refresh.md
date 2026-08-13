# Tier the AI-bundle refresh instead of prompting for everything

## Provenance

Asked 2026-08-13, while fixing the global MCP entry that pins the extension version:
"If they need to be regenerated, why wouldn't we do that as part of an update?"

The prompt has a cost history: `.127` and `.128` each bumped `AI_CONTEXT_VERSION`, each
re-prompted every existing project, and each generated support questions. Both times the
change was small.

## The finding that makes this worth doing

**The extension already regenerates silently — on a different path.**
`updateExecutor.ts` (the Adobe MCP package update) runs `npm update`, then calls
`generateAIContextFiles(project.path, project, ctx.extensionPath)` and persists the freshness
stamp. No prompt. No question asked.

Meanwhile `aiContextFreshnessCheck` compares the project's `aiContextVersion` against
`AI_CONTEXT_VERSION` and puts a prompt in front of the identical operation.

So two routes perform the same regeneration and disagree about whether it needs consent.
That is an inconsistency, not a policy — and it means "regeneration must be consented to" is
already false in this codebase.

## What "Regenerate AI files" actually does

Three jobs behind one button, with very different costs:

| Job | Cost | Touches |
|---|---|---|
| Rewrite config paths | instant, offline, deterministic | `.mcp.json`, `.claude/mcp.json`, `.claude/settings.json` |
| Rewrite skills + AGENTS.md | fast, offline | `.claude/skills/*.md`, `AGENTS.md`, the `CLAUDE.md` pointers |
| Install MCP tool packages | slow, needs network, can fail | `.demo-builder-mcp/` via `installAiDefaultsMcpTools` |

The prompt asks permission for the third every time, even when only the first or second
changed. `AI_CONTEXT_VERSION` is a single integer, so the check cannot tell which happened —
only that *something* did.

Verified: regeneration is **not destructive to user content**. `skillsWriter` only writes the
files it owns; a user-authored skill in `.claude/skills/` survives. That removes the main
objection to doing it silently.

## Goal

Make the refresh proportionate. Repair what we own without asking; ask only before spending
someone's time or network.

- Config paths → silent, on activation. (The `global-mcp-version-pin` plan is the first
  instance of exactly this, for `~/.claude.json`.)
- Skills / AGENTS.md → silent, or a passive notice. See the risk below.
- Package installs → prompt, as today.

Most releases would then prompt nobody.

## The risk to settle first

Nothing stops a user editing `AGENTS.md` or a generated skill, and **today the prompt is the
only thing standing between those edits and being overwritten.** Going silent removes that
without replacing it.

Options, in order of preference:

1. Record a hash of each generated file when written; on refresh, overwrite only what still
   matches. A modified file gets left alone and reported.
2. Accept the loss deliberately and say so where users can see it — `AGENTS.md` already
   declares itself generated.
3. Keep the prompt for the skills tier only.

Do not go silent by simply not noticing.

## Execution plan

1. **Make the freshness check say WHAT is stale, not just THAT something is.** Either compare
   per-artifact, or have `AI_CONTEXT_VERSION` carry which tiers each bump touched. The
   constant's comment already records what each version added by convention — formalise it.
2. **Split `generateAIContextFiles` by tier** so callers can request one without the others.
   The three writers already exist as separate services; the orchestrator is what fuses them.
3. **Repair tier 1 on activation**, silently, for every known project. Offline and
   deterministic, so it cannot hang a window.
4. **Decide the tier-2 policy** using the risk section above, and implement whichever wins.
5. **Leave tier 3 behind a prompt**, and make that prompt say what it will download — the
   current wording covers all three jobs and so explains none of them.
6. **Reconcile the two paths.** Whatever policy lands, `updateExecutor`'s silent regeneration
   and the freshness check must follow the same one.

## Constraints

- `ai-context-authoring` governs: the four gate seams (`mcpConfigWriter.buildMcpConfig`,
  `aiDefaultsInstaller.installAiDefaultsMcpTools`, `componentInstallationOrchestrator`,
  `aiHandlers.handleRegenerateAiFiles`) change all or none, and any change to generated
  content still needs an `AI_CONTEXT_VERSION` bump.
- **Regenerate parity**: whatever creation writes, the refresh must reproduce for a project
  that gains the qualifying component later.
- Silent work must never be able to hang activation. Tier 1 is offline by definition; keep
  it that way.
- Do not fold this into `global-mcp-version-pin`. That is a small repair; this is a redesign
  of the update path, and the repair should not wait for it.

## Kickoff prompt

> Read `.rptc/backlog/2026-08-13-tier-the-ai-bundle-refresh.md`. Start by confirming the
> inconsistency: `updateExecutor.ts` regenerates the AI bundle silently after an Adobe MCP
> package update, while `aiContextFreshnessCheck` prompts for the same operation. Then decide
> the tier-2 policy — whether a user's edits to a generated file should survive a refresh —
> because everything else follows from that answer.
