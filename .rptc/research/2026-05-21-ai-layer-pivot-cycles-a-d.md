# AI Layer Pivot — Manual Validation Plan (Cycles A–D)

**Date**: 2026-05-21
**Branch**: `feature/ai-layer-cycle-d` (5 commits ahead of Cycle C tip)
**Goal**: From-zero validation that all surfaces shipped in Cycles A–D work end-to-end before merging the cycle work to `develop`.
**Out of scope**: Items in [`.rptc/backlog/`](../backlog/README.md).

Use the checkboxes to track progress. Capture observations in the **Notes** box under each section. If any step fails, drop a line in the **Findings** table at the bottom.

---

## Pre-flight

- [ ] **Clean slate**: confirm zero projects in `~/Documents/AdobeDemoBuilder` (or your projects root).
- [ ] **Back up** `~/.claude.json` if you've been using Claude Code: `cp ~/.claude.json ~/.claude.json.bak`.
- [ ] **Check current MCP state**: `jq '.mcpServers["demo-builder"]' ~/.claude.json` — note the value (null / present).
- [ ] **VS Code**: `anthropic.claude-code` extension installed at v2.1.72 or newer.
- [ ] **CLI sanity**: `claude --version` works in a plain shell.
- [ ] **Launch Extension Development Host** (`F5` from `demo-builder-vscode` workspace).
- [ ] In the Host, open View → Output → **"Demo Builder: Logs"** and keep it visible.

**Notes:**

```
(starting MCP state, any anomalies before testing)
```

---

## A. Activation + global MCP registration (Cycle B)

**Timing correction**: the consent prompt fires at the **end of project creation**, NOT on extension activation. Call site: `src/features/project-creation/handlers/executor.ts:446` → `ensureGlobalMcpRegistration`.

**State machine** (`src/features/project-creation/services/mcpConfigWriter.ts:170-188`):

| globalState `demoBuilder.ai.globalMcpRegistration` | Behavior |
|---|---|
| `'registered'` | Skip — already done |
| `'declined'` | Skip — user hit "Don't Ask Again" |
| `undefined` / "Not Now" | Prompt re-appears on next project creation |

- [ ] Watch for the **Register / Not Now / Don't Ask Again** info-message toast at the end of step B4 below.
- [ ] If you've previously hit "Don't Ask Again", the prompt is suppressed — bypass via the **Register** button in the AI Configuration tab (covered in step C12) and reset globalState if you want a clean test.

**Notes:**

```
(did the prompt appear? which button? final ~/.claude.json state?)
```

---

## B. Create a new project (Cycles A + B)

- [ ] **B1** Command Palette → `Demo Builder: Create Project`.
- [ ] **B2** Pick a demo package with an **EDS storefront** (required for the Adobe extensibility tools test).
- [ ] **B3** Complete the wizard end-to-end. EDS pipeline finishes without errors.
- [ ] **B4** Note when finalization completes — this is when the Cycle B consent prompt fires.

### B5 — AI file layout (Cycle A)

In a terminal, with `PROJ=<path-to-new-project>`:

```bash
ls -la "$PROJ/AGENTS.md" "$PROJ/CLAUDE.md" "$PROJ/.claude/CLAUDE.md"
wc -l "$PROJ/CLAUDE.md" "$PROJ/.claude/CLAUDE.md"   # should each be 1 line
ls "$PROJ/.claude/skills/"
cat "$PROJ/.mcp.json"           # only demo-builder server
cat "$PROJ/.claude/mcp.json"    # only demo-builder server
ls "$PROJ/.cursor/mcp.json" "$PROJ/.codex/mcp.json" 2>&1   # should both fail (gone)
```

- [ ] `AGENTS.md` present and non-empty
- [ ] Both `CLAUDE.md` pointers are one-liners (`see @AGENTS.md`)
- [ ] `.claude/skills/` contains: `add-component.md`, `sync-changes.md`, `update-credentials.md`, plus the Adobe bundle skills (verify in B7)
- [ ] Both `.mcp.json` files contain ONLY a `demo-builder` server (no DA.live / commerce / aem-content entries)
- [ ] No `.cursor/mcp.json` and no `.codex/mcp.json`

### B6 — PostToolUse hook (Cycle A)

```bash
cat "$PROJ/.claude/settings.json"
```

