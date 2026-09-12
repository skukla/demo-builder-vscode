/**
 * forget_added_demo and change_demo_source — the agent's doors for a demo
 * added from a link. The handlers behind them are mocked at the module
 * boundary; what is asserted is the gate, the refusal's words, and the
 * ARGUMENTS each handler receives.
 */

jest.mock('@/features/eds/handlers/forgetAddedDemoHandler', () => ({
    countProjectsBuiltOn: jest.fn(),
    forgetDemo: jest.fn(),
    isOwnCopy: jest.fn(),
    projectsSentence: jest.requireActual('@/features/eds/handlers/forgetAddedDemoHandler').projectsSentence,
}));
jest.mock('@/features/eds/handlers/changeDemoSourceHandler', () => ({
    handleChangeDemoSource: jest.fn(),
}));
jest.mock('@/features/eds/handlers/probeSharedDemoHandler', () => ({
    handleProbeSharedDemo: jest.fn(),
}));
jest.mock('@/features/project-creation/services/addedDemoSettings', () => ({
    ...jest.requireActual('@/features/project-creation/services/addedDemoSettings'),
    readAddedDemos: jest.fn(),
}));
jest.mock('@/features/ai/server/edsToolGuards', () => ({
    requireGitHub: jest.fn(),
}));

import { registerAddedDemoTools } from '@/features/ai/server/addedDemoTools';
import { requireGitHub } from '@/features/ai/server/edsToolGuards';
import { handleChangeDemoSource } from '@/features/eds/handlers/changeDemoSourceHandler';
import { countProjectsBuiltOn, forgetDemo, isOwnCopy } from '@/features/eds/handlers/forgetAddedDemoHandler';
import { handleProbeSharedDemo } from '@/features/eds/handlers/probeSharedDemoHandler';
import { readAddedDemos } from '@/features/project-creation/services/addedDemoSettings';
import type { SharedDemoRead } from '@/types/webviewRequests';
import { makeAddedDemo } from '../../../helpers/demoPackageFixtures';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';

const mockRequireGitHub = requireGitHub as jest.Mock;
const mockRead = readAddedDemos as jest.Mock;
const mockOwn = isOwnCopy as jest.Mock;
const mockCount = countProjectsBuiltOn as jest.Mock;
const mockForget = forgetDemo as jest.Mock;
const mockProbe = handleProbeSharedDemo as jest.Mock;
const mockChange = handleChangeDemoSource as jest.Mock;

const JEN = makeAddedDemo();
const OWN = makeAddedDemo({ name: 'My copy', source: { owner: 'steve', repo: 'isle5-demo', branch: 'main' } });
const READ: SharedDemoRead = {
    outcome: 'read',
    fullName: 'steve/isle5-copy',
    defaultBranch: 'main',
    isTemplate: false,
    kind: 'eds',
    contentSource: { org: 'steve', site: 'isle5-copy' },
    contentPublished: { indexFound: true, pageCount: 3 },
    b2b: 'unknown',
    overrides: [],
    warnings: ['No description file.'],
    viewer: { login: 'steve', ownsRepo: true },
};

function fakeServer() {
    const tools = new Map<string, (args: any) => Promise<{ content: Array<{ text: string }> }>>();
    return {
        registerTool(name: string, _def: unknown, handler: (args: any) => Promise<{ content: Array<{ text: string }> }>) {
            tools.set(name, handler);
        },
        async call(name: string, args: unknown): Promise<any> {
            return JSON.parse((await tools.get(name)!(args)).content[0].text);
        },
    };
}

const ctx = createMockHandlerContext({ logger: createMockLogger() });

beforeEach(() => {
    jest.clearAllMocks();
    mockRequireGitHub.mockResolvedValue(undefined);
    mockRead.mockReturnValue([JEN, OWN]);
    mockOwn.mockImplementation(async (_c: unknown, source: { owner: string }) => source.owner === 'steve');
    mockCount.mockResolvedValue(2);
    mockForget.mockResolvedValue({ forgotten: true });
});

