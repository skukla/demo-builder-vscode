/**
 * Creating the new repository from its source: `generate` for a shipped
 * template and for an added demo whose source is flagged; otherwise an empty
 * repository reset onto the source, on the source's own branch.
 */

import { createRepoFromSource } from '@/features/eds/handlers/storefrontSetup/storefrontSetupPhase1';
import { createMockLogger } from '../../../../helpers/loggerFake';

jest.mock('@/features/eds/services/appInstallationResolver', () => ({
    ...jest.requireActual('@/features/eds/services/appInstallationResolver'),
    resolveAppInstallation: jest.fn(),
}));

const GENERATED = { fullName: 'steve/new-demo', defaultBranch: 'main' };
const EMPTY = { fullName: 'steve/new-demo', defaultBranch: 'main' };

function repoOps(isTemplate: boolean, defaultBranch = 'main') {
    return {
        createFromTemplate: jest.fn().mockResolvedValue(GENERATED),
        createEmptyRepository: jest.fn().mockResolvedValue(EMPTY),
        getRepository: jest.fn().mockResolvedValue({ isTemplate, defaultBranch, fullName: 'jen/isle5-demo' }),
    };
}

function templateSync(result: { success: boolean; error?: string } = { success: true }) {
    return {
        resetRepository: jest.fn().mockResolvedValue({ strategy: 'reset', syncedCommit: 'abc', ...result }),
    };
}

describe('createRepoFromSource', () => {
    it('generates from a shipped template without asking GitHub about it', async () => {
        const ops = repoOps(false);
        await createRepoFromSource({ repoOps: ops, templateSync: templateSync() }, { newRepoName: 'new-demo', isPrivate: false, namespace: 'steve', fromAddedDemo: false }, 'adobe-commerce', 'boilerplate-b2b-template', createMockLogger());
        expect(ops.getRepository).not.toHaveBeenCalled();
        expect(ops.createFromTemplate).toHaveBeenCalledWith('adobe-commerce', 'boilerplate-b2b-template', 'new-demo', false, 'steve');
        expect(ops.createEmptyRepository).not.toHaveBeenCalled();
    });

    it("generates from an added demo's source when GitHub flags it as a template", async () => {
        const ops = repoOps(true);
        const sync = templateSync();
        await createRepoFromSource({ repoOps: ops, templateSync: sync }, { newRepoName: 'new-demo', isPrivate: true, fromAddedDemo: true }, 'jen', 'isle5-demo', createMockLogger());
        expect(ops.getRepository).toHaveBeenCalledWith('jen', 'isle5-demo');
        expect(ops.createFromTemplate).toHaveBeenCalledWith('jen', 'isle5-demo', 'new-demo', true, undefined);
        expect(sync.resetRepository).not.toHaveBeenCalled();
    });

    it('creates an empty repository and resets it onto the source, on its branch, when it is not a template', async () => {
        const ops = repoOps(false, 'demo');
        const sync = templateSync();
        const created = await createRepoFromSource({ repoOps: ops, templateSync: sync }, { newRepoName: 'new-demo', isPrivate: false, namespace: 'steve', fromAddedDemo: true }, 'jen', 'isle5-demo', createMockLogger());
        expect(ops.createFromTemplate).not.toHaveBeenCalled();
        expect(ops.createEmptyRepository).toHaveBeenCalledWith('new-demo', false, 'steve');
        expect(sync.resetRepository).toHaveBeenCalledWith(
            {
                repoOwner: 'steve',
                repoName: 'new-demo',
                templateOwner: 'jen',
                templateRepo: 'isle5-demo',
                repoBranch: 'main',
                templateBranch: 'demo',
            },
            [],
            'chore: start from the demo',
        );
        expect(created).toBe(EMPTY);
    });

    it("stops with the reset's own message when resetting the new repository fails", async () => {
        const sync = templateSync({ success: false, error: 'Could not push the update to GitHub. See Debug Logs for details.' });
        await expect(
            createRepoFromSource({ repoOps: repoOps(false), templateSync: sync }, { newRepoName: 'new-demo', isPrivate: false, fromAddedDemo: true }, 'jen', 'isle5-demo', createMockLogger()),
        ).rejects.toThrow('Could not push the update to GitHub. See Debug Logs for details.');
    });
});
