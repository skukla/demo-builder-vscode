/**
 * EDS Reset Service — what steps 0 through 11 HAND their collaborators.
 *
 * The name migration, the repo reset, the code sync, the permission grant, the
 * config step and the content pipeline, each asserted by the arguments it
 * receives and the progress the caller sees. The result of a reset and the
 * final steps live in `edsResetService-finalize.test.ts`.
 */

import {
    helixInstance,
    mockExecuteEdsPipeline,
    mockHelixService,
    mockMigrate,
    mockPreviewCode,
    mockPublishConfig,
    mockResetRepoToTemplate,
    mockTokenProvider,
    pipelineProgressCallback,
    resetOrchestrationMocks,
    runReset,
    REPO_RESULT,
    SERVICES,
} from './edsResetService.orchestrationHarness';
import { mockEnsureDaLiveAuth } from './edsResetService.sharedMocks';

import type { CodePatchResult } from '@/features/eds/services/patches/codePatchRegistry';

import { lostGrantsMessage } from '@/features/eds/services/configService/lostGrantsMessage';
import { DaLiveContentOperations } from '@/features/eds/services/daLive/daLiveContentOperations';
import {
    configureDaLivePermissions,
    getDaLiveAuthService,
    getGitHubServices,
} from '@/features/eds/handlers/edsHelpers';
import { DaLiveAuthError } from '@/features/eds/services/types';

jest.setTimeout(5000);

beforeEach(resetOrchestrationMocks);

// =============================================================================
// Step 0: name migration
// =============================================================================

describe('executeEdsReset - storefront name migration', () => {
    it('hands the migration the params, the project, the content ops and the injected config service', async () => {
        const { params, project, context } = await runReset();

        expect(mockMigrate).toHaveBeenCalledWith(
            params,
            project,
            expect.any(DaLiveContentOperations),
            SERVICES.configService,
            context.logger
        );
    });

    it('stops before touching the repo when the migration reports an error', async () => {
        mockMigrate.mockResolvedValue({
            skipped: false,
            migrated: false,
            error: 'Migration failed',
        });

        const { result } = await runReset();

        expect(result).toStrictEqual({ success: false, error: 'Migration failed' });
        expect(mockResetRepoToTemplate).not.toHaveBeenCalled();
    });

    it('reports lost admin grants as a step-0 warning and carries on', async () => {
        mockMigrate.mockResolvedValue({
            skipped: false,
            migrated: true,
            lostGrants: ['a***@example.com'],
        });

        const { result, progress } = await runReset();

        expect(progress[0]).toStrictEqual({
            step: 0,
            totalSteps: 11,
            message: `⚠️ ${lostGrantsMessage(['a***@example.com'], 'Storefront name migration completed')}`,
        });
        expect(result.success).toBe(true);
    });

    it('does not report a step-0 warning when no grants were lost', async () => {
        const { progress } = await runReset();

        expect(progress.some((p) => p.step === 0)).toBe(false);
    });
});

// =============================================================================
// Steps 1, 4, 5, 7: repo reset, code sync, permissions, config step
// =============================================================================

