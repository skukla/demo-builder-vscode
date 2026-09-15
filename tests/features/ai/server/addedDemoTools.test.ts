/**
 * forget_added_demo and change_demo_source — the agent's doors for a demo
 * added from a link. The handlers behind them are mocked at the module
 * boundary; what is asserted is the gate, the refusal's words, and the
 * ARGUMENTS each handler receives.
 */

jest.mock('@/features/eds/handlers/forgetAddedDemoHandler', () => ({
    countProjectsBuiltOn: jest.fn(),
    forgetDemo: jest.fn(),
    isDeletableZipRepository: jest.fn(),
    projectWithStorefront: jest.fn(),
    projectsSentence: jest.requireActual('@/features/eds/handlers/forgetAddedDemoHandler').projectsSentence,
}));
jest.mock('@/features/eds/handlers/changeDemoSourceHandler', () => ({
    handleChangeDemoSource: jest.fn(),
}));
jest.mock('@/features/eds/handlers/addSharedDemoHandler', () => ({
    handleAddSharedDemo: jest.fn(),
}));
jest.mock('@/features/eds/handlers/probeSharedDemoHandler', () => ({
    handleProbeSharedDemo: jest.fn(),
}));
jest.mock('@/features/eds/handlers/importStorefrontZipHandler', () => ({
    handleImportStorefrontZip: jest.fn(),
    refusalFor: jest.fn(),
}));
jest.mock('@/features/eds/services/storefront/zipStorefrontImport', () => ({
    ...jest.requireActual('@/features/eds/services/storefront/zipStorefrontImport'),
    readStorefrontZip: jest.fn(),
}));
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: () => ({ tokenService: { validateToken: async () => ({ valid: true, user: { login: 'steve' } }) } }),
}));
jest.mock('@/features/project-creation/services/addedDemoSettings', () => ({
    ...jest.requireActual('@/features/project-creation/services/addedDemoSettings'),
    readAddedDemos: jest.fn(),
    editAddedDemo: jest.fn(),
}));
jest.mock('@/features/ai/server/edsToolGuards', () => ({
    requireGitHub: jest.fn(),
}));

import { registerAddedDemoTools } from '@/features/ai/server/addedDemoTools';
import { requireGitHub } from '@/features/ai/server/edsToolGuards';
import { handleAddSharedDemo } from '@/features/eds/handlers/addSharedDemoHandler';
import { handleChangeDemoSource } from '@/features/eds/handlers/changeDemoSourceHandler';
import {
    countProjectsBuiltOn,
    forgetDemo,
    isDeletableZipRepository,
    projectWithStorefront,
} from '@/features/eds/handlers/forgetAddedDemoHandler';
import { handleImportStorefrontZip, refusalFor } from '@/features/eds/handlers/importStorefrontZipHandler';
import { handleProbeSharedDemo } from '@/features/eds/handlers/probeSharedDemoHandler';
import { readStorefrontZip } from '@/features/eds/services/storefront/zipStorefrontImport';
import { editAddedDemo, readAddedDemos } from '@/features/project-creation/services/addedDemoSettings';
import type { RememberedDemo } from '@/types/projectFile';
import type { SharedDemoRead } from '@/types/webviewRequests';
import { makeAddedDemo } from '../../../helpers/demoPackageFixtures';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const mockRequireGitHub = requireGitHub as jest.Mock;
const mockRead = readAddedDemos as jest.Mock;
const mockDeletable = isDeletableZipRepository as jest.Mock;
const mockStorefrontOf = projectWithStorefront as jest.Mock;
const mockCount = countProjectsBuiltOn as jest.Mock;
const mockForget = forgetDemo as jest.Mock;
const mockProbe = handleProbeSharedDemo as jest.Mock;
const mockChange = handleChangeDemoSource as jest.Mock;
const mockAdd = handleAddSharedDemo as jest.Mock;
const mockImport = handleImportStorefrontZip as jest.Mock;
const mockRefusal = refusalFor as jest.Mock;
const mockReadZip = readStorefrontZip as jest.Mock;

