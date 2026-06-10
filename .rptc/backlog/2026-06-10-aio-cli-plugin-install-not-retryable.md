# Aio-CLI install treats CLI + plugin as one atomic step — partial failures aren't retryable

**Filed:** 2026-06-10
**Origin:** Field case `v1.0.0-beta.113`. Colleague's aio CLI installed successfully (4m 43s on a throttled laptop), then the api-mesh plugin install timed out at 180s. The wizard reported "Adobe I/O CLI installation did not complete," and there was no way to click Install again to retry just the failed plugin — the install action was either gone or non-functional. The CLI was installed; only the plugin was missing. The install state model treats the prereq as atomic and doesn't expose a path to fix partial failures from the UI.
**Status:** Ready — moderate scope; needs an install-state model decision before code change. ~30-60 minutes once the model is settled.

## Provenance

`src/features/prerequisites/handlers/installHandler.ts:541` calls `installPlugins(context, prereq, prereqId, targetVersions)` immediately after the CLI install completes. `installPlugins` (line 291) iterates `prereq.plugins`, runs each plugin's install commands sequentially, and catches per-plugin failures at line 332:

```ts
context.logger.warn(`[Prerequisites] Failed to install plugin ${plugin.name}${versionLabel}: ${toError(pluginError).message}`);
```

When that fires, the outer handler eventually hits line 456 — `"installation did not complete"` — and the prereq is left in a "not installed" state from the wizard's perspective, even though the CLI binary IS installed on disk and only the plugin is missing.

From the colleague's log:

```
16:49:34 [Prerequisites] Completed step: Install Adobe I/O CLI (Node 20)         ← CLI installed ✓
16:49:34 [Prerequisites] Adobe I/O CLI has 1 plugin(s) to check
16:49:34 [Prerequisites] Installing plugin API Mesh Plugin for Node 20
16:52:34 [Prerequisites] Failed to install plugin API Mesh Plugin for Node 20    ← plugin failed
16:52:55 [Prerequisites] Adobe I/O CLI installation did not complete             ← whole prereq marked incomplete
```

So her actual machine state at 16:52:55:
- `aio` binary present in fnm's Node 20 bin dir — works for `aio --version` (just slowly)
- `@adobe/aio-cli-plugin-api-mesh` not installed
- Wizard's state: "Adobe I/O CLI not installed" → install action either missing, ineffective, or re-running the CLI install instead of just the plugin

The user-facing problem: she can't recover without leaving the wizard, opening a terminal, and running `aio plugins:install @adobe/aio-cli-plugin-api-mesh` by hand. That assumes she knows the exact command — which a typical SC wouldn't.

## Goal / scope

Decouple "is the CLI installed?" from "are the required plugins installed?" in the install state model, so a partial-success state has a clean retry path. Three approaches by scope:

1. **Per-step retry button** (smallest). Add a separate "Retry plugin install" action on the prereq card when the state is "CLI installed, plugin not." Runs `installPlugins` directly without re-running the CLI install. Cheapest change; works for the current single-plugin case.
2. **Idempotent install action** (medium). Make the existing Install action smart: if the CLI is already present, skip the CLI step and jump straight to the plugin install. Same UI surface, smarter implementation. Survives future cases where additional plugins land.
3. **Split CLI and plugin into separate prereqs** (largest). Two entries in `prerequisites.json` — `aio-cli` and `aio-plugin-api-mesh`. Each has its own check + install + retry. More config sprawl but the state model is dead-simple.

Recommend **option 2**. The user-facing behavior is what matters — "Install" should always do the right thing for the current state. Option 2 keeps the UI the same as today and only fixes the internal logic. Option 1 surfaces a new button the user has to learn. Option 3 adds config sprawl for a problem that only affects one prereq today.

## Execution plan

1. Look at how `installHandler.ts` decides whether to fire the install action at all. The "Install" button visibility is probably keyed on the prereq's `installed=false` state — confirm that's the right gate.
2. In the install handler, before running the CLI install command, check if `aio --version` succeeds (the existing prereq `check` command). If it does, skip the CLI install and jump directly to `installPlugins`. If it doesn't, run the full install.
3. The plugin install error path stays — `installPlugins` catches per-plugin failures (line 332) and the outer handler reports the prereq as incomplete (line 456). After the change, retrying the Install action while the CLI is present just re-runs the plugin install.
4. Make sure the cache invalidation around line 462 (`[Prerequisites Cache] Invalidated 2 cache entries for aio-cli`) still fires correctly so the recheck after install picks up the new plugin state.
5. Add a regression test that simulates: CLI install succeeds → plugin install fails → user clicks Install again → only the plugin install runs (not the CLI install) → recheck reflects current state.

## Constraints

- Don't change `prerequisites.json` schema. The current single-prereq-with-plugins shape works; the problem is in the install handler's sequencing, not the config.
- Don't fall back to "always run both" on retry. That'd re-run a 4m 43s CLI install for a 30s plugin retry — wasteful and confusing on slow networks.
- Don't surface the "CLI is installed but plugin isn't" partial state in the UI as anything other than "not installed." The user shouldn't have to understand the internal distinction; the Install button just needs to do the right next step. This is a contract: from the UI's perspective, the prereq is either installed (CLI + plugin) or not.
- This case will interact with the [low-power install hint](2026-06-10-prereq-install-low-power-hint.md) and the [tier-2 aio prereq check](2026-06-10-aio-cli-prereq-check-too-shallow.md). All three improvements compose: the tier-2 check detects broken installs, the retry handles partial installs, and the hint tells users what to try. Land them in any order; each is self-contained.

## Kickoff prompt

```
Make the aio-cli prereq install action idempotent against plugin failures (see
.rptc/backlog/2026-06-10-aio-cli-plugin-install-not-retryable.md).

Today `installHandler.ts:541` always runs the CLI install before `installPlugins`,
so when the CLI install succeeded but the plugin install failed (her case), the
user has no path to retry just the plugin from the wizard.

Change the install handler: before running the CLI install command, check if
the existing prereq `check` command (`aio --version`) succeeds. If yes, skip
the CLI step and jump straight to `installPlugins`. If no, run the full install.
The Install button stays the same in the UI; only the internal sequencing
becomes smart about current state.

Don't touch `prerequisites.json`. Don't add new UI. Don't fall back to "always
run both." Add a regression test that runs the install flow twice — first with
no CLI present, then with CLI present + plugin missing — and asserts the
second run skips the CLI install command and only runs the plugin install.

Related (compose, ship in any order):
- .rptc/backlog/2026-06-10-prereq-install-low-power-hint.md
- .rptc/backlog/2026-06-10-aio-cli-prereq-check-too-shallow.md
```
