# Phase 5 — Guidance (skills)

**Status:** scoped 2026-08-17, not started.
**Blocked on:** nothing. Phase 4 was its blocker — the overview says skills are "scored
against the post-phase-4 tool surface — that is its denominator, so it cannot start
earlier." That denominator is now **103 tools**, up from 65 when the program was written.

## What was measured, and how

Against the RUNNING server (`probe.mjs list` → 103 names) and the generated bundle
(`src/features/project-creation/templates/skills/*.md`, 63,070 bytes). Controls printed
before the result: 103 tool names read, positive control `create_project` found 11 times,
negative control `not_a_real_tool` found 0.

| Measure | Value |
|---|---|
| Generated skills shipped to a project | **14** (the overview's "21" is stale) |
| Tools named in at least one generated skill | 23 of 103 |
| Tools named in AGENTS.md | **3** — `add_console_apis`, `list_console_apis`, `sync_storefront`, all already in skills |
| **Tools named in NO generated guidance** | **80 of 103** |
| `AI_CONTEXT_VERSION` | 10 |

## 80 unmentioned tools is NOT 80 gaps — do not plan against that number

Two things make it the wrong target, and both are already program policy:

1. **Tools are self-describing.** Name and description ARE the agent's search surface, and
   deferred tool loading ranks on them. `list_orgs` needs no skill.
2. **"No new generated skills unless multi-step-with-traps"** — a standing constraint from
   2026-07-11 shipped work, recorded in the overview.

So the unit of work is a WORKFLOW that spans several tools in a required order with a trap
in it, not a tool without a mention. The 80 is useful as a denominator and as evidence the
guidance surface did not grow with the tool surface — nothing more.

## Finding 1 — `diagnose-demo` sends the wrong way for the FIRST symptom it names

This is the highest-leverage item in the phase and it is a correctness bug, not staleness.

The skill's row reads:

| Symptom | Check | Why |
|---|---|---|
| Product page renders empty or 404s | `get_store_structure` | scope may have no products |

…and closes with "If every code is `ok` and pages are still empty, look at the catalog in
the Commerce admin."

But the classic cause of exactly that symptom is a **refused Configuration Service
registration**. `repairSiteConfigHeadless`'s own docstring: *"the storefront is built,
pushed and browsable but cannot serve a single product detail page."* An agent following
this skill checks store scope, finds it fine, and tells the user their catalog is empty —
when the overlay registration was refused and `get_site_access` + `repair_site_configuration`
would have found and fixed it in two calls.

Those tools did not exist when the skill was written. They do now.

`diagnose-demo` routes to 8 tools, ALL of them pre-Group-1. It knows none of:
`get_project_status`, `check_prerequisites`, `check_github_app`, `check_repo_readiness`,
`discover_store_structure` (Group 1 — the diagnosis group), `get_site_access`,
`repair_site_configuration` (Group 6), or `get_settings` (Group 7 — which answers "is the
feature off, or broken?", a question the skill currently cannot ask).

**This one is worth doing even if nothing else in phase 5 is.**

## Finding 2 — the datapack import loop is the one genuine new skill

Group 8 created a six-tool ordered workflow with three traps, and nothing teaches it:

    find_datapacks → get_datapack_import_target → list_datapack_import_scopes
      → validate_datapack_import → start_datapack_import → get_datapack_import_status (poll)

The traps, each measured or read this session:

- **`start_datapack_import` returns a HANDLE, not an outcome.** An agent that treats the
  response as the result reports success for a job that may still fail. It must poll.
- **`commerceInstance` must never be guessed.** The handler refuses to default it, and its
  comment says why: *"a wrong default writes sample data into someone else's live demo."*
  `get_datapack_import_target` is how you learn it.
- **Validate before starting.** The dry run is deliberately ungated so it can be used freely;
  the start is confirm-gated. An agent that skips the dry run finds out by writing.

This qualifies under "multi-step-with-traps" on every clause. It is the only new workflow
that clearly does.

## Finding 3 — the open-ended design gap (from the overview, unverified here)

The overview records "21 skills, all task- or reference-shaped; no open-ended design skill."
The count is wrong (14), and whether the CONCLUSION still holds was not re-checked. Before
building anything for this, re-read the 14 and decide whether "how to approach a demo you
have not been given a recipe for" is a skill or a section in AGENTS.md. **Do not inherit the
conclusion from a line whose count was stale.**

## Suggested order

1. **Fix `diagnose-demo`** — add the Group 1 and Group 6 routes, correct the PDP row.
   Cheapest, highest value, and it is currently wrong rather than merely thin.
2. **Add the datapack import skill** — the one workflow that earns a new file.
3. **Re-assess Finding 3** against the real 14 before writing anything.

## Non-negotiables for any change here

- **Bump `AI_CONTEXT_VERSION`** (currently 10) and record what the version added in the
  comment above the constant. Without it, existing projects never learn the bundle changed —
  the activation sweep is driven by that stamp.
- **A new skill file bumps a pinned COUNT.** `skillsWriter.test.ts` pins the exact number
  (14 for EDS as of v7: 13 always-on + `extend-app-builder-app`); a new always-on skill
  needs the pin bumped and both a positive and a bare-project negative case.
- **Every bundle write goes through `GeneratedFileWriter`** — no direct `writeFile` in
  `skillsWriter`. The review grep is in the `ai-context-authoring` skill.
- **Regenerate parity:** anything creation writes, "Regenerate AI Files" must reproduce.
- Docs to sync: `src/features/ai/README.md`, `src/features/CLAUDE.md`,
  `docs/systems/mcp-server.md` §12.

## What this phase is NOT

Not a campaign to mention 80 tools. Not new skills for single-call tools. If the outcome is
one corrected skill and one new one, that is the right size — the constraint against
skill sprawl is older than this phase and was earned.
