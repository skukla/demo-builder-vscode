# Step 01 — A hook can no longer block everything

**Why first.** This is the only item that can break someone today. The `aio` guard we generate
relies on a matcher. VS Code's Local harness reads Claude-format hooks (behind
`chat.useClaudeHooks`, which it offers to enable) and **ignores matchers**, so the guard's
`echo …; exit 2` would deny every tool call in that project. In Copilot CLI the opposite happens:
the guard never fires, because MCP tools are named `commerce-extensibility-aio-…`, not
`mcp__commerce-extensibility__aio-…`.

The same shape threatens this repo: `.claude/settings.json` runs every hook as
`bash "$CLAUDE_PROJECT_DIR/.claude/hooks/…"`, Copilot does not document that variable, and a
failing pre-tool hook denies the call in Copilot CLI.

## Behaviour

1. **A hook script decides for itself whether it applies.** It reads the tool name from its stdin
   payload, accepts both `mcp__<server>__<tool>` and `<server>-<tool>`, and exits 0 when the call
   is not the one it guards. No script relies on a matcher to avoid firing.
2. **A hook script cannot fail closed by accident.** Where the project directory is not supplied,
   it falls back to the repository root (`git rev-parse --show-toplevel`) or the payload's cwd.
3. **Generated projects carry both formats.** The Claude hooks stay as they are; the same guards
   are written as Copilot hooks (`.github/hooks/*.json`, camelCase events), so the surface that
   reads either gets the same behaviour.
4. **The git-sync hook reads the edited path under either name**, Claude's and Copilot's.

## Files

- `src/features/project-creation/services/aiBundle/claudeSettingsWriter.ts` — the guard and the
  git-sync hook; extract the script bodies so both formats share one source.
- a new writer beside it for `.github/hooks/*.json`, through `GeneratedFileWriter` (ADR-013), with
  the path added to the same `.gitignore` treatment if it carries machine paths.
- `.claude/settings.json` + `.claude/hooks/*.sh` in THIS repo — the `CLAUDE_PROJECT_DIR` fallback.

## Checks

- Unit: a payload naming `commerce-extensibility-aio-app-use` is refused; one naming an unrelated
  tool exits 0; a payload with no project directory still finds the scripts.
- The existing hook-proof harness (`.claude/hooks/rules/*.proof.sh`, `tests/hooks/rule-proofs.test.ts`)
  covers this repo's half.
- Live, once a Copilot seat exists: open a generated project in Copilot CLI and in VS Code with
  Claude hooks enabled; ordinary edits pass, `aio app use` is refused, and the storefront push
  still happens.

## Built (2026-09-16)

- **The `aio` guard decides for itself.** The command reads the payload, matches the tool NAME
  field against both `mcp__commerce-extensibility__<tool>` and `commerce-extensibility-<tool>`,
  and exits 0 for anything else — including an empty or unparseable payload. The matcher stays
  for the harness that honours it. No Node, no interpolated path
  (`claudeSettingsWriter.ts`, `buildAioGlobalGuardHook`).
- **The git-sync extractor accepts `filePath` as well as `file_path`.** Copilot's own key
  spelling is unverified; both are read, and the doc comment says so.
- **This repo's hooks find their scripts without `CLAUDE_PROJECT_DIR`.** The eight commands in
  `.claude/settings.json` resolve `${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel …)}`.
  Verified by running the router with the variable unset: an ordinary Bash call exits 0, and a
  call the rules block still exits 2 with its message.
- Tests: six cases execute the guard with Claude-shaped, Copilot-shaped, unrelated, empty and
  unparseable payloads, plus the false-positive probe (an edit whose CONTENT names a guarded tool
  must not be refused). The test that pinned the old "static, no conditional" design was replaced,
  with the reason recorded in the suite.

## Still to do here, gated on a Copilot seat

- **`.github/hooks/*.json` for generated projects.** The documented shape is
  `{ "version": 1, "hooks": { "preToolUse": [ { "type": "command", "command": … } ] } }`, but
  shipping a config we have never seen load is how an invalid file silently disables every hook.
  Write it with the seat in hand, confirm Copilot loads it, then wire it into the four bundle
  seams and bump `AI_CONTEXT_VERSION`.
- Until then Copilot CLI still gets the guard (it reads `.claude/settings.json`), and VS Code's
  Local agent gets it only if the user enables Claude hooks — fail-OPEN, where the old design was
  fail-closed on every call.

## Open question this step answers

What keys Copilot puts in `tool_input` for edits (UNVERIFIED in the research). A throwaway
`.github/hooks/probe.json` that appends its stdin to a file settles it in one run.
