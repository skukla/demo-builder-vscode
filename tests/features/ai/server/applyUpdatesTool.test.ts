/**
 * apply_updates tool — check mode (no confirm), the up-to-date short-circuit, the
 * running-demo guard, and the apply path. The headless updateApplyService is
 * mocked; this verifies the tool's gating + shaping, not the apply mechanics.
 */

jest.mock('@/core/utils/agentPhaseChannel', () => ({
    reportPhase: jest.fn(),
}));

jest.mock('@/features/updates/services/updateApplyService', () => ({
    computeProjectUpdateSelections: jest.fn(),
    applyUpdatesHeadless: jest.fn(),
    countSelections: jest.fn(),
}));

import { registerApplyUpdatesTool } from '@/features/ai/server/applyUpdatesTool';
import { reportPhase } from '@/core/utils/agentPhaseChannel';
import {
    computeProjectUpdateSelections,
    applyUpdatesHeadless,
    countSelections,
} from '@/features/updates/services/updateApplyService';
import type { HandlerContext } from '@/types/handlers';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';

const computeMock = computeProjectUpdateSelections as jest.Mock;
const applyMock = applyUpdatesHeadless as jest.Mock;
const countMock = countSelections as jest.Mock;
const reportPhaseMock = reportPhase as jest.Mock;

const EMPTY = { forkSync: [], template: [], component: [], adobeMcp: [], blockLibrary: [], inspector: [] };

function fakeServer() {

    const tools = new Map<string, (args: any) => Promise<{ content: Array<{ text: string }> }>>();
    const defs = new Map<string, any>();
    return {

        registerTool(name: string, def: unknown, handler: (args: any) => Promise<{ content: Array<{ text: string }> }>) {
            tools.set(name, handler);
            defs.set(name, def);
        },
        /** What the tool DECLARES to the client — auth, annotations, schema. */
        definition(): any {
            return defs.get('apply_updates');
        },
        async call(args?: unknown): Promise<any> {
            return JSON.parse((await tools.get('apply_updates')!(args)).content[0].text);
        },
    };
}

const getCurrentProject = jest.fn();
const ctxFactory = () =>
    ({
        stateManager: { getCurrentProject },
        commandManager: createMockCommandExecutor({ execute: jest.fn() }),
        context: { secrets: {}, extensionPath: '/ext' },
        logger: createMockLogger(),
    }) as unknown as HandlerContext;


/**
 * ADR-015 (2026-08-28): this boundary fetches the shell executor from the
 * registry, which the shared node setup resets after EVERY test — so the fake
 * is seeded per-test rather than once at module scope.
 */
beforeEach(() => {
    ServiceLocator.setCommandExecutor(createMockCommandExecutor({
        execute: jest.fn(async () => ({ code: 0, stdout: '', stderr: '' })),
    }));
});

