/**
 * edsResetConfigStep — reset steps 6–7, where most of the reset's error
 * nuance lives.
 *
 * WRITTEN 2026-08-28 as phase-2 of the ADR-015 convergence. The module had NO
 * test despite its own docblock saying "all of it is load-bearing", and its
 * inline comments record SIX past incidents. Each of those is a behaviour a
 * refactor could silently undo, so each gets a witness here:
 *
 *  1. a skipped config write must report `configWritten: false` — a run that
 *     silently skipped it used to end with "reset successfully" while PDPs
 *     were dead
 *  2. the tokenProvider reaches HelixService — without it the CDN keeps
 *     serving a stale config.json (401, seen live 2026-08-15)
 *  3. a config.json publish failure is NON-fatal; step 7 still runs
 *  4. registration goes through `registerSiteConfig` WITH the tokenProvider
 *     and retryOn403 — that call carries the publish-key re-mint a reset used
 *     to destroy
 *  5. an expired DA.live session does NOT rethrow (a rethrow left a half-reset
 *     repo) and does NOT fall into the BYOM branch
 *  6. lost grants are surfaced on the progress channel
 */

const mockPreviewCode = jest.fn();
const mockMakeHelix = jest.fn();
const mockRegisterSiteConfig = jest.fn();
const mockLogConfigAccessState = jest.fn();
const mockBuildSiteConfigParams = jest.fn((..._a: unknown[]) => ({ built: 'params' }));
const mockLostGrantsMessage = jest.fn((..._a: unknown[]) => 'lost: admin');
const mockSurfaceOverlayFailure = jest.fn();
const mockByomFailureMessage = jest.fn((..._a: unknown[]) => 'byom advice');
const mockConfigurationServiceCtor = jest.fn();
const mockHelixServiceCtor = jest.fn();

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    surfaceOverlayRegistrationFailure: (...a: unknown[]) => mockSurfaceOverlayFailure(...a),
    byomRegistrationFailureMessage: (...a: unknown[]) => mockByomFailureMessage(...a),
}));
jest.mock('@/features/eds/services/configService/configAccessRecovery', () => ({
    logConfigAccessState: (...a: unknown[]) => mockLogConfigAccessState(...a),
}));
// `buildSiteConfigParams` is a pure function this step's assertions read the
// output of, so it is mocked. The SERVICE normally arrives through the seam; the
// class is mocked only so the DEFAULT seam (production never passes services) can
// be pinned — what its constructor is handed is the one thing that path decides.
jest.mock('@/features/eds/services/configService/configurationService', () => ({
    buildSiteConfigParams: (...a: unknown[]) => mockBuildSiteConfigParams(...a),
    ConfigurationService: class {
        constructor(...a: unknown[]) {
            mockConfigurationServiceCtor(...a);
        }
    },
}));
// Same reason: the default seam constructs the real HelixService, and the property
// the suite exists to pin is that the DA.live tokenProvider reaches THAT constructor.
jest.mock('@/features/eds/services/helix/helixService', () => ({
    HelixService: class {
        previewCode = mockPreviewCode;
        constructor(...a: unknown[]) {
            mockHelixServiceCtor(...a);
        }
    },
}));
jest.mock('@/features/eds/services/configService/lostGrantsMessage', () => ({
    lostGrantsMessage: (...a: unknown[]) => mockLostGrantsMessage(...a),
}));
jest.mock('@/features/eds/services/configService/siteConfigRegistrar', () => ({
    registerSiteConfig: (...a: unknown[]) => mockRegisterSiteConfig(...a),
}));
import { publishConfigAndRegisterSite } from '@/features/eds/services/reset/edsResetConfigStep';
import type { ConfigStepServices } from '@/features/eds/services/reset/edsResetConfigStep';
import type { TokenProvider } from '@/features/eds/services/daLive/daLiveOrgOperations';
import type { GitHubTokenService } from '@/features/eds/services/github/githubTokenService';
import { DaLiveAuthError } from '@/features/eds/services/types';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../../helpers/loggerFake';

const PARAMS = {
    repoOwner: 'skukla',
    repoName: 'kukla-bodea',
    daLiveOrg: 'skukla',
    byomOverlayUrl: 'https://overlay.example/render',
};

// Both are forwarded, never called, by this step. The DA.live provider is the
// shape the callee declares (`getAccessToken`, not `getToken` — the cast that
// used to sit here hid that mismatch). The GitHub service is a class with private
// state no literal can supply.
const TOKEN_PROVIDER: TokenProvider = { getAccessToken: jest.fn() };
const GITHUB_TOKENS = { validateToken: jest.fn() } as unknown as GitHubTokenService;

function makeLogger(): Logger {
    return createMockLogger() as unknown as Logger;
}

