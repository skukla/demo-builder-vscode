/**
 * Storefront Setup Handlers — a stopped setup removes what it made (F275).
 *
 * Setup registers its stop by project folder, so `cancel_project_creation` (and the
 * wizard's Cancel) reach it. After a stop the running step finishes, no further step
 * starts (`storefrontSetupPhases-stop.test.ts`), and only THEN does the run remove what
 * it made, through the delete path's own storefront cleanup (`performEdsCleanup`: the
 * shared teardown on the DA.live session, then the repository and its code on aem.live).
 *
 * Until 2026-11-18 an agent's setup registered no stop at all, and the wizard's Cancel
 * cleaned up at once, from the webview's guess at what existed, while the step carried on.
 *
 * The cleanup is mocked (it makes live calls); every assertion reads its ARGUMENTS.
 */

import type { HandlerContext } from '@/types/handlers';
import type { StorefrontSetupResult } from '@/features/eds/handlers/storefrontSetup/storefrontSetupTypes';

jest.mock('@/core/auth/adobeAuthGuard', () => ({ ensureAdobeIOAuth: jest.fn() }));
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    ensureDaLiveAuth: jest.fn(async () => ({ authenticated: true })),
    getDaLiveAuthService: jest.fn(),
    resolveByomOverlayConfig: jest.fn(() => 'https://overlay.example/render-pdp'),
    explainAbsentOverlay: jest.fn(),
}));
jest.mock('@/features/eds/handlers/storefrontSetup/storefrontSetupPhases', () => ({
    executeStorefrontSetupPhases: jest.fn(),
}));
jest.mock('@/features/eds/handlers/storefrontSetup/storefrontSetupConfigRehydration', () => ({
    rehydratePackageDerivedConfig: jest.fn((edsConfig: unknown) => edsConfig),
}));
const mockPerformEdsCleanup = jest.fn();
jest.mock('@/features/projects-dashboard/services/edsExternalCleanup', () => ({
    performEdsCleanup: (...args: unknown[]) => mockPerformEdsCleanup(...args),
}));

import {
    handleStartStorefrontSetup,
    type StorefrontSetupStartPayload,
} from '@/features/eds/handlers/storefrontSetup/storefrontSetupHandlers';
import { executeStorefrontSetupPhases } from '@/features/eds/handlers/storefrontSetup/storefrontSetupPhases';
import { creationPath } from '@/features/project-creation/handlers/executorPreflight';
import { stopCreation } from '@/features/project-creation/handlers/creationStop';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { ErrorCode } from '@/types/errorCodes';
import type { CleanupResultItem } from '@/features/eds/services/resourceCleanupHelpers';
import { createMockHandlerContext } from '../../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockAuthenticationService } from '../../../../helpers/authenticationServiceFake';

const mockPhases = executeStorefrontSetupPhases as jest.MockedFunction<
    typeof executeStorefrontSetupPhases
>;

const PROJECT = 'stop-during-setup';
const FOLDER = creationPath({ projectName: PROJECT });

/** What a run stopped after it made the repository and wrote the site answers. */
const STOPPED_AFTER_SITE: StorefrontSetupResult = {
    success: false,
    error: 'Operation cancelled',
    repoOwner: 'steve',
    repoName: 'demo-repo',
    repoUrl: 'https://github.com/steve/demo-repo',
    siteWritten: true,
};

function createContext(): HandlerContext {
    return createMockHandlerContext({
        logger: createMockLogger() as unknown as HandlerContext['logger'],
        sendMessage: jest.fn(),
        context: { secrets: {} } as unknown as HandlerContext['context'],
        authManager: createMockAuthenticationService(),
    });
}

function payload(
    overrides: Partial<StorefrontSetupStartPayload> = {}
): StorefrontSetupStartPayload {
    return {
        projectName: PROJECT,
        dependencies: ['eds-storefront'],
        nobodyToAsk: true,
        edsConfig: {
            repoName: 'demo-repo',
            repoMode: 'new',
            daLiveOrg: 'demo-org',
            daLiveSite: 'demo-site',
            githubOwner: 'steve',
            templateOwner: 'tmpl-owner',
            templateRepo: 'tmpl-repo',
        },
        ...overrides,
    };
}

/**
 * Phases whose running step is stopped by the project's folder (as cancel_project_creation
 * does) and ends only when the test says so, answering `result`.
 */
