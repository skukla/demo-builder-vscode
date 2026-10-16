/**
 * Reset step 2 (publishing code and settings), its code-and-permissions half,
 * driven directly: publish the code, then grant the signed-in user on the DA.live
 * site. The settings half is `edsResetConfigStep.test.ts`.
 *
 * The same behaviour is also pinned through `executeEdsReset` in
 * `edsResetService-orchestration.test.ts`; this suite is the step's own, so a
 * focused mutation run measures the module against tests named for it.
 */

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
import { syncCodeAndPermissions } from '@/features/eds/services/reset/edsResetCodeSyncStep';
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
