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
import { PICKABLE_KINDS, PICK_FIELDS } from '@/features/data-installer/pickableKinds';
import type { HandlerResponse } from '@/types/handlers';

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
const PACK_SOURCE = z.enum(['installer', 'library']).optional().describe('Which store holds the pack: installer or library. Omitted: the preview and the check read the installer, the save tries the library then the installer');

const DATAPACK_ID = {
    datapackName: z.string().describe('Datapack name from find_datapacks'),
    version: z.string().describe('Datapack version, e.g. main (required — there is no "latest")'),
};

/**
 * What a save from the store picks (datapack-engine step 14), as the service's export `selections`:
 * `{<kind>: {<field>: [ids]}}`, each kind's field in `pickableKinds.ts`. The ids are the ones
 * list_datapack_export_items answers.
 */
/** Save As: a new datapack of the user's, by the name they gave (`demoPack.ts`). */
const SAVE_AS = z
    .object({ displayName: z.string().min(1).describe('The name the user gave the new datapack, e.g. My Bodea') })
    .optional()
    .describe("Save As: a new datapack of the user's under this name, which the project then uses. Needed when the project's pack is not theirs");

const SELECTIONS = z
    .record(z.record(z.array(z.union([z.string(), z.number()]))))
    .optional()
    .describe(
        `Things to pick from the store for a save with no datapack (refused with one), as {kind: {field: [ids]}} with ids from list_datapack_export_items: ${PICKABLE_KINDS.map((kind) => `${kind} by ${PICK_FIELDS[kind]}`).join(', ')}`,
    );

/** The export fields only an ACO pack (aco:true) takes: a save from the store refuses them. */
const ACO_ONLY = ' (with aco only; a save from the store refuses it)';

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
        .describe(
            'Data types to include, from list_datapack_data_types. At least one. An install writes only these ' +
                'and what they need, and leaves the rest of the pack alone',
        ),
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
    // Which store holds the pack (DI-5). Demo Builder installs from either, its own copy first, so a
    // library pack is installed without copying it to the Data Installer.
    source: z.enum(['installer', 'library']).optional().describe("Which store holds the pack: installer (default) or library. Demo Builder installs either, reading its own store's copy first"),
};

/** An agent's call that waits on the job it started rather than polling it (`importJobWait.ts`). */
const WAIT_FOR_JOB = {
    waitSeconds: z
        .number()
        .min(0)
        .max(45)
        .optional()
        .describe('Wait up to this many seconds (at most 45) for the job to end, its progress shown; the answer then carries job'),
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
        | { items?: unknown[]; totalCount?: number; excludedCount?: number; inPackCount?: number }
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
        // Demo Builder's engine: left off `items` because the pack being saved holds them.
        ...(page?.inPackCount !== undefined ? { inPackCount: page.inPackCount } : {}),
    });
}