describe('apply_updates', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        getCurrentProject.mockResolvedValue({ name: 'p', path: '/p', status: 'stopped' });
        computeMock.mockResolvedValue({ ...EMPTY, component: [{ componentId: 'mesh', latestVersion: '2.0.0' }] });
        countMock.mockReturnValue(1);
        applyMock.mockResolvedValue({
            forkSync: { successCount: 0, failCount: 0, errors: [] },
            template: { successCount: 0, failCount: 0, errors: [] },
            component: { successCount: 1, failCount: 0, errors: [] },
            adobeMcp: { successCount: 0, failCount: 0, errors: [] },
            addon: { successCount: 0, failCount: 0, errors: [] },
            totalApplied: 1,
            totalFailed: 0,
        });
    });

    it('declares what it is: no read-only claim, github auth, and a confirm flag', async () => {
        // The annotation block travels to the client in tools/list and the dry run
        // gates on it, so a wrong declaration is a tool an agent applies blind.
        const s = fakeServer();
        registerApplyUpdatesTool(s, ctxFactory);

        const def = s.definition();
        expect(def.needsAuth).toStrictEqual(['github']);
        expect(def.annotations).toStrictEqual({ readOnlyHint: false, destructiveHint: false });
        expect(def.description).toMatch(/apply available updates/);
        expect(def.inputSchema.confirm.isOptional()).toBe(true);
        expect(def.inputSchema.confirm.parse(true)).toBe(true);
    });

    it('errors when no project is open', async () => {
        getCurrentProject.mockResolvedValueOnce(undefined);
        const s = fakeServer();
        registerApplyUpdatesTool(s, ctxFactory);
        expect(await s.call({})).toMatchObject({ error: expect.stringMatching(/No current project/) });
    });

    it('reports up-to-date when nothing is available', async () => {
        countMock.mockReturnValueOnce(0);
        const s = fakeServer();
        registerApplyUpdatesTool(s, ctxFactory);
        expect(await s.call({ confirm: true })).toMatchObject({ upToDate: true, available: 0 });
        expect(applyMock).not.toHaveBeenCalled();
    });

    it('without confirm, reports available updates and does not apply', async () => {
        const s = fakeServer();
        registerApplyUpdatesTool(s, ctxFactory);
        const res = await s.call({});
        expect(res).toMatchObject({ available: 1 });
        expect(res.message).toMatch(/confirm:true/);
        expect(res.summary.component).toEqual(['mesh → 2.0.0']);
        expect(applyMock).not.toHaveBeenCalled();
    });

    it('treats a call with NO arguments as a check, not a crash', async () => {
        // MCP clients may send nothing at all for an all-optional schema.
        const s = fakeServer();
        registerApplyUpdatesTool(s, ctxFactory);
        expect(await s.call()).toMatchObject({ available: 1 });
        expect(applyMock).not.toHaveBeenCalled();
    });

    it('names every category in the summary, each in its own shape', async () => {
        // One category summarised wrongly reads to the agent as nothing pending
        // there — the per-category shapes are the whole content of the check mode.
        computeMock.mockResolvedValueOnce({
            forkSync: [{ owner: 'skukla', repo: 'a-store' }],
            template: [{ x: 1 }, { x: 2 }],
            component: [{ componentId: 'mesh', latestVersion: '2.0.0' }],
            adobeMcp: [{ packageName: '@adobe/aem-mcp', latestVersion: '3.1.0' }],
            blockLibrary: [{ library: { name: 'Bodea blocks' } }],
            inspector: [{ y: 1 }],
        });
        countMock.mockReturnValueOnce(7);
        const s = fakeServer();
        registerApplyUpdatesTool(s, ctxFactory);

        const res = await s.call({});

        expect(res.summary).toStrictEqual({
            forkSync: ['skukla/a-store'],
            template: 2,
            component: ['mesh → 2.0.0'],
            adobeMcp: ['@adobe/aem-mcp → 3.1.0'],
            blockLibrary: ['Bodea blocks'],
            inspector: 1,
        });
    });

    it('refuses to apply while the demo is running', async () => {
        getCurrentProject.mockResolvedValueOnce({ name: 'p', path: '/p', status: 'running' });
        const s = fakeServer();
        registerApplyUpdatesTool(s, ctxFactory);
        const res = await s.call({ confirm: true });
        expect(res).toMatchObject({ error: expect.stringMatching(/Stop the running demo/), available: 1 });
        expect(applyMock).not.toHaveBeenCalled();
    });

    it('applies on confirm and returns per-category counts + phases', async () => {
        const s = fakeServer();
        registerApplyUpdatesTool(s, ctxFactory);
        const res = await s.call({ confirm: true });
        expect(res).toMatchObject({ applied: 1, failed: 0 });
        expect(res.categories.component).toMatchObject({ successCount: 1 });
        expect(applyMock).toHaveBeenCalledTimes(1);
        // UpdateContext is assembled from the handler context.
        expect(applyMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ extensionPath: '/ext' }),
            expect.any(Function),
        );
    });

    it('hands the updater the selections it just computed', async () => {
        const selections = { ...EMPTY, template: [{ x: 1 }] };
        computeMock.mockResolvedValueOnce(selections);
        const s = fakeServer();
        registerApplyUpdatesTool(s, ctxFactory);

        await s.call({ confirm: true });

        // A mock cannot see a malformed call: assert the ARGUMENT, or the tool
        // could be recomputing or passing something else entirely.
        expect(applyMock.mock.calls[0][0]).toBe(selections);
    });

    it('both records each phase for the agent and reports it live', async () => {
        // The array is the after-the-fact record; reportPhase is what the user sees
        // while the wait is happening, which is when they care. Dropping either
        // leaves one of the two audiences with nothing.
        applyMock.mockImplementationOnce(async (_sel: unknown, _ctx: unknown, report: (m: string) => void) => {
            report('Syncing fork');
            report('Updating components');
            return {
                forkSync: { successCount: 0, failCount: 0, errors: [] },
                template: { successCount: 0, failCount: 0, errors: [] },
                component: { successCount: 1, failCount: 0, errors: [] },
                adobeMcp: { successCount: 0, failCount: 0, errors: [] },
                addon: { successCount: 0, failCount: 0, errors: [] },
                totalApplied: 1,
                totalFailed: 0,
            };
        });
        const s = fakeServer();
        registerApplyUpdatesTool(s, ctxFactory);

        const res = await s.call({ confirm: true });

        expect(res.phases).toStrictEqual(['Syncing fork', 'Updating components']);
        expect(reportPhaseMock.mock.calls).toStrictEqual([
            ['Syncing fork'],
            ['Updating components'],
        ]);
    });
});
