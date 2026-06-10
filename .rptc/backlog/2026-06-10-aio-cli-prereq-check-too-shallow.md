# Aio-CLI prereq check is too shallow — passes for non-functional installs

**Filed:** 2026-06-10
**Origin:** User-reported field issue (`v1.0.0-beta.113`). Colleague's `Demo Builder: Diagnostics` reported `✅ aio: @adobe/aio-cli/11.0.1 darwin-arm64 node-v20.20.0` — but every subsequent aio operation (`aio config get ims.contexts.cli.access_token --json`) hung for 5+ seconds and timed out. After she wiped `~/.config/aio` and reinstalled, the symptom went away. The binary was technically present; it just couldn't function.
**Status:** Ready — small surface change in one config file + one validator helper; pick up any time.

## Provenance

`src/features/prerequisites/config/prerequisites.json` for the `aio-cli` entry defines the install check as:

```json
"check": {
  "command": "aio --version",
  "parseVersion": "@adobe/aio-cli/([0-9.]+)"
}
```

That's the entire check. `aio --version` returns the bundled version string from a baked-in literal — it doesn't touch the user's config, network, or the Adobe API. The binary can return `@adobe/aio-cli/11.0.1` while its config-load path is broken, its network calls hang indefinitely, or its plugin registry is corrupted. The colleague's diagnostics log demonstrates exactly that failure mode at lines 78-89, 95-106, 108-119, 125-136 of `~/Desktop/diagnostics demo-builder.log` (her shared file). After 5 successful `aio --version` invocations marking the binary "installed," `aio config get` hung five times and forced re-authentication.

The relevant log slice:

```
[INFO]  [Prerequisites] ✓ Adobe I/O CLI is installed: 11.0.1
...
[WARN]  [Command Executor] Command timed out after 5000ms
[ERROR] [Command Executor] Process error: Command timed out after 5000ms
[WARN]  [Retry Strategy] Command timed out - not retrying
[WARN]  [Token] Timeout on attempt 1/3, retrying in 500ms...
[WARN]  [Token] Timeout on attempt 2/3, retrying in 1000ms...
[WARN]  [Token] Failed after 3 attempts: Operation took too long. Please try again.
```

The fix that worked for her was `npm uninstall -g @adobe/aio-cli && rm -rf ~/.config/aio ~/.aio && npm install -g @adobe/aio-cli --no-fund` — a full clean reinstall. The prereq check should have caught the broken state before she got that far.

## Goal / scope

Add a second-tier "functional" check that fires after the existing `aio --version` check passes. The functional check exercises config-load + plugin-registry paths (the same paths everything else in the extension uses), so a binary that responds to `--version` but can't actually do work gets flagged.

Two-tier check pattern:

1. **Tier 1 (existing, unchanged)** — `aio --version` parsed for `@adobe/aio-cli/<semver>`. Fast (<200ms). Proves the binary starts.
2. **Tier 2 (new)** — `aio plugins:list --json` with a 5-second timeout. Proves the binary can load its config and plugin registry. If it times out or returns non-JSON, the install is corrupted — surface that distinctly from "not installed," so the user gets an actionable message ("Adobe I/O CLI appears installed but is not responding. Try reinstalling: `npm uninstall -g @adobe/aio-cli && npm install -g @adobe/aio-cli`").

Both tiers run on every wizard startup. Tier 2 adds ~1-2s to the happy path; acceptable cost for catching this failure mode early.

## Execution plan

1. Look at how `prerequisites.json` represents multi-step checks today (the `plugins` array under `aio-cli` already runs `aio plugins` and asserts `contains: "@adobe/aio-cli-plugin-api-mesh"`). The schema can extend to multi-step checks per prereq, OR a new `functionalCheck` field that runs only after the primary `check` passes. Pick whichever fits the existing infrastructure with the smallest diff.

2. Extend the prereq check engine in `src/features/prerequisites/services/` to run the functional check when present. Surface three distinct states: `installed-and-functional`, `installed-but-broken`, `not-installed`. The "broken" state should show the user a different message and offer a one-click "reinstall" action (reusing the existing uninstall + install commands).

3. Confirm: the existing `aio plugins` check used for api-mesh plugin verification (`prerequisites.json:plugins[0].check`) is essentially the same command. The new tier-2 check can reuse that command's output if the engine already invokes it. Avoid running `aio plugins:list` twice if avoidable.

4. Add one test that simulates `aio --version` succeeding but `aio plugins:list --json` timing out, and asserts the prereq is reported as `installed-but-broken` (not `installed`).

5. Manual verification: corrupt aio's local config (`mv ~/.config/aio ~/.config/aio.bak`), open the wizard, confirm the broken state is detected with the right message; restore (`mv ~/.config/aio.bak ~/.config/aio`) and confirm the wizard proceeds.

## Constraints

- Don't add a generic "every prereq gets a functional check" mechanism. The `aio` failure mode is specific (binary works for self-reflection but not for real ops); other prereqs don't share it. YAGNI says scope to aio-cli only until a second instance shows up.
- Keep tier-1 fast. If tier 2 takes too long for a sluggish network, only tier 2's result changes; the user still sees something marked installed (just degraded) and can act on it.
- The reinstall action this surfaces must work cross-platform. `npm uninstall -g` is portable; the cache-clear (`rm -rf ~/.config/aio`) is Unix-only. Windows users have `%APPDATA%\@adobe\aio` instead. Either pick the OS at runtime, or skip the cache clear from the auto-action (and document the manual step in the error message).

## Kickoff prompt

```
Add a tier-2 functional check to the aio-cli prerequisite so installs that respond
to `aio --version` but hang on real operations are surfaced as
"installed-but-broken" instead of "installed" (see
.rptc/backlog/2026-06-10-aio-cli-prereq-check-too-shallow.md).

The existing check at `src/features/prerequisites/config/prerequisites.json`
runs `aio --version` and parses the version string. Add a second-stage check
that runs `aio plugins:list --json` with a 5-second timeout. If tier 1 passes
but tier 2 times out, the prereq engine should report a distinct
"installed-but-broken" state with a message instructing the user to reinstall
(`npm uninstall -g @adobe/aio-cli && npm install -g @adobe/aio-cli`). The
existing `aio plugins` check for the api-mesh plugin (same prereq, plugins
array) is essentially the same operation — reuse its result if the engine
already invokes it.

One regression test: simulate `aio --version` succeeding and `aio plugins:list
--json` timing out, assert the prereq is reported as broken. Manual
verification: temporarily move `~/.config/aio` aside, confirm the wizard
detects the broken state; restore and confirm it proceeds normally.

Scope is aio-cli only. Don't generalize to a per-prereq functional-check
mechanism — YAGNI applies.
```
