/**
 * Response-size harness for the descriptor tool surface.
 *
 * WHY THIS EXISTS. Phase 2 measured tool responses by CALLING them against a
 * live extension. That works for reads and is impossible for the tools that
 * change state — measuring `deploy_mesh` means deploying a mesh. Reading their
 * source instead produced three confident wrong answers in one session, and the
 * third ran `republish` against a live storefront.
 *
 * So: drive the real registration and dispatch path with a STUB handler map. No
 * service is reachable and no state changes, yet what runs is the actual code
 * every one of these tools uses — `registerDescriptorTools` → `dispatchHandler`
 * → `shape(res, args)`.
 *
 * That also makes `confirm: true` safe here, which is the point worth keeping:
 * the confirm gate protects the HANDLER, and the handler is a stub, so the
 * SUCCESS path of a destructive tool can be measured without destroying
 * anything. This is the only way this suite can see past a refusal message.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ACTION_DESCRIPTORS } from '@/features/ai/server/actionDescriptors';
import { DATA_INSTALLER_DESCRIPTORS } from '@/features/ai/server/dataInstallerDescriptors';
import { READ_DESCRIPTORS } from '@/features/ai/server/readDescriptors';
import { STATUS_DESCRIPTORS } from '@/features/ai/server/statusDescriptors';
import { registerDescriptorTools, type ToolDescriptor } from '@/features/ai/server/toolDescriptors';
import type { HandlerMap, HandlerResponse } from '@/types/handlers';
import { RESPONSE_CEILINGS } from './responseCeilings';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

/** Registers the rows and invokes them exactly as the MCP server does. */
function harness(descriptors: ToolDescriptor[], response: HandlerResponse) {
    const tools = new Map<
        string,
        (args: unknown) => Promise<{ content: Array<{ text: string }> }>
    >();
    const server = {
        registerTool(
            name: string,
            _def: unknown,
            handler: (args: unknown) => Promise<{ content: Array<{ text: string }> }>
        ) {
            tools.set(name, handler);
        },
    };
    // Any type resolves to a handler returning `response`, so no real handler —
    // and therefore no service, no network, no filesystem — is reachable.
    const stub: HandlerMap = new Proxy({} as HandlerMap, {
        get: () => async () => response,
        has: () => true,
        ownKeys: () => [],
    });

    registerDescriptorTools(
        server,
        descriptors.map((d) => ({ ...d, map: stub })),
        () => createMockHandlerContext()
    );
    return {
        names: () => [...tools.keys()],
        async sizeOf(name: string, args: Record<string, unknown> = {}): Promise<number> {
            // confirm:true is safe — see the module docstring. Without it a gated
            // row returns its refusal and the success path stays unmeasured.
            const out = await tools.get(name)!({ confirm: true, ...args });
            return Buffer.byteLength(out.content[0].text, 'utf8');
        },
    };
}

const bigRows = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
        id: { name: `pack-${i}`, version: 'main' },
        displayName: `Datapack number ${i}`,
        art: { thumbnail: `https://example.test/${i}/300/200` },
        dataTypes: Array.from({ length: 12 }, (_, j) => `data_type_${j}`),
        commerceInstance: 'X'.repeat(22),
    }));

/**
 * A realistic oversized payload PER SHAPED TOOL — only the keys that tool's
 * handler actually returns. A single all-keys blob made every projector look
 * broken: each collapses its own key and spreads the rest, so the other tools'
 * payloads rode through untouched.
 */
