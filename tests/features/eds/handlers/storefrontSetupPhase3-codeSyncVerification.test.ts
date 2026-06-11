/**
 * Phase 3 Code-Sync Verification Tests
 *
 * Regression coverage for the false-positive bug where Demo Builder declared
 * "AEM Code Sync verified" while the AEM Code Sync GitHub App was not
 * installed on the user's repo.
 *
 * Background. The code bus retains files that were seeded during initial
 * template setup (e.g., via DA.live's direct push of CitiSignal boilerplate)
 * even when the GitHub App is absent. Fetching one of those seeded files
 * (`scripts/aem.js` was the canary) returns 200, so a verification that polls
 * file fetchability without also checking the App falsely concludes that
 * sync is working. Later user pushes silently 404 on the bus because no
 * GitHub → Helix webhook fires.
 *
 * The fix shifts `GitHubAppService.isAppInstalled` from a fallback (run only
 * when polling exhausts) to the up-front gate (run first, regardless of poll
 * result). Polling stays as a warm-up wait for sync to settle, but it can
 * never short-circuit the App-installed check.
 */

import type { HandlerContext } from '@/types/handlers';
import type { Logger } from '@/types/logger';

jest.setTimeout(5000);

// Mock the helpers Phase 3 calls AFTER verifyCodeSync. We don't care about
// their behavior here — we only want verifyCodeSync to be exercised cleanly.
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    configureDaLivePermissions: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        QUICK: 5000,
        NORMAL: 30000,
        CONFIG_SERVICE_RETRY_DELAY: 30000,
    },
}));

import { executePhaseCodeSync } from '@/features/eds/handlers/storefrontSetupPhase3';
import type { RepoInfo, SetupServices } from '@/features/eds/handlers/storefrontSetupTypes';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const REPO_INFO: RepoInfo = {
    repoOwner: 'skukla',
    repoName: 'citisignal-b2b',
    repoUrl: 'https://github.com/skukla/citisignal-b2b',
};

const EDS_CONFIG = {
    repoName: 'citisignal-b2b',
    repoMode: 'new' as const,
    daLiveOrg: 'skukla',
    daLiveSite: 'citisignal-b2b',
    githubOwner: 'skukla',
    templateOwner: 'adobe',
    templateRepo: 'citisignal-template',
};

function makeContext(): HandlerContext {
    return {
        panel: { webview: { postMessage: jest.fn() } } as unknown as HandlerContext['panel'],
        stateManager: {
            getCurrentProject: jest.fn(),
            saveProject: jest.fn().mockResolvedValue(undefined),
        } as unknown as HandlerContext['stateManager'],
        logger: {
            info: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            trace: jest.fn(),
        } as unknown as Logger,
        debugLogger: {
            info: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
        } as unknown as HandlerContext['debugLogger'],
        sendMessage: jest.fn().mockResolvedValue(undefined),
        context: {
            secrets: {},
            globalState: { get: jest.fn(), update: jest.fn() },
        } as unknown as HandlerContext['context'],
        sharedState: {},
    } as unknown as HandlerContext;
}

function makeServices(overrides: Partial<{
    isInstalled: boolean;
    codeStatus?: number;
    registerSiteResult: { success: boolean; statusCode?: number; error?: string };
}> = {}): SetupServices {
    const isInstalled = overrides.isInstalled ?? true;
    const codeStatus = overrides.codeStatus ?? (isInstalled ? 200 : 404);
    return {
        githubAppService: {
            isAppInstalled: jest.fn().mockResolvedValue({ isInstalled, codeStatus }),
            getInstallUrl: jest.fn().mockReturnValue('https://github.com/apps/aem-code-sync/installations/select_target'),
        },
        helixService: {
            previewCode: jest.fn().mockResolvedValue(undefined),
        },
        daLiveAuthService: {
            getUserEmail: jest.fn().mockResolvedValue('test@example.com'),
        },
        daLiveTokenProvider: {
            getAccessToken: jest.fn().mockResolvedValue('mock-token'),
        },
        configurationService: {
            registerSite: jest.fn().mockResolvedValue(overrides.registerSiteResult ?? { success: true }),
            updateSiteConfig: jest.fn().mockResolvedValue({ success: true }),
        },
        githubRepoOps: {} as SetupServices['githubRepoOps'],
        githubFileOps: {} as SetupServices['githubFileOps'],
        daLiveContentOps: {} as SetupServices['daLiveContentOps'],
    } as unknown as SetupServices;
}

