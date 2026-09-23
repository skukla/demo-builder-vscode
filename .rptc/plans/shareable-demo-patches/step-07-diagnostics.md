# Step 07 — Diagnostics learns the storefront's origin, fixes and pre-render state

`src/commands/diagnostics.ts` already probes GitHub, the Configuration Service and what the
storefront serves (overlay source page, PDP fallback), and `diagnosticsTools.ts` exposes the
report to agents. The report gains a `storefront.origin` section computed by one service the
Storefront report (step 04) also renders:

| Field | Source |
|---|---|
| boilerplate name + version, and the current template's version | the repository's `package.json`; the template's at the ledger's last-known-good |
| lineage | `template_repository`, fork parent, `builtWith.template` |
| pin | the project's `lastSyncedCommit` and `lkgSource`, and whether canonical files still match it |
| fixes | each load-bearing and universal patch: applied / fits / missing / target missing (the engine's dry run, already how the dry check works) |
| written by Demo Builder | smart-404 marker present, block libraries installed, fstab and config present, description file present |
| pre-render | the probes diagnostics already runs (overlay registered, source page published, fallback installed) |

Rules: the section is read-only and never writes; a fetch that fails says "could not read",
never "not present" (the verifying rules); fixtures for its tests come from live answers
(the fit test on `sayurihanki/aistore` recorded in the research is the first). The agent tool
returns the same section; `mcp-tools.md` regenerates; `docs/systems/debugging.md` gains the
section's meaning.