describe('forget_added_demo', () => {
    it('refuses without confirm, naming the demo, the project count and nothing deleted', async () => {
        const s = fakeServer();
        registerAddedDemoTools(s, () => ctx);

        const res = await s.call('forget_added_demo', { owner: 'JEN', repo: 'isle5-demo' });

        expect(res).toMatchObject({ demo: 'Isle5 by Jen', projectsBuiltOn: 2, destructive: true });
        expect(res.error).toContain('2 projects on this computer were built on it');
        expect(res.error).not.toContain('Deleting your copy');
        expect(mockForget).not.toHaveBeenCalled();
    });

    it('forgets on confirm, without deleting, and answers the outcome', async () => {
        const s = fakeServer();
        registerAddedDemoTools(s, () => ctx);

        const res = await s.call('forget_added_demo', { owner: 'jen', repo: 'isle5-demo', confirm: true });

        expect(mockForget).toHaveBeenCalledWith(ctx, JEN.source, false);
        expect(res).toEqual({ demo: 'Isle5 by Jen', source: JEN.source, projectsBuiltOn: 2, forgotten: true });
    });

    it("refuses deleteCopy for a repository that is not the SC's own", async () => {
        const s = fakeServer();
        registerAddedDemoTools(s, () => ctx);

        const res = await s.call('forget_added_demo', { owner: 'jen', repo: 'isle5-demo', deleteCopy: true, confirm: true });

        expect(res.error).toContain('is not your copy');
        expect(mockForget).not.toHaveBeenCalled();
    });

    it('names the cost of deleting the copy in the refusal, then deletes on confirm', async () => {
        mockForget.mockResolvedValue({ forgotten: true, deletedCopy: true });
        const s = fakeServer();
        registerAddedDemoTools(s, () => ctx);

        const refusal = await s.call('forget_added_demo', { owner: 'steve', repo: 'isle5-demo', deleteCopy: true });
        expect(refusal.error).toContain('Deleting your copy (steve/isle5-demo) leaves them without reset and updates');

        const res = await s.call('forget_added_demo', { owner: 'steve', repo: 'isle5-demo', deleteCopy: true, confirm: true });
        expect(mockForget).toHaveBeenCalledWith(ctx, OWN.source, true);
        expect(res).toMatchObject({ forgotten: true, deletedCopy: true });
    });

    it('answers an unknown repository and a missing GitHub sign-in without touching anything', async () => {
        const s = fakeServer();
        registerAddedDemoTools(s, () => ctx);
        expect((await s.call('forget_added_demo', { owner: 'nobody', repo: 'x', confirm: true })).error).toContain('No added demo at nobody/x');

        mockRequireGitHub.mockResolvedValueOnce({ needsAuth: 'github', message: 'sign in' });
        expect(await s.call('forget_added_demo', { owner: 'jen', repo: 'isle5-demo', confirm: true })).toEqual({
            needsAuth: 'github',
            message: 'sign in',
        });
        expect(mockForget).not.toHaveBeenCalled();
    });
});

describe('change_demo_source', () => {
    it('reads the repository, builds the row the dialog would, and hands it to the change handler', async () => {
        mockProbe.mockResolvedValue({ success: true, result: READ });
        mockChange.mockResolvedValue({
            success: true,
            result: {
                demo: { ...OWN, source: { owner: 'steve', repo: 'isle5-copy', branch: 'main' } },
                previous: { owner: 'jen', repo: 'isle5-demo' },
            },
        });
        const s = fakeServer();
        registerAddedDemoTools(s, () => ctx);

        const res = await s.call('change_demo_source', { owner: 'steve', repo: 'isle5-copy', keepCopy: true, updateRemembered: true, name: 'Mine' });

        expect(mockProbe).toHaveBeenCalledWith(ctx, { owner: 'steve', repo: 'isle5-copy' });
        expect(mockChange).toHaveBeenCalledWith(ctx, {
            demo: expect.objectContaining({
                name: 'Mine',
                source: { owner: 'steve', repo: 'isle5-copy', branch: 'main' },
                storefrontKind: 'eds',
                contentSource: { org: 'steve', site: 'isle5-copy' },
            }),
            // The SC's own repository: nothing to copy, whatever was asked.
            keepCopy: false,
            updateRemembered: true,
        });
        expect(res).toEqual({
            changed: true,
            demo: 'My copy',
            source: { owner: 'steve', repo: 'isle5-copy', branch: 'main' },
            previous: { owner: 'jen', repo: 'isle5-demo' },
            warnings: [
                'No description file.',
                'Whether this demo uses company (B2B) features could not be read; it is treated as off.',
            ],
        });
    });

    it("passes the handler's refusal through (the other kind, or no added demo)", async () => {
        mockProbe.mockResolvedValue({ success: true, result: READ });
        mockChange.mockResolvedValue({ success: false, error: 'This project is built on a headless demo; pick a demo of the same kind.' });
        const s = fakeServer();
        registerAddedDemoTools(s, () => ctx);

        const res = await s.call('change_demo_source', { owner: 'steve', repo: 'isle5-copy' });

        expect(res).toEqual({ error: 'This project is built on a headless demo; pick a demo of the same kind.' });
    });

    it('refuses a shipped template, an unreadable repository, and one that is not a storefront', async () => {
        const s = fakeServer();
        registerAddedDemoTools(s, () => ctx);

        mockProbe.mockResolvedValueOnce({ success: true, result: { outcome: 'shipped', shippedPackageId: 'starter', fullName: 'a/b' } });
        expect((await s.call('change_demo_source', { owner: 'a', repo: 'b' })).error).toContain("can't be pointed at a demo we ship");

        mockProbe.mockResolvedValueOnce({ success: true, result: { outcome: 'unreadable', reason: 'Not found' } });
        expect(await s.call('change_demo_source', { owner: 'a', repo: 'b' })).toEqual({ error: 'Not found' });

        mockProbe.mockResolvedValueOnce({
            success: true,
            result: { ...READ, kind: 'not-a-storefront', missing: ['scripts/scripts.js'] },
        });
        expect(await s.call('change_demo_source', { owner: 'a', repo: 'b' })).toEqual({
            error: 'This repository is not a storefront we can build on.',
            missing: ['scripts/scripts.js'],
            warnings: ['No description file.'],
        });
        expect(mockChange).not.toHaveBeenCalled();
    });
});
