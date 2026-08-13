# ADR-013: Generated AI Files — Hash-and-Skip Edit Survival

**Status**: Accepted — policy decided 2026-08-14; implementation pending (backlog: `tier-the-ai-bundle-refresh`)
**Date**: 2026-08-14
**Decision Maker**: Project Owner
**Implementer**: Pending

Related: [ADR-004 Claude Code Harness](004-claude-code-harness.md) (why every project carries a generated AI bundle at all). Backlog item `.rptc/backlog/2026-08-13-tier-the-ai-bundle-refresh.md` holds the full refresh redesign this decision unblocks; the `ai-context-authoring` skill governs the seams.

---

## Context

Every project gets a copy of the extension's AI context at creation: skills under
`.claude/skills/`, `AGENTS.md`, the `CLAUDE.md` pointers, `.mcp.json` /
`.claude/mcp.json` / `.claude/settings.json`, and the MCP tool packages in
`.demo-builder-mcp/`. "Regenerate AI files" rewrites all of it.

Nothing stops a user editing a generated file — `AGENTS.md` invites project-specific
context, and a generated skill is just markdown in their repo. **Today the only thing
standing between those edits and silent overwrite is the Regenerate prompt.** That
prompt exists for a different reason (a package download costs time and network), and
it fires on every `AI_CONTEXT_VERSION` bump for every project — `.127` and `.128`
each re-prompted everyone over small changes, generating support questions.

The refresh redesign (backlog: `tier-the-ai-bundle-refresh`) wants most refresh work
to happen silently: config-path repair on activation, skills/AGENTS.md rewrites
without a prompt, with only real downloads still asking. Going silent removes the
accidental edit-protection the prompt provided, without replacing it — unless
something else takes over that job.

Three options were considered:

1. **Hash-and-skip** — record a hash of each generated file when written; on refresh,
   overwrite only files that still match their recorded hash; leave modified files
   alone and say so.
2. **Accept the loss** — overwrite everything, document that generated files are
   generated (`AGENTS.md` already declares it).
3. **Keep the prompt for the skills tier only** — consent as edit-protection,
   permanently.

## Decision

**Option 1: hash-and-skip.** Every writer of generated AI content records a content
hash per file at write time. On any refresh — prompted or silent — a generated file
is overwritten only when its current content still matches the recorded hash:

- **Match** → ours to rewrite; overwrite silently.
- **Mismatch** (user edited it) → leave the file untouched, log it, and surface the
  skip where the user will see it (the regenerate result message and/or the AI
  Capabilities modal), so the edit's survival is a stated fact rather than luck.
- **No recorded hash** (file predates this ADR) → treat as unmodified ONCE, on the
  first refresh after upgrade, and record hashes from that write onward. A project
  that edited a generated file before hashes existed loses that edit on the first
  refresh — the same exposure they have today on every Regenerate click — and gains
  protection thereafter.

A skipped file is an event, not a silence: the log line names the file and why it was
left alone. This is what makes the rest of the refresh redesign safe to build —
silent tiers can be silent because overwriting is now provably confined to content
the extension owns.

## Consequences

- **Unblocks** the tiered-refresh steps in `tier-the-ai-bundle-refresh`: silent
  config-path repair, silent skills/AGENTS.md refresh, prompt only for downloads.
- A user's edited skill or `AGENTS.md` **diverges** from the shipped bundle and stays
  diverged — by design. The skip report is the signal that they own that file now;
  "regenerate from scratch" (delete the file, refresh) remains the way back.
- Writers gain a small obligation: every generated file must flow through the
  hash-recording write path. A writer that bypasses it reverts that file to today's
  overwrite behaviour — reviewable at the seams named in `ai-context-authoring`.
- The hash store is extension-owned state about project files. It must live outside
  the user's repo content (not itself a tracked generated file a user might edit) —
  the project manifest the extension already owns is the natural home; exact shape is
  an implementation choice.

## Alternatives Considered

- **Accept the loss (option 2)**: cheapest, but turns a real user artifact into a
  casualty of any release, and the "it said generated" defence reads poorly the day
  it deletes an afternoon of someone's prompt-engineering.
- **Prompt-as-protection (option 3)**: keeps the `.127`/`.128` support-question
  generator forever, and protects nothing on the paths that already regenerate
  without asking (`updateExecutor` after an Adobe MCP package update) — the
  protection it offers is already inconsistent today.
