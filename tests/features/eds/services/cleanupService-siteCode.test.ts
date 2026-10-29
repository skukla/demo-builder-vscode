/**
 * The setup cancel's cleanup, and a storefront's code on aem.live (EDS-67).
 *
 * Cancelling a storefront setup deletes the repository it made. Its code was by then
 * often on aem.live already (the setup publishes it), and the delete left it there. A
 * DELETE goes through `deleteStorefrontRepository`, which lists the files first and
 * removes the code after the repository is gone. An ARCHIVE keeps the repository, so it
 * removes nothing: the code is still the repository's.
 *
 * Driven with the real removal and fakes at its edges (the file list, the Helix call,
 * the live check), so the ORDER is read off one tape across all of them.
 */

import { CleanupService, setupCleanupHarness, type CleanupHarness } from './cleanupService.testUtils';
import type { CodeRemovalWiring } from '@/features/eds/services/cleanupService';
import type { ConfigurationService } from '@/features/eds/services/configService/configurationService';
import type { DaLiveOrgOperations } from '@/features/eds/services/daLive/daLiveOrgOperations';
import type { GitHubRepoLifecycle } from '@/features/eds/services/github/githubRepoLifecycle';
import type { ToolManager } from '@/features/eds/services/toolManager';
import { createMockLogger } from '../../../helpers/loggerFake';

const METADATA = { githubRepo: 'acme/site', daLiveOrg: 'acme', daLiveSite: 'site' };

let h: CleanupHarness;
let deleteCode: jest.Mock;
let wiring: CodeRemovalWiring & { checkLive: jest.Mock };

function serviceWith(codeRemoval: CodeRemovalWiring): CleanupService {
    return new CleanupService(
        h.githubRepoOps as unknown as GitHubRepoLifecycle,
        h.daLiveOrgOps as unknown as DaLiveOrgOperations,
        h.toolManager as unknown as ToolManager,
        codeRemoval,
        createMockLogger(),
        h.configurationService as unknown as ConfigurationService,
    );
}

beforeEach(() => {
    h = setupCleanupHarness();
    deleteCode = jest.fn(async (_o: string, _r: string, path: string) => {
        h.operationOrder.push(`code ${path}`);
    });
    wiring = {
        files: {
            listRepoFiles: jest.fn(async () => {
                h.operationOrder.push('list');
                return [{ path: 'scripts/aem.js' }];
            }),
        },
        tokenProvider: { getAccessToken: async () => 'da-live-token' },
        checkSignIn: async () => 'valid',
        makeHelix: () => ({ deleteCode }),
        checkLive: jest.fn(async () => 404),
    };
});

describe('a delete', () => {
    it('lists the repository, deletes it, then removes its code from the same site', async () => {
        const result = await serviceWith(wiring).cleanupEdsResources(METADATA, {
            deleteGitHub: true,
            archiveInsteadOfDelete: false,
        });

        expect(h.operationOrder).toEqual(['list', 'github', 'code /scripts/aem.js']);
        expect(wiring.files.listRepoFiles).toHaveBeenCalledWith('acme', 'site', 'main');
        expect(h.githubRepoOps.deleteRepository).toHaveBeenCalledWith('acme', 'site');
        expect(deleteCode).toHaveBeenCalledWith('acme', 'site', '/scripts/aem.js', 'main');
        expect(result.github).toEqual({ success: true, skipped: false });
        expect(result.siteCode).toEqual({ success: true, skipped: false });
    });

    it("reports the code as not removed, with the SC's sentence, when aem.live still serves it", async () => {
        wiring.checkLive.mockResolvedValue(200);

        const result = await serviceWith(wiring).cleanupEdsResources(METADATA, { deleteGitHub: true });

        expect(result.github).toEqual({ success: true, skipped: false });
        expect(result.siteCode).toEqual({
            success: false,
            skipped: false,
            error: expect.stringContaining('still serves'),
        });
    });

    it('removes no code when the repository delete fails', async () => {
        (h.githubRepoOps.deleteRepository as jest.Mock).mockRejectedValue(new Error('403 from GitHub'));

        const result = await serviceWith(wiring).cleanupEdsResources(METADATA, { deleteGitHub: true });

        expect(deleteCode).not.toHaveBeenCalled();
        expect(result.github).toEqual({ success: false, skipped: false, error: '403 from GitHub' });
        expect(result.siteCode).toEqual({ success: false, skipped: true });
    });
});

// Owner, 2026-10-28: with no working DA.live sign-in the repository is kept, because
// once it is gone its code can never be listed for removal.
describe('a delete with no working DA.live sign-in', () => {
    it('keeps the repository and says why, deleting and removing nothing', async () => {
        const result = await serviceWith({ ...wiring, checkSignIn: async () => 'refused' }).cleanupEdsResources(
            METADATA,
            { deleteGitHub: true },
        );

        expect(h.githubRepoOps.deleteRepository).not.toHaveBeenCalled();
        expect(deleteCode).not.toHaveBeenCalled();
        expect(result.github).toEqual({
            success: false,
            skipped: false,
            error: 'The repository was kept so its site code can still be removed. Sign in to DA.live and delete again.',
        });
        expect(result.siteCode).toEqual({ success: false, skipped: true });
    });
});

describe('an archive', () => {
    it('keeps the code with the repository: nothing listed, nothing removed', async () => {
        const result = await serviceWith(wiring).cleanupEdsResources(METADATA, {
            deleteGitHub: true,
            archiveInsteadOfDelete: true,
        });

        expect(h.githubRepoOps.archiveRepository).toHaveBeenCalledWith('acme', 'site');
        expect(wiring.files.listRepoFiles).not.toHaveBeenCalled();
        expect(deleteCode).not.toHaveBeenCalled();
        expect(wiring.checkLive).not.toHaveBeenCalled();
        expect(result.siteCode).toEqual({ success: false, skipped: true });
    });
});
