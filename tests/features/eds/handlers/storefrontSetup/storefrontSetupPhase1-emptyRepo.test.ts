/**
 * Phase 1 adopts an EMPTY existing repository (EDS-17).
 *
 * An SC who cannot create repositories in their organization asks an owner for an
 * empty one. The step already reads such a repo as `empty` and promises "it will be
 * set up from the template" — but nothing reset it, and the reset clones
 * `--branch main`, which a repository with no commits does not have. So setup
 * writes one first commit (GitHub's contents API accepts that on an empty
 * repository and creates its default branch), then runs the same template reset a
 * not-a-storefront repo gets, then checks the App — in that order.
 *
 * The classifier is the REAL one (`classifyRepoForStorefront`), driven through a
 * fake file reader answering GitHub's own "This repository is empty." message, so
 * the step and setup cannot disagree about what "empty" means.
 */

import { executePhaseGitHubRepo } from '@/features/eds/handlers/storefrontSetup/storefrontSetupPhase1';
import type { StorefrontSetupStartPayload } from '@/features/eds/handlers/storefrontSetup/storefrontSetupHandlers';
import type { SetupServices } from '@/features/eds/handlers/storefrontSetup/storefrontSetupTypes';

jest.mock('@/features/eds/services/appInstallationResolver', () => ({
    ...jest.requireActual('@/features/eds/services/appInstallationResolver'),
    resolveAppInstallation: jest.fn(),
}));
import { resolveAppInstallation } from '@/features/eds/services/appInstallationResolver';
import { makeContext, TEMPLATE } from './storefrontSetupPhase1.testUtils';

const mockResolve = resolveAppInstallation as jest.Mock;
let callOrder: string[];

function makeServices(repoIsEmpty: boolean): SetupServices {
    return {
        githubFileOps: {
            getFileContent: jest.fn().mockImplementation(async () => {
                if (repoIsEmpty) throw new Error('This repository is empty.');
                return { content: 'x', sha: 's' };
            }),
            createOrUpdateFile: jest.fn().mockImplementation(async () => {
                callOrder.push('firstCommit');
                return { sha: 'f', commitSha: 'c' };
            }),
        },
        githubRepoOps: {},
        templateSync: {
            resetRepository: jest.fn().mockImplementation(async () => {
                callOrder.push('resetToTemplate');
                return { success: true, strategy: 'reset', syncedCommit: 'abc1234' };
            }),
        },
        githubAppService: {
            getInstallUrl: jest.fn().mockReturnValue('https://github.com/apps/aem-code-sync'),
            isAppInstalled: jest.fn().mockResolvedValue({ isInstalled: true, codeStatus: 200 }),
        },
    } as unknown as SetupServices;
}

/** The SC picked an existing repo and did NOT tick reset — the step never sets it for an empty repo. */
const ADOPTED = {
    repoMode: 'existing',
    existingRepo: 'acme-corp/storefront',
    resetToTemplate: false,
} as unknown as StorefrontSetupStartPayload['edsConfig'];

function run(services: SetupServices) {
    return executePhaseGitHubRepo(
        makeContext(),
        ADOPTED,
        services,
        { repoOwner: '', repoName: '', repoUrl: '' },
        new AbortController().signal,
        TEMPLATE.owner,
        TEMPLATE.repo,
    );
}

beforeEach(() => {
    jest.clearAllMocks();
    callOrder = [];
    mockResolve.mockImplementation(async () => {
        callOrder.push('appCheck');
        return { kind: 'installed', codeStatus: 200 };
    });
});

describe('an empty repository', () => {
    it('gets a first commit, then the template, then the App check', async () => {
        const result = await run(makeServices(true));
        expect(result).toBeNull();
        expect(callOrder).toEqual(['firstCommit', 'resetToTemplate', 'appCheck']);
    });

    it('writes the first commit to the adopted repo with no sha (a create, onto the default branch)', async () => {
        const services = makeServices(true);
        await run(services);
        const [owner, repo, path, , , sha] = (services.githubFileOps.createOrUpdateFile as jest.Mock).mock.calls[0];
        expect([owner, repo, path, sha]).toEqual(['acme-corp', 'storefront', 'README.md', undefined]);
    });

    it('resets onto the template named by the run', async () => {
        const services = makeServices(true);
        await run(services);
        expect(services.templateSync.resetRepository).toHaveBeenCalledWith(
            expect.objectContaining({
                repoOwner: 'acme-corp',
                repoName: 'storefront',
                templateOwner: TEMPLATE.owner,
                templateRepo: TEMPLATE.repo,
            }),
        );
    });
});

describe('a repository that already has content', () => {
    it('is left exactly as the SC chose: no first commit, no reset', async () => {
        const services = makeServices(false);
        await run(services);
        expect(services.githubFileOps.createOrUpdateFile).not.toHaveBeenCalled();
        expect(services.templateSync.resetRepository).not.toHaveBeenCalled();
        expect(callOrder).toEqual(['appCheck']);
    });
});
