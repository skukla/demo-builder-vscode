/**
 * The button's delete run with nobody to ask (`cleanupOptions.nobodyToAsk`), which is how
 * the agent's `delete_project` runs it now (PL-104 fix 6), and the one DA.live sign-in
 * the storefront teardown runs on (fix 7).
 *
 * A sign-in the delete would ask for is refused instead, with the sentence saying which,
 * and the step that needed it does not run. The DA.live check is the guard's own (the one
 * sign-in reader, which asks IMS), so the agent's delete refuses exactly where the button
 * would have asked.
 */

import {
    mockDaLiveAccessToken,
    mockDaLiveCheckSignIn,
    mockDeleteDaLiveSite,
    mockDeleteRepository,
    mockDeleteSiteConfig,
    mockEnsureDaLiveAuth,
    mockGetSession,
    mockGetToken,
    mockRemoveSitePermissions,
    mockRm,
    mockShowWarningMessage,
    mockSleep,
    runProjectDelete,
} from './projectDeletionService.testUtils';
import {
    SERVICES,
    context,
    edsProject,
    mockCheckDaLiveSignIn,
    mockListAllPages,
    mockListPublishedPaths,
    mockUnpublishPages,
} from './projectDeletionService.fixtures';
import {
    DA_LIVE_NOT_SIGNED_IN,
    GITHUB_NOT_SIGNED_IN,
} from '@/features/projects-dashboard/services/deleteSignInRefusals';
import type { CleanupResultItem } from '@/features/eds/services/resourceCleanupHelpers';

/** Delete the storefront project with nobody to ask, the two online boxes as given. */
async function deleteWithNobodyToAsk(deleteGitHubRepo: boolean, deleteDaLiveSite: boolean) {
    const cleanupResults: CleanupResultItem[] = [];
    const cleanupOptions = { deleteGitHubRepo, deleteDaLiveSite, nobodyToAsk: true as const };
    const ran = await runProjectDelete(
        context(),
        edsProject(),
        { cleanupOptions, cleanupResults, services: SERVICES },
        jest.fn()
    );
    return { ran, cleanupResults };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockRm.mockResolvedValue(undefined);
    mockSleep.mockResolvedValue(undefined);
    mockDeleteDaLiveSite.mockResolvedValue({ success: true });
    mockRemoveSitePermissions.mockResolvedValue({ success: true });
    mockDeleteSiteConfig.mockResolvedValue({ success: true });
    mockDeleteRepository.mockResolvedValue(undefined);
    mockGetToken.mockResolvedValue('gh-token');
    mockListAllPages.mockResolvedValue([]);
    mockUnpublishPages.mockResolvedValue({
        success: true,
        count: 0,
        total: 0,
        liveFailed: 0,
        previewFailed: 0,
    });
    mockListPublishedPaths.mockResolvedValue([]);
    mockCheckDaLiveSignIn.mockResolvedValue('valid');
    mockDaLiveAccessToken.mockResolvedValue('da-live-token');
    mockDaLiveCheckSignIn.mockResolvedValue({ state: 'valid' });
});

describe('the DA.live site, with nobody to ask', () => {
    it("checks the sign-in the guard's way and never asks", async () => {
        await deleteWithNobodyToAsk(false, true);

        expect(mockDaLiveCheckSignIn).toHaveBeenCalled();
        expect(mockEnsureDaLiveAuth).not.toHaveBeenCalled();
        expect(mockShowWarningMessage).not.toHaveBeenCalled();
        expect(mockDeleteDaLiveSite).toHaveBeenCalledWith('skukla', 'demo-storefront');
    });

    it.each([['expired'], ['refused'], ['none']])(
        'skips the site, saying why, when the sign-in is %s',
        async (state) => {
            mockDaLiveCheckSignIn.mockResolvedValue({ state });

            const { cleanupResults } = await deleteWithNobodyToAsk(false, true);

            expect(mockDeleteDaLiveSite).not.toHaveBeenCalled();
            expect(cleanupResults).toContainEqual({
                type: 'daLive',
                name: 'skukla/demo-storefront',
                success: false,
                skipped: true,
                error: DA_LIVE_NOT_SIGNED_IN,
            });
        }
    );

    it('carries on when IMS did not answer, as the guard does', async () => {
        mockDaLiveCheckSignIn.mockResolvedValue({ state: 'unknown' });

        await deleteWithNobodyToAsk(false, true);

        expect(mockDeleteDaLiveSite).toHaveBeenCalled();
    });
});

describe('the repository, with nobody to ask', () => {
    it('skips it, saying why, when no GitHub token is stored, and asks nothing', async () => {
        mockGetToken.mockResolvedValue(null);

        const { cleanupResults } = await deleteWithNobodyToAsk(true, false);

        expect(mockShowWarningMessage).not.toHaveBeenCalled();
        expect(mockGetSession).not.toHaveBeenCalled();
        expect(mockDeleteRepository).not.toHaveBeenCalled();
        expect(cleanupResults).toContainEqual({
            type: 'github',
            name: 'skukla/demo-storefront',
            success: false,
            skipped: true,
            error: GITHUB_NOT_SIGNED_IN,
        });
    });

    it('deletes it on the stored token, and hands back what happened to its code', async () => {
        const { ran } = await deleteWithNobodyToAsk(true, false);

        expect(mockDeleteRepository).toHaveBeenCalledWith('skukla', 'demo-storefront');
        expect(ran.siteCode).toMatchObject({ removed: expect.any(Number) });
    });
});

describe('what the delete hands back about the storefront', () => {
    it("is the teardown's own result, beside the rows", async () => {
        const { ran } = await deleteWithNobodyToAsk(false, true);

        expect(ran.storefront).toMatchObject({ contentDeleted: true });
    });
});