/**
 * The two services, handed in through the seam.
 *
 * Typed to the module's OWN interfaces rather than cast, so `tsc` rejects a shape
 * that drifts from what the step will call — the check a `jest.mock` factory
 * structurally cannot perform. Helix is a FACTORY because the property pinned
 * below is what reaches its CONSTRUCTOR.
 */
const services: ConfigStepServices = {
    makeHelix: (...a) => {
        mockMakeHelix(...a);
        return { previewCode: mockPreviewCode };
    },
    configService: {
        registerSite: jest.fn(async () => ({ success: true })),
        updateSiteConfig: jest.fn(async () => ({ success: true })),
    },
};

function run(overrides: Partial<typeof PARAMS> = {}, report = jest.fn(), logger = makeLogger()) {
    return publishConfigAndRegisterSite(
        { ...PARAMS, ...overrides },
        GITHUB_TOKENS,
        TOKEN_PROVIDER,
        logger,
        report,
        services
    );
}

/** The production call: no seam, so the step constructs both services itself. */
function runWithoutSeam(logger: Logger) {
    return publishConfigAndRegisterSite(PARAMS, GITHUB_TOKENS, TOKEN_PROVIDER, logger, jest.fn());
}

beforeEach(() => {
    jest.clearAllMocks();
    mockPreviewCode.mockResolvedValue(undefined);
    mockRegisterSiteConfig.mockResolvedValue({ registered: true, statusCode: 200 });
});

describe('publishConfigAndRegisterSite — the happy path', () => {
    it('reports configWritten TRUE only when the registration actually succeeded', async () => {
        await expect(run()).resolves.toEqual({ configWritten: true });
    });

    it('hands the tokenProvider to HelixService — without it the CDN serves a stale config', async () => {
        await run();

        expect(mockMakeHelix).toHaveBeenCalledWith(
            expect.anything(),
            GITHUB_TOKENS,
            TOKEN_PROVIDER
        );
        expect(mockPreviewCode).toHaveBeenCalledWith('skukla', 'kukla-bodea', '/config.json');
    });

    it('registers through the shared registrar WITH the publish-key inputs and 403 retry', async () => {
        await run();

        expect(mockRegisterSiteConfig).toHaveBeenCalledWith(
            expect.objectContaining({
                tokenProvider: TOKEN_PROVIDER,
                retryOn403: true,
                siteParams: { built: 'params' },
            })
        );
    });

    it('builds the site params from the owner, repo, DA.live org and overlay it was given', async () => {
        await run();

        expect(mockBuildSiteConfigParams).toHaveBeenCalledWith(
            'skukla',
            'kukla-bodea',
            'skukla',
            'https://overlay.example/render'
        );
    });

    it('reports the publish and the registration on the progress channel, in step order', async () => {
        const report = jest.fn();

        await run({}, report);

        expect(report).toHaveBeenCalledWith(6, 'config.json published');
        expect(report).toHaveBeenCalledWith(7, 'Configuration Service updated');
        // A success is NOT also a BYOM failure: the overlay advice stays silent.
        expect(mockSurfaceOverlayFailure).not.toHaveBeenCalled();
        expect(mockLostGrantsMessage).not.toHaveBeenCalled();
    });

    it('relays the registrar’s progress onto step 7 of the progress channel', async () => {
        const report = jest.fn();

        await run({}, report);

        const { onProgress } = mockRegisterSiteConfig.mock.calls[0][0] as {
            onProgress: (message: string) => void;
        };
        onProgress('Waiting for admin role to propagate...');
        expect(report).toHaveBeenCalledWith(7, 'Waiting for admin role to propagate...');
    });

    it('telegraphs config access for THIS repo before the write', async () => {
        const logger = makeLogger();

        await run({}, jest.fn(), logger);

        expect(mockLogConfigAccessState).toHaveBeenCalledWith(
            TOKEN_PROVIDER,
            { owner: 'skukla', repo: 'kukla-bodea' },
            logger
        );
    });

    it('surfaces lost grants on the progress channel', async () => {
        mockRegisterSiteConfig.mockResolvedValue({
            registered: true,
            statusCode: 200,
            lostGrants: ['admin'],
        });
        const report = jest.fn();

        await run({}, report);

        expect(report).toHaveBeenCalledWith(7, expect.stringContaining('lost: admin'));
    });
});

