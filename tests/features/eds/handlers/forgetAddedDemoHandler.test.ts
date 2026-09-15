/**
 * forget-added-demo: confirm host-side naming the projects built on the demo,
 * remove the row, and delete the repository the extension made from a zip only
 * when that is what the remembered card says, it still exists, it is the SC's
 * own, and they confirm twice.
 */

import * as vscode from 'vscode';
import { handleForgetAddedDemo } from '@/features/eds/handlers/forgetAddedDemoHandler';
import { forgetAddedDemo } from '@/features/project-creation/services/addedDemoSettings';
import type { RememberedDemo } from '@/types/projectFile';
import { makeAddedDemo } from '../../../helpers/demoPackageFixtures';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const deleteRepository = jest.fn();
const getRepository = jest.fn();
const validateToken = jest.fn();
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: () => ({ tokenService: { validateToken }, repoOperations: { deleteRepository, getRepository } }),
}));

let mockRemembered: RememberedDemo[] = [];
jest.mock('@/features/project-creation/services/addedDemoSettings', () => ({
    ...jest.requireActual('@/features/project-creation/services/addedDemoSettings'),
    forgetAddedDemo: jest.fn(async () => []),
    readAddedDemos: jest.fn(() => mockRemembered),
}));

const JEN = makeAddedDemo();
const OWN = makeAddedDemo({ source: { owner: 'steve', repo: 'isle5-demo', branch: 'main' } });
/** The same repository, remembered as made from a zip: the one card Remove offers to delete. */
const ZIP: RememberedDemo = { ...OWN, createdFromZip: true };
const ZIP_REQUEST = { name: ZIP.name, source: ZIP.source };
const REQUEST = { name: JEN.name, source: JEN.source };
const warn = vscode.window.showWarningMessage as jest.Mock;

