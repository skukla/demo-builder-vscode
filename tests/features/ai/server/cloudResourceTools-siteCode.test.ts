/**
 * `delete_github_repo` and AEM's copy of the repository's code (EDS-67).
 *
 * Deleting a storefront's repository left its code serving on aem.live. The tool now
 * deletes through `deleteStorefrontRepository`, which lists the files first, deletes the
 * repository, then removes the code. Here that function is the recorder and its
 * ARGUMENTS are the subject; the order inside it is `storefrontCodeRemoval.test.ts`'s.
 *
 * This spec declares one mock of its own, above the import of the family's harness. It
 * hoists above that import, so the subject (which the harness loads) binds to it.
 */

jest.mock('@/features/eds/services/storefront/storefrontCodeRemoval', () => ({
    deleteStorefrontRepository: jest.fn(),
}));

import {
    ctxFactory,
    fakeServer,
    getGitHubServicesMock,
    gh,
    mockDaLiveAuth,
    registerCloudResourceTools,
    resetCloudResourceMocks,
} from './cloudResourceTools.testUtils';
import {
    deleteStorefrontRepository,
    type StorefrontRepoDeletionDeps,
} from '@/features/eds/services/storefront/storefrontCodeRemoval';

const deleteRepo = deleteStorefrontRepository as jest.MockedFunction<typeof deleteStorefrontRepository>;
const CONFIRMED = { owner: 'acme', repo: 'shop', confirm: true, confirmName: 'acme/shop' };

function serve(services = gh()) {
    getGitHubServicesMock.mockReturnValue(services);
    const server = fakeServer();
    registerCloudResourceTools(server, ctxFactory);
    return { server, services };
}

beforeEach(() => {
    resetCloudResourceMocks();
    deleteRepo.mockResolvedValue({ code: { removed: 9, failed: [], stillServing: false } });
});

describe('delete_github_repo — the code removal it hands the delete to', () => {
    it('names THE repository, with its file list and its delete', async () => {
        const { server, services } = serve();

        await server.call('delete_github_repo', CONFIRMED);

        expect(deleteRepo).toHaveBeenCalledTimes(1);
        const [target, deps] = deleteRepo.mock.calls[0] as [unknown, StorefrontRepoDeletionDeps];
        expect(target).toStrictEqual({ owner: 'acme', repo: 'shop' });
        expect(deps.files).toBe(services.fileOperations);
        await deps.deleteRepository('acme', 'shop');
        expect(services.repoLifecycle.deleteRepository).toHaveBeenCalledWith('acme', 'shop');
    });

    it('hands it the DA.live session, the credential the code bus DELETE was measured with', async () => {
        mockDaLiveAuth.getAccessToken.mockResolvedValue('da-live-token');
        const { server } = serve();

        await server.call('delete_github_repo', CONFIRMED);

        const [, deps] = deleteRepo.mock.calls[0] as [unknown, StorefrontRepoDeletionDeps];
        expect(await deps.tokenProvider?.getAccessToken()).toBe('da-live-token');
    });

    it('says what happened to the code, as counts', async () => {
        const { server } = serve();

        expect(await server.call('delete_github_repo', CONFIRMED)).toStrictEqual({
            deleted: true,
            repo: 'acme/shop',
            siteCode: { removed: 9, notRemoved: 0, stillServing: false },
        });
    });

    it('carries the sentence when code may be left', async () => {
        const summary = '1 of the site\'s 9 code files could not be removed from aem.live, so some of its code may still be served there.';
        deleteRepo.mockResolvedValue({
            code: { removed: 8, failed: [{ path: '/head.html', reason: '503' }], stillServing: 'unknown', summary },
        });
        const { server } = serve();

        const res = await server.call('delete_github_repo', CONFIRMED);

        expect(res.siteCode).toStrictEqual({ removed: 8, notRemoved: 1, stillServing: 'unknown', summary });
    });

    // Owner, 2026-10-28: once the repository is gone its code can never be listed for removal.
    it('says the repository was kept, not deleted, when there is no working DA.live sign-in', async () => {
        const kept = 'The repository was kept so its site code can still be removed. Sign in to DA.live and delete again.';
        deleteRepo.mockResolvedValue({ kept });
        const { server } = serve();

        expect(await server.call('delete_github_repo', CONFIRMED)).toStrictEqual({
            deleted: false,
            kept: true,
            repo: 'acme/shop',
            error: kept,
        });
    });

    it('says nothing about code for a repository that was not a storefront', async () => {
        deleteRepo.mockResolvedValue({});
        const { server } = serve();

        expect(await server.call('delete_github_repo', CONFIRMED)).toStrictEqual({ deleted: true, repo: 'acme/shop' });
    });
});