- [ ] `hooks.PostToolUse` entry exists, targets storefront file edits, triggers `regenerate_ai_files_after_run`.

### B7 — Adobe extensibility tools (Cycle B)

```bash
ls "$PROJ/components/eds-storefront/node_modules/@adobe-commerce/commerce-extensibility-tools/"
jq .version "$PROJ/components/eds-storefront/node_modules/@adobe-commerce/commerce-extensibility-tools/package.json"
```

- [ ] Package installed in the storefront's `node_modules`
- [ ] Version recorded: `_____________` (you'll compare against this in section F)

**Notes:**

```
(any file-layout deviations, missing skills, unexpected MCP entries)
```

---

## C. AI Configuration tab — inventory backend (Cycles C + D)

Open: Project Dashboard → **Configure** → **AI Configuration** tab. (Or sidebar nav → "AI Configuration".)

- [ ] **C8** All four Status rows render: **Skills**, **Project MCP Servers**, **Session MCP Servers**, **Global MCP Registration**.

### C9 — Skills drill-down

- [ ] Expand the **Skills** row.
- [ ] 3 `demo-builder` skills present + N `adobe` skills from the bundle.
- [ ] Each row shows name, description, source classification badge.

### C10 — Project MCP Servers drill-down

- [ ] Expand. `demo-builder` server appears.
- [ ] Expand the server: 7 tools listed — `list_projects`, `get_project`, `get_component_config`, `update_project_config`, `sync_storefront`, `list_blocks`, `get_block_source`.
- [ ] StatusCard color: **green**.
- [ ] (Proves `mcpInspector` spawned `dist/mcp-server.js` via stdio and the SDK env allowlist let the child run.)

### C11 — Session MCP Servers drill-down

- [ ] Expand. If you've connected Adobe MCPs in Claude Code before, they appear with display name + `needsAuth` indicator.
- [ ] If none, empty state reads "No session MCP activity detected" — that's correct, not an error.

### C12 — Global MCP Registration

- [ ] Row reads `registered` (green) if you accepted the prompt in section A.
- [ ] Register button: hidden if registered, shown otherwise.
- [ ] **Bypass test**: if you previously declined, click **Register** here. `~/.claude.json` gets the entry; row turns green.

### C13 — Refresh action

- [ ] Click **Refresh**. Spinner shows briefly. Project MCP cache clears, `tools/list` re-runs.
- [ ] Output is idempotent (no spurious diffs).

**Notes:**

```
(missing skills, MCP spawn failures, empty inventories where data was expected)
```

---

## D. Open in Claude Code — three harness modes (Cycle D)

Default setting: `"demoBuilder.ai.harness": "auto"`.

### D14 — Auto + extension installed

- [ ] Confirm setting is `"auto"`.
- [ ] Project Dashboard → click the **Open in Claude Code** tile (Wrench icon).
- [ ] Expected: Claude Code extension opens; first-time tip toast appears once about dragging the panel to the secondary side bar.
- [ ] Click the tile again — NO tip the second time (globalState `demoBuilder.ai.firstClaudeOpenTipShown = true`).

### D15 — Auto from project-card menu

- [ ] Sidebar → "Projects" (home).
- [ ] Project card → kebab → **Open in Claude Code**.
- [ ] Same launch behavior. (This exercises the D4 payload-aware handler.)

### D16 — Forced terminal mode

- [ ] Set `"demoBuilder.ai.harness": "terminal"`.
- [ ] Click Open in Claude Code from either entry point.
- [ ] Expected: terminal named "Claude Code" opens, cwd = project path, runs `claude`. NO extension activation.

### D17 — Forced extension mode, extension missing (negative test)

- [ ] Set `"demoBuilder.ai.harness": "extension"`.
- [ ] Extensions panel → disable `anthropic.claude-code`.
- [ ] Click Open in Claude Code.
- [ ] Expected: VS Code error message about the extension being required. NO terminal opens, NO URI launch attempted.
- [ ] Re-enable `anthropic.claude-code`.

### D18 — Restore default

- [ ] Set `"demoBuilder.ai.harness": "auto"`.

**Notes:**

```
(any mode that didn't behave correctly, tip-toast misfires, label/icon issues)
```

---

## E. Regenerate AI Files (Cycle A files written correctly, via Cycle D UI)

### E19 — Break files

```bash
rm "$PROJ/.claude/skills/add-component.md"
echo "" > "$PROJ/AGENTS.md"
```

- [ ] Files broken on disk.

### E20 — Regenerate

- [ ] AI Configuration tab → click **Regenerate AI Files**.
- [ ] `add-component.md` restored.
- [ ] `AGENTS.md` has content again.
- [ ] Tab auto-re-verifies; the 4 Status rows return to green.
- [ ] `.cursor/mcp.json` is still NOT created (Cycle A retraction holds).

**Notes:**

```
(missing files after regen, status row not green, etc.)
```

---

## F. Adobe MCP update check (Cycle D)

### F21 — Run the checker

- [ ] Command Palette → `Demo Builder: Check for Updates`.
- [ ] In the QuickPick, look for `Adobe MCP  <current> → <latest>` if Adobe published a newer release.
- [ ] If versions match, no Adobe MCP item appears (correct — no update available).

### F22 — Apply the update (if offered)

- [ ] Select the Adobe MCP item, hit Update.
- [ ] Expected: npm runs in the storefront, version bumps, `generateAIContextFiles` re-runs (Logs channel: "Generating AI context files…").
- [ ] Verify: `jq .version "$PROJ/components/eds-storefront/node_modules/@adobe-commerce/commerce-extensibility-tools/package.json"` — bumped (compare to B7 baseline).
- [ ] AI Configuration tab → Skills → new/changed Adobe skills reflect.

### F23 — Skip-condition coverage

```bash
mv "$PROJ/components/eds-storefront/node_modules" /tmp/nm-bak
```

- [ ] `Check for Updates` again. No Adobe MCP item appears (graceful skip — no error toast).
- [ ] Restore: `mv /tmp/nm-bak "$PROJ/components/eds-storefront/node_modules"`.

**Notes:**

```
(npm errors, missing regenerate step, false-positive updates)
```

---

## G. Standalone MCP server smoke test (Cycle A)

### G24 — Discover via Claude Code

From outside any Demo Builder project:

```bash
claude   # fresh terminal, default workspace
```

In the Claude session:

```
/mcp
```

- [ ] `demo-builder` server lists as available.
- [ ] Ask Claude: `list my Demo Builder projects` — should return the project you created in section B.

(Proves global registration from section A wired into Claude Code's discovery.)

**Notes:**

```
(MCP not discovered, tool calls failing, env-related crashes)
```

---

## H. Label rename verification (Phase 4 fix)

- [ ] **H25a** Sidebar's 4th nav item reads **"AI Configuration"** (not "AI Setup").
- [ ] **H25b** Configure screen tab list shows **"Configuration | AI Configuration"**.
- [ ] **H25c** `src/commands/CLAUDE.md`, `docs/architecture/overview.md`, root README all consistently say "AI Configuration".

**Notes:**

```
(any remaining "AI Setup" in user-visible UI)
```

---

## I. SyncStorefrontCommand (Cycle B Step 8)

### I26 — Storefront sync tile

- [ ] Edit any file in `"$PROJ/components/eds-storefront/"` (e.g., a block CSS file).
- [ ] Project Dashboard → click the **Sync Storefront** tile.
- [ ] Expected: non-technical UX, no raw git output. Successful commit + push. Logs channel confirms.
- [ ] Conflict path (optional): introduce a divergent change upstream first to exercise the rebase/cancel flow.

**Notes:**

```
(any technical git output leaking to UI, push failures, sync hang)
```

---

## J. Cleanup verification

### J27 — Delete the test project

- [ ] Project Dashboard → Delete Project. Confirms.
- [ ] Expected: GitHub repo / DA.live content / Helix CDN all cleaned up (see Logs).
- [ ] `~/.claude.json::mcpServers.demo-builder` entry persists (it's user-scope, not project-scope — by design).

### J28 — Restore

- [ ] Optionally restore `~/.claude.json.bak` if you wish to undo the registration.

---

## Findings

Add a row whenever something doesn't match expected behavior.

| Section | Step | Severity | What I Saw | Expected | Logs/Screenshot ref | Status |
|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |

---

## Sign-off

- [ ] All sections complete
- [ ] Findings table empty OR every row resolved
- [ ] Ready to merge `feature/ai-layer-cycle-d` → `develop`

**Tester**: _______________ **Date completed**: _______________
