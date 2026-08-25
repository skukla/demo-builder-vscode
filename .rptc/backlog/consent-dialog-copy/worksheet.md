| Tool | Title shown | Sentence shown today | Human rewrite |
|---|---|---|---|
| `add_console_apis` | Add console APIs? | Subscribe Adobe APIs on this project's Developer Console workspace credential, e.g. | |
| `add_integration` | Add integration? | Add an App Builder integration to the current project: clone it, subscribe its Adobe APIs, build and deploy it under the project org, and register it on the dashboard. | |
| `apply_updates` | Apply updates? | Check and apply available updates for the current project — fork sync, template, components, Adobe MCP, block libraries, inspector SDK. | |
| `cleanup_dalive_site` | Cleanup DA.live site? | Delete all content for a DA.live site (irreversible). | |
| `configure_project` | Configure project? | Configure the current project: datapack, addons, block libraries, store scope and non-secret env vars. | |
| `connect_dalive` | Connect DA.live? | Sign in to DA.live, which every storefront content and site-config operation authorizes as. | |
| `create_adobe_project` | Create Adobe project? | Create an Adobe Developer Console project in the selected org. | |
| `create_adobe_workspace` | Create Adobe workspace? | Create a workspace in the SELECTED Adobe project. | |
| `create_github_repo` | Create GitHub repo? | Create a GitHub repo from a template (the EDS storefront path). | |
| `create_project` | Create project? | Create a new Demo Builder project headlessly from a package + stack. | |
| `delete_adobe_project` | Delete Adobe project? | Permanently delete an Adobe Console project and everything in it (irreversible). | |
| `delete_ai_prompt` | Delete AI prompt? | Delete a saved AI prompt by id | |
| `delete_github_repo` | Delete GitHub repo? | Permanently delete a GitHub repository (irreversible). | |
| `delete_mesh` | Delete mesh? | Delete the API Mesh for an Adobe I/O workspace | |
| `delete_page` | Delete page? | Unpublish and delete a page from the current project's DA.live storefront (irreversible). | |
| `delete_project` | Delete project? | Permanently delete a project locally (files + recent list). | |
| `deploy_integration` | Deploy integration? | Deploy (or redeploy) one App Builder integration on the current project by its id. | |
| `deploy_mesh` | Deploy mesh? | Deploy (or redeploy) the current project's API Mesh. | |
| `discover_store_structure` | Discover store structure? | Fetch the LIVE Commerce store hierarchy (websites, stores, store views). | |
| `edit_project` | Edit project? | Open the creation wizard in edit mode on the current project, for changes the configure_project tool cannot make (package, stack, storefront repo). | |
| `export_project_settings` | Export project settings? | Export the current project's settings to a JSON file on disk (folder, saved state, component configs, and — by default — secrets). | |
| `install_prerequisite` | Install prerequisite? | Install one missing prerequisite (Node, aio CLI, plugins) by its prereqId from check_prerequisites. | |
| `migrate_storefront_name` | Migrate storefront name? | Rename ONE project's DA.live site to match its GitHub repo name, preserving all content. | |
| `open_url` | Open URL? | Open one of the CURRENT project's URLs in the browser. | |
| `open_view` | Open view? | Open a Demo Builder view in VS Code. | |
| `promote_block_to_library` | Promote block to library? | Block changes to push back to source library — adds a block to the DA.live authoring library by updating component-definition.json, writing the doc page, appending the sheet row, and committing/pushing/publishing the storefront. | |
| `publish_page` | Publish page? | Preview and publish an existing DA.live page to the live CDN | |
| `redeploy_integration` | Redeploy integration? | Redeploy one App Builder integration by its id (idempotent re-run of its deploy). | |
| `refresh_block_library` | Refresh block library? | Rebuild the current EDS project's DA.live authoring block library from its component-definition.json (destructive full re-sync — use after hand-editing component-definition.json outside the promote flow). | |
| `regenerate_ai_files` | Regenerate AI files? | Regenerate the project's AI context files (AGENTS.md, .mcp.json, skills) | |
| `remove_block_from_library` | Remove block from library? | Remove (delete) a block from the DA.live authoring library — the inverse of promote_block_to_library. | |
| `remove_integration` | Remove integration? | Remove one App Builder integration by its id. | |
| `rename_integration` | Rename integration? | Change one App Builder integration's DISPLAY NAME on the current project. | |
| `rename_project` | Rename project? | Rename the current project — the folder on disk, saved state, and the project's MCP/AI configs all move together. | |
| `repair_site_configuration` | Repair site configuration? | Re-run the Configuration Service registration for the current project's storefront — the write that fails when the caller holds no admin role, leaving a storefront that builds but serves no product pages. | |
| `republish` | Republish? | Regenerate and republish the EDS storefront config.json to GitHub and the CDN | |
| `reset_datapack` | Reset datapack? | Remove a datapack's data from the Commerce instance so the project can be reused. | |
| `reset_eds_project` | Reset EDS project? | Reset an EDS storefront to its template (repo + DA.live content + config). | |
| `restart_demo` | Restart demo? | Stop and restart the current project's demo server. | |
| `save_ai_prompt` | Save AI prompt? | Create or update a saved AI prompt | |
| `select_org` | Select org? | Select the active Adobe organization by id | |
| `select_project` | Select project? | Select the active Adobe Console project by id (within the selected org) | |
| `select_workspace` | Select workspace? | Select the active Adobe Runtime workspace by id (within the selected project) | |
| `set_console_apis` | Set console APIs? | Set the OPTIONAL Adobe API subscriptions on this project's Developer Console workspace credential to EXACTLY this list — anything currently subscribed and not listed is REMOVED. | |
| `set_current_project` | Set current project? | Make a project the CURRENT one, which is what every project-scoped tool acts on. | |
| `set_project_destination` | Set project destination? | Point the current project at a different Adobe Console project + workspace, and MOVE every integration there (each is redeployed under the new target; the old deployments are left running and can be cleaned up in the Console). | |
| `set_project_pinned` | Set project pinned? | Pin or unpin a project. | |
| `set_setting` | Set setting? | Change one of the extension's VS Code settings. | |
| `set_site_admin` | Set site admin? | Grant or revoke the admin role on the current project's storefront configuration. | |
| `sign_in` | Sign in? | Open an interactive sign-in to refresh an expired session (opens a browser). | |
| `start_datapack_export` | Start datapack export? | Capture data from a Commerce instance into a datapack. | |
| `start_datapack_import` | Start datapack import? | Import a datapack into a live Commerce instance. | |
| `start_demo` | Start demo? | Start the current project's demo server | |
| `stop_demo` | Stop demo? | Stop the current project's running demo server | |
| `sync_content` | Sync content? | Publish all EDS storefront content (config + code + DA.live pages) to the CDN | |
| `sync_storefront` | Sync storefront? | Git add, commit, and push changes in the storefront directory | |
| `update_project_config` | Update project config? | Write content to .demo-builder.json or a .env file inside the project directory (path must not escape the project root) | |
| `validate_component_selection` | Validate component selection? | Can this frontend + backend be built together: compatibility, the dependencies the pair pulls in, and whether the resulting chain validates. | |
| `validate_datapack_import` | Validate datapack import? | Dry-run an import: same guard, same credentials, same request body as the real thing, without writing. | |
| `write_page` | Write page? | Write a page's HTML to the current project's DA.live storefront; set publish:true to preview+publish it in the same call | |
