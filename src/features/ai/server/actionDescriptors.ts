/**
 * Action tool descriptors (Phase 3a).
 *
 * Like the read descriptors, each row dispatches to an EXISTING handler map —
 * only handlers verified headless-safe (no panel/sendMessage/modal) are listed.
 * Destructive rows set `confirm`. Wired in from `extension.ts`.
 */

import { z } from 'zod';
import { needsUser } from './handoff';
import type { ToolDescriptor } from './toolDescriptors';
import { aiHandlers } from '@/features/dashboard/handlers/aiHandlers';
import {
    resolveAddEntry,
    userSuppliedEnvVars,
} from '@/features/dashboard/handlers/appBuilderComponentHandlers';
import { dashboardHandlers } from '@/features/dashboard/handlers/dashboardHandlers';
import { edsHandlers } from '@/features/eds/handlers/edsHandlers';
import { meshHandlers } from '@/features/mesh/handlers/meshHandlers';

/**
 * The add payload, as `handleAddAppBuilderComponent` reads it.
 *
 * Shared by the tool's `inputSchema` and its preflight, so the schema cannot
 * describe one shape while the preflight resolves another.
 */
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
    name: z
        .string()
        .optional()
        .describe('Display name for a custom/blank instance (defaults to the repo name)'),
    instanceId: z
        .string()
        .optional()
        .describe('Explicit instance id for a custom/blank add; must not collide with an existing one'),
    apis: z
        .array(z.string())
        .optional()
        .describe('Adobe sdk codes to subscribe for THIS integration (from list_console_apis)'),
};

/**
 * Refuse a bucket-3 add BEFORE it dispatches, and say where the values go.
 *
 * `handleAddAppBuilderComponent` routes an entry whose `envSchema` declares
 * user-supplied vars to Configure rather than deploying with blanks — by running
 * `demoBuilder.configureProject`. Dispatched from an agent that would open a
 * panel in the user's editor for a call they did not make, and hand back nothing
 * they could act on. Answering here means the handler never runs.
 *
 * Resolution and classification come from the handler's own exports, so the two
 * paths cannot decide differently about the same payload.
 *
 * MEASURED 2026-08-17: no entry in the shipped catalog declares such a var, so
 * this returns `undefined` for every add available today. It is the guard that
 * has to exist before the first one is authored, not a live branch.
 */
function addIntegrationPreflight(args: Record<string, unknown>): Record<string, unknown> | undefined {
    const entry = resolveAddEntry(args as Parameters<typeof resolveAddEntry>[0]);
    // An unknown id is the HANDLER's error to report; answering here would say
    // "enter values" for a component that does not exist.
    if (!entry) return undefined;

    const { names, hasSecret } = userSuppliedEnvVars(entry);
    if (names.length === 0) return undefined;

    const label = entry.name ?? entry.id;
    const listed = names.join(', ');
    return needsUser({
        reason: hasSecret ? 'secret-entry' : 'config-entry',
        what: `Enter ${listed} for ${label} in Demo Builder`,
        where: { command: 'demoBuilder.configureProject' },
        tellUser:
            `${label} needs ${listed}, which Demo Builder collects on its own form — ` +
            `${hasSecret ? 'and a secret must not be sent through the agent. ' : ''}` +
            'Open Configure Project, enter the values, then ask me to add it again. ' +
            'Nothing has been added yet.',
        resumeWith: 'get_component_requirements',
    });
}

export const ACTION_DESCRIPTORS: ToolDescriptor[] = [
    {
        tool: 'regenerate_ai_files',
        description: "Regenerate the project's AI context files (AGENTS.md, .mcp.json, skills)",
        map: aiHandlers,
        type: 'regenerate-ai-files',
    },
    {
        tool: 'start_demo',
        description: "Start the current project's demo server",
        map: dashboardHandlers,
        type: 'startDemo',
    },
    {
        tool: 'add_integration',
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
        preflight: addIntegrationPreflight,
    },
    {
        tool: 'deploy_integration',
        description:
            'Deploy (or redeploy — idempotent) one App Builder integration on the current ' +
            'project by its id (from get_project). Runs the guard chain and deploys under the ' +
            "project's Adobe org context. For the API Mesh, use deploy_mesh instead.",
        map: dashboardHandlers,
        type: 'deployAppBuilderComponent',
        inputSchema: {
            id: z.string().describe('The integration id to deploy (from get_project)'),
        },
    },
    {
        tool: 'redeploy_integration',
        description:
            'Redeploy one App Builder integration by its id (idempotent re-run of its deploy). ' +
            'Same effect as deploy_integration; named for the "redeploy my integration" ask.',
        map: dashboardHandlers,
        type: 'redeployAppBuilderComponent',
        inputSchema: {
            id: z.string().describe('The integration id to redeploy (from get_project)'),
        },
    },
    {
        tool: 'remove_integration',
        description:
            'Remove one App Builder integration by its id. DESTRUCTIVE: undeploys it remotely ' +
            '(aio app undeploy / api-mesh:delete), deletes its local files, and republishes the ' +
            'storefront without it. Confirm the id with the user first.',
        map: dashboardHandlers,
        type: 'removeAppBuilderComponent',
        confirm: true,
        inputSchema: {
            id: z.string().describe('The integration id to remove (from get_project)'),
        },
    },
    {
        tool: 'stop_demo',
        description: "Stop the current project's running demo server",
        map: dashboardHandlers,
        type: 'stopDemo',
    },
    {
        tool: 'rename_project',
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
        description: 'Delete a saved AI prompt by id',
        map: aiHandlers,
        type: 'delete-ai-prompt',
        confirm: true,
        inputSchema: { promptId: z.string().describe('Id of the prompt to delete') },
    },
    {
        tool: 'deploy_mesh',
        description:
            "Deploy (or redeploy — idempotent) the current project's API Mesh. Runs the guard " +
            "chain (auth, org, developer permission) and deploys under the project's Adobe org " +
            'context, then persists the mesh endpoint. Use this rather than deploy_integration ' +
            'for the mesh.',
        map: meshHandlers,
        type: 'deploy-api-mesh',
    },
    {
        tool: 'export_project_settings',
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
];
