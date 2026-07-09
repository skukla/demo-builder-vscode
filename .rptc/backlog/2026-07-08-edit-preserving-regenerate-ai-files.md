# Make "Regenerate AI Files" edit-preserving (stop clobbering user AI edits)

**Filed:** 2026-07-08 · **Status:** Ready — small-to-medium, own workstream.
**Origin:** surfaced by the code review of the AI-context-freshness feature (shipped 2026-07-08).

## Problem

`handleRegenerateAiFiles` → `generateAIContextFiles` (`projectFinalizationService.ts`) does UNCONDITIONAL
full-file overwrites via its three writers. It clobbers any user customization of the generated AI context:

- **`.claude/settings.json`** — fully replaced with just the Demo-Builder git-sync hook (or `{}`).
  Any user-added hooks / permissions / settings are wiped. **Highest-impact clobber.**
- **`AGENTS.md`** — regenerated from the manifest; hand-added prose/notes are lost. Both `CLAUDE.md`
  pointers reset to the one-liner.
- **The 12 shipped skills** — overwritten by fixed filename (edits to `sync-changes.md` etc. lost).
- SAFE today: user-authored EXTRA skills (dir not deleted), saved AI prompts, `.gitignore` (append-only).

## Why it matters now

The AI-context-freshness check (shipped 2026-07-08) surfaces "AI files out of date" and points users at
Regenerate. It is deliberately **detect-only** (no auto-heal) precisely because Regenerate is destructive —
prompting/badge-then-user-click is the interim guard. If Regenerate were edit-preserving, the guard could
relax: the freshness check (and the existing `mcpHealthCheck` silent auto-heal) could safely auto-heal
without risking user edits.

## Goal / approach (to design)

Make the three writers reconcile rather than clobber the parts a user can legitimately own:
- `.claude/settings.json`: MERGE the Demo-Builder hook into the existing object instead of replacing it
  (preserve user hooks/permissions; only ensure the git-sync PostToolUse hook is present).
- `AGENTS.md`: either a managed region (BEGIN/END markers) the writer owns while leaving user prose
  outside it intact, or accept full regeneration but stop advertising AGENTS.md as user-editable.
- Shipped skills: overwrite is defensible (they're extension-owned templates) — but consider a "you edited
  this shipped skill" guard, or leave as-is.
- Then: relax the freshness check to auto-heal (drop the badge-click gate) if desired.

## Constraints
- Behavior-preserving for the freshly-created case (a new project's files must still be exactly the
  generated bundle).
- Don't regress the mcp-config rewrite (the whole point of Regenerate for the MCP-path bug is a clean
  overwrite of `.mcp.json`/`.claude/mcp.json` — those are machine-owned, keep overwriting them).

## Kickoff prompt
> Make `generateAIContextFiles` edit-preserving: MERGE `.claude/settings.json` (keep user hooks/permissions,
> ensure the git-sync hook), give `AGENTS.md` a managed region so user prose survives, keep the
> machine-owned MCP configs as clean overwrites. Then optionally relax the ai-context-freshness check to
> auto-heal. See `.rptc/complete/ai-context-freshness/` and the code-review findings.
