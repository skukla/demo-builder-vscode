# Tool inventory and safety classification — step 01

**Measured:** 2026-08-16, `feature/ai-surface-coverage` @ develop/beta.131. **52 tools.**
Develop-only — a worktree with `feature/data-installer` merged adds six datapack tools.

## How this was built, and the trap it hit

Names and handler metadata are extracted in **independent passes**. The first attempt gated the
name on finding its `map`/`type` within a 400-character window, which silently dropped **10 of
52 tools** whose descriptor bodies were longer — `deploy_integration`, `get_store_structure`,
`rename_project` among them. The count looked plausible at 42.

**Rule: never gate the inventory on the metadata.** A missing handler is a blank cell; it must
never remove the row.

Reconcile against `probeInExtensionMcpTools` when an extension host is running — that is ground
truth for what the agent SEES, and a difference from this source sweep is itself a finding.

## Corrections from the 2026-08-16 research fan-out

- **"only 4 descriptor rows set `confirm`" was wrong — it is 3** (`actionDescriptors.ts:60,110,162`).
- **The classification understated the risk.** 19 tools change state with NO gate, and **eight
  take no required arguments** (`deploy_mesh`, `export_project_settings`, `refresh_block_library`,
  `regenerate_ai_files`, `republish`, `start_demo`, `stop_demo`, `sync_content`). Never build a
  harness that enumerates tools and calls each with `{}`.
- **Two `read` tools can seize the UI** — `get_store_structure` and `list_console_apis` route
  through an auth guard that can open a modal and a browser.
- **Two `read` tools emit secrets** — `get_component_config` returns raw `.env`;
  `get_project full=true` returns an unredacted manifest. This repo is public.
- **`promote_block_to_library` is misclassified.** Classed `mutate`, it commits, pushes and
  publishes to a live site ungated — while its literal inverse `remove_block_from_library` is
  classed `destroy` and IS gated. Same blast radius, opposite protection.
- The `destroy` set is the **best**-guarded part of the surface; the risk lives in `mutate`,
  where the heuristic's warning is mildest.

## Classification

Verb-prefix heuristic, spot-checked — **NOT reviewed tool by tool.** An earlier version of this
line claimed "reviewed by hand", which was an overclaim; the classification is a heuristic that
has been sampled, not verified.

**It also rests on an unverified assumption.** `docs/systems/mcp-server.md` §10 says any tool
changing cloud or local state requires `confirm: true` and otherwise returns a description of
what WOULD happen. If that holds universally, most `mutate` tools are safe to probe live and
step 02's scope widens. But only **4 descriptor rows** set `confirm` in code; directly-registered
tools implement their own. **Verify per tool before probing any of them.**

It decides the capture METHOD in step 02.

| Class | Count | Capture method |
|---|---|---|
| `read` | 21 | live capture — safe to call repeatedly |
| `mutate` | 23 | live only on a scratch project; otherwise static |
| `destroy` | 8 | **static only — never called to measure** |

### The `destroy` set

`cleanup_dalive_site` · `delete_ai_prompt` · `delete_github_repo` · `delete_mesh` ·
`delete_project` · `remove_block_from_library` · `remove_integration` · `reset_eds_project`

Step 02's harness allowlist is derived from this table — the `read` set — rather than
hand-written, so a newly added `delete_*` is excluded by default.

**`delete_ai_prompt` is the heuristic's weakest call**: it deletes a saved prompt, which is local
and trivially recreated. Classified `destroy` anyway — the cost of being wrong is asymmetric.