beforeEach(() => {
    jest.clearAllMocks();
    // Default: fetch returns 200 — the failure mode we're protecting against.
    // Each test can override via (global.fetch as jest.Mock).mockResolvedValueOnce(...)
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('executePhaseCodeSync — code sync verification gate', () => {
    describe('GitHub App not installed', () => {
        it('uses team-org messaging when the namespace differs from the authenticated GitHub user (Step 5 of picker plan)', async () => {
            // Picker scenario: SC authenticated as `leahrayard` but picked the
            // team org `demo-system-stores` as the demo namespace. Phase 3
            // surfaces the install prompt but with "ask your team admin"
            // framing because the SC cant install on the team org themselves.
            const context = makeContext();
            const services = makeServices({ isInstalled: false });

            const repoInfo: RepoInfo = {
                repoOwner: 'demo-system-stores',
                repoName: 'leah-demo',
                repoUrl: 'https://github.com/demo-system-stores/leah-demo',
            };
            const edsConfig = {
                ...EDS_CONFIG,
                daLiveOrg: 'demo-system-stores',
                githubAuth: {
                    isAuthenticated: true,
                    user: { login: 'leahrayard' },
                },
            } as unknown as typeof EDS_CONFIG;

            await executePhaseCodeSync(
                context, edsConfig, services, repoInfo, new AbortController().signal,
            );

            expect(context.sendMessage).toHaveBeenCalledWith(
                'storefront-setup-github-app-required',
                expect.objectContaining({
                    owner: 'demo-system-stores',
                    isTeamOrg: true,
                    message: expect.stringContaining('admin'),
                }),
            );
        });

        it('uses self-install messaging when the namespace matches the authenticated GitHub user (personal namespace case)', async () => {
            // Picker scenario: SC authenticated as `leahrayard` AND picked
            // their personal account. They can install on their own user,
            // so the message stays as the existing "must be installed" copy.
            const context = makeContext();
            const services = makeServices({ isInstalled: false });

            const repoInfo: RepoInfo = {
                repoOwner: 'leahrayard',
                repoName: 'leah-demo',
                repoUrl: 'https://github.com/leahrayard/leah-demo',
            };
            const edsConfig = {
                ...EDS_CONFIG,
                daLiveOrg: 'leahrayard',
                githubAuth: {
                    isAuthenticated: true,
                    user: { login: 'leahrayard' },
                },
            } as unknown as typeof EDS_CONFIG;

            await executePhaseCodeSync(
                context, edsConfig, services, repoInfo, new AbortController().signal,
            );

            expect(context.sendMessage).toHaveBeenCalledWith(
                'storefront-setup-github-app-required',
                expect.objectContaining({
                    owner: 'leahrayard',
                    isTeamOrg: false,
                }),
            );
        });

        it('surfaces the install dialog and fails even when the code-bus poll would succeed (regression for false-positive verified)', async () => {
            // The bug: scripts/aem.js was on the bus from initial template seed,
            // so polling returned 200 and Demo Builder declared "verified" while
            // the GitHub App was never installed. Fix: App check must be the gate.
            const context = makeContext();
            const services = makeServices({ isInstalled: false, codeStatus: 404 });

            const result = await executePhaseCodeSync(
                context, EDS_CONFIG, services, { ...REPO_INFO }, new AbortController().signal,
            );

            // Install dialog must be sent
            expect(context.sendMessage).toHaveBeenCalledWith(
                'storefront-setup-github-app-required',
                expect.objectContaining({
                    owner: 'skukla',
                    repo: 'citisignal-b2b',
                    installUrl: expect.stringContaining('aem-code-sync'),
                }),
            );
            // Phase must fail with the explicit reason
            expect(result).toMatchObject({
                success: false,
                error: 'GitHub App installation required',
            });
            // Downstream steps must NOT run
            expect(services.helixService.previewCode).not.toHaveBeenCalled();
            expect(services.configurationService.registerSite).not.toHaveBeenCalled();
        });

        it('checks GitHub App installation BEFORE polling the code bus', async () => {
            // Order matters: the App check is the ground truth; polling is a
            // warm-up wait. If polling runs first and succeeds, the false-positive
            // returns. Assert isAppInstalled is invoked, and on failure the poll
            // is short-circuited entirely.
            const context = makeContext();
            const services = makeServices({ isInstalled: false });

            await executePhaseCodeSync(
                context, EDS_CONFIG, services, { ...REPO_INFO }, new AbortController().signal,
            );

            expect(services.githubAppService.isAppInstalled).toHaveBeenCalledWith('skukla', 'citisignal-b2b');
            // Polling must not have run for the code bus when the App is missing —
            // we already know verification will fail.
            expect(global.fetch).not.toHaveBeenCalled();
        });
    });

    describe('GitHub App installed', () => {
        it('proceeds past verification when the App is installed and the code bus is serving (status 200)', async () => {
            const context = makeContext();
            const services = makeServices({ isInstalled: true, codeStatus: 200 });

            const result = await executePhaseCodeSync(
                context, EDS_CONFIG, services, { ...REPO_INFO }, new AbortController().signal,
            );

            // No install dialog
            expect(context.sendMessage).not.toHaveBeenCalledWith(
                'storefront-setup-github-app-required',
                expect.anything(),
            );
            // Downstream steps did run
            expect(services.helixService.previewCode).toHaveBeenCalled();
            // Verification did not error out
            expect(result).toBeNull();
        });
    });

    describe('Transient failure recovery', () => {
        it('retries once on transient failure, then proceeds when the retry confirms the App is installed', async () => {
            // Realistic case: first isAppInstalled call hits a network blip and returns
            // `transient: true`. A single short retry confirms the App is installed —
            // user must NOT see a misleading install-required dialog.
            const context = makeContext();
            const services = makeServices();
            (services.githubAppService.isAppInstalled as jest.Mock)
                .mockResolvedValueOnce({ isInstalled: false, transient: true })
                .mockResolvedValueOnce({ isInstalled: true, codeStatus: 200 });

            const result = await executePhaseCodeSync(
                context, EDS_CONFIG, services, { ...REPO_INFO }, new AbortController().signal,
            );

            expect(services.githubAppService.isAppInstalled).toHaveBeenCalledTimes(2);
            expect(context.sendMessage).not.toHaveBeenCalledWith(
                'storefront-setup-github-app-required',
                expect.anything(),
            );
            expect(result).toBeNull();
        });

        it('surfaces the install dialog when the transient retry also fails', async () => {
            const context = makeContext();
            const services = makeServices();
            (services.githubAppService.isAppInstalled as jest.Mock)
                .mockResolvedValue({ isInstalled: false, transient: true });

            const result = await executePhaseCodeSync(
                context, EDS_CONFIG, services, { ...REPO_INFO }, new AbortController().signal,
            );

            // Retried exactly once before giving up
            expect(services.githubAppService.isAppInstalled).toHaveBeenCalledTimes(2);
            expect(context.sendMessage).toHaveBeenCalledWith(
                'storefront-setup-github-app-required',
                expect.objectContaining({ owner: 'skukla', repo: 'citisignal-b2b' }),
            );
            expect(result).toMatchObject({ success: false, error: 'GitHub App installation required' });
        });

        it('does NOT retry when the first check returns a definitive not-installed (no transient flag)', async () => {
            // codeStatus: 404 is Helix saying "the App really isn't installed" —
            // retrying won't change the answer. Skip the delay; go straight to dialog.
            const context = makeContext();
            const services = makeServices({ isInstalled: false, codeStatus: 404 });

            await executePhaseCodeSync(
                context, EDS_CONFIG, services, { ...REPO_INFO }, new AbortController().signal,
            );

            expect(services.githubAppService.isAppInstalled).toHaveBeenCalledTimes(1);
            expect(context.sendMessage).toHaveBeenCalledWith(
                'storefront-setup-github-app-required',
                expect.anything(),
            );
        });
    });
});