const JEN = makeAddedDemo();
const OWN: RememberedDemo = { ...makeAddedDemo({ name: 'Summit', source: { owner: 'steve', repo: 'isle5-demo', branch: 'main' } }), createdFromZip: true };
const READ: SharedDemoRead = {
    outcome: 'read',
    fullName: 'steve/isle5-copy',
    defaultBranch: 'main',
    isTemplate: false,
    kind: 'eds',
    contentSource: { org: 'steve', site: 'isle5-copy', indexPath: '/full-index.json' },
    contentPublished: { indexFound: true, pageCount: 3 },
    b2b: 'unknown',
    overrides: [],
    warnings: ['No description file.'],
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

const ctx = createMockHandlerContext({
    logger: createMockLogger(),
    stateManager: createMockStateManager({
        getCurrentProject: jest.fn().mockResolvedValue(createMockProject({ demo: makeAddedDemo({ name: 'Summit, as I named it' }) })),
    }),
});

beforeEach(() => {
    jest.clearAllMocks();
    mockRequireGitHub.mockResolvedValue(undefined);
    mockRead.mockReturnValue([JEN, OWN]);
    mockDeletable.mockImplementation(async (_c: unknown, source: { owner: string }) => source.owner === 'steve');
    mockStorefrontOf.mockResolvedValue(undefined);
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
        expect(res.error).not.toContain('Deleting');
        expect(mockForget).not.toHaveBeenCalled();
    });

    it('forgets on confirm, without deleting, and answers the outcome', async () => {
        const s = fakeServer();
        registerAddedDemoTools(s, () => ctx);

        const res = await s.call('forget_added_demo', { owner: 'jen', repo: 'isle5-demo', confirm: true });

        expect(mockForget).toHaveBeenCalledWith(ctx, JEN.source, false);
        expect(res).toEqual({ demo: 'Isle5 by Jen', source: JEN.source, projectsBuiltOn: 2, forgotten: true });
    });

    it('refuses deleteRepository for a demo whose repository Demo Builder did not make from a zip, in one sentence', async () => {
        const s = fakeServer();
        registerAddedDemoTools(s, () => ctx);

        const res = await s.call('forget_added_demo', { owner: 'jen', repo: 'isle5-demo', deleteRepository: true, confirm: true });

        expect(mockDeletable).toHaveBeenCalledWith(ctx, JEN.source);
        expect(res.error).toContain('jen/isle5-demo was not made from a zip file by Demo Builder in your account');
        expect(mockForget).not.toHaveBeenCalled();
    });

    it("refuses deleteRepository for a zip's repository that is a project's own storefront, without asking GitHub", async () => {
        mockStorefrontOf.mockResolvedValue('summit');
        const s = fakeServer();
        registerAddedDemoTools(s, () => ctx);

        const res = await s.call('forget_added_demo', { owner: 'steve', repo: 'isle5-demo', deleteRepository: true, confirm: true });

        expect(res.error).toContain("a project's own storefront");
        expect(mockDeletable).not.toHaveBeenCalled();
        expect(mockForget).not.toHaveBeenCalled();
    });

    it('names the cost of deleting the zip\'s repository in the refusal, then deletes on confirm', async () => {
        mockForget.mockResolvedValue({ forgotten: true, deletedRepository: true });
        const s = fakeServer();
        registerAddedDemoTools(s, () => ctx);

        const refusal = await s.call('forget_added_demo', { owner: 'steve', repo: 'isle5-demo', deleteRepository: true });
        expect(refusal.error).toContain('Deleting steve/isle5-demo leaves them without reset and updates');

        const res = await s.call('forget_added_demo', { owner: 'steve', repo: 'isle5-demo', deleteRepository: true, confirm: true });
        expect(mockForget).toHaveBeenCalledWith(ctx, OWN.source, true);
        expect(res).toMatchObject({ forgotten: true, deletedRepository: true });
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
                demo: { ...JEN, name: 'Mine', source: { owner: 'steve', repo: 'isle5-copy', branch: 'main' } },
                previous: { owner: 'jen', repo: 'isle5-demo' },
            },
        });
        const s = fakeServer();
        registerAddedDemoTools(s, () => ctx);

        const res = await s.call('change_demo_source', { owner: 'steve', repo: 'isle5-copy', updateDemoPackage: true, name: 'Mine' });

        expect(mockProbe).toHaveBeenCalledWith(ctx, { owner: 'steve', repo: 'isle5-copy' });
        expect(mockChange).toHaveBeenCalledWith(ctx, {
            demo: expect.objectContaining({
                name: 'Mine',
                source: { owner: 'steve', repo: 'isle5-copy', branch: 'main' },
                storefrontKind: 'eds',
                contentSource: { org: 'steve', site: 'isle5-copy', indexPath: '/full-index.json' },
            }),
            updateDemoPackage: true,
        });
        expect(res).toEqual({
            changed: true,
            demo: 'Mine',
            source: { owner: 'steve', repo: 'isle5-copy', branch: 'main' },
            previous: { owner: 'jen', repo: 'isle5-demo' },
            warnings: [
                'No description file.',
                'Whether this demo uses company (B2B) features could not be read; it is treated as off.',
            ],
        });
    });

    it("keeps the project's demo name across a source change unless a new one is given", async () => {
        mockProbe.mockResolvedValue({ success: true, result: READ });
        mockChange.mockResolvedValue({ success: true, result: { demo: OWN, previous: { owner: 'jen', repo: 'isle5-demo' } } });
        const s = fakeServer();
        registerAddedDemoTools(s, () => ctx);

        await s.call('change_demo_source', { owner: 'steve', repo: 'isle5-copy' });
        expect(mockChange).toHaveBeenLastCalledWith(ctx, expect.objectContaining({ demo: expect.objectContaining({ name: 'Summit, as I named it' }) }));

        await s.call('change_demo_source', { owner: 'steve', repo: 'isle5-copy', name: 'Renamed' });
        expect(mockChange).toHaveBeenLastCalledWith(ctx, expect.objectContaining({ demo: expect.objectContaining({ name: 'Renamed' }) }));
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
        expect((await s.call('change_demo_source', { owner: 'a', repo: 'b' })).error).toContain('use that package id with create_project');

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

describe('add_shared_demo', () => {
    const NOT_MINE: SharedDemoRead = { ...READ, fullName: 'jen/isle5-demo' };

    beforeEach(() => {
        mockAdd.mockResolvedValue({ success: true, result: { demo: JEN } });
    });

    it('adds from a link with no confirm and nothing created on GitHub, answering the id create_project takes', async () => {
        mockProbe.mockResolvedValue({ success: true, result: NOT_MINE });
        mockAdd.mockResolvedValue({ success: true, result: { demo: JEN } });
        const s = fakeServer();
        registerAddedDemoTools(s, () => ctx);

        const res = await s.call('add_shared_demo', { link: 'https://github.com/jen/isle5-demo', description: 'Luxury B2C demo' });

        expect(mockProbe).toHaveBeenCalledWith(ctx, { owner: undefined, repo: undefined, link: 'https://github.com/jen/isle5-demo' });
        // No description file in the read: the name is the repository's, spelled for people.
        // The agent can give the card a description, as the dialog's field does.
        expect(mockAdd).toHaveBeenCalledWith(ctx, {
            demo: expect.objectContaining({ name: 'Isle5 Demo', description: 'Luxury B2C demo' }),
        });
        expect(mockAdd.mock.calls[0][1].demo).not.toHaveProperty('createdFromZip');
        expect(mockImport).not.toHaveBeenCalled();
        expect(res).toMatchObject({ added: true, id: 'added:jen/isle5-demo', source: JEN.source, storefrontKind: 'eds' });
    });

    it('points a shipped template at its package id instead of adding it', async () => {
        mockProbe.mockResolvedValue({ success: true, result: { outcome: 'shipped', shippedPackageId: 'starter', fullName: 'a/b' } });
        const s = fakeServer();
        registerAddedDemoTools(s, () => ctx);

        const res = await s.call('add_shared_demo', { owner: 'a', repo: 'b' });

        expect(res).toMatchObject({ shippedPackageId: 'starter' });
        expect(res.error).toContain('use that package id with create_project');
        expect(mockAdd).not.toHaveBeenCalled();
    });
});

describe('add_shared_demo from a zip file', () => {
    const MINE: SharedDemoRead = { ...READ, fullName: 'steve/summit' };

    beforeEach(() => {
        mockReadZip.mockReturnValue({ files: new Map([['head.html', Buffer.from('x')]]), rootName: 'summit-main', dropped: 4 });
        mockRefusal.mockResolvedValue(undefined);
        mockImport.mockResolvedValue({ success: true, result: { owner: 'steve', repo: 'summit', fullName: 'steve/summit', fileCount: 1, dropped: 4, isPrivate: true } });
        mockProbe.mockResolvedValue({ success: true, result: MINE });
        mockAdd.mockResolvedValue({ success: true, result: { demo: { ...JEN, source: { owner: 'steve', repo: 'summit', branch: 'main' } } } });
    });

    it('refuses without confirm, naming the repository it would create, the account and the file counts, and creates nothing', async () => {
        const s = fakeServer();
        registerAddedDemoTools(s, () => ctx);

        const res = await s.call('add_shared_demo', { zipPath: '/tmp/summit-main.zip' });

        expect(res.error).toContain('would create the public repository summit in your GitHub account (steve) from /tmp/summit-main.zip (1 files; 4 entries');
        expect(res).toMatchObject({ repoName: 'summit', fileCount: 1, dropped: 4, wouldCreate: 'summit', setupIncluded: false });
        expect(mockImport).not.toHaveBeenCalled();
        expect(mockAdd).not.toHaveBeenCalled();
    });

    it('refuses a zip that is not a storefront before asking to confirm', async () => {
        mockRefusal.mockResolvedValue('This zip is not an Edge Delivery storefront: it has no head.html.');
        const s = fakeServer();
        registerAddedDemoTools(s, () => ctx);
        expect(await s.call('add_shared_demo', { zipPath: '/tmp/notes.zip', confirm: true })).toEqual({
            error: 'This zip is not an Edge Delivery storefront: it has no head.html.',
        });
        expect(mockImport).not.toHaveBeenCalled();
    });

    it('creates the repository on confirm with the given name and visibility, probes it, and adds the card recorded as made from the zip', async () => {
        const s = fakeServer();
        registerAddedDemoTools(s, () => ctx);

        const res = await s.call('add_shared_demo', { zipPath: '/tmp/summit-main.zip', repoName: 'summit-demo', confirm: true });

        expect(mockImport).toHaveBeenCalledWith(ctx, { zipPath: '/tmp/summit-main.zip', repoName: 'summit-demo', isPrivate: false });
        expect(mockProbe).toHaveBeenCalledWith(ctx, { owner: 'steve', repo: 'summit', link: undefined });
        expect(mockAdd).toHaveBeenCalledWith(ctx, {
            demo: expect.objectContaining({ source: { owner: 'steve', repo: 'summit', branch: 'main' }, createdFromZip: true }),
        });
        expect(res).toMatchObject({ added: true, createdFromZip: 'steve/summit', fileCount: 1, dropped: 4, setupIncluded: false });
        expect(res.setupHint).toBeUndefined();
    });

    it('says when the bundle also carries setup, and where to use it', async () => {
        mockReadZip.mockReturnValue({ files: new Map([['head.html', Buffer.from('x')]]), rootName: 'bodea-demo-bundle', dropped: 0, setup: { version: 1 } });
        const s = fakeServer();
        registerAddedDemoTools(s, () => ctx);
        const res = await s.call('add_shared_demo', { zipPath: '/tmp/bodea-demo-bundle.zip', confirm: true });
        expect(res).toMatchObject({ setupIncluded: true, setupHint: expect.stringContaining('Import the bundle from the projects list') });
    });
});

describe('edit_added_demo', () => {
    const mockEditDemo = editAddedDemo as jest.Mock;

    it('renames and re-describes the card on the same handler the Welcome step uses, with no confirm', async () => {
        const s = fakeServer();
        registerAddedDemoTools(s, () => ctx);
        mockEditDemo.mockResolvedValue({ ...JEN, name: 'Isle5 luxury', description: 'New words' });

        const res = await s.call('edit_added_demo', { owner: 'jen', repo: 'isle5-demo', name: 'Isle5 luxury', description: 'New words' });

        expect(mockEditDemo).toHaveBeenCalledWith({ owner: 'jen', repo: 'isle5-demo' }, { name: 'Isle5 luxury', description: 'New words' });
        expect(res).toStrictEqual({ edited: true, id: 'added:jen/isle5-demo', name: 'Isle5 luxury', description: 'New words' });
    });

    it('keeps what is not given: an omitted name or description stays as it was', async () => {
        const s = fakeServer();
        registerAddedDemoTools(s, () => ctx);
        mockRead.mockReturnValue([{ ...JEN, description: 'Kept words' }]);
        mockEditDemo.mockResolvedValue({ ...JEN, name: 'Renamed', description: 'Kept words' });

        await s.call('edit_added_demo', { owner: 'jen', repo: 'isle5-demo', name: 'Renamed' });

        expect(mockEditDemo).toHaveBeenCalledWith({ owner: 'jen', repo: 'isle5-demo' }, { name: 'Renamed', description: 'Kept words' });
    });

    it('answers the refusal when the demo is not on the Welcome step', async () => {
        const s = fakeServer();
        registerAddedDemoTools(s, () => ctx);
        mockRead.mockReturnValue([]);

        const res = await s.call('edit_added_demo', { owner: 'nobody', repo: 'nothing', name: 'X' });

        expect(res).toStrictEqual({ error: 'nobody/nothing is not on your Welcome step.' });
        expect(mockEditDemo).not.toHaveBeenCalled();
    });
});
