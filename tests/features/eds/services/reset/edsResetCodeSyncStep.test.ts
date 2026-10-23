/**
 * Reset step 2 (publishing code and settings), its code-and-permissions half,
 * driven directly: publish the code, then grant the signed-in user on the DA.live
 * site. The settings half is `edsResetConfigStep.test.ts`.
 *
 * The same behaviour is also pinned through `executeEdsReset` in
 * `edsResetService-orchestration.test.ts`; this suite is the step's own, so a
 * focused mutation run measures the module against tests named for it.
 */

jest.mock('@/core/utils/sleep', () => ({ sleep: jest.fn().mockResolvedValue(undefined) }));

const mockPreviewCode = jest.fn();
const mockHelixService = jest.fn().mockImplementation(() => ({ previewCode: mockPreviewCode }));
jest.mock('@/features/eds/services/helix/helixService', () => ({
    HelixService: function HelixService(...args: unknown[]) {
        return mockHelixService(...args);
    },
}));

const mockGetUserEmail = jest.fn();
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    configureDaLivePermissions: jest.fn().mockResolvedValue({ success: true }),
    getDaLiveAuthService: jest.fn(() => ({ getUserEmail: mockGetUserEmail })),
}));

import { createMockHandlerContext } from '../../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../../helpers/projectFake';
import { RESET_STEP } from '@/core/utils/resetStages';
import {
    configureDaLivePermissions,
    getDaLiveAuthService,
} from '@/features/eds/handlers/edsHelpers';
import type { TokenProvider } from '@/features/eds/services/daLive/daLiveOrgOperations';
import type { GitHubTokenService } from '@/features/eds/services/github/githubTokenService';
import {
    republishCodeIfMissed,
    syncCodeAndPermissions,
} from '@/features/eds/services/reset/edsResetCodeSyncStep';
import { ADMIN_API_401_MESSAGE } from '@/features/eds/services/helix/helixAdminErrors';
import type { EdsResetParams } from '@/features/eds/services/reset/edsResetParams';
import type { HandlerContext } from '@/types/handlers';

const params: EdsResetParams = {
    repoOwner: 'acme',
    repoName: 'storefront',
    daLiveOrg: 'acme-org',
    daLiveSite: 'storefront-site',
    templateOwner: 'template-owner',
    templateRepo: 'template-repo',
    project: createMockProject({ name: 'demo' }),
};
const githubTokenService = { getToken: jest.fn() } as unknown as GitHubTokenService;
const tokenProvider: TokenProvider = { getAccessToken: jest.fn() };

async function run(): Promise<{ context: HandlerContext; steps: Array<[number, string]> }> {
    const context = createMockHandlerContext();
    const steps: Array<[number, string]> = [];
    await syncCodeAndPermissions(params, context, githubTokenService, tokenProvider, (s, m) => {
        steps.push([s, m]);
    });
    return { context, steps };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockPreviewCode.mockResolvedValue(undefined);
    mockGetUserEmail.mockResolvedValue('sc@example.com');
});

describe('syncCodeAndPermissions — the code', () => {
    it('previews the whole repo through a Helix service built on the DA.live token provider', async () => {
        const { context } = await run();

        expect(mockHelixService).toHaveBeenCalledWith(context.logger, githubTokenService, tokenProvider);
        expect(mockPreviewCode).toHaveBeenCalledWith('acme', 'storefront', '/*');
    });

    it('reports the publish, then that it landed, then the permissions, all on one step', async () => {
        const { steps } = await run();

        expect(steps).toStrictEqual([
            [RESET_STEP.publishingCodeAndSettings, 'Publishing the code'],
            [RESET_STEP.publishingCodeAndSettings, 'Code published'],
            [RESET_STEP.publishingCodeAndSettings, 'Setting site permissions'],
        ]);
    });

    it('answers with no error when the code published', async () => {
        const context = createMockHandlerContext();

        const outcome = await syncCodeAndPermissions(params, context, githubTokenService, tokenProvider, () => {});

        expect(outcome).toStrictEqual({});
    });

    it('answers with the reason when it did not, so the reset can publish again later', async () => {
        mockPreviewCode.mockRejectedValue(new Error('helix down'));
        const context = createMockHandlerContext();

        const outcome = await syncCodeAndPermissions(params, context, githubTokenService, tokenProvider, () => {});

        expect(outcome).toStrictEqual({ codeError: 'helix down' });
    });

    it('carries on to the permissions past a failed code sync, reporting it as pending', async () => {
        mockPreviewCode.mockRejectedValue(new Error('helix down'));

        const { steps } = await run();

        expect(steps).toStrictEqual([
            [RESET_STEP.publishingCodeAndSettings, 'Publishing the code'],
            [RESET_STEP.publishingCodeAndSettings, 'Waiting for the publish'],
            [RESET_STEP.publishingCodeAndSettings, 'Setting site permissions'],
        ]);
        expect(configureDaLivePermissions).toHaveBeenCalledTimes(1);
    });
});

