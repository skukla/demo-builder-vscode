/**
 * Read/status tool descriptors (Phase 2).
 *
 * Each row dispatches to an EXISTING handler map — the same handler the webview
 * calls — so the agent reuses the extension's logic with no new code. Only
 * handlers verified headless-safe (no `panel`/`sendMessage`/modal) are listed
 * here; action/destructive tools come in later phases.
 *
 * This module imports handler maps (extension-host code), so it is wired in
 * from `extension.ts` rather than from the (vscode-free) server module.
 */

import { z } from 'zod';
import type { ToolDescriptor } from './toolDescriptors';
import { aiHandlers } from '@/features/dashboard/handlers/aiHandlers';
import { dashboardHandlers } from '@/features/dashboard/handlers/dashboardHandlers';
import { dataInstallerHandlers } from '@/features/data-installer/handlers';
import { edsHandlers } from '@/features/eds/handlers/edsHandlers';
import { meshHandlers } from '@/features/mesh/handlers';

/** Paging, shared by the Data Installer's list reads. */
const PAGING = {
    limit: z.number().optional().describe('Maximum rows to return'),
    skip: z.number().optional().describe('Rows to skip, for paging'),
};

/** The four things `process-datapack` can be asked to do. */
const OPERATION_MODE = z.enum(['import', 'export', 'delete', 'validate']);

export const READ_DESCRIPTORS: ToolDescriptor[] = [
    {
        tool: 'verify_ai_setup',
        description:
            "Check the project's AI setup (context files, MCP config, skills) and report status",
        map: aiHandlers,
        type: 'verify-ai-setup',
    },
    {
        tool: 'list_ai_prompts',
        description:
            'List saved AI prompts for the current project (global + project-local, merged)',
        map: aiHandlers,
        type: 'list-ai-prompts',
    },
    {
        tool: 'check_mesh',
        description: "Report whether the current project's API mesh is deployed and up to date",
        map: meshHandlers,
        type: 'check-api-mesh',
    },
    {
        tool: 'list_console_apis',
        description:
            "List the Adobe APIs (sdk codes + names) the org can subscribe to on this project's " +
            'Developer Console workspace, flagging the ones Demo Builder already manages. Use before ' +
            'add_console_apis to find the right code (e.g. for Firefly Services).',
        map: dashboardHandlers,
        type: 'listConsoleApis',
    },
    {
        tool: 'get_store_structure',
        description:
            "The Commerce websites, store groups and store views the project's backend actually " +
            'has, plus whether the website/store/store-view codes the project is configured for ' +
            'resolve against them. Use when catalog or PDP pages come back empty, or before ' +
            'trusting a configured store scope.',
        map: edsHandlers,
        type: 'get-store-structure',
    },
    {
        tool: 'get_project_urls',
        description:
            "The current project's useful URLs as data (no browser opened): local storefront " +
            '(while running), EDS live site + DA.live authoring, Commerce admin, and the Developer ' +
            'Console deep link. Absent URLs are omitted.',
        map: dashboardHandlers,
        type: 'getProjectUrls',
    },
    // ---- Data Installer (reads only) ----------------------------------------
    //
    // The six read handlers, and only those. Datapack AUTHORING (create/update/
    // delete datapack, add/update/delete data item, promote version) is
    // deliberately absent: the catalog is shared infrastructure — 23 shared
    // entries other teams depend on — `delete-datapack` cascades, there is no
    // undo and no visible ownership guard, so one agent typo removes a
    // colleague's demo. Those stay behind UI actions with a named-target
    // confirm. Also withheld: `DELETE get-installed-datapacks`, whose only
    // effect is to make the tracking lie, and `async-process-status`, which
    // reports `in_progress` for jobs that finished hours ago.
    //
    // None of these needs a custom `shape`. Measured against the captured
    // fixtures: the whole 40-row catalog is ~17KB of JSON, one datapack's
    // metadata ~0.5KB, and an activity row ~360 bytes. The megabyte payload is a
    // data ITEM, which no handler here returns — `limit`/`skip` is the lever for
    // the rest, and it is the service's own.
    {
        tool: 'check_datapack_service',
        description:
            'Check whether the Data Installer API is configured and reachable. Use before the ' +
            'other datapack tools when one fails, to tell a service outage from a bad request.',
        map: dataInstallerHandlers,
        type: 'check-datapack-service',
    },
    {
        tool: 'find_datapacks',
        description:
            'List Adobe Commerce sample-data datapacks the Data Installer holds. Returns one row ' +
            'per (name, version) pair — the same pack appears once per version. Curated packs ' +
            'only unless includeCommunity is set.',
        map: dataInstallerHandlers,
        type: 'find-datapacks',
        inputSchema: {
            includeCommunity: z
                .boolean()
                .optional()
                .describe('Include non-shared developer packs (default: curated only)'),
            ...PAGING,
        },
    },
    {
        tool: 'get_datapack',
        description:
            "One datapack's metadata plus which of its declared data types the service actually " +
            'stores. Use before installing: a pack can declare a type it holds no item for.',
        map: dataInstallerHandlers,
        type: 'get-datapack-detail',
        inputSchema: {
            // Both required: `(name, version)` is the identity the service keys
            // on, so a lookup by name alone has no answer.
            datapackName: z.string().describe('Datapack name, e.g. "bodea"'),
            version: z.string().describe('Version, e.g. "main" or "eds-compatible"'),
        },
    },
    {
        tool: 'list_datapack_data_types',
        description:
            'The data types the Data Installer can process for one operation mode, in dependency ' +
            'order. Ask per mode — the import and export sets genuinely differ.',
        map: dataInstallerHandlers,
        type: 'list-datapack-data-types',
        inputSchema: {
            // No default: guessing a mode would offer the wrong type set.
            operationMode: OPERATION_MODE.describe('Which operation the types are for'),
        },
    },
    {
        tool: 'list_installed_datapacks',
        description:
            'Datapacks the Data Installer records as installed, and the Commerce instance each ' +
            'went into. This is the service\'s own tracking, not a live check of the instance.',
        map: dataInstallerHandlers,
        type: 'list-installed-datapacks',
        inputSchema: {
            commerceInstance: z.string().optional().describe('Filter to one ACCS instance id'),
            datapackName: z.string().optional().describe('Filter to one datapack name'),
            ...PAGING,
        },
    },
    {
        tool: 'get_datapack_activity',
        description:
            "The Data Installer's own request log — which packs were imported, exported or " +
            'validated, against which instance, and when. Use to see what a previous run did.',
        map: dataInstallerHandlers,
        type: 'get-datapack-activity',
        inputSchema: {
            datapackName: z.string().optional().describe('Filter to one datapack name'),
            commerceInstance: z.string().optional().describe('Filter to one ACCS instance id'),
            operationMode: OPERATION_MODE.optional().describe('Filter to one operation'),
            ...PAGING,
        },
    },
];
