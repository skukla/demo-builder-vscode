/**
 * Action tool descriptors (Phase 3a).
 *
 * Like the read descriptors, each row dispatches to an EXISTING handler map —
 * only handlers verified headless-safe (no panel/sendMessage/modal) are listed.
 * Destructive rows set `confirm`. Wired in from `extension.ts`.
 */

import { z } from 'zod';
import type { ToolDescriptor } from './toolDescriptors';
import { aiHandlers } from '@/features/dashboard/handlers/aiHandlers';
import { dashboardHandlers } from '@/features/dashboard/handlers/dashboardHandlers';
import { edsHandlers } from '@/features/eds/handlers/edsHandlers';
import { meshHandlers } from '@/features/mesh/handlers/meshHandlers';
import { prerequisitesHandlers } from '@/features/prerequisites/handlers/prerequisitesHandlers';
import { projectsListHandlers } from '@/features/projects-dashboard/handlers/projectsListHandlers';

/** The add payload, as `handleAddAppBuilderComponent` reads it. */
const addIntegrationSchema = {
    id: z
        .string()
        .optional()
        .describe('Catalog component id (from list_components). Omit when passing `source`.'),
    source: z
        .object({
            owner: z.string().describe('GitHub owner/org'),
            repo: z.string().describe('GitHub repository name'),
        })
        .optional()
        .describe('A custom App Builder app on GitHub. Omit when passing `id`.'),
    refreshCli: z
        .boolean()
        .optional()
        .describe(
            'Consent to refresh the Adobe CLI and retry, when a previous attempt failed with an out-of-date-toolchain hint. CONFIRM WITH THE USER FIRST — this updates their global `@adobe/aio-cli` install. Never pass it pre-emptively.',
        ),
    name: z
        .string()
        .optional()
        .describe('Display name for a custom/blank instance (defaults to the repo name)'),
    instanceId: z
        .string()
        .optional()
        .describe(
            'Explicit instance id for a custom/blank add; must not collide with an existing one',
        ),
    apis: z
        .array(z.string())
        .optional()
        .describe('Adobe sdk codes to subscribe for THIS integration (from list_console_apis)'),
};

