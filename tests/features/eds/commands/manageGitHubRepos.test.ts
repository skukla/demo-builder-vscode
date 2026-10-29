/**
 * "Manage GitHub Repositories" deletes each chosen repository, and a storefront's code on
 * aem.live with it (EDS-67).
 *
 * The command deletes repositories of any kind; `deleteStorefrontRepository` decides which
 * are storefronts and removes their code after the repository is gone. What these pin is
 * the batch: each repository is handed over by owner and name, in order; one failure
 * never stops the rest; and a repository whose code may still be served is never
 * reported as cleanly deleted.
 */

import { deleteGitHubRepos, describeRepoOutcome } from '@/features/eds/commands/manageGitHubRepos';
import { createMockLogger } from '../../../helpers/loggerFake';

describe('deleteGitHubRepos', () => {
    it('deletes each repository by owner and name, in order', async () => {
        const deleteRepository = jest.fn().mockResolvedValue({});
        const onRepo = jest.fn();

        const outcome = await deleteGitHubRepos(['acme/one', 'acme/two'], {
            logger: createMockLogger(),
            deleteRepository,
            onRepo,
        });

        expect(deleteRepository.mock.calls).toEqual([
            ['acme', 'one'],
            ['acme', 'two'],
        ]);
        expect(onRepo.mock.calls).toEqual([['acme/one'], ['acme/two']]);
        expect(outcome).toEqual({ deleted: ['acme/one', 'acme/two'], failed: [], codeLeft: [], kept: [] });
    });

    it('carries on past a failure, and refuses a name that is not owner/repo without calling GitHub', async () => {
        const deleteRepository = jest
            .fn()
            .mockRejectedValueOnce(new Error('403 from GitHub'))
            .mockResolvedValue({});

        const outcome = await deleteGitHubRepos(['acme/one', 'no-slash', 'acme/two'], {
            logger: createMockLogger(),
            deleteRepository,
        });

        expect(deleteRepository.mock.calls).toEqual([
            ['acme', 'one'],
            ['acme', 'two'],
        ]);
        expect(outcome.deleted).toEqual(['acme/two']);
        expect(outcome.failed).toEqual([
            { repo: 'acme/one', error: '403 from GitHub' },
            { repo: 'no-slash', error: 'Invalid repository format: no-slash' },
        ]);
    });

    it("lists a deleted storefront whose code may still be on aem.live, with the SC's sentence", async () => {
        const summary = "1 of the site's 40 code files could not be removed from aem.live.";
        const deleteRepository = jest
            .fn()
            .mockResolvedValueOnce({ code: { removed: 39, failed: [], stillServing: true, summary } })
            .mockResolvedValueOnce({ code: { removed: 40, failed: [], stillServing: false } });

        const outcome = await deleteGitHubRepos(['acme/left', 'acme/clean'], {
            logger: createMockLogger(),
            deleteRepository,
        });

        expect(outcome.deleted).toEqual(['acme/left', 'acme/clean']);
        expect(outcome.codeLeft).toEqual([{ repo: 'acme/left', summary }]);
    });

    // Owner, 2026-10-28: with no working DA.live sign-in a storefront is kept, because
    // once the repository is gone its code can never be listed for removal.
    it('lists a storefront kept for want of a DA.live sign-in, apart from the deleted ones', async () => {
        const reason = 'The repository was kept so its site code can still be removed. Sign in to DA.live and delete again.';
        const deleteRepository = jest.fn().mockResolvedValueOnce({ kept: reason }).mockResolvedValueOnce({});

        const outcome = await deleteGitHubRepos(['acme/shop', 'acme/notes'], {
            logger: createMockLogger(),
            deleteRepository,
        });

        expect(outcome).toEqual({ deleted: ['acme/notes'], failed: [], codeLeft: [], kept: [{ repo: 'acme/shop', reason }] });
    });
});

describe('describeRepoOutcome', () => {
    it('is a success only when everything went, code included', () => {
        expect(describeRepoOutcome({ deleted: ['a/b', 'a/c'], failed: [], codeLeft: [], kept: [] })).toEqual({
            level: 'success',
            message: 'Deleted 2 repositories',
        });
    });

    it('is a warning naming the repository and the sentence when code is left', () => {
        const outcome = describeRepoOutcome({
            deleted: ['a/b'],
            failed: [],
            codeLeft: [{ repo: 'a/b', summary: 'Its code is still on aem.live.' }],
            kept: [],
        });

        expect(outcome.level).toBe('warning');
        expect(outcome.message).toBe('Deleted 1 repository. a/b: Its code is still on aem.live.');
    });

    it('keeps naming the failures alongside what was deleted', () => {
        expect(
            describeRepoOutcome({ deleted: ['a/b'], failed: [{ repo: 'a/c', error: 'x' }], codeLeft: [], kept: [] }),
        ).toEqual({ level: 'warning', message: 'Deleted 1, failed 1: a/c' });
    });

    it('is an error when nothing was deleted', () => {
        expect(describeRepoOutcome({ deleted: [], failed: [{ repo: 'a/c', error: 'x' }], codeLeft: [], kept: [] })).toEqual({
            level: 'error',
            message: 'Failed to delete all 1 repositories. Check Debug Logs for details.',
        });
    });
});

describe('describeRepoOutcome — a kept storefront', () => {
    it('is a warning that names what was kept and says what to do, once', () => {
        const reason = 'The repository was kept so its site code can still be removed. Sign in to DA.live and delete again.';

        expect(
            describeRepoOutcome({
                deleted: ['a/notes'],
                failed: [],
                codeLeft: [],
                kept: [{ repo: 'a/shop', reason }, { repo: 'a/other', reason }],
            }),
        ).toEqual({ level: 'warning', message: `Deleted 1. Kept a/shop, a/other. ${reason}` });
    });
});
