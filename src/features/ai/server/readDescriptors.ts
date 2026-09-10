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
// AGENT_PAGE_SIZE is owned by `projectors.ts`, alongside the shaping that applies
// it — two copies of a default page size drift into two different defaults. The
// measurement behind the number is in its docstring there.
import { AGENT_PAGE_SIZE } from './projectors';
import { defaultShape, type ToolDescriptor } from './toolDescriptors';
import { aiHandlers } from '@/features/dashboard/handlers/aiHandlers';
import { dashboardHandlers } from '@/features/dashboard/handlers/dashboardHandlers';
import { dataInstallerHandlers } from '@/features/data-installer/handlers/dataInstallerHandlers';
import { edsHandlers } from '@/features/eds/handlers/edsHandlers';
import { meshHandlers } from '@/features/mesh/handlers/meshHandlers';
import type { HandlerResponse } from '@/types/handlers';

/** Paging, shared by the Data Installer's list reads. */
const PAGING = {
    limit: z
        .number()
        .default(AGENT_PAGE_SIZE)
        .describe(`Maximum rows to return (default ${AGENT_PAGE_SIZE})`),
    skip: z.number().optional().describe('Rows to skip, for paging'),
};

/** Shape of the Data Installer's paged list envelope. */
interface PagedItems {
    items?: Array<Record<string, unknown>>;
    [key: string]: unknown;
}

/**
 * Project each row of a paged list, preserving the envelope
 * (`count`/`total`/`limit`/`skip`) that tells an agent whether to page.
 *
 * Falls through to {@link defaultShape} when the response is an error or has no
 * `items`, so a projector can never turn a failure into a confusing success.
 */
function shapeRows(
    res: HandlerResponse,
    project: (row: Record<string, unknown>) => Record<string, unknown>,
): string {
    if (!res.success) return defaultShape(res);
    const { success: _s, ...rest } = res as HandlerResponse & Record<string, unknown>;
    const keys = Object.keys(rest);
    const payload = (
        keys.length === 1 && keys[0] === 'data' ? (rest as { data: unknown }).data : rest
    ) as PagedItems;
    if (!payload || !Array.isArray(payload.items)) return defaultShape(res);
    return JSON.stringify({ ...payload, items: payload.items.map(project) });
}

/**
 * Drop the fields a datapack row carries for the DASHBOARD, not for an agent.
 *
 * Measured on the live service: `art` (a thumbnail URL) and the full
 * `dataTypes` array were 69% of `list_installed_datapacks` and 64% of a
 * `find_datapacks` row. `dataTypes` is replaced by its count because
 * `get_datapack` already answers the detailed question BETTER — it reports
 * which declared types the service actually holds, which the list cannot.
 * That is the index/detail split, applied to a payload that had none.
 */
function leanDatapackRow(row: Record<string, unknown>): Record<string, unknown> {
    const { art: _art, dataTypes, ...keep } = row;
    return {
        ...keep,
        ...(Array.isArray(dataTypes) ? { dataTypeCount: dataTypes.length } : {}),
    };
}

/**
 * `verify_ai_setup` answers "is my AI setup healthy?" — and used to spend 99% of
 * its response not answering it.
 *
 * Measured live 2026-08-16: 19,856 bytes total, of which `status` + `checks` —
 * the actual verdict — were **170**. The remaining 19,647 were inventory:
 * `skills` 9,451 (21 full descriptions), `mcps` 7,797 (every server's whole tool
 * list), `sessionMcps` 2,267. One call cost more than the entire 65-tool
 * catalogue of descriptions, to deliver a four-item checklist.
 *
 * So the verdict is always returned and the inventory collapses to counts. It is
 * NOT dropped: `inventory:"full"` restores it, because the full listing is a
 * genuine capability — it is the runtime source of truth for what MCP servers a
 * project actually loads, which is how the external-tool audit established that
 * Playwright exposes 23 tools and not the 66 its README lists.
 */
function shapeAiSetup(res: HandlerResponse, args: Record<string, unknown>): string {
    if (!res.success || args.inventory === 'full') return defaultShape(res);
    const { success: _s, ...rest } = res as HandlerResponse & Record<string, unknown>;
    const keys = Object.keys(rest);
    const payload = (
        keys.length === 1 && keys[0] === 'data' ? (rest as { data: unknown }).data : rest
    ) as { inventory?: Record<string, unknown> } & Record<string, unknown>;
    if (!payload?.inventory || typeof payload.inventory !== 'object') return defaultShape(res);

    const counts: Record<string, number> = {};
    for (const [key, value] of Object.entries(payload.inventory)) {
        if (Array.isArray(value)) counts[key] = value.length;
    }
    return JSON.stringify({
        ...payload,
        inventory: counts,
        inventoryDetail: 'call with inventory:"full" for the listing',
    });
}

