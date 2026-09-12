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
        resetToTemplate: jest.fn().mockResolvedValue({ commitSha: 'abc' }),
        getRepository: jest.fn().mockResolvedValue({ isTemplate, defaultBranch, fullName: 'jen/isle5-demo' }),
    };
}

describe('createRepoFromSource', () => {
    it('generates from a shipped template without asking GitHub about it', async () => {
        const ops = repoOps(false);
        await createRepoFromSource(ops, { newRepoName: 'new-demo', isPrivate: false, namespace: 'steve', fromAddedDemo: false }, 'adobe-commerce', 'boilerplate-b2b-template', createMockLogger());
        expect(ops.getRepository).not.toHaveBeenCalled();
        expect(ops.createFromTemplate).toHaveBeenCalledWith('adobe-commerce', 'boilerplate-b2b-template', 'new-demo', false, 'steve');
        expect(ops.createEmptyRepository).not.toHaveBeenCalled();
    });

    it("generates from an added demo's source when GitHub flags it as a template", async () => {
        const ops = repoOps(true);
        await createRepoFromSource(ops, { newRepoName: 'new-demo', isPrivate: true, fromAddedDemo: true }, 'jen', 'isle5-demo', createMockLogger());
        expect(ops.getRepository).toHaveBeenCalledWith('jen', 'isle5-demo');
        expect(ops.createFromTemplate).toHaveBeenCalledWith('jen', 'isle5-demo', 'new-demo', true, undefined);
        expect(ops.resetToTemplate).not.toHaveBeenCalled();
    });

    it('creates an empty repository and resets it onto the source, on its branch, when it is not a template', async () => {
        const ops = repoOps(false, 'demo');
        const created = await createRepoFromSource(ops, { newRepoName: 'new-demo', isPrivate: false, namespace: 'steve', fromAddedDemo: true }, 'jen', 'isle5-demo', createMockLogger());
        expect(ops.createFromTemplate).not.toHaveBeenCalled();
        expect(ops.createEmptyRepository).toHaveBeenCalledWith('new-demo', false, 'steve');
        expect(ops.resetToTemplate).toHaveBeenCalledWith('steve', 'new-demo', 'jen', 'isle5-demo', 'main', 'chore: start from the demo', 'demo');
        expect(created).toBe(EMPTY);
    });
});
