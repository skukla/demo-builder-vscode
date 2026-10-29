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

import { registerFinishStorefrontUpdateTool } from '@/features/ai/server/finishStorefrontUpdateTool';
import { callRequestsConsent } from '@/features/ai/server/inExtensionMcpServer';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { finishClash, leaveClash, previewClash } from '@/features/updates/services/pendingClashFinish';
import type { HandlerContext } from '@/types/handlers';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createMockLogger } from '../../../helpers/loggerFake';

const finishMock = finishClash as jest.Mock;
const leaveMock = leaveClash as jest.Mock;
const previewMock = previewClash as jest.Mock;

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
        finishMock.mockResolvedValue({ kind: 'finished', commit: 'c'.repeat(40), files: PREVIEW.files, notes: [] });

        const out = await server().call({ project: 'justrite', confirm: true });

        expect(finishMock).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'justrite' }),
            { builtFrom: expect.objectContaining({ extensionPath: '/ext' }) },
        );
        expect(out).toMatchObject({ project: 'justrite', kind: 'finished' });
    });

    it('drops the fix on leave, and never finishes', async () => {
        const out = await server().call({ project: 'justrite', confirm: true, leave: true });

        expect(leaveMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'justrite' }), expect.anything());
        expect(finishMock).not.toHaveBeenCalled();
        expect(out).toMatchObject({ left: true });
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
