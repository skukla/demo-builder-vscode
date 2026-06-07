/**
 * apply_updates tool — check mode (no confirm), the up-to-date short-circuit, the
 * running-demo guard, and the apply path. The headless updateApplyService is
 * mocked; this verifies the tool's gating + shaping, not the apply mechanics.
 */

jest.mock('@/features/updates/services/updateApplyService', () => ({
    computeProjectUpdateSelections: jest.fn(),
    applyUpdatesHeadless: jest.fn(),
    countSelections: jest.fn(),
}));

import { registerApplyUpdatesTool } from '@/features/ai/server/applyUpdatesTool';
import {
    computeProjectUpdateSelections,
    applyUpdatesHeadless,
    countSelections,
} from '@/features/updates/services/updateApplyService';
import type { HandlerContext } from '@/types/handlers';

const computeMock = computeProjectUpdateSelections as jest.Mock;
const applyMock = applyUpdatesHeadless as jest.Mock;
const countMock = countSelections as jest.Mock;

const EMPTY = { forkSync: [], template: [], component: [], adobeMcp: [], blockLibrary: [], inspector: [] };

function fakeServer() {

    const tools = new Map<string, (args: any) => Promise<{ content: Array<{ text: string }> }>>();
    return {

        registerTool(name: string, _def: unknown, handler: (args: any) => Promise<{ content: Array<{ text: string }> }>) {
            tools.set(name, handler);
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
        context: { secrets: {}, extensionPath: '/ext' },
        logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
    }) as unknown as HandlerContext;

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
});
