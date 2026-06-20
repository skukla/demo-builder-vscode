# Project MCP servers fail MODULE_NOT_FOUND — `.mcp.json` points at storefront node_modules

**Status:** Filed 2026-06-20 from a live AI-verify session. **Root cause CONFIRMED + remedy verified.**
Direction chosen: **open-time self-heal** (auto-regenerate when an MCP path doesn't resolve).

## Verified 2026-06-20

- **Regenerate AI files fixes it.** After clicking it on `b2b-tester`, `.mcp.json` now points at
  `b2b-tester/.demo-builder-mcp/node_modules/...` and the isolated dir is populated. ✓
- **`my-commerce-demo` was RENAMED to `b2b-tester`, not deleted.** The rename→regenerate fix
  `eaaf44c8` (2026-06-18) already handles this correctly (calls `generateAIContextFiles(newPath, …)`
  at the end of a path-changing rename). `b2b-tester` was created 2026-06-10 and renamed **before**
  that fix existed (and before the tools-dir isolation) — a **pre-fix casualty**, not a live rename
  bug. New renames are covered.
- **Deeper gap the self-heal also covers:** `eaaf44c8` regenerates *non-fatally* during rename, so a
  silently-failed inline regen (e.g. the b2b `@dropins` install abort) leaves the rename "successful"
  but the config stale. Open-time self-heal is the backstop for that and for all pre-fix projects.

## Design (open-time self-heal — cause-agnostic, honors rename automatically)

- **Detect (cheap, no network):** on project open, `stat` each `.mcp.json` server arg path; drift =
  any non-`demo-builder` server whose file doesn't resolve. Pure filesystem.
- **Heal only when broken:** if drift, run the existing `generateAIContextFiles` (install →
  `.demo-builder-mcp/node_modules`, then rewrite `.mcp.json` to this-project isolated paths). Healthy
  projects do nothing.
- **Visible, not silent:** reuse the shipped "Regenerate AI files" `creationProgress` UI so it reads
  as "Updating AI configuration…", not a mystery stall on open (avoid the surprise-background-work
  smell — cf. the dashboard org-check browser-launch).
- Because detection is path-existence (not "was it renamed?"), it covers rename, tools-dir migration,
  move, and silent inline-regen failure uniformly.

---
_The confirmed root-cause analysis below stands; only the "deleted" framing was corrected to "renamed"._

## CONFIRMED root cause (2026-06-20)

Inspected `b2b-tester`'s live `.mcp.json` (the originally-reported `my-commerce-demo` was already
deleted). Its MCP server args are:
```
commerce-extensibility → node  /Users/kukla/.demo-builder/projects/my-commerce-demo/components/eds-storefront/node_modules/@adobe-commerce/commerce-extensibility-tools/index.js
playwright             → node  /Users/kukla/.demo-builder/projects/my-commerce-demo/components/eds-storefront/node_modules/@playwright/mcp/cli.js
```
This is **stale on two axes at once**: (1) it points at **a different project** (`my-commerce-demo`,
now deleted) — hence MODULE_NOT_FOUND; and (2) it uses the **pre-isolation** location
(`components/eds-storefront/node_modules/`).

The **current** writer cannot produce this. `ai-defaults.json` args are **relative**
(`node_modules/@adobe-commerce/...`); `mcpConfigWriter` (lines 257–265) joins them to
`resolveMcpToolsDir(project.path)` = `<project>/.demo-builder-mcp` (`aiDefaultsInstaller.ts:55-57`), so
a fresh write yields `<this-project>/.demo-builder-mcp/node_modules/...`. So `b2b-tester` (created
2026-06-10) carries a `.mcp.json` written by an **older extension version**, before both the
isolated-tools-dir migration and the rename-regenerate fix (`eaaf44c8`), and it was never regenerated.
Confirmed on disk: `<project>/.demo-builder-mcp/node_modules` is **missing**; the packages exist only in
the storefront tree.

**So the immediate remedy already exists — "Regenerate AI files"** runs the current writer (install
first → populates `.demo-builder-mcp/node_modules`, then rewrites `.mcp.json` to the isolated,
this-project paths). The real gap is **prevention**: nothing detected the dead path until an agent
failed, and pre-migration projects silently carry broken configs.

---
_Original hypothesis (now superseded by the confirmation above):_

## Symptom

`AI Verify` reports two project MCP servers dead with `MCP error -32000: Connection closed`, stderr =
`MODULE_NOT_FOUND`:

```
mcp commerce-extensibility: Cannot find module
  '…/projects/my-commerce-demo/components/eds-storefront/node_modules/@adobe-commerce/commerce-extensibility-tools/index.js'
mcp playwright: Cannot find module
  '…/projects/my-commerce-demo/components/eds-storefront/node_modules/@playwright/mcp/cli.js'
```

## Leading hypothesis — stale `.mcp.json` pointing at the pre-isolation path

`mcpConfigWriter.ts` (lines 247–266) now anchors each `ai-defaults.json` MCP server's args to the
**isolated per-project tools dir** `<project>/.demo-builder-mcp/node_modules/...` — and the code
comment says this was done *specifically because* "the storefront manifest['s] own `npm install` can
abort on b2b @dropins." The failing paths point at **`components/eds-storefront/node_modules/`** — the
**old, pre-isolation** location. So this project's `.mcp.json` was most likely generated **before** the
isolated-tools-dir change and never regenerated; the storefront `npm install` (which aborts on b2b
@dropins) never installed those packages there → MODULE_NOT_FOUND.

(Plausible alternative: the isolated-dir install itself failed for this project. Confirm by reading the
project's actual `.mcp.json`.)

## Investigate first

1. Read `~/.demo-builder/projects/my-commerce-demo/.mcp.json` (+ `.claude/mcp.json`): do the
   `commerce-extensibility` / `playwright` args point at `components/eds-storefront/node_modules/...`
   (stale) or `.demo-builder-mcp/node_modules/...` (current)?
2. Check whether `<project>/.demo-builder-mcp/node_modules/` actually contains the two packages.
3. If stale: **Regenerate AI files** should rewrite the paths — verify it does, and consider an
   automatic drift detector (ties to `2026-06-01-ai-ready-skills-drift.md`).
4. If the isolated install failed: harden `ai-defaults` package install + surface the failure.

## Fix direction

- If stale-config: ensure regenerate rewrites MCP paths to the isolated dir; surface "MCP outdated" on
  the AI Ready badge (same family as skills drift) so the user is signaled before an agent fails.
- If install failure: make the isolated MCP-tools install robust/retried and report when it doesn't
  complete (today the failure only shows as a runtime MODULE_NOT_FOUND in AI Verify).

## Related

- `2026-06-01-ai-ready-skills-drift.md` (surface AI-files drift as amber — MCP-path drift is the same
  class).
- `mcpConfigWriter.ts` isolated-tools-dir design (lines 247–266); `@adobe-commerce/commerce-extensibility-tools`
  skill bundle (installed per EDS project).