export const ACTION_DESCRIPTORS: ToolDescriptor[] = [
    {
        tool: 'regenerate_ai_files',
        needsAuth: false,
        readOnly: false,
        description: "Regenerate the project's AI context files (AGENTS.md, .mcp.json, skills)",
        map: aiHandlers,
        type: 'regenerate-ai-files',
    },
    {
        tool: 'start_demo',
        needsAuth: false,
        readOnly: false,
        description: "Start the current project's demo server",
        map: dashboardHandlers,
        type: 'startDemo',
    },
    {
        tool: 'add_integration',
        needsAuth: ['adobe'],
        readOnly: false,
        description:
            'Add an App Builder integration to the current project: clone it, subscribe its ' +
            'Adobe APIs, build and deploy it under the project org, and register it on the ' +
            'dashboard. Pass a catalog `id` (from list_components) OR a custom GitHub `source`. ' +
            'Takes about a minute. Returns the id to use with deploy_integration / ' +
            'remove_integration. Confirm the choice with the user first.',
        map: dashboardHandlers,
        type: 'addAppBuilderComponent',
        inputSchema: addIntegrationSchema,
        // Not confirm-gated, matching deploy_integration: an add is additive and
        // re-runnable (a failed add keeps its folder so the user can retry), and
        // remove_integration — which undeploys remotely — carries the gate instead.
    },
    {
        tool: 'rename_integration',
        needsAuth: false,
        readOnly: false,
        description:
            "Change one App Builder integration's DISPLAY NAME on the current project. The id, " +
            'its folder and its Runtime package are immutable and do not move. Local metadata ' +
            'only — nothing redeploys. Pre-built catalog integrations and the API Mesh cannot ' +
            'be renamed.',
        map: dashboardHandlers,
        type: 'renameAppBuilderComponent',
        inputSchema: {
            id: z.string().describe('The integration id to rename (from get_project)'),
            // REQUIRED, and that is the headless-safety guard rather than a
            // convenience: `resolveRenameName` falls through to
            // `vscode.window.showInputBox` when the payload carries no name, so an
            // optional field here would hang an agent's call on a dialog nobody is
            // watching. Anything the caller must control belongs in the schema —
            // the same reasoning as `argDefaults`, from the other direction.
            name: z
                .string()
                .min(1)
                .describe('New display name; must not collide with another integration'),
        },
    },
    {
        tool: 'set_console_apis',
        needsAuth: ['adobe'],
        readOnly: false,
        description:
            "Set the OPTIONAL Adobe API subscriptions on this project's Developer Console " +
            'workspace credential to EXACTLY this list — anything currently subscribed and not ' +
            'listed is REMOVED. Pass an empty array to clear the extras. Use add_console_apis to ' +
            'only add. Always-on codes (baseline + whatever the components require) are re-included ' +
            "regardless. Pass componentId to edit one integration's picks rather than the union.",
        map: dashboardHandlers,
        type: 'setConsoleApis',
        // Gated where `add_console_apis` is not, and the tool NAME is why the
        // `delete_*` rule could never catch it: a short list unsubscribes codes on
        // a live workspace credential, which is a delete wearing a setter's name.
        confirm: true,
        inputSchema: {
            apis: z
                .array(z.string())
                .describe(
                    'The complete desired list of extra sdk codes (from list_console_apis); [] clears them',
                ),
            componentId: z
                .string()
                .optional()
                .describe("Edit only this integration's picks; omit to set the project-wide union"),
        },
    },
    {
        tool: 'set_project_destination',
        needsAuth: ['adobe'],
        readOnly: false,
        description:
            'Point the current project at a different Adobe Console project + workspace, and MOVE ' +
            'every integration there (each is redeployed under the new target; the old deployments ' +
            'are left running and can be cleaned up in the Console). Takes a minute or more per ' +
            'integration. The org is NOT taken from here — sign-in owns org selection. Create the ' +
            'target first with create_adobe_project / create_adobe_workspace if it does not exist.',
        map: dashboardHandlers,
        type: 'setProjectDestination',
        inputSchema: {
            project: z
                .object({
                    id: z.string().describe('Adobe Console project id (from list_adobe_projects)'),
                    name: z.string().optional(),
                    title: z
                        .string()
                        .optional()
                        .describe('Display title, used in progress and the header'),
                })
                .describe('The Adobe Console project to deploy into'),
            workspace: z
                .object({
                    id: z.string().describe('Workspace id (from list_workspaces)'),
                    name: z.string().optional(),
                    title: z
                        .string()
                        .optional()
                        .describe('Display title, used in progress and the header'),
                })
                .describe('The workspace within that project'),
        },
        // Ungated on purpose. The move only ever DEPLOYS — nothing is undeployed
        // from the old destination — and it is undone by setting the destination
        // back. The UI's confirmation modal was removed for that reason (user
        // decision 2026-08-07); gating here would reinstate it for agents alone.
    },
    {
        tool: 'deploy_integration',
        needsAuth: ['adobe'],
        readOnly: false,
        description:
            'Deploy (or redeploy) one App Builder integration on the current ' +
            'project by its id (from get_project). Runs the guard chain and deploys under the ' +
            "project's Adobe org context. For the API Mesh, use deploy_mesh instead.",
        map: dashboardHandlers,
        type: 'deployAppBuilderComponent',
        inputSchema: {
            id: z.string().describe('The integration id to deploy (from get_project)'),
            refreshCli: z
                .boolean()
                .optional()
                .describe(
                    'Consent to refresh the Adobe CLI and retry, when a previous attempt failed with an out-of-date-toolchain hint. CONFIRM WITH THE USER FIRST — this updates their global `@adobe/aio-cli` install. Never pass it pre-emptively.',
                ),
        },
    },
    {
        tool: 'set_integration_settings',
        needsAuth: ['adobe'],
        readOnly: false,
        description:
            "Change one integration's text Settings (from get_integration_settings), then " +
            'redeploy it, and first its ERP when the ERP uses the same setting, because a ' +
            'setting reaches an app only through its deploy. Takes minutes. Secret settings ' +
            'cannot be set here: a secret must never be a tool argument, so ask the user to ' +
            "enter it in the integration's Settings on its tile. Confirm the change with the " +
            'user first.',
        map: dashboardHandlers,
        type: 'saveIntegrationSettings',
        inputSchema: {
            id: z.string().describe('The integration id (from get_project)'),
            values: z
                .record(z.string(), z.string())
                .describe('Text settings to change, by name (from get_integration_settings)'),
        },
    },
    {
        tool: 'redeploy_integration',
        needsAuth: ['adobe'],
        readOnly: false,
        description:
            'Redeploy one App Builder integration by its id (idempotent re-run of its deploy). ' +
            'Same effect as deploy_integration; named for the "redeploy my integration" ask. ' +
            'Deploys the folder as it is; to get newer code, use update_integration.',
        map: dashboardHandlers,
        type: 'redeployAppBuilderComponent',
        inputSchema: {
            id: z.string().describe('The integration id to redeploy (from get_project)'),
            refreshCli: z
                .boolean()
                .optional()
                .describe(
                    'Consent to refresh the Adobe CLI and retry, when a previous attempt failed with an out-of-date-toolchain hint. CONFIRM WITH THE USER FIRST — this updates their global `@adobe/aio-cli` install. Never pass it pre-emptively.',
                ),
        },
    },
    {
        tool: 'update_integration',
        needsAuth: ['adobe'],
        readOnly: false,
        description:
            'Update an integration to the newest code on its GitHub branch: fetch it ' +
            '(fast-forward only), install its dependencies, redeploy, and upgrade the app in ' +
            'Commerce. An integration and its ERP update as a pair from either id: each with ' +
            'newer code is updated, the ERP first. Also works on one whose last deploy failed. ' +
            'Refuses, and names the files, when the folder holds local edits. Use ' +
            'check_integration_updates to see which integrations have an update.',
        map: dashboardHandlers,
        type: 'updateAppBuilderComponent',
        // Not confirm-gated, matching redeploy_integration: it never overwrites
        // the SC's edits (it refuses instead) and deploys the declared source.
        inputSchema: {
            id: z.string().describe('The integration or ERP id to update (from get_project)'),
        },
    },
    {
        tool: 'check_integration_updates',
        needsAuth: false,
        // Records the answer on the project (appBuilderComponents[id].updateAvailable),
        // so it is not a pure read.
        readOnly: false,
        description:
            'Check which deployed integrations (and their ERPs) have newer code on their GitHub ' +
            'branch, or a version Commerce does not have installed. Records the answer where the ' +
            'integration cards read it. Changes no files and deploys nothing.',
        map: dashboardHandlers,
        type: 'checkIntegrationUpdates',
        inputSchema: {},
    },
    {
        tool: 'install_integration',
        needsAuth: ['adobe'],
        readOnly: false,
        description:
            'Re-run the Commerce install/associate pass for a DEPLOYED App Management ' +
            'integration (e.g. the Commerce starter kit), without redeploying it. Use when ' +
            'get_integration_install_status reports a failed install. Idempotent — an ' +
            'already-current install answers skipped.',
        map: dashboardHandlers,
        type: 'installAppBuilderComponent',
        // Not confirm-gated, matching deploy_integration: the install is a
        // convergent reconcile toward the state the deploy already declared.
        inputSchema: {
            id: z.string().describe('The integration id to install (from get_project)'),
        },
    },
    {
        tool: 'reinstall_integration',
        needsAuth: ['adobe'],
        readOnly: false,
        description:
            'Uninstall a DEPLOYED App Management integration from Commerce and install it again ' +
            'from the code already deployed. Only for when get_integration_install_status shows ' +
            'needsReinstall (Commerce refused to upgrade it in place); refused otherwise. ' +
            'DESTRUCTIVE: what the app set up in Commerce is removed first, and its saved ' +
            'settings may reset. Confirm with the user first.',
        map: dashboardHandlers,
        type: 'reinstallAppBuilderComponent',
        confirm: true,
        inputSchema: {
            id: z.string().describe('The integration id to reinstall (from get_project)'),
        },
    },
    {
        tool: 'remove_integration',
        needsAuth: ['adobe'],
        readOnly: false,
        description:
            'Remove one App Builder integration by its id. DESTRUCTIVE: undeploys it remotely ' +
            '(aio app undeploy / api-mesh:delete), deletes its local files, and republishes the ' +
            'storefront without it. The ERP integration first undoes what it wrote into Commerce ' +
            'and takes its ERP with it; removing the ERP removes its integration the same way. ' +
            'Before undeploying it runs the clean-ups only the deployed code can do (the Commerce ' +
            "undo and uninstall, the ERP's records); if one fails NOTHING is removed and the " +
            'error code is COMPONENT_REMOVAL_STOPPED, with the reasons. Retry, or pass force:true ' +
            'only after the user chose to remove anyway; data.warning then says what stays behind. ' +
            'Confirm the id with the user first.',
        map: dashboardHandlers,
        type: 'removeAppBuilderComponent',
        confirm: true,
        inputSchema: {
            id: z.string().describe('The integration id to remove (from get_project)'),
            force: z
                .boolean()
                .optional()
                .describe('Remove even though a clean-up did not finish. Only when the user chose to.'),
        },
    },
    {
        tool: 'reset_erp_records',
        needsAuth: ['adobe'],
        readOnly: false,
        description:
            "Reset the ERP that comes with the ERP integration: undo the credit limits and " +
            'company blocks it wrote into Commerce, clear the ERP order numbers from Commerce ' +
            'orders, wipe every ERP record, then mirror the Commerce products and companies into it ' +
            'again as they stand. Commerce is the master; the ERP is transitory. Confirm with the ' +
            'user first. Takes the integration id.',
        map: dashboardHandlers,
        type: 'resetErpRecords',
        confirm: true,
        inputSchema: {
            id: z.string().describe('The ERP integration id (from get_project)'),
        },
    },
    {
        tool: 'open_erp_screen',
        needsAuth: false,
        // NOT read-only: it opens a browser window, same as open_url.
        readOnly: false,
        description:
            "Open the ERP's own screen (products, partners, pricing, orders, events) in a private " +
            'browser window, for the ERP that comes with an ERP integration. The key the screen ' +
            'needs is added by the extension and never returned. Takes the integration id. ' +
            'Requires confirm:true — it takes over the screen; ask the user first.',
        map: dashboardHandlers,
        type: 'openErpScreen',
        confirm: true,
        inputSchema: {
            id: z.string().describe('The ERP integration id (from get_project)'),
        },
    },
    {
        tool: 'stop_demo',
        needsAuth: false,
        readOnly: false,
        description: "Stop the current project's running demo server",
        map: dashboardHandlers,
        type: 'stopDemo',
    },
    {
        tool: 'restart_demo',
        needsAuth: false,
        readOnly: false,
        description:
            "Stop and restart the current project's demo server. Use after a config change that " +
            'says a restart is needed — it owns the settle delay between the stop and the start, ' +
            'which calling stop_demo then start_demo does not.',
        map: dashboardHandlers,
        type: 'restartDemo',
    },
    {
        tool: 'set_current_project',
        needsAuth: false,
        readOnly: false,
        description:
            'Make a project the CURRENT one, which is what every project-scoped tool acts on ' +
            '(get_project, configure_project, deploy_*, start_demo…). Takes the path from ' +
            'list_projects. Note this is unrelated to select_project, which picks an Adobe ' +
            'Console project.',
        map: projectsListHandlers,
        type: 'selectProject',
        inputSchema: {
            projectPath: z.string().describe('Absolute project path (from list_projects)'),
        },
        // Forced OFF, not defaulted. `forceNewWindow` is the shift-click gesture:
        // it opens a SECOND VS Code window, which is a screen takeover no agent
        // should be able to trigger — and it leaves the current window on the
        // projects list, so the agent's own next call would act on a window the
        // user is not looking at. Anything the caller should control belongs in
        // `inputSchema`; this deliberately does not.
        argDefaults: { forceNewWindow: false },
    },
    {
        tool: 'set_project_pinned',
        needsAuth: false,
        readOnly: false,
        description:
            'Pin or unpin a project. Pinned projects sort first on the projects dashboard. ' +
            'Local display state only — nothing deploys or restarts.',
        map: projectsListHandlers,
        type: 'setProjectPinned',
        inputSchema: {
            projectPath: z.string().describe('Absolute project path (from list_projects)'),
            pinned: z.boolean().describe('true to pin, false to unpin'),
        },
    },
    {
        tool: 'rename_project',
        needsAuth: false,
        readOnly: false,
        description:
            'Rename the current project — the folder on disk, saved state, and the ' +
            "project's MCP/AI configs all move together. Rejected while the demo is " +
            'running. Never rename a project folder with shell commands; always use this.',
        map: dashboardHandlers,
        type: 'renameProject',
        inputSchema: {
            newName: z
                .string()
                .min(1)
                .describe('New project name (letters, digits, hyphens, underscores only)'),
        },
    },
    {
        tool: 'save_ai_prompt',
        needsAuth: false,
        readOnly: false,
        description: 'Create or update a saved AI prompt',
        map: aiHandlers,
        type: 'save-ai-prompt',
        inputSchema: {
            prompt: z
                .object({
                    id: z.string().describe('Prompt id (reuse to update; new id to create)'),
                    title: z.string(),
                    prompt: z.string(),
                    pinned: z
                        .boolean()
                        .optional()
                        .describe('true = global (every project); false = project-local'),
                })
                .describe('The prompt to save'),
        },
    },
    {
        tool: 'delete_ai_prompt',
        needsAuth: false,
        readOnly: false,
        description: 'Delete a saved AI prompt by id',
        map: aiHandlers,
        type: 'delete-ai-prompt',
        confirm: true,
        inputSchema: { promptId: z.string().describe('Id of the prompt to delete') },
    },
    {
        tool: 'deploy_mesh',
        needsAuth: ['adobe'],
        readOnly: false,
        description:
            "Deploy (or redeploy) the current project's API Mesh. Runs the guard " +
            "chain (auth, org, developer permission) and deploys under the project's Adobe org " +
            'context, then persists the mesh endpoint. Use this rather than deploy_integration ' +
            'for the mesh.',
        map: meshHandlers,
        type: 'deploy-api-mesh',
    },
    {
        tool: 'export_project_settings',
        needsAuth: false,
        readOnly: false,
        description:
            "Export the current project's settings to a JSON file on disk (folder, saved state, " +
            'component configs, and — by default — secrets). Secrets are written to the FILE only; ' +
            'the response returns just { path, includesSecrets }, never the secret values. The ' +
            'target must be inside the project directory (defaults to ' +
            '<project>/<name>.demo-builder.json). Pass includeSecrets:false for a secret-free copy.',
        map: dashboardHandlers,
        type: 'exportProjectSettings',
        inputSchema: {
            path: z
                .string()
                .optional()
                .describe(
                    'Target file (relative to the project dir, or absolute inside it). ' +
                        'Omit for <project>/<name>.demo-builder.json.',
                ),
            includeSecrets: z
                .boolean()
                .optional()
                .describe('Write secrets to the file (default true — a full local backup).'),
        },
    },
    {
        tool: 'refresh_block_library',
        needsAuth: false,
        readOnly: false,
        description:
            "Rebuild the current EDS project's DA.live authoring block library from its " +
            'component-definition.json (destructive full re-sync — use after hand-editing ' +
            'component-definition.json outside the promote flow). EDS projects only; returns the ' +
            'rebuilt library paths. Republishes the library to the live site, so it requires ' +
            'confirm:true.',
        map: edsHandlers,
        type: 'refresh-block-library',
        // Gated on the same rule as promote/remove_block_from_library: it runs
        // with skipPublish: false (refreshBlockLibraryHeadless.ts:109), so a full
        // re-sync reaches the live site. The dashboard kebab path is unaffected —
        // this gate lives in the descriptor row, not the handler.
        confirm: true,
    },
    {
        tool: 'delete_mesh',
        needsAuth: ['adobe'],
        readOnly: false,
        description: 'Delete the API Mesh for an Adobe I/O workspace',
        map: meshHandlers,
        type: 'delete-api-mesh',
        confirm: true,
        inputSchema: {
            workspaceId: z.string().describe('Adobe I/O workspace id whose mesh to delete'),
        },
    },
    {
        tool: 'add_console_apis',
        needsAuth: ['adobe'],
        readOnly: false,
        description:
            "Subscribe Adobe APIs (sdk codes from list_console_apis) on this project's Developer " +
            'Console workspace credential, e.g. to give a custom App Builder app Firefly Services ' +
            'access. Persisted — survives later component adds/removes. Confirm the codes with the ' +
            'user first.',
        map: dashboardHandlers,
        type: 'addConsoleApis',
        inputSchema: {
            apis: z
                .array(z.string())
                .min(1)
                .describe('Adobe sdk codes to subscribe (from list_console_apis)'),
        },
    },
    {
        tool: 'install_prerequisite',
        needsAuth: false,
        readOnly: false,
        description:
            'Install one missing prerequisite (Node, aio CLI, plugins) by its prereqId from ' +
            'check_prerequisites. Runs a package manager — confirm with the user first. Some ' +
            'prerequisites can only be installed by hand; those answer with a URL to relay.',
        map: prerequisitesHandlers,
        type: 'install-prerequisite',
        // CONFIRM-GATED because it runs package managers on the user's machine —
        // fnm, npm, brew. Not destructive, but not something to discover after
        // the fact either, and it can take minutes.
        confirm: true,
        inputSchema: {
            // The prerequisite's OWN id, never the numeric index. That index is a
            // position in a list rebuilt per check and looked up in `sharedState`,
            // which the headless context recreates on every call — so an
            // index-addressed install could only ever fail here, however correct
            // the index was. `check_prerequisites` now reports `prereqId`
            // alongside it for exactly this call.
            prerequisiteId: z
                .string()
                .describe('Prerequisite id from check_prerequisites, e.g. node or aio-cli'),
            version: z
                .string()
                .optional()
                .describe('Specific version to install, where the prerequisite supports one'),
        },
    },
];
