# Generated diagnosis skill — teach agents how to LOOK, not just how to DO

**Filed:** 2026-08-11, during the `get_store_structure` MCP tool work.

## Provenance

Adding `get_store_structure` raised the question of whether to teach it in the generated
AI bundle. Checking what "teaching" means there turned up a structural gap:

**Of the 13 generated skills, zero cover diagnosis.** Every one is a do-this-task skill:

```
add-component · commerce-block-mapper · connect-authenticated-site · create-eds-project
demo-data-injector · extend-app-builder-app · header-nav-footer · refine-visual-match
register-custom-block · remove-custom-block · scrape-reference-site · sync-changes
update-credentials
```

Verified 2026-08-11: `grep -rli "troubleshoot\|diagnos\|debug"` over
`src/features/project-creation/templates/skills/` returns **0 files**.

The bundle teaches a tool only when it sits inside a decision or sequence — `sync-changes.md`
exists to pick between `sync_content` / `sync_storefront` / `deploy_mesh`;
`extend-app-builder-app.md` exists for the `list_console_apis → add_console_apis` loop. It is
never a catalog. A single read like `get_store_structure` has no such home, so it went
untaught: an agent finds it by tool search, but nothing tells it to check store scope *when
PDPs come back empty*. That is exactly the failure the tool was built to prevent — it cost
most of an afternoon in `.rptc/complete/pdp-prerender-validation/HANDOFF.md` §3.

`get_store_structure` is the trigger, not the scope. The gap is the missing category.

## Goal / Scope

One generated skill that routes a **symptom** to the affordance that answers it. Symptom-first,
shaped like `sync-changes.md`'s decision table — not a tool catalog.

### What to include

Read tools an agent already has in a generated project (names read from source 2026-08-11,
`readDescriptors.ts` + the server's `registerProjectTools`):

| Affordance | Answers |
|---|---|
| `get_store_structure` | which websites / store groups / store views exist; whether the project's configured scope codes resolve (`ok` / `missing` / `not-configured`) |
| `get_project` | the project's saved Commerce config, endpoints, components |
| `check_mesh` | is the API Mesh deployed and up to date |
| `get_project_urls` | live site, DA.live authoring, Commerce admin, Dev Console — as data |
| `get_component_config` | one component's resolved config |
| `list_blocks` / `get_block_source` | storefront block inventory and source |
| `verify_ai_setup` | AI context / MCP config / skills health |
| `list_console_apis` | which Adobe APIs the workspace can subscribe to, and which are managed |

Non-tool surfaces worth naming: the **"Demo Builder: Diagnostics"** command and the
**Debug Logs** output channel.

### Symptom routing to cover

- **PDP empty or 404** → store scope first (`get_store_structure`), then SKU
  casing/encoding (ADR-007), then mesh scope staleness.
- **Catalog empty** → the configured website/store view may simply have no products;
  structure resolving `ok` does not mean it is populated.
- **Storefront serving stale content** → republish / `sync_storefront`; the served
  `config.json` can diverge from the project manifest.
- **Mesh behaving unexpectedly** → `check_mesh`, plus the ordering trap from the PDP
  handoff: `deploy_mesh` deploys whatever `.env` is on disk, and only **Configure save**
  regenerates it. Correct order is Configure save → then deploy mesh.

## Execution plan

1. Draft `templates/skills/diagnose-demo.md` as a symptom → check table (mirror
   `sync-changes.md`'s shape and length; route, do not restate tool docs).
2. Register it in `skillsWriter.ts` alongside the other always-on skills.
3. Bump `AI_CONTEXT_VERSION` — follow the `ai-context-authoring` skill for the four gate
   seams so creation and regenerate stay in sync.
4. Tests: skill-count pins in the skillsWriter suites will move.

## Constraints

- **The version bump re-prompts every existing project** to regenerate AI files. `.127`
  already did that once and it generated support questions — worth batching with another
  bundle change rather than shipping alone.
- **Do not duplicate the repo-side `debug-log-triage` skill.** That one is for the
  maintainer working in THIS repo; this one is for an agent inside a user's generated
  project. Different audience, different available context.
- **Symptom-first, not tool-first.** A tool catalog is what the MCP tool list already is;
  the value here is the routing an agent cannot infer.
- Keep it honest about limits — store structure resolving `ok` says nothing about whether
  products exist under that scope.

## Kickoff prompt

> Add a `diagnose-demo` skill to the generated AI bundle. Read
> `.rptc/backlog/2026-08-11-generated-diagnosis-skill.md` for the affordance inventory and
> symptom routing it must cover. Model its shape on
> `src/features/project-creation/templates/skills/sync-changes.md` — a symptom → check
> decision table that routes, rather than restating tool documentation. Register it in
> `skillsWriter.ts`, then follow the `ai-context-authoring` skill for the `AI_CONTEXT_VERSION`
> bump and its four gate seams. Expect skill-count pins in the skillsWriter suites to move.