/** Unwrap a handler response to its payload, or `undefined` if it is an error. */
function payloadOf(res: HandlerResponse): Record<string, unknown> | undefined {
    if (!res.success) return undefined;
    const { success: _s, ...rest } = res as HandlerResponse & Record<string, unknown>;
    const keys = Object.keys(rest);
    return (keys.length === 1 && keys[0] === 'data' ? (rest as { data: unknown }).data : rest) as
        | Record<string, unknown>
        | undefined;
}

/**
 * Flatten the repeated `group` object on each Console API row.
 *
 * Measured live 2026-08-16: 46 rows carrying a `{code, name}` group object cost
 * 2,584 bytes — 48% of the response — to convey **6 distinct values**. Rows keep
 * the group code; the legend is emitted once, so the names stay readable without
 * being paid for 46 times.
 */
function shapeConsoleApis(res: HandlerResponse, args: Record<string, unknown>): string {
    const payload = payloadOf(res) as
        | ({ apis?: Array<Record<string, unknown>> } & Record<string, unknown>)
        | undefined;
    if (!payload || !Array.isArray(payload.apis)) return defaultShape(res);

    const groups: Record<string, string> = {};
    let apis: Array<Record<string, unknown>> = payload.apis.map((row) => {
        const g = row.group as { code?: string; name?: string } | undefined;
        if (g?.code && g.name) groups[g.code] = g.name;
        return { ...row, ...(g?.code ? { group: g.code } : {}) };
    });

    // The description tells an agent to come here "to find the right code (e.g.
    // for Firefly Services)" — a search, which the tool did not offer. Filtering
    // turns that intent into ~a dozen rows instead of all 46.
    const search = typeof args.search === 'string' ? args.search.trim().toLowerCase() : '';
    const total = apis.length;
    if (search) {
        apis = apis.filter((a) =>
            [a.code, a.name, a.group].some(
                (v) => typeof v === 'string' && v.toLowerCase().includes(search),
            ),
        );
    }
    return JSON.stringify({
        ...payload,
        apis,
        groups,
        ...(search ? { search, matched: apis.length, totalUnfiltered: total } : {}),
    });
}

/** How much of a prompt body the index shows before you fetch it in full. */
const PROMPT_PREVIEW_CHARS = 100;

/**
 * `list_ai_prompts` is an INDEX by default; one prompt's body is a detail call.
 *
 * Measured live 2026-08-16: two saved prompts cost 4,848 bytes and **97% of it
 * was the bodies**. Prompts are unbounded free text, so this grows with whatever
 * the user has written — twenty of them would be tens of kilobytes to answer
 * "which prompts do I have?".
 *
 * No `get_ai_prompt` tool exists, so trimming alone would strand the bodies.
 * Hence `promptId`: omit for the index, pass it for one prompt in full. The
 * index keeps a short preview because a title alone ("Build carousel") often
 * will not tell an agent which prompt it wants.
 */
function shapeAiPrompts(res: HandlerResponse, args: Record<string, unknown>): string {
    const payload = payloadOf(res) as
        | ({ aiPrompts?: Array<Record<string, unknown>> } & Record<string, unknown>)
        | undefined;
    if (!payload || !Array.isArray(payload.aiPrompts)) return defaultShape(res);

    const wanted = typeof args.promptId === 'string' ? args.promptId : undefined;
    if (wanted) {
        const one = payload.aiPrompts.find((p) => p.id === wanted);
        return JSON.stringify(
            one ?? {
                error: `Unknown promptId: ${wanted}`,
                hint: 'Call list_ai_prompts with no promptId for the available ids.',
            },
        );
    }

    return JSON.stringify({
        ...payload,
        aiPrompts: payload.aiPrompts.map((p) => {
            const body = typeof p.prompt === 'string' ? p.prompt : '';
            return {
                id: p.id,
                title: p.title,
                ...(p.pinned ? { pinned: true } : {}),
                chars: body.length,
                preview:
                    body.length > PROMPT_PREVIEW_CHARS
                        ? `${body.slice(0, PROMPT_PREVIEW_CHARS)}…`
                        : body,
            };
        }),
        promptBodies: 'call with promptId for one prompt in full',
    });
}

/** The four things `process-datapack` can be asked to do. */
const OPERATION_MODE = z.enum(['import', 'export', 'delete', 'validate']);

