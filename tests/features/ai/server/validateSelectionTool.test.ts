/**
 * validate_component_selection — three wizard handlers, one agent question.
 *
 * These tests pin the merge itself: which handlers run, in what order, and when
 * one of them is deliberately skipped.
 */

import { registerValidateSelectionTool } from '@/features/ai/server/validateSelectionTool';
import type { McpToolSchema } from '@/features/ai/server/mcpToolServer';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

const dispatchHandler = jest.fn();
jest.mock('@/core/handlers/dispatchHandler', () => ({
    dispatchHandler: (...a: unknown[]) => dispatchHandler(...a),
}));

function serve() {
    const tools = new Map<string, (a: unknown) => Promise<{ content: Array<{ text: string }> }>>();
    // McpToolSchema, not a hand-written shape: the declaration is what reaches
    // `tools/list`, so the compiler should be the thing that checks it.
    const declared = new Map<string, McpToolSchema>();
    registerValidateSelectionTool(
        {
            registerTool: (n: string, d: McpToolSchema, h: never) => {
                declared.set(n, d);
                tools.set(n, h);
            },
        },
        () => createMockHandlerContext({ sendMessage: async () => {} })
    );
    const invoke = (args: Record<string, unknown>) =>
        tools.get('validate_component_selection')!(args);
    return {
        declaration: declared.get('validate_component_selection')!,
        raw: async (args: Record<string, unknown>) => (await invoke(args)).content[0].text,
        call: async (args: Record<string, unknown>) =>
            JSON.parse((await invoke(args)).content[0].text),
    };
}

/** Message types dispatched, in order. */
const dispatched = () => dispatchHandler.mock.calls.map((c) => c[2]);

/** Drive each handler by message type. */
function respond(byType: Record<string, unknown>) {
    dispatchHandler.mockImplementation(async (_map, _ctx, type) => byType[type]);
}

const PAIR = { frontend: 'eds-storefront', backend: 'accs' };

const COMPATIBLE = { success: true, data: { compatible: true } };
const DEPS = {
    success: true,
    data: {
        dependencies: [
            { id: 'eds-accs-mesh', name: 'ACCS Mesh', required: true, impact: 'adds a mesh' },
            { id: 'analytics', name: 'Analytics', required: false },
        ],
    },
};
const VALID = { success: true, data: { valid: true, errors: [], warnings: [] } };

beforeEach(() => jest.clearAllMocks());

