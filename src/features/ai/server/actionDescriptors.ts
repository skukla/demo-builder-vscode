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
            'Add an App Builder integration to the current project: give it an Adobe workspace ' +
            "of its own (an ERP and its integration share one; a mesh stays in the project's " +
            'workspace), clone it, subscribe its Adobe APIs there, build and deploy it, and ' +
            'register it on the dashboard. get_project shows the workspace on its record. ' +
            'Pass a catalog `id` (from list_components) OR a custom GitHub `source`. Adding a ' +
            'catalog id the project already has adds a numbered copy (`erp-integration-2`, which ' +
            'brings its own `demo-erp-2`); a project has one mesh. ' +
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
            'are left running and can be cleaned up in the Console). An integration with a ' +
            'workspace of its own stays put within the same Adobe project; into a different one ' +
            'it is removed from the old (uninstalled from Commerce, its workspace deleted) and ' +
            'added again, after the SC confirms. Takes a minute or more per integration. The org is NOT taken from here — sign-in owns org selection. Create the ' +
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
                    // REQUIRED, and optional until 2026-09-20. The machine name is what an
                    // App Management install sends; a destination written without it leaves
                    // the project unable to install one AT ALL, and the refusal names an
                    // internal field ("missing workspaceName") long after the move that
                    // caused it. Kukla Bodea was moved this way on 2026-09-18.
                    name: z
                        .string()
                        .min(1)
                        .describe('Workspace MACHINE name, exactly as list_workspaces returns it'),
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
        tool: 'set_setup_step',
        needsAuth: false,
        readOnly: false,
        description:
            "Mark one step of an integration's demo setup checklist (from get_setup_checklist) " +
            'done or dismissed, or open it again. Changes only the checklist in Demo Builder, not ' +
            'Commerce: the step itself is done by hand in Commerce Admin. Mark a step done only ' +
            'when the user says they did it.',
        map: dashboardHandlers,
        type: 'setSetupStep',
        inputSchema: {
            id: z.string().describe('The integration id (from get_project)'),
            stepId: z.string().describe('The step id (from get_setup_checklist)'),
            state: z.enum(['done', 'dismissed', 'open']).describe('What the step becomes'),
        },
    },
    {
        tool: 'check_setup_steps',
        needsAuth: ['adobe'],
        readOnly: false,
        description:
            "Run the checks Demo Builder can do itself on an integration's demo setup checklist " +
            '(reads Commerce, e.g. whether each company has a customer group of its own), and ' +
            'save what each found: a passing check marks its step done, a failing one opens it ' +
            'again with the reason. Steps without a check are left as they are.',
        map: dashboardHandlers,
        type: 'checkSetupSteps',
        inputSchema: {
            id: z.string().describe('The integration id (from get_project)'),
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
            'from the code already deployed. Use when get_integration_install_status shows ' +
            'needsReinstall (Commerce refused to upgrade it in place), and as the REPAIR when ' +
            "Commerce has lost what the app registered (its webhooks or events are gone) while " +
            'the app still reports itself installed — install_integration then answers skipped. ' +
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
            '(aio app undeploy / api-mesh:delete), deletes its local files and its own Adobe ' +
            'workspace, and republishes the storefront without it. The ERP integration first undoes what it wrote into Commerce ' +
            'and takes its ERP with it; removing the ERP removes its integration the same way. ' +
            'Before undeploying it runs the clean-ups only the deployed code can do (the Commerce ' +
            "undo and uninstall, the ERP's records); if one fails NOTHING is removed and the " +
            'error code is COMPONENT_REMOVAL_STOPPED, with the reasons. Retry, or pass force:true ' +
            'only after the user chose to remove anyway; data.warning then says what stays behind. ' +
            'After the undeploy, Runtime leftovers are retried until gone; if any remain, or the ' +
            'namespace cannot be checked, it also stops with COMPONENT_REMOVAL_STOPPED, keeping ' +
            'the integration and its workspace, and a retry resumes at the undeploy. ' +
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
        tool: 'write_erp_rest',
        needsAuth: false,
        readOnly: false,
        description:
            "POST, PUT, PATCH or DELETE one of the ERP's own routes — the actions a person takes " +
            "on its screens, without the screen: confirm, ship, invoice, hold, release or cancel an " +
            'order (orders/<number>/confirm …), change a price or list price (PATCH products/<sku>), ' +
            'a credit limit or block (PATCH partners/<id>), add a pricing condition (POST pricing). ' +
            'The ERP publishes the change to the integration, which applies it to Commerce. Requires ' +
            'confirm:true. Takes the ERP integration id, the method, the route and a JSON body.',
        map: dashboardHandlers,
        type: 'writeErpApi',
        confirm: true,
        inputSchema: {
            id: z.string().describe('The ERP integration id (from get_project)'),
            method: z.enum(['POST', 'PUT', 'PATCH', 'DELETE']).describe('The ERP route\'s verb'),
            path: z.string().describe('The ERP route, e.g. "orders/0000001003/confirm" or "partners/C21"'),
            body: z.record(z.unknown()).optional().describe('The JSON body the route takes'),
        },
    },
    {
        tool: 'invoke_runtime_action',
        needsAuth: ['adobe'],
        readOnly: false,
        description:
            "Run one deployed action in this project's Adobe I/O Runtime namespace (or the " +
            'workspace an integration deploys into), blocking, with a payload, and answer its result, ' +
            'status and log lines. Use to replay an event handler ("order-commerce/created" with ' +
            '{data:{value:<the order>}}) or a webhook ("webhook/item-prices" with the cart payload) ' +
            'when Commerce or a timer cannot be made to fire it, and to read what a SUCCESSFUL run ' +
            'did — which list_runtime_activations never records. A web action (a cart webhook, an ' +
            "ERP route) is called through its URL with the user's Adobe token and its recorded run " +
            'is read, log lines included; any other action (an event handler, a job) is invoked ' +
            'blocking and answers its result — Runtime keeps no log lines for a successful direct ' +
            'invoke, only for a failed one. The action may write to Commerce or the ' +
            'ERP, so this requires confirm:true. Takes componentId (optional), action ' +
            '(<package>/<action>) and payload (a JSON object).',
        map: dashboardHandlers,
        type: 'invokeRuntimeAction',
        confirm: true,
        inputSchema: {
            componentId: z.string().min(1).optional().describe('An integration id, to run in its own workspace'),
            action: z.string().describe('The action, as <package>/<action>, e.g. "webhook/item-prices"'),
            payload: z.record(z.unknown()).optional().describe("The action's parameters as a JSON object"),
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
            'access. Pass componentId to add them to one integration, in its own workspace when it ' +
            'has one. Persisted — survives later component adds/removes. Confirm the codes with the ' +
            'user first.',
        map: dashboardHandlers,
        type: 'addConsoleApis',
        inputSchema: {
            apis: z
                .array(z.string())
                .min(1)
                .describe('Adobe sdk codes to subscribe (from list_console_apis)'),
            componentId: z
                .string()
                .optional()
                .describe("Add to this integration's APIs, in its own workspace; omit for the project's"),
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
