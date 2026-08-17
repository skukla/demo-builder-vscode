/**
 * Data Installer write tools (Phase 4, Group 8).
 *
 * Six data-installer READS were exposed and optimised in phase 2; ZERO writes
 * were. That asymmetry was the largest single hole in the agent surface — an
 * agent could find a datapack and describe it, and could not import it.
 *
 * ## These ARE descriptor rows, unlike Group 6
 *
 * `importHandlers` and `exportHandlers` are ordinary `MessageHandler`s over a
 * `HandlerContext`, and neither file contains a single `vscode.window` reference
 * (checked, with a control). So they dispatch, and the work here is response
 * design rather than adapters.
 *
 * ## The long-running problem was already solved
 *
 * The backlog required that an import "return a job handle and let
 * `get-datapack-import-status` be called, or it returns a dispatch rather than
 * an outcome". `runAndWatch` already does exactly that: it validates, starts,
 * persists an `ImportJobRecord`, fires the watcher with `void`, and returns
 * `{activationId}`. The watcher's `onProgress` pushes to the webview, which is a
 * no-op headless — but the authoritative record goes to `TransientStateManager`,
 * which `get_datapack_import_status` reads. So polling works with no webview,
 * and no handler needed changing.
 *
 * ## `provision_accs_credentials` is deliberately NOT here
 *
 * Its own handler docstring says so: "Panel-only by construction (never in the
 * MCP maps): it creates a credential in the user's Console workspace." That is a
 * decision already recorded in the code, and its bare `{success: true}` is
 * deliberate for the same reason — "The response never carries the values."
 * Exposing it would be overriding a prior judgement, not filling a gap.
 *
 * ## Shared infrastructure, and what that changes
 *
 * The datapack catalog holds entries other teams depend on, and an EXPORT writes
 * into it. So `start_datapack_export` takes a name echo as well as a confirm,
 * the same bar `delete_github_repo` uses — the risk is not losing your own work.
 *
 * @module features/ai/server/dataInstallerDescriptors
 */

import { z } from 'zod';
import { AGENT_PAGE_SIZE } from './projectors';
import type { ToolDescriptor } from './toolDescriptors';
import { importHandlers } from '@/features/data-installer/handlers/importHandlers';
import type { HandlerResponse } from '@/types/handlers';

/**
 * The datapack an import/reset/export names.
 *
 * `version` is REQUIRED, not "omit for the latest" — `readInput` refuses without
 * it and there is no latest-resolution anywhere behind these handlers. An
 * earlier draft of this schema said otherwise and taught an agent to make a call
 * that always fails; the live probe caught it on the second invocation.
 */
const DATAPACK_ID = {
    datapackName: z.string().describe('Datapack name from find_datapacks'),
    version: z.string().describe('Datapack version, e.g. main (required — there is no "latest")'),
};

/**
 * Where the data lands, and which parts of it.
 *
 * Both are REQUIRED, and `commerceInstance` deliberately so. The handler's own
 * comment says why: "Required, and deliberately NOT defaulted from the project:
 * an import writes into whatever instance this names, and a wrong default writes
 * sample data into someone else's live demo." A schema that invited omitting it
 * was describing a defaulting behaviour that had been removed on purpose.
 */
const IMPORT_TARGET = {
    commerceInstance: z
        .string()
        .describe(
            'Target Commerce instance id (from get_datapack_import_target). Required and never ' +
                'defaulted — a wrong value writes into someone else\'s live demo',
        ),
    dataTypes: z
        .array(z.string())
        .min(1)
        .describe('Data types to include, from list_datapack_data_types. At least one'),
    websiteCode: z.string().optional().describe('Scope from list_datapack_import_scopes'),
    storeCode: z.string().optional().describe('Scope from list_datapack_import_scopes'),
};

/**
 * Page the export item list.
 *
 * `listExportItems` asks the service for `page_size: 1000` and returns whatever
 * comes back. That is the shape phase 2 measured at 25,056 bytes on
 * `get_datapack_activity`, and it is worse here because the caller is CHOOSING
 * from the list rather than reading it.
 *
 * `totalCount` and `excludedCount` are the service's own numbers and are passed
 * through untouched — never recomputed from the page, which is how a `total`
 * comes to describe the page instead of the collection.
 */
function pageExportItems(res: HandlerResponse, args: Record<string, unknown>): string {
    if (!res.success) return JSON.stringify(res);

    const page = res.data as
        | { items?: unknown[]; totalCount?: number; excludedCount?: number }
        | undefined;
    const items = page?.items ?? [];
    const limit = Math.max(1, Math.trunc(Number(args.limit) || AGENT_PAGE_SIZE));

    return JSON.stringify({
        items: items.slice(0, limit),
        returned: Math.min(items.length, limit),
        // The service's counts, verbatim. `totalCount` is what EXISTS;
        // `returned` is what this page carries. Collapsing them is the
        // fabricated-envelope mistake.
        ...(page?.totalCount !== undefined ? { totalCount: page.totalCount } : {}),
        ...(page?.excludedCount !== undefined ? { excludedCount: page.excludedCount } : {}),
    });
}