| tool | class | source | handler |
|---|---|---|---|
| `add_console_apis` | mutate | `actionDescriptors.ts` | `dashboardHandlers.addConsoleApis` |
| `apply_updates` | mutate | `applyUpdatesTool.ts` | — |
| `check_mesh` | read | `readDescriptors.ts` | `meshHandlers.check-api-mesh` |
| `cleanup_dalive_site` | destroy | `cloudResourceTools.ts` | — |
| `create_project` | mutate | `createProjectTool.ts` | — |
| `delete_ai_prompt` | destroy | `actionDescriptors.ts` | `aiHandlers.delete-ai-prompt` |
| `delete_github_repo` | destroy | `cloudResourceTools.ts` | — |
| `delete_mesh` | destroy | `actionDescriptors.ts` | `meshHandlers.delete-api-mesh` |
| `delete_project` | destroy | `deleteProjectTool.ts` | — |
| `deploy_integration` | mutate | `actionDescriptors.ts` | `dashboardHandlers.deployAppBuilderComponent` |
| `deploy_mesh` | mutate | `actionDescriptors.ts` | `meshHandlers.deploy-api-mesh` |
| `export_project_settings` | mutate | `actionDescriptors.ts` | `dashboardHandlers.exportProjectSettings` |
| `get_auth_status` | read | `authTools.ts` | — |
| `get_block_source` | read | `mcp-server.ts` | — |
| `get_component_config` | read | `mcp-server.ts` | — |
| `get_current_project` | read | `currentProjectTool.ts` | — |
| `get_project` | read | `mcp-server.ts` | — |
| `get_project_urls` | read | `readDescriptors.ts` | `dashboardHandlers.getProjectUrls` |
| `get_store_structure` | read | `readDescriptors.ts` | `edsHandlers.get-store-structure` |
| `list_adobe_projects` | read | `adobeTools.ts` | — |
| `list_ai_prompts` | read | `readDescriptors.ts` | `aiHandlers.list-ai-prompts` |
| `list_blocks` | read | `mcp-server.ts` | — |
| `list_components` | read | `discoveryTools.ts` | — |
| `list_console_apis` | read | `readDescriptors.ts` | `dashboardHandlers.listConsoleApis` |
| `list_dalive_sites` | read | `cloudResourceTools.ts` | — |
| `list_demo_packages` | read | `discoveryTools.ts` | — |
| `list_github_repos` | read | `cloudResourceTools.ts` | — |
| `list_orgs` | read | `adobeTools.ts` | — |
| `list_projects` | read | `mcp-server.ts` | — |
| `list_stacks` | read | `discoveryTools.ts` | — |
| `list_workspaces` | read | `adobeTools.ts` | — |
| `open_view` | mutate | `viewTools.ts` | — |
| `promote_block_to_library` | mutate | `mcp-server.ts` | — |
| `redeploy_integration` | mutate | `actionDescriptors.ts` | `dashboardHandlers.redeployAppBuilderComponent` |
| `refresh_block_library` | mutate | `actionDescriptors.ts` | `edsHandlers.refresh-block-library` |
| `regenerate_ai_files` | mutate | `actionDescriptors.ts` | `aiHandlers.regenerate-ai-files` |
| `remove_block_from_library` | destroy | `mcp-server.ts` | — |
| `remove_integration` | destroy | `actionDescriptors.ts` | `dashboardHandlers.removeAppBuilderComponent` |
| `rename_project` | mutate | `actionDescriptors.ts` | `dashboardHandlers.renameProject` |
| `republish` | mutate | `storefrontTools.ts` | — |
| `reset_eds_project` | destroy | `edsResetTool.ts` | — |
| `save_ai_prompt` | mutate | `actionDescriptors.ts` | `aiHandlers.save-ai-prompt` |
| `select_org` | mutate | `adobeTools.ts` | — |
| `select_project` | mutate | `adobeTools.ts` | — |
| `select_workspace` | mutate | `adobeTools.ts` | — |
| `sign_in` | mutate | `authTools.ts` | — |
| `start_demo` | mutate | `actionDescriptors.ts` | `dashboardHandlers.startDemo` |
| `stop_demo` | mutate | `actionDescriptors.ts` | `dashboardHandlers.stopDemo` |
| `sync_content` | mutate | `storefrontTools.ts` | — |
| `sync_storefront` | mutate | `mcp-server.ts` | — |
| `update_project_config` | mutate | `mcp-server.ts` | — |
| `verify_ai_setup` | read | `readDescriptors.ts` | `aiHandlers.verify-ai-setup` |
