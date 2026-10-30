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

/** One store a demo-data check or clearing is about (`WipeStoreChoice`): a website alone means all its stores. */
const WIPE_STORE = z
    .object({
        websiteCode: z.string().describe('The website, by code'),
        storeCode: z.string().optional().describe('The store (store group), by code. Omit for every store of the website'),
    })
    .strict();

/**
 * The datapack an import/reset/export names.
 *
 * `version` is REQUIRED, not "omit for the latest" — `readInput` refuses without
 * it and there is no latest-resolution anywhere behind these handlers. An
 * earlier draft of this schema said otherwise and taught an agent to make a call
 * that always fails; the live probe caught it on the second invocation.
 */
/**
 * Which store holds a pack, for the two step-05 rows: the preview reads the pack from it, and the
 * save reads the installed version's own rows from it, so products the store already had are kept
 * in the new version.
 */
const PACK_SOURCE = z.enum(['installer', 'library']).optional().describe('Which store holds the pack: installer or library. Omitted: the preview reads the installer, the save tries the library then the installer');

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
    // Optional, and safe to omit: the handler falls back to the scope the
    // PROJECT recorded. Omitting them used to mean the SERVICE's base/default —
    // a scope nobody chose — which is how an agent could import, and reset,
    // against the wrong website without ever seeing a decision.
    //
    // Send BOTH or NEITHER. Half a pair is refused rather than completed, so a
    // caller cannot half-specify and get a target it did not ask for.
    websiteCode: z
        .string()
        .optional()
        .describe(
            'Website scope. Omit to use what the project recorded (get_datapack_import_target ' +
                'reports it); send with storeCode to override',
        ),
    storeCode: z
        .string()
        .optional()
        .describe(
            'Store VIEW code, from list_datapack_import_scopes. Omit to use the project’s; ' +
                'send with websiteCode to override',
        ),
    // Which store holds the pack (DI-5). The service installs only from its own catalog; Demo
    // Builder's engine reads either, so a library pack is installed without copying it first.
    source: z.enum(['installer', 'library']).optional().describe('Which store holds the pack: installer (default) or library. A library pack needs the demo-builder engine'),
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
        needsAuth: ['adobe'],
        readOnly: true,
        description:
            'Which Commerce instance an import would land on, derived from the current project, ' +
            'plus the datapack the project was created to hold and the website/store-view scope ' +
            'it recorded. Answers; does not decide.',
        map: importHandlers,
        type: 'get-datapack-import-target',
    },
    {
        tool: 'list_datapack_import_scopes',
        needsAuth: ['adobe'],
        readOnly: true,
        description:
            "The websites and store views an import can be scoped to on this project's instance. " +
            'An empty list is normal — it means the import lands on the default.',
        map: importHandlers,
        type: 'list-datapack-import-scopes',
    },
    {
        tool: 'get_datapack_import_status',
        needsAuth: ['adobe'],
        readOnly: true,
        description:
            'Progress of the running or most recent datapack import/reset. Poll this after ' +
            'start_datapack_import — that call returns as soon as the job starts, not when it ends.',
        map: importHandlers,
        type: 'get-datapack-import-status',
    },
    {
        tool: 'list_datapack_export_items',
        needsAuth: ['adobe'],
        readOnly: true,
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
        needsAuth: ['adobe'],
        // The safe half of the import pair — "same request body as the real
        // thing, without writing".
        readOnly: true,
        description:
            'Dry-run an import: same guard, same credentials, same request body as the real thing, ' +
            'without writing. Run this before start_datapack_import. A refusal comes back as ' +
            'valid:false with a reason, not as an error. With the demo-builder engine it also reads ' +
            "the pack's rows and names each kind whose rows Commerce could not take.",
        map: importHandlers,
        type: 'validate-datapack-import',
        inputSchema: { ...DATAPACK_ID, ...IMPORT_TARGET },
        // Deliberately UNGATED. It is the safe half of the pair, and gating the
        // dry run would push an agent toward the real import to find out whether
        // a request is well-formed — the opposite of why it exists.
    },

    // ── installing again, and saving the store back (datapack-engine step 05) ──
    {
        tool: 'preview_datapack_changes',
        needsAuth: ['adobe'],
        // Reads the pack and the project's store; writes nothing to either, nor to the record.
        readOnly: true,
        description:
            'What installing a datapack again would change in this project\'s store: by data kind, how many ' +
            'things Demo Builder made would be updated to the pack, added, removed, or kept because they were ' +
            'changed in the Admin, with a few names each. Writes nothing. installed:false means Demo Builder ' +
            'never installed the pack here, so every row would be new. root (a pack with a root category of its ' +
            "own) says where it would go: under the store's own root, or a root of its own with one Admin step.",
        map: importHandlers,
        type: 'preview-datapack-changes',
        inputSchema: {
            ...DATAPACK_ID,
            source: PACK_SOURCE,
            dataTypes: z.array(z.string()).optional().describe('Only these data kinds; all the pack holds when omitted'),
        },
    },
    {
        tool: 'save_store_changes_to_pack',
        needsAuth: ['adobe'],
        readOnly: false,
        description:
            'Save the store\'s copy of a datapack Demo Builder installed in this project as a NEW version of this ' +
            'demo\'s own pack in the datapack library (made at the first save and named for the project), with the ' +
            'categories, set, attributes and quantities its products need. The pack installed is never changed; undo ' +
            'by deleting the new version with delete_library_datapack. Answers the demo\'s pack and its new version. ' +
            'Nothing in Commerce changes.',
        map: importHandlers,
        type: 'save-store-changes-to-pack',
        // Gated twice, as reset_datapack is: the row refuses before dispatch, and the same flag
        // satisfies the handler's own confirm check.
        confirm: true,
        inputSchema: { ...DATAPACK_ID, source: PACK_SOURCE },
    },

    // ── clearing a demo's part of the store (datapack-engine step 10) ────────
    {
        tool: 'check_demo_data',
        needsAuth: ['adobe'],
        readOnly: true, // reads the store structure, the chosen stores' products, categories, customers, cart rules, orders and returns, the records, and the ERP integration's erp/status and erp/settings (GETs)
        description:
            "What some STORES of this project's Commerce instance hold that Demo Builder did not install, and what clearing them would do. " +
            'Answers data.choices: every website and its stores (store views listed under each, never chosen alone; a store another ' +
            'local project records as its own carries claimedBy and cannot be chosen). With stores chosen, also data.preview: ' +
            'products, categories, customers and cart rules (with their coupons) it would remove, products and cart rules other websites ' +
            "also sell or use that would only be taken off the chosen websites, orders it would cancel or refund (never delete) and returns it would close, what it would leave and why " +
            "(a root category a store not chosen shares, a product whose demo can't be told, a B2B company, a cart rule on a website a " +
            'store not chosen also sells on), and a token clear_demo_data needs. ' +
            'When an ERP integration on this instance (in any local project) sends a chosen store\'s orders to an ERP, those orders ' +
            'are in data.preview.erp instead (its line says so): that integration closes them and its ERP is refreshed from Commerce ' +
            'after; when it must be updated first or cannot be asked, data.preview.erp.held says why and they are left open. ' +
            "Also counts what Demo Builder installed (removed by reset_datapack, never by the clearing). Writes nothing. Defaults to the " +
            "project's own store; stores: [] answers the choices alone. When a chosen store is another project's, answers data.refused " +
            'instead of a preview: tell the user that sentence; it names the project to clear it from.',
        map: importHandlers,
        type: 'check-demo-data',
        inputSchema: { stores: z.array(WIPE_STORE).optional().describe("The stores to look at, by website and store code. Omit for the project's own; [] for the choices alone") },
    },
    {
        tool: 'clear_demo_data',
        needsAuth: ['adobe'],
        readOnly: false,
        description:
            'Clear the chosen stores of everything check_demo_data listed: deletes those products, categories, customers and cart rules ' +
            '(their coupons with them), takes the shared products and cart rules off the chosen websites, cancels or refunds their orders (closing them, never deleting) and closes their ' +
            "returns; orders an ERP integration handles are closed by it first, and its ERP is refreshed from Commerce last, in the " +
            "same call (the note merges its counts). Cannot be undone. Show the user check_demo_data's list and ask first. Needs the stores named exactly as checked " +
            'and the token from that check; if the store would now clear anything the list did not hold, nothing is written and the ' +
            'new list comes back. Refused when another project on this machine records a chosen store as its own. ' +
            "Never touches what any project's install records list, other stores' things, attributes, customer groups, companies, " +
            'shared catalogs, stocks or settings.',
        map: importHandlers,
        type: 'clear-demo-data',
        confirm: true, // gated twice, as reset_datapack is: the row, then the handler's own check
        inputSchema: {
            stores: z.array(WIPE_STORE).describe('The stores to clear, by website and store code, as check_demo_data was asked about them. Never defaulted'),
            token: z.string().describe("check_demo_data's token for those stores"),
        },
    },

    // ── writes ──────────────────────────────────────────────────────────────
    {
        tool: 'start_datapack_import',
        needsAuth: ['adobe'],
        readOnly: false,
        description:
            'Import a datapack into a live Commerce instance. Returns an activationId as soon as ' +
            'the job starts — poll get_datapack_import_status for the outcome. Validate first. ' +
            'Installing a pack again updates and removes what it made before and keeps what was ' +
            'changed in the Admin; the outcome\'s note says what it kept, and preview_datapack_changes ' +
            'says it beforehand. A pack\'s store_config rows are written last, and the note names each ' +
            'setting set, by path, with its old and new value. A pack\'s own root category goes under the ' +
            "store's root when no other store shares it; when one does, the install asks the user for the one " +
            'Admin step (no API can change a store\'s root), and the note names it if skipped. Running it ' +
            'again re-checks that step and marks it done once set. Under the store\'s root, a pack category ' +
            'whose url key the store already uses in the same place stops the install before any write. ' +
            "Every kind's rows are checked before any write. A row Commerce refuses is skipped and the rest " +
            'go in; the note names each skipped row and why, and every row that needed it. Every kind still ' +
            'reads success, so read the note. Sign-in, throttling, a Commerce error or no answer stop it; ' +
            'running it again carries on and counts anything made without an answer as the pack\'s.',
        map: importHandlers,
        type: 'start-datapack-import',
        confirm: true,
        inputSchema: { ...DATAPACK_ID, ...IMPORT_TARGET },
    },
    {
        tool: 'reset_datapack',
        needsAuth: ['adobe'],
        readOnly: false,
        description:
            "Remove a datapack's data from the Commerce instance so the project can be reused. " +
            'Cannot be undone. Returns an activationId; poll get_datapack_import_status. With the ' +
            'demo-builder engine, a category, set, company, shared catalog or customer group the pack made ' +
            "that holds things it did not make is kept (a kept company with its admin and its catalog), and " +
            "the outcome's note says which; store settings it set are put back first, unless changed since, " +
            "and the note names each by path. The project stops naming the pack only once a removal " +
            'finishes having taken everything out. A pack the demo-builder engine has no install record of ' +
            'is refused and nothing is removed by name; check_demo_data then clear_demo_data clears what an ' +
            'earlier install left.',
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
        needsAuth: ['adobe'],
        readOnly: false,
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

    // ── datapack files ──────────────────────────────────────────────────────
    // Neither store has a file form, so the zip is built and read in the
    // extension and works the same for both (`datapackZipHandlers`).
    {
        tool: 'save_datapack_zip',
        needsAuth: ['adobe'],
        // Writes a local file and nothing else: the store is only read.
        readOnly: false,
        description:
            'Save a datapack from the Data Installer or the datapack library as a zip file in the ' +
            'project — one file to keep, send, or load into a store later.',
        map: importHandlers,
        type: 'save-datapack-zip',
        inputSchema: {
            ...DATAPACK_ID,
            source: z.enum(['installer', 'library']).optional().describe('Which store to read it from (default installer)'),
            path: z
                .string()
                .describe(
                    'Where to write the file, inside the project; folders it names are made if missing. ' +
                        'A path not ending in .zip is a folder and gets <name>-<version>.datapack.zip',
                ),
        },
    },
    {
        tool: 'open_datapack_zip',
        needsAuth: [],
        readOnly: true,
        description:
            'Say what a datapack zip file holds — name, version, data types — without writing anything. ' +
            'Run before load_datapack_zip.',
        map: importHandlers,
        type: 'open-datapack-zip',
        inputSchema: { path: z.string().describe('The datapack file, inside the project') },
    },
    {
        tool: 'load_datapack_zip',
        needsAuth: ['adobe'],
        readOnly: false,
        description:
            'Write the pack in a datapack zip file into the datapack library (default) or the Data Installer. ' +
            'Into the Data Installer, which other teams share, it needs confirmName equal to the pack ' +
            'name and never updates an existing pack. This does not install anything into Commerce.',
        map: importHandlers,
        type: 'load-datapack-zip',
        confirm: true,
        inputSchema: {
            path: z.string().describe('The datapack file, inside the project'),
            target: z.enum(['installer', 'library']).optional().describe('Which store to write it into (default library)'),
            update: z
                .boolean()
                .optional()
                .describe('Library only: replace the data types this file carries in a pack that already exists'),
            confirmName: z
                .string()
                .optional()
                .describe('Data Installer only: must equal the pack name (open_datapack_zip reports it)'),
        },
    },
    {
        tool: 'delete_library_datapack',
        needsAuth: ['adobe'],
        readOnly: false,
        description:
            'Delete one of your own packs from the datapack library — the undo of ' +
            "load_datapack_zip. Cannot be undone. The library only lets a pack's owner delete " +
            "it; the Data Installer's shared catalog is never touched. When you shared the pack " +
            'in a project file, the answer carries `warning` (without confirm, `sharedInFile`): ' +
            "anyone who has not created that project yet gets the pack it was made from instead. " +
            "Deleting the last version of this demo's own pack also stops the project naming it " +
            '(`ownPackCleared: true`); its next save makes the pack again.',
        map: importHandlers,
        type: 'delete-library-datapack',
        // Gated twice, as reset_datapack is: the row refuses before dispatch, and the
        // same flag satisfies the handler's own confirm check.
        confirm: true,
        inputSchema: { ...DATAPACK_ID },
    },
    {
        tool: 'rename_datapack',
        needsAuth: ['adobe'],
        readOnly: false,
        description:
            'Rename one of your own datapack library packs: every version takes the new display ' +
            "name (its datapackName, from find_datapacks, never changes). On this demo's own pack, " +
            "its name stops following the project's. Answers how many versions were renamed.",
        map: importHandlers,
        type: 'rename-library-datapack',
        // Gated twice, as delete_library_datapack is: the row refuses before dispatch, and the
        // same flag satisfies the handler's own confirm check.
        confirm: true,
        inputSchema: {
            datapackName: z.string().describe('The library pack name from find_datapacks'),
            displayName: z.string().describe('The new name everyone sees for the pack'),
        },
    },
    {
        tool: 'share_datapack',
        needsAuth: ['adobe'],
        readOnly: false,
        description:
            'Share one of your own datapack library packs with your team, or stop sharing it: every version. ' +
            'Shared, everyone with access to the datapack library can see and install it, and a colleague can ' +
            'create a project from a file that names it; stopped, only you can. Answers how many versions changed. ' +
            "Ask the user first. export_project_settings's packNote says when the project's pack is private.",
        map: importHandlers,
        type: 'share-library-datapack',
        confirm: true, // gated twice, as rename_datapack is: the row, then the handler's own check
        inputSchema: {
            datapackName: z.string().describe('The library pack name from find_datapacks (one of yours)'),
            shared: z.boolean().describe('true to share it with everyone with access to the library, false to stop sharing'),
        },
    },
    {
        tool: 'copy_library_datapack_to_installer',
        needsAuth: ['adobe'],
        readOnly: false,
        description:
            "Copy a datapack library pack into the Data Installer's catalog, for the Data Installer " +
            'service to install. Not needed to install it here: start_datapack_import takes ' +
            'source:"library". **Writes into the SHARED catalog** — needs confirm:true and ' +
            'confirmName equal to the pack name, never overwrites an existing pack, and cannot be ' +
            'undone from the extension.',
        map: importHandlers,
        type: 'copy-library-datapack-to-installer',
        confirm: true,
        inputSchema: {
            ...DATAPACK_ID,
            confirmName: z
                .string()
                .optional()
                .describe('Must equal datapackName — guards a write to the shared catalog'),
        },
    },
];
