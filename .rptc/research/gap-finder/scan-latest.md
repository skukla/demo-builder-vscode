# Agent gap scan

Scope: **demo projects only** — 50 transcript(s), 49 session(s) that called a tool, 566 user turns, 404 tool calls (171 Bash).

## 2. Jobs agents did WITHOUT us

The strongest signal here: an agent reaching for the shell where a tool should exist.

### `curl` — 35 call(s)

HTTP against a project endpoint — we own the endpoints and the headers

    curl -s -X POST 'https://na1-sandbox.api.commerce.adobe.com/UoGYsHrcxMyeoVd2zUktZi/graphql' \ -H 'Content-Type: application/json' 
    curl -s -X POST 'https://na1-sandbox.api.commerce.adobe.com/UoGYsHrcxMyeoVd2zUktZi/graphql' \ -H 'Content-Type: application/json' 
    curl -s -X POST 'https://na1-sandbox.api.commerce.adobe.com/UoGYsHrcxMyeoVd2zUktZi/graphql' \ -H 'Content-Type: application/json' 
    curl -s -X POST 'https://na1-sandbox.api.commerce.adobe.com/UoGYsHrcxMyeoVd2zUktZi/graphql' \ -H 'Content-Type: application/json' 
    curl -s -X POST 'https://na1-sandbox.api.commerce.adobe.com/UoGYsHrcxMyeoVd2zUktZi/graphql' \ -H 'Content-Type: application/json' 
    for cat in "phones" "watches" "accessories" "default-category"; do echo "=== categoryPath: $cat ===" curl -s -X POST 'https://na1-

### `aio` — 23 call(s)

Adobe I/O CLI — we own org/project/workspace context and the mesh

    aio --version 2>&1; echo "---WHO---"; aio console where 2>&1 | head -20
    aio console org list 2>&1 | head -30
    echo "=== current context ==="; aio console where 2>&1 | head -10 echo "=== token validity (live project call) ==="; aio console p
    aio console org list 2>&1 | head -40
    aio console org select 3397333 2>&1 | head -10; echo "=== confirm ==="; aio console where 2>&1 | head -10
    aio console project list 2>&1 | head -40

## 1. Tools nobody calls

**85 of 105** shipped tools were never called in this corpus.

A tool here is a candidate to delete, consolidate, or announce — a triage, not a build.

```
add_console_apis add_integration apply_updates check_datapack_service check_github_app check_repo_readiness cleanup_dalive_site configure_project connect_dalive create_adobe_project create_adobe_workspace create_github_repo create_project delete_adobe_project delete_ai_prompt delete_github_repo delete_mesh delete_page delete_project discover_store_structure edit_project evaluate_prompt export_project_settings find_storefront_name_mismatches get_block_authoring_shape get_block_source get_commerce_endpoints get_component_config get_component_requirements get_datapack get_datapack_activity get_datapack_import_status get_datapack_import_target get_settings install_prerequisite list_ai_prompts list_blocks list_components list_console_apis list_content list_dalive_sites list_datapack_data_types list_datapack_export_items list_datapack_import_scopes list_demo_packages list_github_repos list_installed_datapacks list_orgs list_workspaces migrate_storefront_name open_view promote_block_to_library publish_page read_page read_published_page redeploy_integration refresh_block_library regenerate_ai_files remove_block_from_library remove_integration rename_integration rename_project repair_site_configuration reset_datapack reset_eds_project restart_demo save_ai_prompt select_org select_project select_workspace set_console_apis set_current_project set_project_destination set_project_pinned set_setting set_site_admin start_datapack_export start_datapack_import stop_demo sync_content sync_storefront validate_component_selection validate_datapack_import verify_ai_setup write_page
```

## 3. Our tools that failed

Harness noise (permission denials, model unavailable) is excluded — see the header.

_None._


## Orientation share

**77%** of our tool calls (74 of 96) are the top six READS — calls that establish where the agent is rather than do anything.

- `get_current_project` — 23
- `get_project_urls` — 16
- `get_project` — 13
- `get_auth_status` — 9
- `list_projects` — 8
- `get_project_status` — 5

## What DID get used

- `get_current_project` — 23
- `get_project_urls` — 16
- `get_project` — 13
- `get_auth_status` — 9
- `list_projects` — 8
- `get_project_status` — 5
- `republish` — 3
- `find_datapacks` — 3
- `update_project_config` — 3
- `check_mesh` — 2
- `sign_in` — 2
- `open_url` — 1
- `list_stacks` — 1
- `check_prerequisites` — 1
- `deploy_mesh` — 1
- `list_adobe_projects` — 1
- `start_demo` — 1
- `deploy_integration` — 1
- `get_site_access` — 1
- `get_store_structure` — 1

_control: 105 tool names read from src/, 36 distinct tools seen in transcripts, 20 of them ours. A zero above means nothing was found; these numbers say whether anything was LOOKED at._