const PAYLOADS: Record<string, HandlerResponse> = {
    // Group 8. The service's own `ExportItemPage`, at the size it can actually
    // reach: `listExportItems` asks for `page_size: 1000` and returns what comes
    // back, so 500 rows is well inside what one call produces.
    list_datapack_export_items: {
        success: true,
        data: {
            items: Array.from({ length: 500 }, (_, i) => ({
                sku: `SKU-${i}`,
                name: `Product number ${i} with a reasonably long merchandising name`,
            })),
            totalCount: 500,
            excludedCount: 4,
        },
    },
    find_datapacks: { success: true, data: { items: bigRows(400), count: 400, total: 400 } },
    list_installed_datapacks: {
        success: true,
        data: { items: bigRows(400), count: 400, total: 400 },
    },
    list_ai_prompts: {
        success: true,
        data: {
            aiPrompts: Array.from({ length: 40 }, (_, i) => ({
                id: `prompt-${i}`,
                title: `Prompt ${i}`,
                prompt: 'z'.repeat(2000),
            })),
        },
    },
    list_console_apis: {
        success: true,
        data: {
            apis: Array.from({ length: 60 }, (_, i) => ({
                code: `Code${i}`,
                name: `Api number ${i}`,
                group: { code: 'marketing_cloud', name: 'Experience Cloud' },
            })),
        },
    },
    verify_ai_setup: {
        success: true,
        data: {
            status: 'ok',
            checks: [{ name: 'mcp', ok: true }],
            inventory: {
                skills: Array.from({ length: 30 }, (_, i) => ({
                    name: `s${i}`,
                    description: 'd'.repeat(300),
                })),
                mcps: Array.from({ length: 5 }, (_, i) => ({
                    name: `m${i}`,
                    tools: Array(40).fill('tool'),
                })),
            },
        },
    },
};

/** Generic oversized payload for rows that declare no projector. */
const GENERIC: HandlerResponse = { success: true, data: { items: bigRows(400) } };

const ALL = [
    ...READ_DESCRIPTORS,
    ...STATUS_DESCRIPTORS,
    ...ACTION_DESCRIPTORS,
    // Group 8. Added the moment the array existed, because the alternative is
    // the failure this file already documents twice: a guard whose scope quietly
    // stops matching what it guards. Eight rows registered by `extension.ts` and
    // classified by nothing would have looked exactly like a clean run.
    ...DATA_INSTALLER_DESCRIPTORS,
];
const SHAPED = ALL.filter((d) => d.shape).map((d) => d.tool);

describe('descriptor tools — response size', () => {
    it('every row registers and returns text', async () => {
        const h = harness(ALL, GENERIC);
        expect(h.names()).toHaveLength(ALL.length);
        for (const name of h.names()) {
            expect(await h.sizeOf(name)).toBeGreaterThan(0);
        }
    });

    it('every shaped row has a representative payload in this file', () => {
        // Otherwise a new projector silently gets measured against GENERIC, which
        // does not exercise it — the failure this suite is meant to prevent.
        expect(SHAPED.filter((t) => !PAYLOADS[t])).toEqual([]);
    });

    /**
     * How much each projector is expected to remove, as a fraction of the
     * unshaped payload it must stay under.
     *
     * These are not one number, because the projectors do different jobs.
     * Dropping a field or collapsing a body removes most of the payload;
     * `list_console_apis` FLATTENS a repeated `{code,name}` into a code plus a
     * one-off legend, so it saves the duplication and nothing else — measured
     * live at 16% (8,693 → 7,284), and a blanket 60% assertion simply called
     * that a failure. A ceiling per tool records what each is actually for.
     */
    const CEILING: Record<string, number> = {
        verify_ai_setup: 0.1,
        list_ai_prompts: 0.2,
        find_datapacks: 0.6,
        list_installed_datapacks: 0.6,
        list_console_apis: 0.9,
        // Pages 500 rows down to 20 and keeps two counts. The saving is the page
        // size, so it is the largest of any projector here — which is the point:
        // the caller is CHOOSING from this list, not reading it.
        list_datapack_export_items: 0.1,
    };

    it.each(SHAPED)('%s shrinks its own payload to the expected degree', async (tool) => {
        const payload = PAYLOADS[tool];
        const shaped = await harness(ALL, payload).sizeOf(tool);
        const unshaped = await harness(
            ALL.map((d) => ({ ...d, shape: undefined })),
            payload
        ).sizeOf(tool);

        expect(shaped).toBeLessThan(unshaped * CEILING[tool]);
    });

    it('declares a ceiling for every shaped row', () => {
        expect(SHAPED.filter((t) => CEILING[t] === undefined)).toEqual([]);
    });

    /**
     * The pass-through set: rows handing their handler's payload straight to the
     * model. Correct for tools whose answer IS small by construction
     * (`start_demo` returns a status), and exactly how `get_datapack_activity`
     * shipped 25KB. Recorded, not asserted — "too large" is relative to what the
     * tool is for, which this suite cannot judge.
     */
    it('reports the rows that pass their payload through unshaped', async () => {
        const h = harness(ALL, GENERIC);
        const unshaped = ALL.filter((d) => !d.shape).map((d) => d.tool);
        const sizes = await Promise.all(unshaped.map((t) => h.sizeOf(t)));

        console.log(
            `\n  ${unshaped.length} rows pass a ${Buffer.byteLength(JSON.stringify(GENERIC.data), 'utf8').toLocaleString()}-byte payload through unchanged:\n` +
                unshaped.map((t) => `    ${t}`).join('\n')
        );

        // None of them projects, so all must behave identically. A divergence
        // means a row is shaping without declaring a projector.
        expect(new Set(sizes).size).toBe(1);
    });
});

