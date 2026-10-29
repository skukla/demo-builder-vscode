# Step 08 — Launching a chat without Claude

Depends on step 03. Gated on a live run.

## Why it matters

The chat button is the extension's front door: the sidebar, the dashboard, the projects list and
the prompt picker all end in `openInClaude`. It spawns `claude [--continue] -- '<prompt>'` in a
terminal named "Claude Code", decides `--continue` by reading `~/.claude/projects`, and re-uses a
live terminal by bracketed paste. With Claude Code retired for colleagues, every one of those
doors leads nowhere.

## Behaviour

- The command keeps its name and its callers; the engine decides what it does.
- **Copilot CLI:** the same shape as today — a terminal, the prompt passed on the command line,
  re-use by paste. Whether Copilot CLI has a `--continue` equivalent is UNVERIFIED; if it does
  not, the first line of the prompt carries the context instead.
- **Copilot in VS Code:** open Copilot Chat with the prompt pre-filled. ADR-019 recorded that no
  API existed to inject into a live chat; whether VS Code now offers a command that opens chat
  with a query is UNVERIFIED and is the first thing to test. If it does not, fall back to putting
  the prompt on the clipboard and opening chat, and say so plainly in the toast.
- The transcript probe (`claudeSessionStore.ts`) is Claude-only and moves behind the seam.
- Wording stops promising Claude: "Prompt sent to Claude" becomes the engine's name.

## Files

`src/commands/openInClaude.ts` (and its name — it stops being accurate), `commandManager.ts`
registrations, `sidebarProvider.ts`, `AiZone.tsx`, `aiHandlers.ts`, `AiOverviewScreen.tsx`,
projects-dashboard handlers, `package.json` command titles.

## Checks

- Unit: each engine produces the expected launch action; unknown engine falls back rather than
  throwing.
- Live: from the sidebar, in a Copilot-only environment, the prompt reaches a working chat with
  the tools connected — the round trip an SC does twenty times a day.
- The eight webview bundles: the wording change touches shared UI, so name which surfaces render
  it (sidebar, dashboard, projectsList, aiOverview).