export const READ_DESCRIPTORS: ToolDescriptor[] = [
    {
        tool: 'verify_ai_setup',
        needsAuth: false,
        readOnly: true,
        description:
            "Check the project's AI setup (context files, MCP config, skills) and report status. " +
            'Returns the verdict plus inventory counts; pass inventory:"full" for the complete ' +
            'skill and MCP-server listing.',
        map: aiHandlers,
        type: 'verify-ai-setup',
        inputSchema: {
            inventory: z
                .enum(['counts', 'full'])
                .default('counts')
                .describe('How much inventory detail to include (default: counts)'),
        },
        shape: shapeAiSetup,
    },
    {
        tool: 'list_ai_prompts',
        needsAuth: false,
        readOnly: true,
        description:
            'List saved AI prompts for the current project (global + project-local, merged). ' +
            'Returns an index with previews; pass promptId for one prompt in full.',
        map: aiHandlers,
        type: 'list-ai-prompts',
        inputSchema: {
            promptId: z
                .string()
                .optional()
                .describe('Return this one prompt in full; omit for the index'),
        },
        shape: shapeAiPrompts,
    },
    {
        tool: 'check_mesh',
        needsAuth: ['adobe'],
        readOnly: true,
        description: "Report whether the current project's API mesh is deployed and up to date",
        map: meshHandlers,
        type: 'check-api-mesh',
        inputSchema: {
            // Optional, and normally omitted: no agent knows an Adobe workspace
            // id, so the handler falls back to the current project's. Declared
            // anyway because the wizard's create/edit mode targets a workspace
            // the project has not stored yet, and an agent mid-setup may need
            // the same. Omitting the field entirely is what broke this tool: the
            // registration loop dispatches `{}` and the handler rejected it.
            workspaceId: z
                .string()
                .optional()
                .describe("Adobe workspace id; defaults to the current project's workspace"),
        },
    },
    {
        tool: 'get_integration_install_status',
        needsAuth: false,
        readOnly: true,
        description:
            "Read an App Management integration's Commerce install state: the persisted " +
            'outcome plus the LIVE state from the app’s own install API (failed step names ' +
            'included). Use after deploy_integration to answer "did it install, and which step ' +
            'failed" — a failed install is retried with install_integration, not a redeploy.',
        map: dashboardHandlers,
        type: 'getAppBuilderInstallStatus',
        inputSchema: {
            id: z.string().describe('The integration id (from get_project)'),
        },
    },
    {
        tool: 'list_console_apis',
        needsAuth: ['adobe'],
        readOnly: true,
        description:
            "List the Adobe APIs (sdk codes + names) the org can subscribe to on this project's " +
            'Developer Console workspace, flagging the ones Demo Builder already manages. Use before ' +
            'add_console_apis to find the right code — pass search to narrow it (e.g. "firefly").',
        map: dashboardHandlers,
        type: 'listConsoleApis',
        inputSchema: {
            search: z
                .string()
                .optional()
                .describe('Case-insensitive substring match on sdk code, name or group'),
        },
        shape: shapeConsoleApis,
    },
    {
        tool: 'get_store_structure',
        needsAuth: ['commerce'],
        readOnly: true,
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
        needsAuth: false,
        readOnly: true,
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
    // CORRECTED 2026-08-16. This block used to read "None of these needs a
    // custom `shape`", on the strength of the CAPTURED FIXTURES: a 40-row
    // catalog, ~17KB, one activity row ~360 bytes. Sound arithmetic, wrong
    // input. Measured against the live service the same day:
    //
    //   get_datapack_activity     25,056 bytes   100 of 1,099 rows
    //   list_installed_datapacks  16,611 bytes    38 rows
    //   find_datapacks            10,456 bytes    23 rows
    //
    // Two causes, neither visible in a fixture. The service's own `limit`
    // defaults to 100 — a UI page, not an agent one — and an agent's first call
    // is `{}`, so that default IS the cost. And `art` (a dashboard thumbnail)
    // plus the repeated `dataTypes` array were 69% / 64% of a row.
    //
    // Hence AGENT_PAGE_SIZE and `leanDatapackRow` above. The lesson generalises:
    // a fixture says what the shape is, never what the VOLUME will be.
    {
        tool: 'check_datapack_service',
        needsAuth: ['adobe'],
        readOnly: true,
        description:
            'Check whether the Data Installer API is configured and reachable. Use before the ' +
            'other datapack tools when one fails, to tell a service outage from a bad request.',
        map: dataInstallerHandlers,
        type: 'check-datapack-service',
    },
    {
        tool: 'find_datapacks',
        needsAuth: ['adobe'],
        readOnly: true,
        description:
            'List Adobe Commerce sample-data datapacks the Data Installer holds. Returns one row ' +
            'per (name, version) pair — the same pack appears once per version. Curated packs ' +
            'only unless includeCommunity is set. This endpoint reports no total, so ' +
            'count === limit means there may be more — page with skip.',
        map: dataInstallerHandlers,
        type: 'find-datapacks',
        shape: (res) => shapeRows(res, leanDatapackRow),
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
        needsAuth: ['adobe'],
        readOnly: true,
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
        needsAuth: ['adobe'],
        readOnly: true,
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
        needsAuth: ['adobe'],
        readOnly: true,
        description:
            'Datapacks the Data Installer records as installed, and the Commerce instance each ' +
            "went into. This is the service's own tracking, not a live check of the instance.",
        map: dataInstallerHandlers,
        type: 'list-installed-datapacks',
        shape: (res) => shapeRows(res, leanDatapackRow),
        inputSchema: {
            commerceInstance: z.string().optional().describe('Filter to one ACCS instance id'),
            datapackName: z.string().optional().describe('Filter to one datapack name'),
            ...PAGING,
        },
    },
    {
        tool: 'get_datapack_activity',
        needsAuth: ['adobe'],
        readOnly: true,
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