// ─── the empty-response guard ────────────────────────────────────────────────
//
// The counterpart to a ceiling. A ceiling catches a tool that says too much;
// this catches one that says NOTHING.
//
// `defaultShape` strips `success` and stringifies the rest, so a handler
// returning a bare `{success: true}` produces the literal string "{}". An agent
// reading that cannot tell the work from a no-op, and neither can a human
// reading the transcript — which is exactly how `handleAddAppBuilderComponent`
// used to report success for opening a panel and doing nothing.
//
// FIXED (Wave 3): that handler now refuses the panel route with `blocked` and
// names the missing vars, returns `{added: {id, name, kind}}` on success, and
// `add_integration`'s preflight answers the agent before the panel can open.
//
// WHAT THIS CAN AND CANNOT SEE. The harness stubs the handler, so it cannot know
// whether a real handler returns data — that is the question phase 4 answered by
// reading 53 handlers, and no stub can re-derive it. What it CAN see is which
// rows have no safety net: no `capturePayloadFrom`, no `shape`, nothing between
// the handler's return and the agent. Those rows are silent IF their handler
// returns bare success, and the list below pins exactly which ones they are.
//
// So this is a classification guard, not a defect detector. A new row lands in
// the set and fails the test until someone reads its handler and decides which
// of the two reasons applies — which is the step that gets skipped.
describe('rows with no output safety net are classified', () => {
    const BARE_SUCCESS: HandlerResponse = { success: true };

    /**
     * Every row that returns "{}" when its handler returns bare success. Two
     * reasons live here and the harness cannot distinguish them:
     *
     * 1. NOTHING TO REPORT — success IS the outcome (`start_demo`, `deploy_mesh`).
     *    Honest, if terse. The plan pairs each with a confirming read.
     * 2. HANDLER RETURNS DATA — verified by reading it (`get_datapack`,
     *    `check_mesh`, and the other reads). Safe, and the ceiling table below
     *    holds the ones whose live size was measured.
     *
     * A row in NEITHER category is the defect: a panel-opening handler reporting
     * success for work it did not do.
     */
    const NO_SAFETY_NET = [
        // `apply_updates` is deliberately absent — it is a bespoke tool
        // (`applyUpdatesTool.ts`), not a descriptor row, so it is out of scope here.
        // Both verified by reading the handler: `checkGitHubApp` returns its
        // response object directly (`checkGitHubAppHandler.ts:261`) and
        // `handleCheckRepoReadiness` returns `{success, readiness}` (`:50`).
        'check_github_app',
        'check_repo_readiness',
        // Category 2, verified by reading it: `handleAddAppBuilderComponent`
        // returns `{added: {id, name, kind}}` on success and a named refusal
        // otherwise (`appBuilderComponentHandlers.ts`). The stub cannot see that.
        'add_integration',
        // The rest of Group 4, all category 2 and all read before being listed:
        // `handleRenameAppBuilderComponent` returns `{renamed: {id, name}}`,
        // `handleSetConsoleApis` returns `{data: {subscribed}}` via reconcileExtras,
        // and `handleSetProjectDestination` returns
        // `{data: {destination, previous, move}}` (`destinationHandlers.ts`).
        'rename_integration',
        'set_console_apis',
        'set_project_destination',
        'add_console_apis',
        'check_datapack_service',
        'check_mesh',
        'delete_ai_prompt',
        'delete_mesh',
        'deploy_integration',
        'deploy_mesh',
        'export_project_settings',
        'get_datapack',
        'get_datapack_activity',
        'get_project_urls',
        'get_store_structure',
        'list_datapack_data_types',
        'redeploy_integration',
        'refresh_block_library',
        'regenerate_ai_files',
        'remove_integration',
        'rename_project',
        'save_ai_prompt',
        'start_demo',
        'stop_demo',
        // Group 5. `restart_demo` is category 1 — success IS the outcome, and
        // `get_project_status` confirms it. `set_current_project` and
        // `set_project_pinned` are category 2: `handleSelectProject` returns
        // `{data: {project}}` and `handleSetProjectPinned` returns `{pinned: {…}}`.
        //
        // `set_project_pinned` was FILED HERE AS CATEGORY 1 and that was wrong —
        // it claimed a confirming read that did not exist. Probing it live
        // (2026-08-17) returned the literal "{}" while NOTHING anywhere reported
        // pinned state, so an agent could pin a project and never learn whether it
        // worked. Both halves were added: the handler now names the new state, and
        // `list_projects` carries `pinned`. The lesson is in the classification
        // itself — "paired with a confirming read" is a claim about ANOTHER tool,
        // and nothing here checks it.
        'restart_demo',
        'set_current_project',
        'set_project_pinned',
        // Group 7. Category 2, verified by reading the handler: every branch of
        // `handleInstallPrerequisite` now names its outcome — `{installed: {id,
        // name, version, verified}}` on a completed install, `{manual, url}` when
        // the prerequisite can only be installed by hand. It reached this list
        // because the STUB cannot see either, not because a branch is bare.
        'install_prerequisite',
        // Group 8. All category 2, each verified by READING the handler rather
        // than inferred from the name: `get-datapack-import-target` returns
        // `{instance, projectName, datapack}`, `list-datapack-import-scopes`
        // returns `{websites}`, `get-datapack-import-status` returns the persisted
        // job record, `validate-datapack-import` returns the verdict, and the two
        // `runAndWatch` writes return `{activationId}`. They appear here only
        // because the STUB cannot see any of it.
        'get_datapack_import_target',
        'list_datapack_import_scopes',
        'get_datapack_import_status',
        'validate_datapack_import',
        'start_datapack_import',
        'reset_datapack',
        // Same category, listed separately because it is the one that does NOT
        // go through `runAndWatch`: the export is synchronous (the service gives
        // no activation id to watch) and returns per-type outcomes inline.
        'start_datapack_export',
        // AB-5 pair, both category 2 and both read before being listed:
        // `handleInstallAppBuilderComponent` returns `{installation: {status,
        // detail, at}}` and `handleGetAppBuilderInstallStatus` returns
        // `{data: {id, persisted, live}}` (appManagementInstallHandlers.ts).
        'install_integration',
        'get_integration_install_status',
    ];

    it('the set matches exactly — a new row must be classified before it ships', async () => {
        const h = harness(ALL, BARE_SUCCESS);
        const silent: string[] = [];

        for (const d of ALL) {
            if (d.capturePayloadFrom || d.shape) continue;
            if ((await h.sizeOf(d.tool)) <= 2) silent.push(d.tool);
        }

        expect(silent.sort()).toEqual([...NO_SAFETY_NET].sort());
    });

    // The control. Without it the loop above passes whether it measured every row
    // or never ran one — a row given real data must NOT come back empty.
    it('control: the same rows are not silent when the handler returns data', async () => {
        const h = harness(ALL, GENERIC);
        for (const tool of NO_SAFETY_NET) {
            expect(await h.sizeOf(tool)).toBeGreaterThan(2);
        }
    });
});

