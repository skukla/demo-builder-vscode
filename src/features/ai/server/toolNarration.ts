/**
 * What the chat says a tool is doing, in words a producer would use.
 *
 * WHY THIS EXISTS. Narration used to be DERIVED from the tool's name —
 * `deploy_mesh` became "Deploy mesh". That put every opening line in the wrong
 * grammatical mood, so a single operation read:
 *
 *     Demo Builder · Deploy mesh…              <- a button label
 *     Demo Builder · Deploying…                <- a status line
 *     Demo Builder · Publishing content…       <- a status line
 *
 * and about ten of them were not English at all: "Set project pinned…",
 * "Set console APIs…", "Republish…" (republish WHAT?). An audit on 2026-08-25
 * found the problem in all 51 narrating tools.
 *
 * This is the same lesson `agentAlertCopy.ts` records for consent text — **the
 * words a person reads are authored, never transformed** — applied to the other
 * surface that had escaped it.
 *
 * ## The form, and why it is the progressive
 *
 * Every phrase completes the sentence "Demo Builder is …". So: "Deploying the
 * API mesh", not "Deploy mesh" and not "Mesh deployment". The chat's opening
 * line is by far the most-seen frame and it announces work in progress, so the
 * phrase is shaped for that and the other frames are shaped around it.
 *
 * ## Rules
 *
 * - **Name the object.** "Republishing the storefront", never "Republishing".
 *   The single worst line in the audit was `Republish…` — republish what?
 * - **No schema words.** "Pinning the project", not "Set project pinned".
 * - **Producer vocabulary.** The reader builds demos; they do not necessarily
 *   write code. "CDN" is fine — it is the right word and widely known. "Rebase"
 *   is not.
 * - **No identifiers.** These phrases take no arguments by design. The target
 *   belongs in the consent dialog, which asks about one specific thing.
 *
 * ## Reads get phrases too
 *
 * An earlier draft covered only the 51 tools that write, on the reasoning that
 * reads do not print a line in the chat. That confused a DISPLAY decision with
 * a vocabulary one. The evaluation trace renders every step in plain
 * language — "Checked whether the demo is running" is a READ, and it is the
 * plan's own example — and repeated reads are the waste that trace exists to
 * show. Leaving 52 tools wordless would just move the problem into the surface
 * being built to fix it.
 *
 * Whether the live chat prints a line per read stays a separate, revisitable
 * display choice. It is not a reason for a tool to have no words.
 *
 * ## Every phrase was written from the tool's DESCRIPTION, not its name
 *
 * The first draft of this file was written from tool names, which is the exact
 * transform this module exists to remove — done by hand instead of by code.
 * Reading all 103 descriptions changed several phrases and caught two tools the
 * name-derived list had missed entirely (`promote_block_to_library`,
 * `remove_block_from_library`). Some distinctions are invisible from the name
 * and load-bearing in the words:
 *
 * - `add_console_apis` ADDS; `set_console_apis` replaces the list and REMOVES
 *   anything not named. "Updating" would have been wrong for one of them.
 * - `connect_dalive` and `set_setting` and `edit_project` change nothing — they
 *   hand back to the user. Their phrases say so.
 * - `set_project_pinned` pins OR unpins, so a phrase saying "Pinning" would be
 *   wrong half the time.
 *
 * @module features/ai/server/toolNarration
 */

