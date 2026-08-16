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
import { registerDescriptorTools, type ToolDescriptor } from '@/features/ai/server/toolDescriptors';
import type { HandlerContext, HandlerMap, HandlerResponse } from '@/types/handlers';

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

const ALL = [...READ_DESCRIPTORS, ...ACTION_DESCRIPTORS];
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