// ─── audit coverage ──────────────────────────────────────────────────────────
//
// The table is only a guard while it keeps up with the surface. This asserts the
// relationship in both directions, because either drift is a silent hole: a new
// tool with no recorded size is one nobody is watching, and a stale entry is a
// ceiling defending a tool that no longer exists.
describe('the ceiling table tracks the tool surface', () => {
    const descriptorTools = ALL.map((d) => d.tool);

    // Exempt: rows whose response is a fixed short status by construction and
    // which no measurement has ever found large. Listed rather than inferred,
    // so adding a tool cannot silently join them.
    const EXEMPT = new Set([
        'regenerate_ai_files',
        'start_demo',
        'stop_demo',
        'rename_project',
        // `add_integration` joins its three siblings: its response is
        // `{added: {id, name, kind}}` — three short strings, bounded by
        // nothing that scales with project or catalog size.
        'add_integration',
        // `rename_integration` returns two short strings. `set_console_apis`
        // returns `{code, name?}` per subscribed API — the same shape and the
        // same credential-bounded union `add_console_apis` already returns
        // exempt. `set_project_destination` returns the destination refs plus a
        // move summary, bounded by the project's integration COUNT.
        'rename_integration',
        'set_console_apis',
        'set_project_destination',
        'deploy_integration',
        'redeploy_integration',
        'remove_integration',
        'deploy_mesh',
        'delete_mesh',
        'save_ai_prompt',
        'delete_ai_prompt',
        'export_project_settings',
        'refresh_block_library',
        'add_console_apis',
        'check_mesh',
        'check_datapack_service',
        'get_store_structure',
        'get_project_urls',
        'get_datapack',
        'list_datapack_data_types',
        'find_datapacks',
        'list_installed_datapacks',
        'get_datapack_activity',
        'verify_ai_setup',
        'list_ai_prompts',
        'list_console_apis',
        // Group 5. `restart_demo` mirrors start/stop_demo. `set_project_pinned`
        // is a boolean write. `set_current_project` returns ONE project record
        // — the same shape `get_project` already carries a 12,000-byte ceiling
        // for, and bounded the same way.
        'restart_demo',
        'set_current_project',
        'set_project_pinned',
        // Group 7. Four short strings on the install branch, two on the
        // manual one — bounded by nothing that scales with the machine or
        // the stack.
        'install_prerequisite',
        // Group 8's three job-handle writes. Each returns an activation id or
        // a short per-type outcome list — bounded by the number of DATA TYPES
        // in one datapack, not by how much data moved.
        'start_datapack_import',
        'reset_datapack',
        'start_datapack_export',
        // A target reference and a status record. Both fixed-shape.
        'get_datapack_import_target',
        'get_datapack_import_status',
        // AB-5 pair. `install_integration` returns one three-field install
        // record. `get_integration_install_status` returns that record plus
        // the live status and FAILED step names — bounded by the app's own
        // installer step count (the kit's whole tree measured ~23 nodes),
        // not by anything that scales with the project.
        'install_integration',
        'get_integration_install_status',
    ]);

    it('records a ceiling for every DESCRIPTOR tool that is not deliberately exempt', () => {
        // Rows built but not yet driven against a live extension. Distinct from
        // EXEMPT on purpose: exempt is a decision, this is an IOU. A ceiling is a
        // live measurement, and inventing one from the stub harness would record a
        // number no production payload ever produced. These get promoted to real
        // ceilings in the same F5 pass that first exercises them; anything left
        // here after that pass is a tool nobody actually ran.
        //
        // Group 8's three variable-size rows. Each returns something whose size
        // depends on a live service — a merchant's store hierarchy, the service's
        // validation verdict, a page of real catalog items — and inventing a
        // number for any of them from the stub would record a size no production
        // payload ever produces. The three fixed-shape writes and two fixed-shape
        // reads are EXEMPT above on their shape; these are the ones that need a
        // measurement.
        // Empty again: Group 8's three variable-size rows were probed against a
        // real Data Installer and now carry measured ceilings. A row lands here
        // only between being built and being probed.
        const PENDING_LIVE_MEASUREMENT = new Set<string>([]);

        const missing = descriptorTools.filter(
            (t) => !RESPONSE_CEILINGS[t] && !EXEMPT.has(t) && !PENDING_LIVE_MEASUREMENT.has(t)
        );
        expect(missing).toEqual([]);

        // An IOU that is already paid is rot in the other direction.
        const paid = [...PENDING_LIVE_MEASUREMENT].filter((t) => RESPONSE_CEILINGS[t]);
        expect(paid).toEqual([]);
    });

    /**
     * The check above walks DESCRIPTOR rows. Tools registered directly — the
     * `*Tools.ts` modules and `registerProjectTools` in `src/mcp-server.ts` — never
     * pass through it, so until 2026-08-24 nothing asserted anything about what
     * they return. Measured that day: 57 directly-registered tools, 47 carrying a
     * ceiling anyway and **10 with neither a ceiling nor an exemption**.
     *
     * This is the same shape as the bug the response-envelope guard shipped with —
     * its first version scanned one directory and missed ten tools in
     * `src/mcp-server.ts`, caught by two reviewers independently. A guard that
     * covers one of two registration paths reads as full coverage and is not.
     *
     * The ten are listed as IOUs rather than given invented ceilings: several
     * (`create_project`, `reset_eds_project`, `apply_updates`) return
     * progress/summary payloads whose real size only a live run produces, and a
     * number guessed from a stub records a size production never emits. Promote
     * each to a real ceiling — or to EXEMPT, if a live look shows a fixed short
     * status — as an F5 pass exercises it.
     */
    it('records a ceiling, an exemption, or an IOU for every DIRECTLY-registered tool', () => {
        const registrarSrc = [
            'src/mcp-server.ts',
            ...fs
                .readdirSync(path.join(__dirname, '../../../../src/features/ai/server'))
                .filter((f) => f.endsWith('.ts'))
                .map((f) => `src/features/ai/server/${f}`),
        ];
        const registered = new Set<string>();
        for (const rel of registrarSrc) {
            const src = fs.readFileSync(path.join(__dirname, '../../../../', rel), 'utf-8');
            for (const m of src.matchAll(/registerTool\(\s*['"]([a-z0-9_]+)/g)) {
                registered.add(m[1]);
            }
        }
        const directOnly = [...registered].filter((t) => !descriptorTools.includes(t));

        // Control: the direct path must be non-empty, or this test proves nothing.
        expect(directOnly.length).toBeGreaterThan(20);

        /**
         * Directly-registered tools awaiting a live measurement (2026-08-24).
         * Shrinking this list is the work; adding to it silently is the rot.
         */
        const DIRECT_PENDING = new Set<string>([
            'apply_updates',
            'create_project',
            'delete_project',
            'edit_project',
            'get_settings',
            'open_url',
            'open_view',
            'reset_eds_project',
            'set_setting',
            'sign_in',
        ]);

        const unwatched = directOnly.filter(
            (t) => !RESPONSE_CEILINGS[t] && !EXEMPT.has(t) && !DIRECT_PENDING.has(t)
        );
        expect(unwatched).toEqual([]);

        // Same both-directions rule as above: a paid IOU left listed is rot.
        const paidDirect = [...DIRECT_PENDING].filter((t) => RESPONSE_CEILINGS[t] || EXEMPT.has(t));
        expect(paidDirect).toEqual([]);

        // The exemption list needs the same two-way check as the ceilings, or it
        // rots in the direction nothing notices: an entry that names no descriptor
        // row can never match, so it sits there reading as a decision. Found this
        // way — `apply_updates` is a bespoke tool and was never in scope here.
        const stale = [...EXEMPT].filter((t) => !descriptorTools.includes(t));
        expect(stale).toEqual([]);
    });

    it('has no ceiling for a tool that no longer exists', async () => {
        // Every recorded name must still be a real tool somewhere in the surface.
        // Descriptor rows are checked here; the bespoke ones are asserted by the
        // suites that drive them, which fail on an unknown name.
        const { readdirSync, readFileSync } = await import('fs');
        const dir = 'src/features/ai/server';
        const sources = readdirSync(dir)
            .filter((f) => f.endsWith('.ts'))
            .map((f) => readFileSync(`${dir}/${f}`, 'utf8'))
            .join('\n');
        const mcpServer = readFileSync('src/mcp-server.ts', 'utf8');
        const blob = sources + mcpServer;

        const orphans = Object.keys(RESPONSE_CEILINGS).filter((t) => !blob.includes(`'${t}'`));
        expect(orphans).toEqual([]);
    });
});
