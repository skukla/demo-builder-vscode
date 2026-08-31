/**
 * validate_component_selection — three wizard handlers, one agent question.
 *
 * These tests pin the merge itself: which handlers run, in what order, and when
 * one of them is deliberately skipped.
 */

import { registerValidateSelectionTool } from '@/features/ai/server/validateSelectionTool';
import type { HandlerContext } from '@/types/handlers';

const dispatchHandler = jest.fn();
jest.mock('@/core/handlers/dispatchHandler', () => ({
    dispatchHandler: (...a: unknown[]) => dispatchHandler(...a),
}));

function serve() {
    const tools = new Map<string, (a: unknown) => Promise<{ content: Array<{ text: string }> }>>();
    registerValidateSelectionTool(
        { registerTool: (n: string, _d: unknown, h: never) => tools.set(n, h) },
        () => ({ sendMessage: async () => {} }) as unknown as HandlerContext,
    );
    const invoke = (args: Record<string, unknown>) =>
        tools.get('validate_component_selection')!(args);
    return {
        raw: async (args: Record<string, unknown>) => (await invoke(args)).content[0].text,
        call: async (args: Record<string, unknown>) => JSON.parse((await invoke(args)).content[0].text),
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
        respond({ checkCompatibility: COMPATIBLE, loadDependencies: DEPS, validateSelection: VALID });

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
        respond({ checkCompatibility: COMPATIBLE, loadDependencies: DEPS, validateSelection: VALID });
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
        respond({ checkCompatibility: COMPATIBLE, loadDependencies: DEPS, validateSelection: VALID });
        await serve().call({ ...PAIR, dependencies: ['analytics'] });

        const validateCall = dispatchHandler.mock.calls.find((c) => c[2] === 'validateSelection');
        expect(validateCall?.[3]).toMatchObject({ dependencies: ['analytics'] });
    });

    it('defaults to no chosen dependencies rather than sending undefined', async () => {
        respond({ checkCompatibility: COMPATIBLE, loadDependencies: DEPS, validateSelection: VALID });
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
});
