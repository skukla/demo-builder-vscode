# Step 5 — Migrate ai-verify (P2: which MCP/skill failed and why)

**Status:** Outline — firms up after Steps 1–3 land.

**Goal:** move the on-open `verify-ai-setup` (`aiHandlers.ts:37`, fired from the hook's own useEffect)
onto the orchestrator as an `ai-verify` check, and surface *which* inspector failed and why — replacing
the generic yellow "Setup incomplete" badge that hides the diagnostic in logs.

## Shape

- New `onOpenChecks/aiVerifyCheck.ts` wrapping `verifyAiSetup` / `gatherInventory`.
- `run` maps the verification to an outcome that carries the *specific* failures:
  - all ok → `{status:'ok'}` (green badge).
  - file check failed → `{status:'error', message:'AI files missing — Regenerate'}` (red).
  - inventory inspector failed (e.g. an MCP MODULE_NOT_FOUND, a skill parse error) →
    `{status:'warning', message:'<server X> failed: <reason>', data:{failures}}` (yellow, now WITH the
    which/why) — and note the overlap with Step 3 (mcp-health already heals the stale-path case; this
    surfaces the *residual* diagnostics).
- Consolidate: the hook currently fires `verify-ai-setup` independently — route it through the
  orchestrator so AI health is one of the coordinated checks, not a separate chain.

## Tests (write FIRST)

- ok / file-missing / inventory-inspector-failure(with named failure) → correct outcomes; the failing
  server id + reason are present in `data` (not just logs).

## Constraints

- Coordinate with Step 3: mcp-health auto-heals stale paths; ai-verify reports anything heal can't fix.
  Avoid double-spawning MCP servers on open (mcp-health uses cheap `fs.access`; ai-verify is the
  spawn — keep one spawn pass, not two).
- Keep the AI-Ready badge + View Skills surface; only enrich the failure detail.