describe('validate_component_selection', () => {
    it('answers compatibility, dependencies and validity in ONE call', async () => {
        respond({
            checkCompatibility: COMPATIBLE,
            loadDependencies: DEPS,
            validateSelection: VALID,
        });

        expect(await serve().call(PAIR)).toEqual({
            compatible: true,
            valid: true,
            required: ['eds-accs-mesh'],
            optional: ['analytics'],
        });
        expect(dispatched()).toEqual([
            'checkCompatibility',
            'loadDependencies',
            'validateSelection',
        ]);
    });

    // Resolving dependencies for a combination that cannot be built produces a
    // list nobody can act on. The incompatibility IS the answer.
    it('stops after compatibility when the pair cannot be built', async () => {
        respond({ checkCompatibility: { success: true, data: { compatible: false } } });
        const out = await serve().call(PAIR);

        expect(out).toMatchObject({ compatible: false, valid: false });
        expect(out.reason).toMatch(/not compatible/);
        expect(dispatched()).toEqual(['checkCompatibility']);
    });

    it('returns ids, not the wizard rows', async () => {
        respond({
            checkCompatibility: COMPATIBLE,
            loadDependencies: DEPS,
            validateSelection: VALID,
        });
        const raw = await serve().raw(PAIR);

        // name/impact are for a wizard card; an agent needs what it can pass on.
        expect(raw).not.toContain('ACCS Mesh');
        expect(raw).not.toContain('adds a mesh');
    });

    it('reports errors and warnings only when there are some', async () => {
        respond({
            checkCompatibility: COMPATIBLE,
            loadDependencies: DEPS,
            validateSelection: {
                success: true,
                data: { valid: false, errors: ['circular: a -> b -> a'], warnings: [] },
            },
        });
        const out = await serve().call(PAIR);

        expect(out.valid).toBe(false);
        expect(out.errors).toEqual(['circular: a -> b -> a']);
        expect('warnings' in out).toBe(false);
    });

    it('passes chosen dependencies through to validation', async () => {
        respond({
            checkCompatibility: COMPATIBLE,
            loadDependencies: DEPS,
            validateSelection: VALID,
        });
        await serve().call({ ...PAIR, dependencies: ['analytics'] });

        const validateCall = dispatchHandler.mock.calls.find((c) => c[2] === 'validateSelection');
        expect(validateCall?.[3]).toMatchObject({ dependencies: ['analytics'] });
    });

    it('defaults to no chosen dependencies rather than sending undefined', async () => {
        respond({
            checkCompatibility: COMPATIBLE,
            loadDependencies: DEPS,
            validateSelection: VALID,
        });
        await serve().call(PAIR);

        // The handler rejects a payload whose `dependencies` is not an array
        // (`componentHandlers.ts:311-317`), so the omitted case must become [].
        const validateCall = dispatchHandler.mock.calls.find((c) => c[2] === 'validateSelection');
        expect(validateCall?.[3]).toMatchObject({ dependencies: [] });
    });

    it('surfaces a failed compatibility check as an error', async () => {
        respond({ checkCompatibility: { success: false, error: 'registry unreadable' } });
        expect(await serve().raw(PAIR)).toMatch(/^Error: registry unreadable/);
        expect(dispatched()).toEqual(['checkCompatibility']);
    });

    // What the tool DECLARES, not what it answers. `needsAuth` and `readOnlyHint`
    // are what the dry run and `tools/list` gate on, and nothing else in the suite
    // looks at the object the registrar hands over.
    describe('declaration', () => {
        it('declares itself credential-free and read-only', () => {
            const { declaration } = serve();

            expect(declaration.needsAuth).toBe(false);
            expect(declaration.annotations).toEqual({
                readOnlyHint: true,
                destructiveHint: false,
            });
        });

        it('declares exactly the three inputs the wizard handlers need', () => {
            const { declaration } = serve();

            expect(Object.keys(declaration.inputSchema ?? {})).toEqual([
                'frontend',
                'backend',
                'dependencies',
            ]);
        });
    });

    // A mock answers the same whatever it is handed, so the PAYLOAD each handler
    // receives is invisible unless it is asserted. Both of these dispatch to
    // handlers that read `frontend`/`backend` off the payload.
    it('hands each wizard handler the pair it dispatches on', async () => {
        respond({
            checkCompatibility: COMPATIBLE,
            loadDependencies: DEPS,
            validateSelection: VALID,
        });
        await serve().call(PAIR);

        const payloadFor = (type: string) =>
            dispatchHandler.mock.calls.find((c) => c[2] === type)?.[3];

        expect(payloadFor('checkCompatibility')).toEqual(PAIR);
        expect(payloadFor('loadDependencies')).toEqual(PAIR);
    });

    it('reads not-valid when the chain says nothing about validity', async () => {
        respond({
            checkCompatibility: COMPATIBLE,
            loadDependencies: DEPS,
            // A chain result with no `valid`, `errors` or `warnings` at all — the
            // shape a handler returns when it could not run the resolver.
            validateSelection: { success: true, data: {} },
        });
        const out = await serve().call(PAIR);

        expect(out.valid).toBe(false);
        expect('errors' in out).toBe(false);
        expect('warnings' in out).toBe(false);
    });

    it('reports warnings when the chain has some', async () => {
        respond({
            checkCompatibility: COMPATIBLE,
            loadDependencies: DEPS,
            validateSelection: {
                success: true,
                data: { valid: true, errors: [], warnings: ['analytics has no backend'] },
            },
        });
        const out = await serve().call(PAIR);

        expect(out.warnings).toEqual(['analytics has no backend']);
        expect('errors' in out).toBe(false);
    });
});
