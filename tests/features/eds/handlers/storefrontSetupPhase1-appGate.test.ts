/**
 * Phase 1 existing-repo AEM Code Sync gate — ordering enforcement.
 *
 * The gate used to live in Phase 2 (progress 28). By the time it ran, Phase 1
 * had already executed `resetToTemplate` (progress 6) and Phase 2 had pushed
 * fstab.yaml, installed block collections, and vendored the smart-404 and
 * Quick Edit scripts. A user whose repo lacked the App had it rewritten and was
 * only then told setup could not continue.
 *
 * It now runs in Phase 1, between resolving the repo and the first write. These
 * tests assert the ORDER, not merely that a check happens — a gate that fires
 * after the reset is the bug, and would pass any test that only counts calls.
 *
 * The existing-repo branch had no Phase 1 coverage before this file, despite
 * `storefrontSetupPhase1-pin.test.ts`'s docblock naming it.
 */

import { executePhaseGitHubRepo } from '@/features/eds/handlers/storefrontSetupPhase1';
import type { StorefrontSetupStartPayload } from '@/features/eds/handlers/storefrontSetupHandlers';
import type { RepoInfo, SetupServices } from '@/features/eds/handlers/storefrontSetupTypes';
import type { HandlerContext } from '@/types/handlers';

jest.mock('@/features/eds/services/lkgPinHelper', () => ({
    pinRepoToLkg: jest.fn().mockResolvedValue(true),
}));
import { pinRepoToLkg } from '@/features/eds/services/lkgPinHelper';

// Mock the resolver, not the helper that wraps it — that keeps
// `checkGitHubAppForExistingRepo` and its Phase 1 call site under test.
jest.mock('@/features/eds/services/appInstallationResolver', () => ({
    ...jest.requireActual('@/features/eds/services/appInstallationResolver'),
    resolveAppInstallation: jest.fn(),
}));
import { resolveAppInstallation } from '@/features/eds/services/appInstallationResolver';

const mockPin = pinRepoToLkg as jest.Mock;
const mockResolve = resolveAppInstallation as jest.Mock;

/** Records the order of the operations whose sequence is the thing under test. */
let callOrder: string[];

function makeContext(): HandlerContext {
    return {
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        sendMessage: jest.fn().mockResolvedValue(undefined),
        context: { secrets: {}, globalState: { get: jest.fn(), update: jest.fn() } },
    } as unknown as HandlerContext;
}

function makeServices(): SetupServices {
    return {
        githubFileOps: {},
        githubRepoOps: {
            resetToTemplate: jest.fn().mockImplementation(async () => {
                callOrder.push('resetToTemplate');
            }),
        },
        githubAppService: {
            getInstallUrl: jest.fn().mockReturnValue('https://github.com/apps/aem-code-sync'),
        },
    } as unknown as SetupServices;
}

const EXISTING_REPO_CONFIG = {
    repoMode: 'existing',
    existingRepo: 'kmanns/blaines',
    resetToTemplate: true,
} as unknown as StorefrontSetupStartPayload['edsConfig'];

const TEMPLATE = { owner: 'adobe-commerce', repo: 'boilerplate-b2b-template' };

function freshRepoInfo(): RepoInfo {
    return { repoOwner: '', repoName: '', repoUrl: '' };
}

beforeEach(() => {
    jest.clearAllMocks();
    callOrder = [];
    mockPin.mockImplementation(async () => {
        callOrder.push('pinRepoToLkg');
        return true;
    });
    mockResolve.mockImplementation(async () => {
        callOrder.push('appCheck');
        return { kind: 'installed', codeStatus: 200 };
    });
});

async function runPhase1(
    services: SetupServices,
    edsConfig = EXISTING_REPO_CONFIG
): ReturnType<typeof executePhaseGitHubRepo> {
    return executePhaseGitHubRepo(
        makeContext(),
        edsConfig,
        services,
        freshRepoInfo(),
        new AbortController().signal,
        TEMPLATE.owner,
        TEMPLATE.repo
    );
}

describe('Phase 1 existing repo — the App gate runs before any write', () => {
    it('checks the App BEFORE resetting the repo to template', async () => {
        await runPhase1(makeServices());

        expect(callOrder).toEqual(['appCheck', 'resetToTemplate']);
    });

    it('does not touch the repo at all when the App is missing', async () => {
        mockResolve.mockResolvedValue({ kind: 'not-installed', codeStatus: 404 });
        const services = makeServices();

        const result = await runPhase1(services);

        expect(services.githubRepoOps.resetToTemplate).not.toHaveBeenCalled();
        expect(mockPin).not.toHaveBeenCalled();
        expect(result).toMatchObject({
            success: false,
            awaitingGitHubApp: true,
        });
    });

    it('does not touch the repo when Helix declines to answer', async () => {
        // Undetermined is not "installed" — but it is also not the install
        // dialog. Setup stops with the real reason and writes nothing.
        mockResolve.mockResolvedValue({ kind: 'undetermined', httpStatus: 401 });
        const services = makeServices();

        const result = await runPhase1(services);

        expect(services.githubRepoOps.resetToTemplate).not.toHaveBeenCalled();
        expect(mockPin).not.toHaveBeenCalled();
        expect(result?.success).toBe(false);
        expect(result?.awaitingGitHubApp).toBeUndefined();
    });

    it('gates the no-reset path too — Phase 2 would still write to a preserved repo', async () => {
        mockResolve.mockResolvedValue({ kind: 'not-installed', codeStatus: 404 });
        const noReset = {
            ...EXISTING_REPO_CONFIG,
            resetToTemplate: false,
        } as unknown as StorefrontSetupStartPayload['edsConfig'];

        const result = await runPhase1(makeServices(), noReset);

        expect(result).toMatchObject({ success: false, awaitingGitHubApp: true });
    });

    it('proceeds normally once the App is verified', async () => {
        const services = makeServices();

        const result = await runPhase1(services);

        expect(result).toBeNull();
        expect(services.githubRepoOps.resetToTemplate).toHaveBeenCalled();
    });

    it('leaves the new-repo branch ungated here (it has no repo to protect yet)', async () => {
        const newRepo = {
            repoMode: 'new',
            createdRepo: { owner: 'skukla', name: 'demo', url: 'https://github.com/skukla/demo' },
        } as unknown as StorefrontSetupStartPayload['edsConfig'];

        await runPhase1(makeServices(), newRepo);

        expect(mockResolve).not.toHaveBeenCalled();
    });
});