function stoppedMidStep(result: StorefrontSetupResult, events: string[]): () => void {
    let finish: () => void = () => undefined;
    const stepDone = new Promise<void>((resolve) => {
        finish = resolve;
    });
    mockPhases.mockImplementation(async (_ctx, _config, signal) => {
        events.push(stopCreation(FOLDER) ? 'stop found the run' : 'no run to stop');
        expect(signal.aborted).toBe(true);
        await stepDone;
        events.push('step ended');
        return result;
    });
    return finish;
}

describe('handleStartStorefrontSetup — stopped', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('is found by its project folder, waits for the running step, then removes the repository and site', async () => {
        const events: string[] = [];
        const finish = stoppedMidStep(STOPPED_AFTER_SITE, events);
        mockPerformEdsCleanup.mockImplementation(
            async (_ctx, _meta, _opts, results: CleanupResultItem[]) => {
                events.push('cleanup');
                results.push({ type: 'daLive', name: 'demo-org/demo-site', success: true });
                results.push({ type: 'github', name: 'steve/demo-repo', success: true });
                return {};
            }
        );

        const answer = handleStartStorefrontSetup(createContext(), payload());
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(mockPerformEdsCleanup).not.toHaveBeenCalled(); // not while the step runs
        finish();
        const res = await answer;

        expect(events).toEqual(['stop found the run', 'step ended', 'cleanup']);
        const [, metadata, options] = mockPerformEdsCleanup.mock.calls[0];
        expect(metadata).toEqual({
            githubRepo: 'steve/demo-repo',
            daLiveOrg: 'demo-org',
            daLiveSite: 'demo-site',
        });
        expect(options).toEqual({
            deleteGitHubRepo: true,
            deleteDaLiveSite: true,
            nobodyToAsk: true,
        });
        expect(res).toMatchObject({
            success: false,
            code: ErrorCode.CANCELLED,
            data: { left: [] },
        });
        expect(stopCreation(FOLDER)).toBe(false); // the run's stop is released
    });

    it('names what it could not remove', async () => {
        const finish = stoppedMidStep(STOPPED_AFTER_SITE, []);
        mockPerformEdsCleanup.mockImplementation(
            async (_ctx, _meta, _opts, results: CleanupResultItem[]) => {
                results.push({
                    type: 'daLive',
                    name: 'demo-org/demo-site',
                    success: false,
                    skipped: true,
                    error: 'Not signed in to DA.live',
                });
                return {};
            }
        );

        const answer = handleStartStorefrontSetup(createContext(), payload());
        finish();
        const res = await answer;

        expect(res.data).toEqual({ left: ['demo-org/demo-site: Not signed in to DA.live'] });
    });

    it('says it is stopping after this step, then deleting what it made', async () => {
        const context = createContext();
        const finish = stoppedMidStep(STOPPED_AFTER_SITE, []);
        mockPerformEdsCleanup.mockResolvedValue({});

        const answer = handleStartStorefrontSetup(context, payload());
        finish();
        await answer;

        expect(context.sendMessage).toHaveBeenCalledWith(
            'storefront-setup-progress',
            expect.objectContaining({
                phase: 'cancelling',
                stage: OPERATION_STAGES.stoppingCreation.label,
                message: 'Then deleting what it made',
            })
        );
        expect(context.sendMessage).not.toHaveBeenCalledWith(
            'storefront-setup-error',
            expect.anything()
        );
    });

    it('removes nothing it was handed: an existing repository and site stay', async () => {
        const finish = stoppedMidStep({ ...STOPPED_AFTER_SITE, siteWritten: undefined }, []);
        mockPerformEdsCleanup.mockResolvedValue({});

        const answer = handleStartStorefrontSetup(
            createContext(),
            payload({
                edsConfig: {
                    ...payload().edsConfig,
                    repoMode: 'existing',
                    existingRepo: 'steve/demo-repo',
                    selectedSite: { id: 'demo-site', name: 'demo-site' },
                },
            })
        );
        finish();
        const res = await answer;

        expect(mockPerformEdsCleanup).not.toHaveBeenCalled();
        expect(res).toMatchObject({
            success: false,
            code: ErrorCode.CANCELLED,
            data: { left: [] },
        });
    });

    it('a run that fails on its own, unstopped, removes nothing (as before)', async () => {
        mockPhases.mockResolvedValue({ ...STOPPED_AFTER_SITE, error: 'Template not found' });

        const res = await handleStartStorefrontSetup(createContext(), payload());

        expect(mockPerformEdsCleanup).not.toHaveBeenCalled();
        expect(res).toMatchObject({ success: false, error: 'Template not found' });
        expect(stopCreation(FOLDER)).toBe(false);
    });
});