describe('executeEdsReset - repo, code sync and permissions', () => {
    it('resets the repo with the params, the context and the GitHub file ops', async () => {
        const { params, context } = await runReset();

        const { fileOperations } = getGitHubServices(context.context.secrets);
        expect(mockResetRepoToTemplate).toHaveBeenCalledWith(
            params,
            context,
            fileOperations,
            expect.any(Function)
        );
    });

    it('previews the whole repo through a Helix service built on the DA.live token provider', async () => {
        const { context, progress } = await runReset();

        const { tokenService } = getGitHubServices(context.context.secrets);
        expect(mockHelixService).toHaveBeenCalledWith(
            context.logger,
            tokenService,
            mockTokenProvider
        );
        expect(mockPreviewCode).toHaveBeenCalledWith('test-owner', 'test-repo', '/*');
        expect(progress).toContainEqual({
            step: 4,
            totalSteps: 11,
            message: 'Syncing code to CDN...',
        });
        expect(progress).toContainEqual({ step: 4, totalSteps: 11, message: 'Code synchronized' });
    });

    it('carries on past a failed code sync, reporting it as pending', async () => {
        mockPreviewCode.mockRejectedValue(new Error('helix down'));

        const { result, progress } = await runReset();

        expect(result.success).toBe(true);
        expect(progress).toContainEqual({
            step: 4,
            totalSteps: 11,
            message: 'Code sync pending...',
        });
        expect(progress).not.toContainEqual(
            expect.objectContaining({ message: 'Code synchronized' })
        );
        expect(configureDaLivePermissions).toHaveBeenCalledTimes(1);
    });

    it('grants the signed-in user on the DA.live org/site', async () => {
        const { context, progress } = await runReset();

        expect(progress).toContainEqual({
            step: 5,
            totalSteps: 11,
            message: 'Configuring site permissions...',
        });
        expect(configureDaLivePermissions).toHaveBeenCalledWith(
            mockTokenProvider,
            'test-org',
            'test-repo',
            'test@example.com',
            context.logger
        );
    });

    it('skips the permission grant when no user email is available', async () => {
        (getDaLiveAuthService as jest.Mock).mockReturnValueOnce({
            getAccessToken: jest.fn().mockResolvedValue('token'),
            getUserEmail: jest.fn().mockResolvedValue(undefined),
        });

        const { result } = await runReset();

        expect(configureDaLivePermissions).not.toHaveBeenCalled();
        expect(result.success).toBe(true);
    });

    it('forwards the config step its params, token services, logger and the service seam', async () => {
        const { params, context } = await runReset();

        const { tokenService } = getGitHubServices(context.context.secrets);
        expect(mockPublishConfig).toHaveBeenCalledWith(
            params,
            tokenService,
            mockTokenProvider,
            context.logger,
            expect.any(Function),
            SERVICES
        );
    });
});

// =============================================================================
// Steps 8-11: the content pipeline
// =============================================================================