export const DATA_INSTALLER_DESCRIPTORS: ToolDescriptor[] = [
    // ── reads ───────────────────────────────────────────────────────────────
    {
        tool: 'get_datapack_import_target',
        needsAuth: ['adobe'],
        readOnly: true,
        description:
            'Which Commerce instance an install would land on, derived from the current project, ' +
            'plus the datapack the project was created to hold and the website/store-view scope ' +
            'it recorded. installFailed (reason, retries) when the install of that datapack at creation ' +
            'did not succeed: install it again with start_datapack_import. Answers; does not decide.',
        map: importHandlers,
        type: 'get-datapack-import-target',
    },
    {
        tool: 'list_datapack_import_scopes',
        needsAuth: ['adobe'],
        readOnly: true,
        description:
            "The websites and store views an install can be scoped to on this project's instance. " +
            'An empty list is normal — it means the install lands on the default.',
        map: importHandlers,
        type: 'list-datapack-import-scopes',
    },
    {
        tool: 'get_datapack_import_status',
        needsAuth: ['adobe'],
        readOnly: true,
        description:
            'Progress of the running or most recent datapack install or uninstall: its purpose (install, switch, ' +
            'uninstall, restore or undo), its outcome (watching while it runs), ' +
            "each data type's state, and while products go in or come out a count as detail (\"450 of 2,046 products\"). " +
            'With waitSeconds (up to 45) it answers when the job ends or the wait is up, showing progress as it goes: ' +
            'call it with waitSeconds 45 while outcome is watching, rather than polling quickly. A pack of 2,000 ' +
            'products takes several minutes. Once ended: timings gives the seconds each data type took, and skipped ' +
            'every skipped row with its whole reason, fifty at a time (skippedTotal; ask for more with skippedFrom). ' +
            'An install that wrote products ends with check: the store checked against the ' +
            'pack, as verify_datapack_install answers it; check.verdict "differs" means the data is not what the pack says.',
        map: importHandlers,
        type: 'get-datapack-import-status',
        inputSchema: {
            waitSeconds: z
                .number()
                .min(0)
                .max(45)
                .optional()
                .describe('Wait up to this many seconds (at most 45) for the job to end, its progress shown; omit to answer at once'),
            skippedFrom: z.number().int().min(0).optional().describe('Where in the skipped rows to start (default 0): the next page of fifty'),
        },
    },
    {
        tool: 'list_datapack_export_items',
        needsAuth: ['adobe'],
        readOnly: true,
        description:
            'What this Commerce instance holds for one data type, to choose from before exporting. ' +
            "Paged — totalCount reports how many exist. It reads the project's own store, scoped to its website (products, customers, cart rules), its " +
            `root category (categories) or its customers (companies), for one of: ${PICKABLE_KINDS.join(', ')}; ` +
            "each item's id is what selections names it by. Commerce's own (the Default set, its five groups, " +
            'the public catalog) is counted in excludedCount. Items the pack being saved already holds (the ' +
            "pack named, else the project's own when Demo Builder installed it) are left off, counted in " +
            'inPackCount: what is left is what was added by hand. A save from a pack takes everything the demo ' +
            'uses on its own and takes no selections, so this list is for a save with no pack. ' +
            'Send only dataType (and datapackName with version for a pack named).',
        map: importHandlers,
        type: 'list-datapack-export-items',
        inputSchema: {
            datapackName: z.string().optional().describe('The pack being saved, whose items are left off; omit for the project\'s own'),
            version: z.string().optional().describe('That pack\'s version'),
            source: PACK_SOURCE,
            dataType: z.string().describe('The single data type to enumerate'),
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
            'Dry run: try an install with the same guard, same credentials, same request body as the real thing, ' +
            'without writing. Run this before start_datapack_import. A refusal comes back as ' +
            "valid:false with a reason, not as an error. It also reads the pack's rows and names each kind " +
            'whose rows Commerce could not take. To fix what a reason names in the pack: ' +
            'save_datapack_zip, correct the rows, load_datapack_zip, then run this again; ' +
            'install only when the user asks.',
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
            'changed in the Admin, with a few names each. A kind with installsWith is no data type of its own ' +
            '(attribute_options go in with product_attributes): an install asks for that one instead. ' +
            'Writes nothing. installed:false means Demo Builder ' +
            'never installed the pack here, so every row would be new. root (a pack with a root category of its ' +
            "own) says where it would go: under the store's own root, or a root of its own with one Admin step. " +
            'settings names what an install would change in the store configuration, by path with old and new value, and ' +
            'settings.layer the settings layer they come from (a library pack named <pack>-settings).',
        map: importHandlers,
        type: 'preview-datapack-changes',
        inputSchema: {
            ...DATAPACK_ID,
            source: PACK_SOURCE,
            dataTypes: z.array(z.string()).optional().describe('The kinds an install would be asked for; the answer then covers these and what they need, as the install does. All the pack holds when omitted'),
        },
    },
    {
        tool: 'verify_datapack_install',
        needsAuth: ['adobe'],
        // Reads the pack and the project's store; opens the store with no recorder, so writes nothing.
        readOnly: true,
        description:
            'Check that the store holds what a datapack says, after installing it: for each product the pack ' +
            'made (all it holds when Demo Builder has no record of installing it), that it is in the store, that a ' +
            'configurable has its options and children, that each select value is the option the pack names, and ' +
            'that its price matches. Answers verdict (matches or differs), checked, compared (how many values, prices ' +
            'and configurables it actually compared: a match that compared nothing is no proof), and per finding a count and up ' +
            'to 20 examples: missing, configurablesWithoutOptions, configurablesDiffer, valuesDiffer, pricesDiffer. ' +
            'Writes nothing. Run it after start_datapack_import succeeds: an install can report success with ' +
            'products whose sizes or options are wrong.',
        map: importHandlers,
        type: 'verify-datapack-install',
        inputSchema: { ...DATAPACK_ID, source: PACK_SOURCE },
    },
    {
        tool: 'save_store_changes_to_pack',
        needsAuth: ['adobe'],
        readOnly: false,
        description:
            'Save the store\'s copy of the datapack this project uses into the datapack library, with the categories, ' +
            'set, attributes and quantities its products need: Save or Save As. Without saveAs (Save) it is the NEW latest save of ' +
            'the pack the project uses, only when that pack is the user\'s own (the save before it is kept for undo_last_save; ' +
            'older saves are deleted); when it is not (a team pack such as ' +
            'Bodea, or a colleague\'s), nothing is written and the answer has data.needsName: ' +
            'ask the user for a name, then call again with saveAs.displayName (Save As), which makes a NEW pack of ' +
            'theirs; a name the user already has for one of their datapacks is refused (ask for another). Either way the ' +
            'project then uses the new save. Everything the demo uses goes in on its own, what was added by hand in the ' +
            'Admin included, so a save from a pack is refused with selections: send selections only for a save with no ' +
            'datapack. No pack named: the project\'s when ' +
            'Demo Builder installed it, else none, and the version holds only what is picked (a store Demo Builder ' +
            'did not fill; send saveAs). The pack installed is never changed, and nothing picked is ever removed with it; ' +
            'undo_last_save goes back to the save before it. Store configuration a pack does not hold ' +
            'itself go to a settings layer beside the new save, not into it (settingsLayer). Answers the pack saved into and its new ' +
            'save, unnamed (ids kept because the store could not name them) and, for a save of picks alone, leftOut (what the store has, of ' +
            'products, gift cards, categories, cart rules, customers and companies, that the version does not ' +
            'hold); its message says both. A version the install would refuse is not saved, and the message says ' +
            'why. Nothing in Commerce changes.',
        map: importHandlers,
        type: 'save-store-changes-to-pack',
        // Gated twice, as reset_datapack is: the row refuses before dispatch, and the same flag
        // satisfies the handler's own confirm check.
        confirm: true,
        inputSchema: {
            datapackName: z.string().optional().describe("The pack installed, from find_datapacks. Omit for the project's"),
            version: z.string().optional().describe('Its version, e.g. main (required with datapackName)'),
            source: PACK_SOURCE,
            selections: SELECTIONS,
            saveAs: SAVE_AS,
        },
    },

    // ── clearing a demo's websites (datapack-engine step 10; datapack-simplification step 06) ──
    {
        tool: 'check_demo_data',
        needsAuth: ['adobe'],
        readOnly: true, // reads the store structure, the project's websites' products, categories, customers, cart rules, orders and returns, the companies, catalogs, groups, attribute sets, attributes and settings they use, the records, and the ERP integration's erp/status and erp/settings (GETs)
        description:
            "What clearing every website this project uses (its own and every website its datapack was installed to) would do in its Commerce instance. " +
            "What any datapack Demo Builder installed lists is left, this project's included: data.datapack names this project's, which its uninstall " +
            '(reset_datapack) removes. Answers data.websites; data.rows, one per data type ' +
            '(products, categories, customers, companies, shared catalogs, cart rules, customer groups, attribute sets, attributes, website settings, ' +
            'orders, returns), each with its count and what happens ("12 removed", "3 closed", ' +
            '"2 set back to the default value"); data.records, every record of each type by name, removed and kept (kept: what another ' +
            "project's datapack lists, or a website not chosen uses; no reasons); data.total; and data.token, which clear_demo_data needs. " +
            "Each record counts under its own type: a shared catalog's customer group under customer groups, a company's customers under customers. " +
            'Orders are closed, never deleted; orders Commerce can neither cancel nor refund and orders already closed are not listed. ' +
            'A type Commerce did not answer is in data.unread: slow (data.problem names it; check again before clearing), refused or strange ' +
            '(left alone; the clearing runs for the rest). When another local project uses one of these websites, data.warning names it: ' +
            'tell the user; they may still clear. When an ERP integration (in any local project) sends these websites\' orders to an ERP, ' +
            'data.erp says its ERP is brought in line with Commerce after the clearing; data.erp.held says why it will not be. ' +
            'Large stores answer long lists. Writes nothing.',
        map: importHandlers,
        type: 'check-demo-data',
        inputSchema: {},
    },
    {
        tool: 'clear_demo_data',
        needsAuth: ['adobe'],
        readOnly: false,
        description:
            "Clear this project's websites of everything check_demo_data listed: deletes those products, categories, customers, cart rules " +
            "(their coupons with them), companies, shared catalogs (their customer groups with them), customer groups, attribute sets and attributes, sets those websites' settings to the default value, " +
            'takes the shared products and cart rules off these websites, cancels or refunds their orders (closing them, never deleting) and closes their ' +
            "returns, those an ERP integration sends to an ERP included; then that integration's ERP is brought in line with Commerce and " +
            "filled again, in the same call. When that step fails or is held, data.erp.broughtInLine is false and data.erp.problem says why; " +
            "the orders stay closed. Cannot be undone. Show the user check_demo_data's list and ask first. Needs the token from that check; " +
            'refused while that check named a type Commerce was too slow to answer (check again). If the store would now clear anything the list did not hold, nothing is written and the ' +
            "new list comes back as data. Never touches what any project's install records list, anything a website not chosen also uses, Commerce's own customer groups and attributes, " +
            "the public catalog, the Default attribute set, stocks, the default settings or another website's, nor what this project's datapack installed " +
            "(left for reset_datapack; the note says so). Answers data.leftOpen (orders left open " +
            'with a note, to finish in the Commerce Admin) and data.listSettings (list settings only the Admin can set back). A partial failure says what finished; running it again picks up what is left.',
        map: importHandlers,
        type: 'clear-demo-data',
        confirm: true, // gated twice, as reset_datapack is: the row, then the handler's own check
        inputSchema: {
            token: z.string().describe("check_demo_data's token"),
        },
    },

    // ── writes ──────────────────────────────────────────────────────────────
    {
        tool: 'start_datapack_import',
        needsAuth: ['adobe'],
        readOnly: false,
        description:
            'Install a datapack into a live Commerce instance. Returns an activationId once the job starts. ' +
            'With waitSeconds (up to 45) it waits for the job to end, showing its progress, and the answer carries ' +
            'the outcome as job. A small pack ends inside the wait; a large one (2,000 products) takes several ' +
            'minutes: then call get_datapack_import_status with waitSeconds 45 until outcome is no longer watching. ' +
            'Validate first. ' +
            'Only the dataTypes named install, with what they need. ' +
            'A kind left out is left alone: not installed, not removed, not put back. ' +
            'Installing a pack again updates and removes what it made before, of the kinds named, and keeps what was ' +
            'changed in the Admin; the outcome\'s note says what it took out and what it kept, and preview_datapack_changes ' +
            'says it beforehand. What Commerce will not take out stays, named in the note with its reason. A pack\'s store_config rows are written last, and the note names each ' +
            'setting set, by path, with its old and new value. A pack holding no ' +
            'store_config also gets its settings layer, the newest library pack named <pack>-settings, written after ' +
            'its data and removed with it, if dataTypes names all the pack holds or store_config; the note says when not. ' +
            'A path a pack may not set stops the install before any write, by path, ' +
            'and a setting Commerce refuses leaves the data installed and is named in the note. A pack\'s own root category goes under the ' +
            "store's root when no other store shares it; when one does, the install asks the user for the one " +
            'Admin step (no API can change a store\'s root), and the note names it if skipped. Running it ' +
            'again re-checks that step and marks it done once set. Under the store\'s root, a pack category ' +
            'whose url key the store already uses in the same place stops the install before any write. ' +
            "Every kind's rows are checked before any write. A row Commerce refuses is skipped and the rest " +
            'go in; the note names each skipped row and why, and every row that needed it. Every kind still ' +
            'reads success, so read the note. Sign-in, throttling, a Commerce error or no answer stop it; ' +
            'running it again carries on and counts anything made without an answer as the pack\'s. ' +
            "Installing another pack over the one the project uses (Demo Builder installed it) is a switch (the screen's " +
            'Switch), and installing another version of that pack works the same way: the pack in use is uninstalled first, ' +
            'in the same job, as reset_datapack uninstalls it, then this one installs; an uninstall that fails installs ' +
            'nothing (stoppedAt replacing) and the project keeps naming the old pack, else it names the new one. Changes ' +
            "the user made since it was installed are saved into the user's own pack first; when the old pack is not " +
            'theirs, this names the changes and installs nothing until changes answers: keep saves them as a new pack ' +
            'named by saveAs, drop loses them. Ask the user. Installing the same version again uninstalls nothing.',
        map: importHandlers,
        type: 'start-datapack-import',
        confirm: true,
        inputSchema: {
            ...DATAPACK_ID,
            ...IMPORT_TARGET,
            ...WAIT_FOR_JOB,
            changes: z
                .enum(['keep', 'drop'])
                .optional()
                .describe("Only when this uninstalls the project's pack first (a switch, or another version of it): the user's changes to it since install, keep saves them first (into their own pack, or as saveAs), drop loses them"),
            saveAs: SAVE_AS,
        },
    },
    {
        tool: 'reset_datapack',
        needsAuth: ['adobe'],
        readOnly: false,
        description:
            "Uninstall a datapack: take its data out of the Commerce instance so the project can be reused (the screen's Uninstall). " +
            'Cannot be undone. Returns an activationId; with waitSeconds (up to 45) it waits for the uninstall to end, ' +
            'showing its progress, and carries the outcome as job; else follow with get_datapack_import_status. ' +
            'It takes everything the install record lists, whatever dataTypes names (it may be omitted). A category, set, company, shared catalog or customer group the pack made ' +
            "that holds things it did not make is kept (a kept company with its admin and its catalog), and " +
            "the outcome's note says which; store configuration it set, its settings layer's included, is put back " +
            "first, unless changed since, and the note names each by path. The project stops naming the pack only once an uninstall " +
            'finishes having taken everything out; what Commerce will not take back stays, named in the note with its reason, and uninstalling again tries it again. A pack Demo Builder has no install record of ' +
            '(one the Data Installer service installed) is refused and nothing is uninstalled by name; check_demo_data then ' +
            'clear_demo_data clears what that install left. If the user changed anything the pack made ' +
            'since it was installed, this names the changes and uninstalls nothing until changes answers: keep ' +
            "saves them first, into the user's own pack or as a new one named by saveAs (the answer says which; " +
            'if the save fails nothing is uninstalled), drop loses them. When changes is omitted and the setting ' +
            'demoBuilder.dataInstaller.changesOnRemoval is save, it saves without asking. Ask the user; ' +
            'preview_datapack_changes shows them beforehand (keep).',
        map: importHandlers,
        type: 'reset-datapack',
        // Gated TWICE, and that is not redundant. The handler has always required
        // `confirm: true` in its payload; the row's gate refuses before dispatch
        // and the same flag satisfies the handler's own check, so the two agree
        // rather than compete. If either were removed the other would still hold.
        confirm: true,
        inputSchema: {
            ...DATAPACK_ID,
            ...IMPORT_TARGET,
            ...WAIT_FOR_JOB,
            dataTypes: z.array(z.string()).min(1).optional().describe('May be omitted: an uninstall takes everything the install record lists'),
            changes: z.enum(['keep', 'drop']).optional().describe("The user's changes since install: keep saves them first (into their own pack, or as saveAs), drop loses them"),
            saveAs: SAVE_AS,
        },
    },
    {
        tool: 'undo_last_save',
        needsAuth: ['adobe'],
        readOnly: false,
        description:
            "Undo the last save of the project's own datapack: Commerce goes back to the save before it. The datapack must " +
            "be the one this project uses and one of the user's own in My Datapacks (not a team pack), with an earlier save " +
            'to go back to; otherwise this refuses and nothing changes. One job, as start_datapack_import over the pack in use: ' +
            'the last save is uninstalled and the one before it installed, onto the website and store view the pack is ' +
            'installed to. Changes made in the Admin since are lost, never saved. Only once the job succeeds is the last ' +
            'save deleted from My Datapacks, with its store configuration; a job that fails deletes nothing and the project ' +
            'keeps the last save. Returns an activationId; with waitSeconds (up to 45) it waits for the job to end and ' +
            'carries the outcome as job; else follow with get_datapack_import_status. Ask the user first.',
        map: importHandlers,
        type: 'undo-last-save',
        // Gated twice, as reset_datapack is: the row, then the handler's own check.
        confirm: true,
        inputSchema: {
            datapackName: z.string().describe("The project's datapack, by its name from find_datapacks (one of yours)"),
            ...WAIT_FOR_JOB,
        },
    },
    {
        tool: 'restore_datapack',
        needsAuth: ['adobe'],
        readOnly: false,
        description:
            "Restore the project's datapack: put Commerce back to the datapack as the user last saved it, losing what " +
            "was changed in the Admin since (the screen's Restore). The datapack must be the one this project uses, installed " +
            "by Demo Builder; otherwise this refuses and nothing changes. When it is one of the user's own in My Datapacks, " +
            'it restores its newest save; otherwise (a team pack, a Data Installer pack) the version installed. It checks ' +
            'Commerce first, writing nothing: when Commerce already matches, it answers data.upToDate and starts nothing. ' +
            'Otherwise it is one job: what is installed is uninstalled by its install record and the datapack installed ' +
            'again, onto the website and store view it is installed to, even when it is the same version (unlike ' +
            'start_datapack_import, which keeps Admin edits then). Changes are lost, never saved: to keep them, ' +
            'save_store_changes_to_pack first. Returns an activationId and target (the version restored); with waitSeconds ' +
            '(up to 45) it waits for the job to end and carries the outcome as job; else follow with ' +
            'get_datapack_import_status. Ask the user first.',
        map: importHandlers,
        type: 'restore-datapack',
        // Gated twice, as reset_datapack is: the row, then the handler, which asks only when the
        // user has edits in Commerce. The row's flag satisfies it, so an agent always asks the user.
        confirm: true,
        inputSchema: {
            datapackName: z.string().describe("The project's datapack, by its name from get_datapack_import_target"),
            ...WAIT_FOR_JOB,
        },
    },
    {
        tool: 'start_datapack_export',
        needsAuth: ['adobe'],
        readOnly: false,
        description:
            "Capture data from this project's Commerce store into a datapack: saves what is picked in selections " +
            "into the datapack library, with the project's pack when Demo Builder installed it; the same save as " +
            'save_store_changes_to_pack (Save, or Save As with saveAs), answering the same way. Send selections, ' +
            "saveAs and confirm. Nothing goes into the Data Installer's shared catalog: copy_library_datapack_to_installer " +
            'does that, afterwards. aco:true (an Adobe Commerce Optimizer pack) is refused in this release: ACO ' +
            'datapacks arrive with ACO support.',
        map: importHandlers,
        type: 'start-datapack-export',
        confirm: true,
        inputSchema: {
            datapackName: z.string().optional().describe(`Datapack name to write${ACO_ONLY}`),
            version: z.string().optional().describe(`Datapack version to write${ACO_ONLY}`),
            dataTypes: z
                .array(z.string())
                .min(1)
                .optional()
                .describe(`ACO kinds to capture; omit for all five${ACO_ONLY}`),
            selections: SELECTIONS,
            saveAs: SAVE_AS,
            aco: z.boolean().optional().describe('Refused in this release: ACO datapacks arrive with ACO support'),
            storeViews: z
                .array(z.string())
                .optional()
                .describe('With aco: the store view codes to make it for; omit for every one'),
            confirmName: z
                .string()
                .optional()
                .describe(`Must equal datapackName exactly${ACO_ONLY}`),
        },
        // The echo is checked BEFORE dispatch, like delete_github_repo's: an ACO pack is written
        // under the name sent. A call naming no pack is a save from the store, which needs none.
        preflight: (args) =>
            args.datapackName === undefined || args.confirmName === args.datapackName
                ? undefined
                : {
                      error:
                          `start_datapack_export writes "${String(args.datapackName)}" into My Datapacks. ` +
                          `To proceed, call again with confirmName:"${String(args.datapackName)}".`,
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
            'project — one file to keep, send, or load into a store later. A pack holding no store_config ' +
            'carries its settings layer (the library pack named <pack>-settings) as a second section; ' +
            'settingsLayer says so, and settingsLayerNote when the library could not be asked.',
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
            dataTypes: z
                .array(z.string())
                .min(1)
                .optional()
                .describe(
                    'Save only these data types (get_datapack lists them); omit to save all. Use it to leave ' +
                        'out an item the store cannot return, such as one too large to send',
                ),
        },
    },
    {
        tool: 'build_datapack_from_export',
        needsAuth: [],
        // Reads and writes files inside the project and nothing else: no store, no Commerce.
        readOnly: false,
        description:
            'Build a datapack file from a Commerce product export (the CSV System > Data Transfer > Export writes, ' +
            'or the same table as JSON): products, gift cards, the categories they name, and stock. An export ' +
            'defines no attributes, so name basePath, a datapack file (save_datapack_zip makes one) whose ' +
            'attributes, attribute sets and other kinds the new pack keeps; its products and stock are replaced ' +
            'by the export\'s, and its categories kept when it has them. Without one, categories hang from a root ' +
            'named <displayName> Catalog and products keep Commerce\'s own fields; leftOutAttributes names the rest. ' +
            'SKUs are kept as exported. unmatchedOptions names each select value that matches no option of the base ' +
            "pack's attribute (an install would refuse that row or set another option): fix those before loading it. The pack is checked with " +
            "the install's own checks first and not written if it would be refused. Load it with load_datapack_zip.",
        map: importHandlers,
        type: 'build-datapack-from-export',
        inputSchema: {
            exportPath: z.string().describe('The export file, inside the project'),
            path: z
                .string()
                .optional()
                .describe(
                    'Where to write the pack, inside the project (default the project folder); a path not ending in .zip is a folder and gets <name>-<version>.datapack.zip',
                ),
            datapackName: z.string().describe('The new pack name: letters, digits, - and _'),
            version: z.string().describe('The new pack version, e.g. main'),
            displayName: z.string().describe('The name SCs see, e.g. Luma'),
            description: z.string().optional().describe('One line about the pack'),
            basePath: z
                .string()
                .optional()
                .describe('A datapack file, inside the project, whose attributes, sets and other kinds the new pack keeps'),
            importForm: z
                .boolean()
                .optional()
                .describe(
                    "Carry the products in Commerce's import form (the Data Installer's product_export kind): installed through the Import API, about twice as fast; a reinstall leaves the products already there as they are",
                ),
        },
    },
    {
        tool: 'open_datapack_zip',
        needsAuth: [],
        readOnly: true,
        description:
            'Say what a datapack zip file holds — name, version, data types, and any settings layer by path — ' +
            'without writing anything. Run before load_datapack_zip.',
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
            'name and never updates an existing pack. A settings layer in the file goes into the datapack library, ' +
            'wherever the data goes; settingsLayer says what became of it. A file whose layer holds a path a pack may ' +
            'not set is refused before any write. The Data Installer needs write access, which its owners grant. Into it the pack goes in its form, as ' +
            'copy_library_datapack_to_installer sends it (changed lists each change). This does not install anything into Commerce.',
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
            'A version takes your settings layer of ' +
            'the same version with it (`settingsLayerDeleted: true`).',
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
            "name (its datapackName, from find_datapacks, never changes). Answers how many versions were renamed.",
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
            'Shared, everyone using Demo Builder can see and install it under Community datapacks, and a colleague can ' +
            'create a project from a file that names it; stopped, only you can. Its settings layer goes with it. Answers how many versions changed. ' +
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
        tool: 'mark_team_datapack',
        needsAuth: ['adobe'],
        readOnly: false,
        description:
            "Mark one of your own datapacks in Demo Builder's datapack store as an official team pack, or take " +
            'the mark off: every version. A team pack is in the default list; any other shared pack is behind ' +
            'Include Community. It does not share the pack: share_datapack does that. The store refuses anyone ' +
            'not on its list of team pack owners. Ask the user first.',
        map: importHandlers,
        type: 'mark-team-datapack',
        confirm: true,
        inputSchema: {
            datapackName: z.string().describe('The pack name from find_datapacks (one of yours)'),
            team: z.boolean().describe('true to mark it as a team pack, false to take the mark off'),
        },
    },
    {
        tool: 'copy_library_datapack_to_installer',
        needsAuth: ['adobe'],
        readOnly: false,
        description:
            "Copy a datapack library pack into the Data Installer's catalog, so other teams can find and install " +
            'it. Needs write access to the Data Installer, which its owners grant and most accounts lack; without it ' +
            'the answer says so and nothing is sent. Not needed to install it here: start_datapack_import takes source:"library". **Writes into the ' +
            'SHARED catalog** — needs confirm:true and ' +
            'confirmName equal to the pack name, never overwrites an existing pack, and cannot be ' +
            'undone from the extension. The pack goes in the form the Data Installer takes, or not at all: a gift card ' +
            'goes in the Default attribute set (changed lists each such change), and a data type it takes no data of ' +
            '(store configuration) or one too large for it is refused before anything is sent.',
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