export const DATA_INSTALLER_DESCRIPTORS: ToolDescriptor[] = [
    // ── reads ───────────────────────────────────────────────────────────────
    {
        tool: 'get_datapack_import_target',
        description:
            'Which Commerce instance an import would land on, derived from the current project, ' +
            'plus the datapack the project was created to hold. Answers; does not decide.',
        map: importHandlers,
        type: 'get-datapack-import-target',
    },
    {
        tool: 'list_datapack_import_scopes',
        description:
            "The websites and store views an import can be scoped to on this project's instance. " +
            'An empty list is normal — it means the import lands on the default.',
        map: importHandlers,
        type: 'list-datapack-import-scopes',
    },
    {
        tool: 'get_datapack_import_status',
        description:
            'Progress of the running or most recent datapack import/reset. Poll this after ' +
            'start_datapack_import — that call returns as soon as the job starts, not when it ends.',
        map: importHandlers,
        type: 'get-datapack-import-status',
    },
    {
        tool: 'list_datapack_export_items',
        description:
            'What this Commerce instance holds for one data type, to choose from before exporting. ' +
            'Paged — totalCount reports how many exist.',
        map: importHandlers,
        type: 'list-datapack-export-items',
        inputSchema: {
            ...DATAPACK_ID,
            dataType: z.string().describe('The single data type to enumerate'),
            // Required for the same reason as the import's: `prepareExport`
            // refuses without it ("A Commerce instance is required.").
            commerceInstance: z.string().describe('Source Commerce instance id'),
            dataTypes: z
                .array(z.string())
                .min(1)
                .describe('Data types the export would cover; at least one, same as start'),
            limit: z
                .number()
                .optional()
                .describe(`Max items to return (default ${AGENT_PAGE_SIZE})`),
        },
        shape: pageExportItems,
    },

    // ── the dry run ─────────────────────────────────────────────────────────
    {
        tool: 'validate_datapack_import',
        description:
            'Dry-run an import: same guard, same credentials, same request body as the real thing, ' +
            'without writing. Run this before start_datapack_import. A refusal comes back as ' +
            'valid:false with a reason, not as an error.',
        map: importHandlers,
        type: 'validate-datapack-import',
        inputSchema: { ...DATAPACK_ID, ...IMPORT_TARGET },
        // Deliberately UNGATED. It is the safe half of the pair, and gating the
        // dry run would push an agent toward the real import to find out whether
        // a request is well-formed — the opposite of why it exists.
    },

    // ── writes ──────────────────────────────────────────────────────────────
    {
        tool: 'start_datapack_import',
        description:
            'Import a datapack into a live Commerce instance. Returns an activationId as soon as ' +
            'the job starts — poll get_datapack_import_status for the outcome. Validate first.',
        map: importHandlers,
        type: 'start-datapack-import',
        confirm: true,
        inputSchema: { ...DATAPACK_ID, ...IMPORT_TARGET },
    },
    {
        tool: 'reset_datapack',
        description:
            "Remove a datapack's data from the Commerce instance so the project can be reused. " +
            'Cannot be undone. Returns an activationId; poll get_datapack_import_status.',
        map: importHandlers,
        type: 'reset-datapack',
        // Gated TWICE, and that is not redundant. The handler has always required
        // `confirm: true` in its payload; the row's gate refuses before dispatch
        // and the same flag satisfies the handler's own check, so the two agree
        // rather than compete. If either were removed the other would still hold.
        confirm: true,
        inputSchema: { ...DATAPACK_ID, ...IMPORT_TARGET },
    },
    {
        tool: 'start_datapack_export',
        description:
            'Capture data from a Commerce instance into a datapack. **Writes into the SHARED ' +
            'catalog other teams depend on** — requires confirm:true and confirmName equal to the ' +
            'datapack name. List what it would contain first.',
        map: importHandlers,
        type: 'start-datapack-export',
        confirm: true,
        inputSchema: {
            ...DATAPACK_ID,
            commerceInstance: z.string().describe('Source Commerce instance id'),
            dataTypes: z.array(z.string()).min(1).describe('Data types to capture; at least one'),
            confirmName: z
                .string()
                .optional()
                .describe('Must equal datapackName exactly — guards a write to the shared catalog'),
        },
        // The echo is checked BEFORE dispatch, like delete_github_repo's. A
        // confirm alone is the bar for "your own project"; this writes somewhere
        // other people read.
        preflight: (args) =>
            args.confirmName === args.datapackName
                ? undefined
                : {
                      error:
                          `start_datapack_export writes "${String(args.datapackName)}" into the shared ` +
                          `datapack catalog. To proceed, call again with confirmName:"${String(args.datapackName)}".`,
                      sharedCatalog: true,
                  },
    },
];
