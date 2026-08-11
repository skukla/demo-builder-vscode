# Step 4 — AI guidance + end-to-end verification

## Goal

The AI in a shell project knows the whole loop without the user teaching it; the Firefly
use case works live.

## Guidance surfaces

1. **Shell repo AGENTS.md** (step 2) — the primary teacher; ships with the clone.
2. **Project-level skill** (via `skillsWriter` DEMO_BUILDER_SKILLS): a short
   `extend-app-builder-app.md` skill written for projects that carry an app-builder
   component — the flow: clarify the integration goal → `list_console_apis` → confirm
   with the user → `add_console_apis` → build actions with the Developer Agent tooling →
   `aio app deploy` (or the deploy tool) → verify.
3. **`aiContextWriter` AGENTS.md section**: mention the two tools in the generated
   project AGENTS.md when app-builder components are present (same predicate as step 1).

## End-to-end verification (live, F5)

Walk the exact use case from the design conversation:

1. Create a project with the `app-builder-shell` integration (any stack).
2. Confirm the Developer Agent MCP + skills are present in the generated `.mcp.json` /
   `.claude/skills/` (step 1 outcome) with no EDS storefront in the project.
3. Open in Claude Code; prompt: "I want to connect this app to Adobe Firefly Services."
4. Observe: AI calls `list_console_apis`, proposes the Firefly service code(s), calls
   `add_console_apis` after confirmation; Developer Console shows the API on the
   workspace credential.
5. Reconcile safety: add a second integration from the dashboard; confirm the Firefly
   subscription survives (`additionalConsoleApis` union).

## Exit criteria

All five observations pass; record the walkthrough in this file and flip the overview
checkboxes.
