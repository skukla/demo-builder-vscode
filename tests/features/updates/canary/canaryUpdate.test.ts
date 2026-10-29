/**
 * The canary update (EDS-49 step B): the patch canary takes the update an SC's project
 * takes, through the extension's own TemplateSyncService. Its project record is built
 * from the bundled demo-package catalog, so these read the REAL catalog: a canary whose
 * package stopped being thin-layer must fail loudly, not quietly update like a fork.
 */

const mockSyncWithTemplate = jest.fn();
const mockServiceCtor = jest.fn();
jest.mock('@/features/updates/services/templateSyncService', () => ({
    TemplateSyncService: jest.fn().mockImplementation((...args: unknown[]) => {
        mockServiceCtor(...args);
        return { syncWithTemplate: (...a: unknown[]) => mockSyncWithTemplate(...a) };
    }),
}));

import { canaryProject, runCanaryUpdate, type CanaryInputs } from '@/features/updates/canary/canaryUpdate';
import { githubAccessFor } from '../../../helpers/githubAccessFake';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';

const INPUTS: CanaryInputs = {
    repo: 'skukla/patch-canary-b2b',
    packageId: 'starter',
    stackId: 'eds-accs',
    daLiveOrg: 'skukla',
    daLiveSite: 'patch-canary-b2b',
    lastSynced: '48bed04d072fff094b49a46709b351bd719b287a',
};

describe('canaryProject', () => {
    it('records what an SC project of the same package and stack records, on the canary repository', () => {
        const project = canaryProject(INPUTS);

        expect(project.selectedPackage).toBe('starter');
        expect(project.selectedStack).toBe('eds-accs');
        expect(project.componentInstances?.['eds-storefront']?.metadata).toEqual({
            githubRepo: 'skukla/patch-canary-b2b',
            templateOwner: 'adobe-commerce',
            templateRepo: 'boilerplate-b2b-template',
            lastSyncedCommit: INPUTS.lastSynced,
            lkgSource: { owner: 'skukla', repo: 'eds-demo-patches', lkgFile: 'b2b/last-known-good' },
            daLiveOrg: 'skukla',
            daLiveSite: 'patch-canary-b2b',
        });
    });

    it('refuses a package and stack that is not thin-layer, rather than update it like a fork', () => {
        // isle5 is a forked storefront: no patch source, so no tested version to go to.
        expect(() => canaryProject({ ...INPUTS, packageId: 'isle5' })).toThrow(/not a thin-layer storefront/);
    });
});

describe('runCanaryUpdate', () => {
    beforeEach(() => jest.clearAllMocks());

    it('runs the merge an SC update runs, with the GitHub access, logger and git it is given', async () => {
        const logger = createMockLogger();
        const github = githubAccessFor(createMockSecretStorage().secrets, logger);
        const executor = createMockCommandExecutor();
        mockSyncWithTemplate.mockResolvedValue({ success: true, strategy: 'merge', syncedCommit: 'abc' });

        const result = await runCanaryUpdate(INPUTS, { github, logger, executor });

        expect(mockServiceCtor).toHaveBeenCalledWith(github, logger, executor);
        // The same record canaryProject builds; its two timestamps are "now".
        const { created: _c, lastModified: _l, ...expected } = canaryProject(INPUTS);
        expect(mockSyncWithTemplate).toHaveBeenCalledWith(expect.objectContaining(expected), { strategy: 'merge' });
        expect(result.syncedCommit).toBe('abc');
    });
});
