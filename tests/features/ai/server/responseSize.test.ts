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

import { ACTION_DESCRIPTORS } from '@/features/ai/server/actionDescriptors';
import { READ_DESCRIPTORS } from '@/features/ai/server/readDescriptors';
import { STATUS_DESCRIPTORS } from '@/features/ai/server/statusDescriptors';
import { registerDescriptorTools, type ToolDescriptor } from '@/features/ai/server/toolDescriptors';
import type { HandlerContext, HandlerMap, HandlerResponse } from '@/types/handlers';
import { RESPONSE_CEILINGS } from './responseCeilings';

/** Registers the rows and invokes them exactly as the MCP server does. */
function harness(descriptors: ToolDescriptor[], response: HandlerResponse) {
    const tools = new Map<string, (args: unknown) => Promise<{ content: Array<{ text: string }> }>>();
    const server = {
        registerTool(
            name: string,
            _def: unknown,
            handler: (args: unknown) => Promise<{ content: Array<{ text: string }> }>,
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
        () => ({}) as HandlerContext,
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
    };

    it.each(SHAPED)('%s shrinks its own payload to the expected degree', async (tool) => {
        const payload = PAYLOADS[tool];
        const shaped = await harness(ALL, payload).sizeOf(tool);
        const unshaped = await harness(
            ALL.map((d) => ({ ...d, shape: undefined })),
            payload,
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
                unshaped.map((t) => `    ${t}`).join('\n'),
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
        'check_github_app', 'check_repo_readiness',
        // Category 2, verified by reading it: `handleAddAppBuilderComponent`
        // returns `{added: {id, name, kind}}` on success and a named refusal
        // otherwise (`appBuilderComponentHandlers.ts`). The stub cannot see that.
        'add_integration',
        // The rest of Group 4, all category 2 and all read before being listed:
        // `handleRenameAppBuilderComponent` returns `{renamed: {id, name}}`,
        // `handleSetConsoleApis` returns `{data: {subscribed}}` via reconcileExtras,
        // and `handleSetProjectDestination` returns
        // `{data: {destination, previous, move}}` (`destinationHandlers.ts`).
        'rename_integration', 'set_console_apis', 'set_project_destination',
        'add_console_apis', 'check_datapack_service', 'check_mesh',
        'delete_ai_prompt', 'delete_mesh', 'deploy_integration', 'deploy_mesh',
        'export_project_settings', 'get_datapack', 'get_datapack_activity',
        'get_project_urls', 'get_store_structure', 'list_datapack_data_types',
        'redeploy_integration', 'refresh_block_library', 'regenerate_ai_files',
        'remove_integration', 'rename_project', 'save_ai_prompt', 'start_demo',
        'stop_demo',
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

    it('records a ceiling for every DESCRIPTOR tool that is not deliberately exempt', () => {
        // Exempt: rows whose response is a fixed short status by construction and
        // which no measurement has ever found large. Listed rather than inferred,
        // so adding a tool cannot silently join them.
        const EXEMPT = new Set([
            'regenerate_ai_files', 'start_demo', 'stop_demo', 'rename_project',
            // `add_integration` joins its three siblings: its response is
            // `{added: {id, name, kind}}` — three short strings, bounded by
            // nothing that scales with project or catalog size.
            'add_integration',
            // `rename_integration` returns two short strings. `set_console_apis`
            // returns `{code, name?}` per subscribed API — the same shape and the
            // same credential-bounded union `add_console_apis` already returns
            // exempt. `set_project_destination` returns the destination refs plus a
            // move summary, bounded by the project's integration COUNT.
            'rename_integration', 'set_console_apis', 'set_project_destination',
            'deploy_integration', 'redeploy_integration', 'remove_integration',
            'deploy_mesh', 'delete_mesh', 'save_ai_prompt', 'delete_ai_prompt',
            'export_project_settings', 'refresh_block_library', 'add_console_apis',
            'check_mesh', 'check_datapack_service', 'get_store_structure',
            'get_project_urls', 'get_datapack', 'list_datapack_data_types',
            'find_datapacks', 'list_installed_datapacks', 'get_datapack_activity',
            'verify_ai_setup', 'list_ai_prompts', 'list_console_apis',
        ]);
        // Rows built but not yet driven against a live extension. Distinct from
        // EXEMPT on purpose: exempt is a decision, this is an IOU. A ceiling is a
        // live measurement, and inventing one from the stub harness would record a
        // number no production payload ever produced. These get promoted to real
        // ceilings in the same F5 pass that first exercises them; anything left
        // here after that pass is a tool nobody actually ran.
        //
        // Empty: every Group 1 row has now been driven against a live server and
        // carries a measured ceiling. A row lands here only between being built
        // and being probed.
        const PENDING_LIVE_MEASUREMENT = new Set<string>([]);

        const missing = descriptorTools.filter(
            (t) => !RESPONSE_CEILINGS[t] && !EXEMPT.has(t) && !PENDING_LIVE_MEASUREMENT.has(t),
        );
        expect(missing).toEqual([]);

        // An IOU that is already paid is rot in the other direction.
        const paid = [...PENDING_LIVE_MEASUREMENT].filter((t) => RESPONSE_CEILINGS[t]);
        expect(paid).toEqual([]);

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

        const orphans = Object.keys(RESPONSE_CEILINGS).filter(
            (t) => !blob.includes(`'${t}'`),
        );
        expect(orphans).toEqual([]);
    });
});