/** Every tool, and what it says while it runs. Keyed by MCP tool name. */
export const TOOL_NARRATION: Record<string, string> = {
    // ── Reads: what is being found out ──────────────────────────────────
    check_datapack_service: 'Checking the sample-data service',
    check_github_app: 'Checking the GitHub app on the repository',
    check_mesh: 'Checking the API mesh',
    check_prerequisites: 'Checking the required tools',
    check_repo_readiness: 'Checking whether the repository can serve a storefront',
    discover_store_structure: 'Looking up the live store structure',
    find_datapacks: 'Looking up available sample data',
    find_storefront_name_mismatches: 'Looking for storefronts whose names do not match',
    get_auth_status: 'Checking who you are signed in as',
    get_block_authoring_shape: 'Looking up how the block is authored',
    get_commerce_endpoints: 'Looking up the Commerce endpoints',
    run_commerce_query: 'Querying the Commerce backend',
    get_component_config: 'Reading the project configuration',
    get_component_requirements: 'Looking up what the component needs',
    get_current_project: 'Checking which project is open',
    get_datapack: 'Looking up the sample-data pack',
    get_datapack_activity: 'Reading the sample-data history',
    get_datapack_import_status: 'Checking the sample-data progress',
    get_datapack_import_target: 'Checking where the sample data would land',
    get_project: 'Reading the project',
    get_project_status: 'Checking whether the demo is running',
    get_project_urls: 'Looking up the project URLs',
    get_settings: 'Reading the Demo Builder settings',
    get_site_access: 'Checking who can administer the site',
    get_store_structure: 'Reading the saved store structure',
    list_adobe_projects: 'Listing your Adobe Console projects',
    list_ai_prompts: 'Listing your saved prompts',
    list_blocks: 'Listing the storefront blocks',
    list_components: 'Listing the available components',
    list_console_apis: 'Listing the Adobe APIs you can subscribe to',
    list_content: 'Listing the storefront content',
    list_dalive_sites: 'Listing the DA.live sites',
    list_datapack_data_types: 'Listing the sample-data types',
    list_datapack_export_items: 'Listing what this store holds',
    list_datapack_import_scopes: 'Listing where the sample data can go',
    list_demo_packages: 'Listing the demo packages',
    list_github_repos: 'Listing your GitHub repositories',
    list_installed_datapacks: 'Listing the installed sample data',
    list_orgs: 'Listing your Adobe organizations',
    list_projects: 'Listing your projects',
    list_stacks: 'Listing the available stacks',
    list_workspaces: 'Listing the Adobe workspaces',
    read_debug_logs: 'Reading the extension debug logs',
    read_page: 'Reading the page',
    read_published_page: 'Reading the published page',
    // Session targeting — these change nothing that outlives the session.
    select_org: 'Switching to the Adobe organization',
    select_project: 'Switching to the Adobe Console project',
    select_workspace: 'Switching to the Adobe workspace',
    // Hands back to the user: "this call changes nothing by itself".
    set_setting: 'Asking you to change a setting',
    validate_component_selection: 'Checking whether those components work together',
    // "same request body as the real thing, without writing".
    validate_datapack_import: 'Checking the sample-data import without running it',
    verify_ai_setup: 'Checking the AI setup',

    // ── Projects ────────────────────────────────────────────────────────
    create_project: 'Creating the project',
    delete_project: 'Deleting the project',
    rename_project: 'Renaming the project',
    // "Hands back to the user — the wizard is theirs to drive".
    edit_project: 'Opening the setup wizard',
    configure_project: 'Updating the project settings',
    update_project_config: 'Writing the project configuration',
    export_project_settings: 'Exporting the project settings to a file',
    set_current_project: 'Switching project',
    // Pins OR unpins — so the phrase cannot say "Pinning".
    set_project_pinned: 'Pinning or unpinning the project',
    set_project_destination: 'Moving the project to a different Adobe workspace',
    apply_updates: 'Applying available updates',

    // ── Demo lifecycle ──────────────────────────────────────────────────
    start_demo: 'Starting the demo',
    stop_demo: 'Stopping the demo',
    restart_demo: 'Restarting the demo',

    // ── Adobe Console ───────────────────────────────────────────────────
    create_adobe_project: 'Creating the Adobe Console project',
    create_adobe_workspace: 'Creating the Adobe workspace',
    delete_adobe_project: 'Deleting the Adobe Console project',
    add_console_apis: 'Adding Adobe API access',
    // Replaces the list EXACTLY — anything unlisted is removed.
    set_console_apis: 'Replacing the optional Adobe API subscriptions',

    // ── API Mesh and integrations ───────────────────────────────────────
    deploy_mesh: 'Deploying the API mesh',
    delete_mesh: 'Deleting the API mesh',
    add_integration: 'Adding the integration',
    deploy_integration: 'Deploying the integration',
    redeploy_integration: 'Redeploying the integration',
    remove_integration: 'Removing the integration',
    // Display name only — "nothing redeploys".
    rename_integration: 'Renaming the integration',
    install_integration: 'Installing the app into Commerce',
    get_integration_install_status: 'Reading the Commerce install state',

    // ── Storefront and content ──────────────────────────────────────────
    republish: 'Republishing the storefront configuration',
    sync_content: 'Publishing the storefront content',
    sync_storefront: 'Pushing the storefront code to GitHub',
    write_page: 'Writing the page',
    publish_page: 'Publishing the page',
    delete_page: 'Deleting the page',
    promote_block_to_library: 'Adding the block to the authoring library',
    remove_block_from_library: 'Removing the block from the authoring library',
    refresh_block_library: 'Rebuilding the block library',
    migrate_storefront_name: 'Renaming the storefront',
    reset_eds_project: 'Resetting the storefront',
    repair_site_configuration: 'Repairing the site configuration',
    // Grants OR revokes.
    set_site_admin: 'Changing who can administer the site',

    // ── GitHub and DA.live ──────────────────────────────────────────────
    create_github_repo: 'Creating the GitHub repository',
    delete_github_repo: 'Deleting the GitHub repository',
    cleanup_dalive_site: 'Deleting the DA.live site content',
    // "Hands back to the user — the credential comes from a bookmarklet".
    connect_dalive: 'Asking you to sign in to DA.live',

    // ── Sample data ─────────────────────────────────────────────────────
    start_datapack_import: 'Importing the sample data',
    start_datapack_export: 'Capturing the sample data',
    reset_datapack: 'Removing the sample data',

    // ── Environment and session ─────────────────────────────────────────
    install_prerequisite: 'Installing the required tool',
    sign_in: 'Opening sign-in',
    open_url: 'Opening the page in your browser',
    open_view: 'Opening the Demo Builder view',
    reload_window: 'Restarting the editor window',

    // ── AI bundle ───────────────────────────────────────────────────────
    regenerate_ai_files: 'Regenerating the AI files',
    save_ai_prompt: 'Saving the prompt',
    delete_ai_prompt: 'Deleting the saved prompt',
};

/**
 * The phrase for a tool, or undefined when it has none.
 *
 * There is deliberately NO fallback that builds a phrase from the tool's name.
 * Inventing one is the defect this module removes, and a fallback would let the
 * next unauthored tool ship silently. `toolNarration.test.ts` asserts every
 * registered tool has a phrase, so undefined means someone forgot — and the
 * caller should say nothing rather than say something wrong.
 *
 * @param toolName - MCP tool name
 * @returns the authored phrase, or undefined
 */
export function narrationFor(toolName: string): string | undefined {
    return TOOL_NARRATION[toolName];
}
