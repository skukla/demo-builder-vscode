# Debugging

Two entry points, and knowing which one answers your question saves the most time.

## "Demo Builder: Diagnostics"

Command Palette → **Demo Builder: Diagnostics**. Its report carries `system`,
`vscode`, `tools`, `adobe`, `mcp`, and probes of the GitHub credential, the
Configuration Service, the storefront and the credential service.

The `aio` checks in it stay **sequential on purpose**: the first `aio` command in a
session writes `aio-cli-telemetry.optOut` to a shared config file, and parallel
invocations race that write.

**Run it before reading logs.** Most reports that look like a bug in a feature are an
environment answer — a stale token, a missing Node major, a CLI that is not where the
extension expects. Diagnostics answers those in one step.

## Which build is actually running

The build stamp is not a nicety. `launch.json` passes
`--extensionDevelopmentPath=${workspaceFolder}`, so F5 binds the Extension Dev Host
to whichever *window* had focus — and with a worktree open alongside the main
checkout, every change built into the other tree is invisible.

Nothing else names the loaded build. On 2026-08-12 two reload-and-look cycles went by
and the first diagnosis blamed a watcher that did not exist. See
`@/core/build`.

Extension-host changes need **F5**. Cmd+R reloads only the webview.

## Reading a Debug Logs dump

The structured stdout/stderr block **above** a blank error line carries the truth —
the error line itself is frequently empty, which sends people looking in the wrong
place.

[debug-log-triage](../../.claude/skills/debug-log-triage/SKILL.md) has the
benign-noise catalog and the channel-to-feature map.

## Conventions that bind this

The rules are in [the handbook](../development/handbook.md). Secrets never reach a
log, which is what makes a Debug Logs dump safe to paste into an issue — this
repository is public.