describe('publishConfigAndRegisterSite — the failure nuances', () => {
    it('a config.json publish failure is NON-fatal: step 7 still runs', async () => {
        mockPreviewCode.mockRejectedValue(new Error('helix 500'));
        const report = jest.fn();

        await expect(run({}, report)).resolves.toEqual({ configWritten: true });
        expect(mockRegisterSiteConfig).toHaveBeenCalled();
        // The SC is told the publish failed and that the reset carries on.
        expect(report).toHaveBeenCalledWith(6, 'config.json publish failed, continuing...');
        expect(report).not.toHaveBeenCalledWith(6, 'config.json published');
    });

    it('a failed registration WITHOUT an overlay warns and stays silent about BYOM', async () => {
        mockRegisterSiteConfig.mockResolvedValue({ registered: false, statusCode: 500 });
        const logger = makeLogger();
        const report = jest.fn();

        await expect(run({ byomOverlayUrl: undefined }, report, logger)).resolves.toEqual({
            configWritten: false,
        });

        expect(mockSurfaceOverlayFailure).not.toHaveBeenCalled();
        expect(mockByomFailureMessage).not.toHaveBeenCalled();
        expect(report).not.toHaveBeenCalledWith(7, 'Configuration Service updated');
        // The one thing this branch does is warn — once, for the registration.
        expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it('a FAILED registration reports configWritten FALSE — the "reset successfully" lie', async () => {
        mockRegisterSiteConfig.mockResolvedValue({ registered: false, statusCode: 403 });

        await expect(run()).resolves.toEqual({ configWritten: false });
    });

    it('a failed registration WITH an overlay surfaces the shared BYOM advice', async () => {
        mockRegisterSiteConfig.mockResolvedValue({ registered: false, statusCode: 403 });
        const report = jest.fn();

        await run({}, report);

        expect(mockSurfaceOverlayFailure).toHaveBeenCalledWith(expect.anything(), undefined, 403);
        expect(report).toHaveBeenCalledWith(7, expect.stringContaining('byom advice'));
    });

    it('an expired DA.live session does NOT rethrow, and does NOT take the BYOM branch', async () => {
        mockRegisterSiteConfig.mockRejectedValue(new DaLiveAuthError('session expired'));
        const report = jest.fn();

        // A rethrow here used to abort AFTER the repo was wiped and BEFORE the
        // content came back — a half-reset storefront.
        await expect(run({}, report)).resolves.toEqual({ configWritten: false });
        expect(mockSurfaceOverlayFailure).not.toHaveBeenCalled();
        expect(report).toHaveBeenCalledWith(7, expect.stringContaining('DA.live session expired'));
    });

    it('a non-auth throw with an overlay still surfaces the advice and reports false', async () => {
        mockRegisterSiteConfig.mockRejectedValue(new Error('network down'));
        const report = jest.fn();

        await expect(run({}, report)).resolves.toEqual({ configWritten: false });
        // No status code: the throw carried none, and the advice must not invent one.
        expect(mockSurfaceOverlayFailure).toHaveBeenCalledWith(expect.anything());
        expect(mockByomFailureMessage).toHaveBeenCalledWith();
        expect(report).toHaveBeenCalledWith(7, '⚠️ byom advice');
    });

    it('a non-auth throw WITHOUT an overlay warns, stays silent about BYOM, and reports false', async () => {
        mockRegisterSiteConfig.mockRejectedValue(new Error('network down'));
        const logger = makeLogger();
        const report = jest.fn();

        await expect(run({ byomOverlayUrl: undefined }, report, logger)).resolves.toEqual({
            configWritten: false,
        });

        expect(mockSurfaceOverlayFailure).not.toHaveBeenCalled();
        expect(mockByomFailureMessage).not.toHaveBeenCalled();
        expect(report).not.toHaveBeenCalledWith(7, expect.stringContaining('⚠️'));
        expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it('logs the config access state BEFORE the write that depends on it', async () => {
        await run();

        expect(mockLogConfigAccessState.mock.invocationCallOrder[0]).toBeLessThan(
            mockRegisterSiteConfig.mock.invocationCallOrder[0]
        );
    });
});

describe('publishConfigAndRegisterSite — the default seam (what production runs)', () => {
    it('builds HelixService from the logger, GitHub tokens and the DA.live tokenProvider', async () => {
        const logger = makeLogger();

        await runWithoutSeam(logger);

        // Without the tokenProvider here the CDN keeps serving a stale config.json.
        expect(mockHelixServiceCtor).toHaveBeenCalledWith(logger, GITHUB_TOKENS, TOKEN_PROVIDER);
        expect(mockPreviewCode).toHaveBeenCalledWith('skukla', 'kukla-bodea', '/config.json');
    });

    it('builds the ConfigurationService from the tokenProvider and logger, and registers through it', async () => {
        const logger = makeLogger();

        await runWithoutSeam(logger);

        expect(mockConfigurationServiceCtor).toHaveBeenCalledWith(TOKEN_PROVIDER, logger);
        const { configurationService } = mockRegisterSiteConfig.mock.calls[0][0] as {
            configurationService: unknown;
        };
        expect(configurationService).toBeInstanceOf(
            jest.requireMock('@/features/eds/services/configService/configurationService')
                .ConfigurationService
        );
    });
});