function ctx(projectsBuiltOnJen = 0) {
    const projects = [
        ...Array.from({ length: projectsBuiltOnJen }, (_, i) =>
            createMockProject({ name: `p${i}`, path: `/p${i}`, demo: JEN }),
        ),
        createMockProject({ name: 'other', path: '/other', demo: OWN }),
        createMockProject({ name: 'shipped', path: '/shipped' }),
    ];
    return createMockHandlerContext({
        logger: createMockLogger(),
        context: createMockExtensionContext({ secrets: createMockSecretStorage().secrets }),
        stateManager: createMockStateManager({
            getAllProjects: jest.fn().mockResolvedValue(
                projects.map((p) => ({ name: p.name, path: p.path, lastModified: new Date(0) })),
            ),
            loadProjectFromPath: jest.fn(async (path: string) => projects.find((p) => p.path === path) ?? null),
        }),
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    validateToken.mockResolvedValue({ valid: true, user: { login: 'steve' } });
    getRepository.mockResolvedValue({ fullName: 'steve/isle5-demo' });
    deleteRepository.mockResolvedValue(undefined);
    mockRemembered = [JEN, ZIP];
});

describe('handleForgetAddedDemo', () => {
    it('confirms with the count of projects on this computer built on the demo, then forgets', async () => {
        warn.mockResolvedValueOnce('Remove');

        const result = await handleForgetAddedDemo(ctx(2), REQUEST);

        expect(warn).toHaveBeenCalledWith(
            'Remove "Isle5 by Jen" from your Welcome step?',
            { modal: true, detail: '2 projects on this computer were built on it and will keep working.' },
            'Remove',
        );
        expect(forgetAddedDemo).toHaveBeenCalledWith(JEN.source);
        expect(result).toEqual({ success: true, result: { forgotten: true } });
    });

    it('says when no project was built on it, and never offers a delete for a repository that is not the SC\'s', async () => {
        warn.mockResolvedValueOnce('Remove');

        await handleForgetAddedDemo(ctx(0), REQUEST);

        expect(warn.mock.calls[0][1]).toEqual({
            modal: true,
            detail: 'No project on this computer was built on it.',
        });
        expect(warn.mock.calls[0].slice(2)).toEqual(['Remove']);
    });

    it('does nothing when the confirmation is dismissed', async () => {
        warn.mockResolvedValueOnce(undefined);

        const result = await handleForgetAddedDemo(ctx(1), REQUEST);

        expect(result).toEqual({ success: true, result: { forgotten: false } });
        expect(forgetAddedDemo).not.toHaveBeenCalled();
    });

    it('offers to delete the repository made from the zip, names what that costs, and deletes only after a second confirmation', async () => {
        warn.mockResolvedValueOnce('Remove and delete the repository').mockResolvedValueOnce('Delete repository');

        const result = await handleForgetAddedDemo(ctx(), ZIP_REQUEST);

        expect(warn).toHaveBeenNthCalledWith(
            1,
            'Remove "Isle5 by Jen" from your Welcome step?',
            {
                modal: true,
                detail:
                    '1 project on this computer was built on it and will keep working. ' +
                    'Deleting steve/isle5-demo, the repository made from its zip file, would leave them without reset and updates until they are pointed at another source.',
            },
            'Remove',
            'Remove and delete the repository',
        );
        expect(warn).toHaveBeenNthCalledWith(
            2,
            'Delete steve/isle5-demo from GitHub? This cannot be undone.',
            { modal: true },
            'Delete repository',
        );
        expect(forgetAddedDemo).toHaveBeenCalledWith(ZIP.source);
        expect(deleteRepository).toHaveBeenCalledWith('steve', 'isle5-demo');
        expect(result).toEqual({ success: true, result: { forgotten: true, deletedRepository: true } });
    });

    it('forgets but keeps the repository when the second confirmation is dismissed', async () => {
        warn.mockResolvedValueOnce('Remove and delete the repository').mockResolvedValueOnce(undefined);

        const result = await handleForgetAddedDemo(ctx(), ZIP_REQUEST);

        expect(deleteRepository).not.toHaveBeenCalled();
        expect(result).toEqual({ success: true, result: { forgotten: true, deletedRepository: false } });
    });

    it.each([
        ['the card was not made from a zip, even though the repository is the SC\'s own', () => { mockRemembered = [OWN]; }],
        ['the repository is already gone', () => { getRepository.mockRejectedValue(new Error('Repository not found')); }],
        ['someone else is signed in to GitHub', () => { validateToken.mockResolvedValue({ valid: true, user: { login: 'jen' } }); }],
        ['nobody is signed in to GitHub', () => { validateToken.mockResolvedValue({ valid: false }); }],
    ])('offers only Remove when %s', async (_why, arrange) => {
        arrange();
        warn.mockResolvedValueOnce('Remove');

        const result = await handleForgetAddedDemo(ctx(), ZIP_REQUEST);

        expect(warn.mock.calls[0].slice(2)).toEqual(['Remove']);
        expect(deleteRepository).not.toHaveBeenCalled();
        expect(result).toEqual({ success: true, result: { forgotten: true } });
    });

    it('reports a delete GitHub refused without undoing the forget', async () => {
        warn.mockResolvedValueOnce('Remove and delete the repository').mockResolvedValueOnce('Delete repository');
        deleteRepository.mockRejectedValueOnce(new Error('403'));

        const result = await handleForgetAddedDemo(ctx(), ZIP_REQUEST);

        expect(result).toEqual({ success: true, result: { forgotten: true, deletedRepository: false } });
        expect(warn).toHaveBeenLastCalledWith(
            'The demo was forgotten, but steve/isle5-demo could not be deleted: 403',
        );
    });

    it('refuses a request without a name and source, and a malformed repository name', async () => {
        expect(await handleForgetAddedDemo(ctx(), { source: JEN.source })).toEqual({
            success: false,
            error: 'A demo name and source are required',
        });
        const bad = await handleForgetAddedDemo(ctx(), { name: 'x', source: { owner: 'jen', repo: '../x' } });
        expect(bad.success).toBe(false);
        expect(warn).not.toHaveBeenCalled();
    });

    it("never offers to delete a repository that is one of this computer's own storefronts, and says whose it is", async () => {
        const context = ctx();
        const projects = await (context.stateManager.getAllProjects as jest.Mock)();
        const own = createMockProject({
            name: 'bodea',
            path: '/bodea',
            selectedStack: 'eds-accs',
            componentInstances: {
                'eds-storefront': { id: 'eds-storefront', name: 'EDS Storefront', type: 'frontend', status: 'ready', metadata: { githubRepo: 'steve/isle5-demo', daLiveOrg: 'steve' } },
            },
        });
        (context.stateManager.getAllProjects as jest.Mock).mockResolvedValue([...projects, { name: 'bodea', path: '/bodea', lastModified: new Date(0) }]);
        const load = context.stateManager.loadProjectFromPath as jest.Mock;
        const before = load.getMockImplementation();
        load.mockImplementation(async (p: string) => (p === '/bodea' ? own : before?.(p)));
        warn.mockResolvedValueOnce('Remove');

        const result = await handleForgetAddedDemo(context, ZIP_REQUEST);

        expect(warn.mock.calls[0][1]).toEqual({ modal: true, detail: 'steve/isle5-demo is the storefront of your project "bodea"; the card goes, the project and its repository stay.' });
        expect(warn.mock.calls[0].slice(2)).toEqual(['Remove']);
        expect(deleteRepository).not.toHaveBeenCalled();
        expect(result).toEqual({ success: true, result: { forgotten: true } });
    });
});
