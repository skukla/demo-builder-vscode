/**
 * finish_storefront_update tool — the project is found by name, a call without confirm
 * changes nothing, leave drops the fix, and confirm finishes through the one finishing
 * path. The finishing itself is pendingClashFinish.test's (real git); this pins the tool's
 * gating and shaping, and that it hands the finish the deps built for it.
 */

jest.mock('@/features/updates/services/pendingClashFinish', () => ({
    finishClash: jest.fn(),
    leaveClash: jest.fn(),
    previewClash: jest.fn(),
}));
jest.mock('@/features/updates/services/pendingClashFinishDeps', () => ({
    createFinishDeps: jest.fn((ctx: unknown) => ({ builtFrom: ctx })),
}));
// The notification and the Updates window's row are fixEndedNotice.test's.
jest.mock('@/features/updates/handlers/fixEndedNotice', () => ({
    tellFixEnded: jest.fn(() => 'what the SC was shown'),
}));

import { registerFinishStorefrontUpdateTool } from '@/features/ai/server/finishStorefrontUpdateTool';
import { callRequestsConsent } from '@/features/ai/server/inExtensionMcpServer';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { tellFixEnded } from '@/features/updates/handlers/fixEndedNotice';
import { finishClash, leaveClash, previewClash } from '@/features/updates/services/pendingClashFinish';
import type { HandlerContext } from '@/types/handlers';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createMockLogger } from '../../../helpers/loggerFake';

const finishMock = finishClash as jest.Mock;
const leaveMock = leaveClash as jest.Mock;
const previewMock = previewClash as jest.Mock;
const tellMock = tellFixEnded as jest.Mock;

const JUSTRITE = { name: 'justrite', path: '/p/justrite' };
const PREVIEW = { track: 'boilerplate', files: ['blocks/header/header.js'], markersLeft: [], diff: '-old\n+new\n' };

function fakeServer() {
     
    let handler: (args: any) => Promise<{ content: Array<{ text: string }> }> = async () => ({ content: [] });
    return {
         
        registerTool(_name: string, _def: unknown, h: (args: any) => Promise<{ content: Array<{ text: string }> }>) {
            handler = h;
        },
         
        async call(args?: unknown): Promise<any> {
            return JSON.parse((await handler(args)).content[0].text);
        },
    };
}

const getAllProjects = jest.fn();
const loadProjectFromPath = jest.fn();
const ctxFactory = () =>
    ({
        stateManager: { getAllProjects, loadProjectFromPath, saveProject: jest.fn() },
        context: { secrets: {}, extensionPath: '/ext' },
        logger: createMockLogger(),
    }) as unknown as HandlerContext;

function server() {
    const s = fakeServer();
    registerFinishStorefrontUpdateTool(s, ctxFactory);
    return s;
}

beforeEach(() => {
    jest.clearAllMocks();
    ServiceLocator.setCommandExecutor(createMockCommandExecutor());
    getAllProjects.mockResolvedValue([{ ...JUSTRITE, lastModified: new Date() }, { name: 'bodea', path: '/p/bodea', lastModified: new Date() }]);
    loadProjectFromPath.mockImplementation(async (p: string) => ({ name: p.split('/').pop(), path: p }));
    previewMock.mockResolvedValue(PREVIEW);
});

describe('finish_storefront_update', () => {
    it('raises the consent dialog only when told to finish or leave', () => {
        expect(callRequestsConsent('finish_storefront_update', { project: 'justrite', confirm: true })).toBe(true);
        expect(callRequestsConsent('finish_storefront_update', { project: 'justrite' })).toBe(false);
    });

    it('finds the project by name, not the open one, and loads it without saving', async () => {
        await server().call({ project: 'justrite' });

        expect(loadProjectFromPath).toHaveBeenCalledWith('/p/justrite', undefined, { persistAfterLoad: false });
        expect(previewMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'justrite' }), expect.anything());
    });

    it('without confirm, previews and changes nothing', async () => {
        const out = await server().call({ project: 'justrite' });

        expect(out).toMatchObject({ project: 'justrite', ...PREVIEW });
        expect(out.message).toMatch(/confirm:true; it pushes to the storefront/);
        expect(finishMock).not.toHaveBeenCalled();
        expect(leaveMock).not.toHaveBeenCalled();
    });

    it('says which files still have markers', async () => {
        previewMock.mockResolvedValue({ ...PREVIEW, markersLeft: ['blocks/header/header.js'] });

        const out = await server().call({ project: 'justrite' });

        expect(out.message).toBe('Fix blocks/header/header.js first: conflict markers are still there.');
    });

    it('finishes through the one finishing path, with the deps built for it', async () => {
        finishMock.mockResolvedValue({ kind: 'finished', commit: 'c'.repeat(40), files: PREVIEW.files, notes: [], localCopyClean: true });

        const out = await server().call({ project: 'justrite', confirm: true });

        expect(finishMock).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'justrite' }),
            { builtFrom: expect.objectContaining({ extensionPath: '/ext' }) },
        );
        expect(out).toMatchObject({ project: 'justrite', kind: 'finished' });
    });

    // Owner, 2026-10-30: the AI finished and the SC was never told. The agent is told the SC
    // was, so it does not send them to look.
    it('tells the SC a finished update is live, and tells the agent it did', async () => {
        finishMock.mockResolvedValue({ kind: 'finished', commit: 'c'.repeat(40), files: PREVIEW.files, notes: [], localCopyClean: true });

        const out = await server().call({ project: 'justrite', confirm: true });

        expect(tellMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'justrite' }), 'boilerplate', 'finished', true);
        expect(out.scNotified).toBe('what the SC was shown');
    });

    it('tells the SC when the fix was dropped for a newer version', async () => {
        finishMock.mockResolvedValue({ kind: 'moved-on' });

        const out = await server().call({ project: 'justrite', confirm: true });

        expect(tellMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'justrite' }), 'boilerplate', 'moved-on');
        expect(out).toMatchObject({ kind: 'moved-on', scNotified: 'what the SC was shown' });
    });

    it.each([
        ['not fixed yet', { kind: 'not-fixed', reason: 'blocks/header/header.js still has conflict markers' }],
        ['failed', { kind: 'failed', reason: 'GitHub refused the push' }],
    ])('tells the SC nothing while the fix is %s: the AI is still on it', async (_label, outcome) => {
        finishMock.mockResolvedValue(outcome);

        const out = await server().call({ project: 'justrite', confirm: true });

        expect(tellMock).not.toHaveBeenCalled();
        expect(out).not.toHaveProperty('scNotified');
    });

    it('drops the fix on leave, never finishes, and tells the SC', async () => {
        const out = await server().call({ project: 'justrite', confirm: true, leave: true });

        expect(leaveMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'justrite' }), expect.anything());
        expect(finishMock).not.toHaveBeenCalled();
        expect(tellMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'justrite' }), 'boilerplate', 'left');
        expect(out).toMatchObject({ left: true, scNotified: 'what the SC was shown' });
    });

    it('tells the SC nothing on a preview', async () => {
        await server().call({ project: 'justrite' });

        expect(tellMock).not.toHaveBeenCalled();
    });

    it('answers plainly for a project with nothing kept', async () => {
        previewMock.mockResolvedValue(undefined);

        const out = await server().call({ project: 'bodea', confirm: true });

        expect(out).toMatchObject({ nothingKept: true });
        expect(finishMock).not.toHaveBeenCalled();
    });

    it('refuses an unknown project', async () => {
        await expect(server().call({ project: 'nope' })).resolves.toEqual({ error: 'No project named "nope"' });
        expect(previewMock).not.toHaveBeenCalled();
    });
});