describe('syncCodeAndPermissions — the permissions', () => {
    it('grants the signed-in user on the DA.live org and site', async () => {
        const { context } = await run();

        expect(getDaLiveAuthService).toHaveBeenCalledWith(context.context);
        expect(configureDaLivePermissions).toHaveBeenCalledWith(
            tokenProvider,
            'acme-org',
            'storefront-site',
            'sc@example.com',
            context.logger,
        );
    });

    it('grants nobody when DA.live gives no user email', async () => {
        mockGetUserEmail.mockResolvedValue(undefined);

        await run();

        expect(configureDaLivePermissions).not.toHaveBeenCalled();
    });
});

/**
 * Owner decision 2026-10-22: when the reset's first code publish fails, publish
 * again once the site has been (re-)registered, and say so if it still fails.
 * A site whose config was missing refuses the first publish with "config for site
 * not found" (measured on scratch-1022), and nothing after step 7 published code.
 */
describe('republishCodeIfMissed — after the site is registered', () => {
    async function republish(codeError: string | undefined) {
        const logger = createMockHandlerContext().logger;
        const steps: Array<[number, string]> = [];
        const sentence = await republishCodeIfMissed(
            params,
            codeError,
            { githubTokenService, tokenProvider, logger },
            (s, m) => steps.push([s, m]),
        );
        return { sentence, steps, logger };
    }

    it('does nothing when the first publish landed', async () => {
        const { sentence, steps } = await republish(undefined);

        expect(sentence).toBeUndefined();
        expect(mockPreviewCode).not.toHaveBeenCalled();
        expect(steps).toStrictEqual([]);
    });

    it('publishes the whole repo again through the DA.live-authenticated Helix service', async () => {
        const { sentence, steps, logger } = await republish('config for site not found');

        expect(sentence).toBeUndefined();
        expect(mockHelixService).toHaveBeenCalledWith(logger, githubTokenService, tokenProvider);
        expect(mockPreviewCode).toHaveBeenCalledWith('acme', 'storefront', '/*');
        expect(steps).toStrictEqual([
            [RESET_STEP.publishingCodeAndSettings, 'Publishing the code'],
            [RESET_STEP.publishingCodeAndSettings, 'Code published'],
        ]);
    });

    it('waits out a 401 from a site whose admins were just restored', async () => {
        mockPreviewCode
            .mockRejectedValueOnce(new Error(ADMIN_API_401_MESSAGE))
            .mockResolvedValue(undefined);

        const { sentence } = await republish('config for site not found');

        expect(sentence).toBeUndefined();
        expect(mockPreviewCode).toHaveBeenCalledTimes(2);
    });

    it('says what is wrong, and what to do, when it still fails', async () => {
        mockPreviewCode.mockRejectedValue(new Error('helix 503'));

        const { sentence, steps } = await republish('config for site not found');

        expect(sentence).toMatch(/could not be published/);
        expect(sentence).toMatch(/helix 503/);
        expect(sentence).toMatch(/Republish/);
        expect(steps).toContainEqual([RESET_STEP.publishingCodeAndSettings, `⚠️ ${sentence}`]);
    });
});