describe('executeEdsReset - content pipeline', () => {
    it('runs the pipeline with the full option set, seeded from the repo reset', async () => {
        const codeResult: CodePatchResult = {
            patchId: 'p1',
            target: 'scripts/a.js',
            applied: false,
            reason: 'gone',
        };
        mockResetRepoToTemplate.mockResolvedValue({
            ...REPO_RESULT,
            canonicalCodePatchResults: [codeResult],
        });
        const contentPatchSource = { owner: 'po', repo: 'pr', path: 'content' };
        const codePatchSource = { owner: 'po', repo: 'pr', path: 'code' };
        const brandAssets = { source: { owner: 'b', repo: 'r', branch: 'main' }, files: [] };

        const { project } = await runReset({
            contentSource: { org: 'content-org', site: 'content-site' },
            accountContentSource: { org: 'acct-org', site: 'acct-site' },
            contentPatches: ['cp'],
            contentPatchSource,
            codePatches: ['kp'],
            codePatchSource,
            brandAssets,
            byomOverlayUrl: 'https://byom.example.com',
        });

        expect(mockExecuteEdsPipeline.mock.calls[0][0]).toStrictEqual({
            repoOwner: 'test-owner',
            repoName: 'test-repo',
            daLiveOrg: 'test-org',
            daLiveSite: 'test-repo',
            templateOwner: 'template-owner',
            templateRepo: 'template-repo',
            clearExistingContent: true,
            skipContent: false,
            contentSource: { org: 'content-org', site: 'content-site' },
            accountContentSource: { org: 'acct-org', site: 'acct-site' },
            contentPatches: ['cp'],
            contentPatchSource,
            includeBlockLibrary: false,
            codePatches: ['kp'],
            codePatchSource,
            brandAssets,
            patchReport: {
                results: [
                    {
                        kind: 'code',
                        patchId: 'p1',
                        target: 'scripts/a.js',
                        applied: false,
                        reason: 'gone',
                    },
                ],
            },
            blockCollectionIds: ['hero', 'cards'],
            libraryContentSources: [{ org: 'lib-org', site: 'lib-site' }],
            purgeCache: true,
            skipPublish: false,
            byomOverlayUrl: 'https://byom.example.com',
            project,
        });
    });

    it('skips content when there is no content source, and starts from an empty patch report', async () => {
        mockResetRepoToTemplate.mockResolvedValue({
            ...REPO_RESULT,
            canonicalCodePatchResults: undefined,
        });

        await runReset({ includeBlockLibrary: true });

        expect(mockExecuteEdsPipeline.mock.calls[0][0]).toEqual(
            expect.objectContaining({
                skipContent: true,
                contentSource: undefined,
                includeBlockLibrary: true,
                patchReport: { results: [] },
            })
        );
    });

    it('hands the pipeline the content ops, the file ops, the Helix service and the logger', async () => {
        const { context } = await runReset();

        const { fileOperations } = getGitHubServices(context.context.secrets);
        expect(mockExecuteEdsPipeline.mock.calls[0][1]).toStrictEqual({
            daLiveContentOps: expect.any(DaLiveContentOperations),
            githubFileOps: fileOperations,
            helixService: helixInstance,
            logger: context.logger,
        });
    });

    it('fails the reset with the pipeline error when the pipeline reports failure', async () => {
        mockExecuteEdsPipeline.mockResolvedValue({ success: false, error: 'Pipeline exploded' });

        const { result } = await runReset();

        expect(result).toStrictEqual({ success: false, error: 'Pipeline exploded' });
    });

    it('fails the reset with a generic message when the pipeline fails without one', async () => {
        mockExecuteEdsPipeline.mockResolvedValue({ success: false });

        const { result } = await runReset();

        expect(result).toStrictEqual({ success: false, error: 'Content pipeline failed' });
    });

    it('reports the session expiry and the resume on step 8 around a DA.live re-auth', async () => {
        mockExecuteEdsPipeline
            .mockRejectedValueOnce(new DaLiveAuthError('expired'))
            .mockResolvedValueOnce({ success: true, contentFilesCopied: 3, libraryPaths: [] });

        const { progress } = await runReset();

        const stepEight = progress.filter((p) => p.step === 8).map((p) => p.message);
        expect(stepEight).toStrictEqual([
            'DA.live session expired. Please re-authenticate...',
            'Resuming content pipeline...',
        ]);
    });

    it('names the operation in the cancellation error', async () => {
        mockExecuteEdsPipeline.mockRejectedValue(new DaLiveAuthError('expired'));
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: false, cancelled: true });

        const { result } = await runReset();

        expect(result).toStrictEqual({
            success: false,
            error: 'Reset cancelled — DA.live re-authentication required',
        });
    });
});

describe('executeEdsReset - pipeline progress mapping', () => {
    it.each([
        ['content-clear', 8],
        ['content-copy', 8],
        ['block-library', 9],
        ['eds-settings', 10],
        ['cache-purge', 11],
        ['library-publish', 11],
        ['catalog-prewarm', 11],
        ['something-new', 8],
    ])('maps %s to step %i with the message unchanged', async (operation, step) => {
        const { progress } = await runReset();
        progress.length = 0;

        pipelineProgressCallback()({ operation, message: 'Working', current: 2, total: 9 });

        expect(progress).toStrictEqual([{ step, totalSteps: 11, message: 'Working' }]);
    });

    it('rewrites content-publish progress as a page count on step 11', async () => {
        const { progress } = await runReset();
        progress.length = 0;

        pipelineProgressCallback()({
            operation: 'content-publish',
            message: 'Publishing',
            current: 3,
            total: 10,
        });

        expect(progress).toStrictEqual([
            { step: 11, totalSteps: 11, message: 'Publishing to CDN (3/10 pages)' },
        ]);
    });

    it.each([
        ['no current', { current: undefined, total: 10 }],
        ['a zero total', { current: 3, total: 0 }],
    ])('leaves the content-publish message alone with %s', async (_label, counts) => {
        const { progress } = await runReset();
        progress.length = 0;

        pipelineProgressCallback()({
            operation: 'content-publish',
            message: 'Publishing',
            ...counts,
        });

        expect(progress).toStrictEqual([{ step: 11, totalSteps: 11, message: 'Publishing' }]);
    });
});
