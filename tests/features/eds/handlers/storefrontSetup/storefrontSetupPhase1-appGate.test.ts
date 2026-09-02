/**
 * Phase 1 existing-repo AEM Code Sync gate — ordering enforcement.
 *
 * Where the gate runs depends on whether the repo is being reset, because that
 * decides whether the question can be answered at all.
 *
 * `admin.hlx.page/status` reports on the SITE, not the App. A repo that is not
 * a storefront yet has no site, so it answers `404 no such site` however the App
 * is configured. Measured on skukla/kukla-bodea 2026-08-20: GitHub listed the
 * repo under the AEM Code Sync installation, and the status endpoint 404'd
 * anyway — 28 minutes after a code-sync trigger Helix had accepted.
 *
 * So:
 * - **No reset** — the repo is already a storefront and can answer. Gate first,
 *   before any write. That is the job this file was written for: the gate used
 *   to live in Phase 2 (progress 28), after fstab.yaml, block collections and
 *   the vendored smart-404 / Quick Edit scripts had landed in a repo the user
 *   asked to preserve.
 * - **Reset** — the repo cannot answer yet. Gate AFTER the reset, the first
 *   moment it can succeed.
 *
 * These tests assert the ORDER in both directions, not merely that a check
 * happens — either gate firing on the wrong side of the reset is the bug, and
 * would pass any test that only counts calls.
 */

import { executePhaseGitHubRepo } from '@/features/eds/handlers/storefrontSetup/storefrontSetupPhase1';
import type { StorefrontSetupStartPayload } from '@/features/eds/handlers/storefrontSetup/storefrontSetupHandlers';
import type {
    RepoInfo,
    SetupServices,
} from '@/features/eds/handlers/storefrontSetup/storefrontSetupTypes';

jest.mock('@/features/eds/services/patches/lkgPinHelper', () => ({
    pinRepoToLkg: jest.fn().mockResolvedValue(true),
}));
import { pinRepoToLkg } from '@/features/eds/services/patches/lkgPinHelper';

// Mock the resolver, not the helper that wraps it — that keeps
// `checkGitHubAppForExistingRepo` and its Phase 1 call site under test.
jest.mock('@/features/eds/services/appInstallationResolver', () => ({
    ...jest.requireActual('@/features/eds/services/appInstallationResolver'),
    resolveAppInstallation: jest.fn(),
}));
import { resolveAppInstallation } from '@/features/eds/services/appInstallationResolver';
import { makeContext, TEMPLATE } from './storefrontSetupPhase1.testUtils';

const mockPin = pinRepoToLkg as jest.Mock;
const mockResolve = resolveAppInstallation as jest.Mock;

/** Records the order of the operations whose sequence is the thing under test. */
let callOrder: string[];

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
    existingRepo: 'acme-corp/storefront-demo',
    resetToTemplate: true,
} as unknown as StorefrontSetupStartPayload['edsConfig'];

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

const NO_RESET = {
    ...EXISTING_REPO_CONFIG,
    resetToTemplate: false,
} as unknown as StorefrontSetupStartPayload['edsConfig'];

describe('a repo being RESET cannot answer until it has been reset', () => {
    it('checks the App AFTER the reset, which is the first moment Helix can answer', async () => {
        await runPhase1(makeServices());

        expect(callOrder).toEqual(['resetToTemplate', 'appCheck']);
    });

    it('tells the resolver a push just landed, so a not-yet-registered site is not a missing App', async () => {
        // Assert the ARGUMENT. The resolver is mocked, so it answers the same
        // whether or not it was told to wait -- and without that flag a repo
        // checked one second after its reset push reads as "App not installed".
        await runPhase1(makeServices());

        expect(mockResolve).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            expect.anything(),
            { awaitRegistration: true }
        );
    });

    it('still halts, and still surfaces the install dialog, when the App is genuinely missing', async () => {
        mockResolve.mockResolvedValue({ kind: 'not-installed', codeStatus: 404 });

        const result = await runPhase1(makeServices());

        expect(result).toMatchObject({ success: false, awaitingGitHubApp: true });
    });

    it('halts with the real reason, not the install dialog, when Helix declines to answer', async () => {
        mockResolve.mockResolvedValue({ kind: 'undetermined', httpStatus: 401 });

        const result = await runPhase1(makeServices());

        expect(result?.success).toBe(false);
        expect(result?.awaitingGitHubApp).toBeUndefined();
    });
});

describe('a repo the user chose to PRESERVE is gated before any write', () => {
    it('checks the App with no reset to wait for', async () => {
        await runPhase1(makeServices(), NO_RESET);

        expect(callOrder).toEqual(['appCheck']);
    });

    it('does NOT ask the resolver to wait — an outer 404 here is a settled answer', async () => {
        // The repo is already a storefront, so nothing is about to register.
        // Waiting would only delay a verdict that will not change.
        await runPhase1(makeServices(), NO_RESET);

        expect(mockResolve).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            expect.anything(),
            { awaitRegistration: false }
        );
    });

    it('writes nothing when the App is missing — Phase 2 would land in a preserved repo', async () => {
        mockResolve.mockResolvedValue({ kind: 'not-installed', codeStatus: 404 });
        const services = makeServices();

        const result = await runPhase1(services, NO_RESET);

        expect(services.githubRepoOps.resetToTemplate).not.toHaveBeenCalled();
        expect(mockPin).not.toHaveBeenCalled();
        expect(result).toMatchObject({ success: false, awaitingGitHubApp: true });
    });

    it('writes nothing when Helix declines to answer', async () => {
        mockResolve.mockResolvedValue({ kind: 'undetermined', httpStatus: 401 });
        const services = makeServices();

        const result = await runPhase1(services, NO_RESET);

        expect(services.githubRepoOps.resetToTemplate).not.toHaveBeenCalled();
        expect(mockPin).not.toHaveBeenCalled();
        expect(result?.success).toBe(false);
    });
});

describe('both paths, once the answer is good', () => {
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
