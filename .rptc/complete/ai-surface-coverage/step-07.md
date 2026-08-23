# Step 07 — Routing: make `diagnose-demo` reach the new surface

**Kind:** TDD + generated bundle
**Depends on:** steps 03–06
**Touches:** `templates/skills/diagnose-demo.md`, `src/core/constants.ts`, docs

## Why routing is its own step

`diagnose-demo` is the **only** cross-cutting skill in the bundle. Every other one is a
single procedure; this one is a symptom → check table spanning four features and six tools.
It is the entire routing layer.

That makes it the failure point for everything steps 03–06 add. A tool nothing routes to is
discoverable only by luck, and skills freeze per project — so a tool that ships without a
route may never be found in projects that already exist.

This step adds no new skill. It makes the existing router reach further.

## Goal

Every tool added in steps 03–04 and every skill added in 05–06 is reachable from a symptom
someone would actually report.

## Method

For each new tool and skill, ask: **what does the user say out loud when they need this?**
That sentence is the row. Not the capability name — the complaint.

Existing rows are the model, and they are complaints:

| Symptom | Check first |
|---|---|
| Product page renders empty or 404s | `get_store_structure` |
| Site serves old content after an edit | `sync_storefront` |
| A setting change had no effect | `get_project` |

New rows will include, at minimum:

- Something like "signed in but the operation says wrong org" → the org-context skill
  (step 05).
- "Mesh is deployed but behaves like the old config" → the mesh skill (6a), which is the
  deployed-versus-stale distinction the current single row cannot hold.
- "Project will not start" → resolved per 6b, either to a prerequisites tool or to a stated
  human-only boundary.

## RED

`tests/features/project-creation/services/skillsWriter.test.ts` already asserts
`diagnose-demo` content. Extend it:

- Every tool name added in steps 03–04 appears somewhere in the template. This is the
  "nothing ships unrouted" gate, and it is mechanical — derive the expected names from the
  descriptor tables rather than hardcoding a list, so a future tool fails this test until
  someone routes it.
- Every skill filename in `DEMO_BUILDER_ALWAYS_ON_SKILLS` is either referenced by
  `diagnose-demo` or documented as not needing a route. Procedure skills (`add-component`)
  legitimately need no symptom row; the exemption should be explicit, not implied.
- No row routes to a tool that does not exist — the inverse rot, and a real risk now that
  the table cites tools by name.

That last assertion is worth more than it looks: it is the same class of defect as the
line-number citations corrected on 2026-08-12, where a reference stayed authoritative-
looking after its target moved.

## GREEN

Update the template. Keep the table a table — its value is that it is scannable under
pressure, and prose would lose that.

## Bundle discipline

This changes generated content, so `AI_CONTEXT_VERSION` must be bumped. Per the overview:
**one bump covering steps 05–07 together**, because each bump re-prompts every existing
project and `.127` and `.128` both generated support questions doing exactly that.

Land 05, 06 and 07 as a set. Bump once, on the last.

## Done when

- Every new tool is routed or explicitly exempt.
- Every route names a tool that exists.
- One `AI_CONTEXT_VERSION` bump covers 05–07, with a comment recording what it added.
- `src/features/ai/README.md`, `src/features/CLAUDE.md`, `docs/systems/mcp-server.md` synced.
- FULL suite green — bundle changes move count pins in several suites at once.

## After this plan

The surface is deliberate: every handler has a disposition, every exposed tool has a route,
and both facts are enforced by tests rather than by memory. The follow-on question this plan
deliberately does not answer is whether `data-installer` should get action tools — that is
Stage 2's call, and the read/write asymmetry is recorded in the overview for whoever makes it.
