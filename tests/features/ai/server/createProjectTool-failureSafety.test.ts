/**
 * create_project never destroys what it did not build, and undoes what it did.
 *
 * Creation's first step removes whatever folder already has the new project's
 * name. The wizard refused a taken or unsafe name before that; the agent door did
 * not, so an agent reusing a name deleted that project (AI-73, 2026-10-16). And a
 * failed agent creation left its half-built project behind where the wizard's
 * cleans up (owner, 2026-10-16: "the way the wizard does"). Mocks are owned by
 * `createProjectTool.testUtils.ts`, which fakes the cleanup: the real one deletes
 * a folder under the real home directory.
 */

import { onWorkChanged, runningWork } from '@/core/state/projectWorkRunning';
import { creationPath } from '@/features/project-creation/handlers/executorPreflight';
import {
    EDS,
    HEADLESS,
    cleanupFailedCreation,
    defaultStorefrontSetup,
    executeProjectCreation,
    projectsOnDisk,
    storefrontSetup,
    toolServer,
} from './createProjectTool.testUtils';

describe('create_project — a name it may not use', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        defaultStorefrontSetup();
    });

    afterEach(() => {
        projectsOnDisk.length = 0;
    });

    it('refuses the name of a project that already exists, building nothing', async () => {
        projectsOnDisk.push({
            name: HEADLESS.projectName,
            path: `/projects/${HEADLESS.projectName}`,
            lastModified: new Date(0),
        });

        const res = await toolServer().call(HEADLESS);

        expect(res).toMatchObject({ created: false });
        expect(res.error).toContain(`Project "${HEADLESS.projectName}" already exists`);
        expect(executeProjectCreation).not.toHaveBeenCalled();
        expect(cleanupFailedCreation).not.toHaveBeenCalled();
    });

    it('refuses it before a storefront is provisioned', async () => {
        projectsOnDisk.push({
            name: EDS.projectName,
            path: `/projects/${EDS.projectName}`,
            lastModified: new Date(0),
        });

        await toolServer().call(EDS);

        expect(storefrontSetup).not.toHaveBeenCalled();
    });

    it.each([['../outside'], ['a/b'], ['with space']])(
        'refuses the unsafe name %p, building nothing',
        async (projectName) => {
            const res = await toolServer().call({ ...HEADLESS, projectName });

            expect(res.error).toMatch(/^Invalid project name: /);
            expect(executeProjectCreation).not.toHaveBeenCalled();
        },
    );
});

describe('create_project — a creation that fails is cleaned up', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        defaultStorefrontSetup();
    });

    it('hands the failed creation, and its own config, to the cleanup (no storefront)', async () => {
        (executeProjectCreation as jest.Mock).mockRejectedValueOnce(new Error('disk full'));

        const res = await toolServer().call(HEADLESS);

        expect(res).toMatchObject({ created: false, error: 'disk full' });
        const [ranWith, config] = (executeProjectCreation as jest.Mock).mock.calls[0];
        expect(cleanupFailedCreation).toHaveBeenCalledWith(ranWith, config);
    });

    it('does the same after a storefront creation fails', async () => {
        (executeProjectCreation as jest.Mock).mockRejectedValueOnce(new Error('disk full'));

        await toolServer().call(EDS);

        const [ranWith, config] = (executeProjectCreation as jest.Mock).mock.calls[0];
        expect(cleanupFailedCreation).toHaveBeenCalledWith(ranWith, config);
    });

    it('cleans up nothing after a creation that worked', async () => {
        await toolServer().call(HEADLESS);

        expect(executeProjectCreation).toHaveBeenCalled();
        expect(cleanupFailedCreation).not.toHaveBeenCalled();
    });
});

describe('create_project — the projects list sees the creation from its start (PL-82)', () => {
    const pathOf = (name: string) => creationPath({ projectName: name });

    beforeEach(() => {
        jest.clearAllMocks();
        defaultStorefrontSetup();
    });

    it('lists an Edge Delivery creation as running while its storefront is set up, before any project file', async () => {
        let duringStorefront = false;
        storefrontSetup.mockImplementationOnce(async (ctx) => {
            duringStorefront = runningWork(pathOf(EDS.projectName)) === 'creating';
            await ctx.sendMessage('storefront-setup-complete', { githubRepo: 'https://github.com/o/r' });
            return { success: true };
        });

        await toolServer().call(EDS);

        expect(duringStorefront).toBe(true);
        expect(runningWork(pathOf(EDS.projectName)) === 'creating').toBe(false);
    });

    it('unlists a creation that fails', async () => {
        (executeProjectCreation as jest.Mock).mockRejectedValueOnce(new Error('disk full'));

        await toolServer().call(HEADLESS);

        expect(runningWork(pathOf(HEADLESS.projectName)) === 'creating').toBe(false);
    });

    it('never lists a name it refused', async () => {
        const heard = jest.fn();
        const subscription = onWorkChanged(heard);

        await toolServer().call({ ...HEADLESS, projectName: '../outside' });

        subscription.dispose();
        expect(heard).not.toHaveBeenCalled();
    });
});
