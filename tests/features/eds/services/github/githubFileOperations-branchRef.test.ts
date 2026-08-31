/**
 * Moving a branch ref is a force-push. It must be asked for, never assumed.
 *
 * `updateBranchRef` took `force = true` as its DEFAULT, and none of its three
 * callers passed the flag. Two of them are ADDITIVE — installing a block library
 * (`blockCollectionHelpers.ts:281`) and vendoring Demo Inspector tagging
 * (`inspectorHelpers.ts:307`) — and neither means to rewrite anything.
 *
 * They read the branch first (`getBranchInfo` → `createTree` → `createCommit` →
 * `updateBranchRef`), so the base tree is fresh when the sequence starts. The
 * damage is in what happens when it is no longer fresh when the sequence ENDS:
 * tree creation is several API round-trips, batched for a large library, and a
 * commit landing inside that window makes the ref update a non-fast-forward.
 *
 *   unforced  GitHub rejects it (422). Nothing is lost. The caller can retry.
 *   forced    The ref moves anyway — silently discarding that commit AND
 *             reverting every file whose content differs from the base tree
 *             read at the start.
 *
 * Reported 2026-08-18 by a colleague, who lost a `.hlxignore` fix and a
 * `commerce-b2b-negotiable-quote.js` fix twice in one evening. They attributed
 * it to `ConfigSync`, whose commit message sat on top of the loss — but that
 * path writes through the Contents API (fetch the file's SHA, PUT with it),
 * which cannot rewrite history or touch another file. It was the newest thing
 * visible, not the cause.
 *
 * The default was written for the one caller that DOES mean it: the docstring
 * said "default: true for reset". A default that encodes one caller's needs and
 * applies silently to every other is the whole defect.
 */

import { GitHubFileOperations } from '@/features/eds/services/github/githubFileOperations';
import type { GitHubTreeInput } from '@/features/eds/services/types';
import type { GitHubTokenService } from '@/features/eds/services/github/githubTokenService';

const mockRequest = jest.fn();

// `@octokit/core`, wrapped in the retry plugin — `Octokit.plugin(retry)` returns
// the constructor the service actually news up, so the mock has to provide it.
jest.mock('@octokit/core', () => ({
    Octokit: {
        plugin: () =>
            jest.fn().mockImplementation(() => ({
                request: (...args: unknown[]) => mockRequest(...args),
            })),
    },
}));


jest.mock('@/core/logging', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        trace: jest.fn(),
    }),
}));

const tokenService = {
    getToken: jest.fn().mockResolvedValue({ token: 'gh-token' }),
} as unknown as GitHubTokenService;

/** The `force` value that reached the GitHub refs API. */
function forceSentToGitHub(): unknown {
    const call = mockRequest.mock.calls.find(
        ([route]) => typeof route === 'string' && route.includes('/git/refs/heads/')
    );
    return (call?.[1] as { force?: unknown } | undefined)?.force;
}

beforeEach(() => {
    mockRequest.mockReset();
    mockRequest.mockResolvedValue({ data: {} });
});

describe('updateBranchRef', () => {
    it('does NOT force by default — a caller that means it has to say so', async () => {
        const ops = new GitHubFileOperations(tokenService);

        await ops.updateBranchRef('owner', 'repo', 'main', 'new-commit-sha');

        expect(forceSentToGitHub()).toBe(false);
    });

    it('forces when the caller explicitly asks', async () => {
        // Replacing a repository's history is a real operation; this keeps it
        // available, just not free.
        const ops = new GitHubFileOperations(tokenService);

        await ops.updateBranchRef('owner', 'repo', 'main', 'new-commit-sha', true);

        expect(forceSentToGitHub()).toBe(true);
    });

    it('still targets the branch ref the caller named', async () => {
        const ops = new GitHubFileOperations(tokenService);

        await ops.updateBranchRef('skukla', 'storefront', 'main', 'abc123');

        expect(mockRequest).toHaveBeenCalledWith(
            'PATCH /repos/{owner}/{repo}/git/refs/heads/{branch}',
            expect.objectContaining({
                owner: 'skukla',
                repo: 'storefront',
                branch: 'main',
                sha: 'abc123',
            })
        );
    });
});

describe('resetRepoToTemplate — the one caller that means to rewrite history', () => {
    it('asks for force explicitly', async () => {
        // Assert the ARGUMENT, not the outcome: `updateBranchRef` is stubbed
        // here, and a stub moves no ref whatever it is handed. What is under
        // test is what reset ASKS for — and after the default flipped, a reset
        // that stays silent would quietly stop replacing history.
        const ops = new GitHubFileOperations(tokenService);
        const updateBranchRef = jest.spyOn(ops, 'updateBranchRef').mockResolvedValue(undefined);
        jest.spyOn(ops, 'getBranchInfo').mockResolvedValue({
            commitSha: 'parent-sha',
            treeSha: 'parent-tree',
        } as Awaited<ReturnType<GitHubFileOperations['getBranchInfo']>>);
        (ops as unknown as { downloadRepoContents: jest.Mock }).downloadRepoContents = jest
            .fn()
            .mockResolvedValue(new Map([['index.html', '<html></html>']]));
        (ops as unknown as { createTree: jest.Mock }).createTree = jest
            .fn()
            .mockResolvedValue('new-tree-sha');
        (ops as unknown as { createCommit: jest.Mock }).createCommit = jest
            .fn()
            .mockResolvedValue('new-commit-sha');

        await ops.resetRepoToTemplate(
            'hlxsites',
            'aem-boilerplate-commerce',
            'user',
            'user-storefront',
            new Map()
        );

        expect(updateBranchRef).toHaveBeenCalledWith(
            'user',
            'user-storefront',
            'main',
            'new-commit-sha',
            true
        );
    });
});

/**
 * Losing the race must cost a retry, not the other person's work.
 *
 * Refusing to force (above) is only half the fix: unforced, a racing install now
 * FAILS where it used to overwrite. That is the right trade, but a user left to
 * re-run it by hand has still been handed the consequence of our race.
 *
 * The retry has to redo the WHOLE sequence, not just the ref update. The tree was
 * built on the base read before the other commit landed, so re-pushing that same
 * commit would move the ref to a tree that still reverts their files — the exact
 * damage, arrived at politely. Re-reading the branch and rebuilding the tree on
 * the NEW base is what makes both changes survive: our entries win for the paths
 * we wrote, everything else comes from their commit.
 *
 * 422 is ambiguous here and the codebase already says so (`errorFormatters.ts`:
 * "GitHub also returns 422 for a stale-SHA conflict on update, which has an
 * entirely different remedy, so detection keys on the message rather than the
 * status"). A repository-ruleset rejection is also a 422 and retrying it can
 * never succeed — it would just hammer GitHub with a write the rules forbid.
 */
describe('commitTreeToBranch', () => {
    const ENTRIES: GitHubTreeInput[] = [
        { path: 'blocks/hero/hero.js', mode: '100644', type: 'blob', content: 'x' },
    ];

    /** A non-fast-forward rejection, as the refs API raises it. */
    const staleRef = () =>
        Object.assign(new Error('Update is not a fast forward'), { status: 422 });

    function opsWith(refUpdates: Array<Error | undefined>) {
        const ops = new GitHubFileOperations(tokenService);
        let read = 0;
        jest.spyOn(ops, 'getBranchInfo').mockImplementation(async () => {
            read += 1;
            return {
                commitSha: `head-${read}`,
                treeSha: `tree-${read}`,
            } as Awaited<ReturnType<GitHubFileOperations['getBranchInfo']>>;
        });
        const createTree = jest
            .spyOn(ops, 'createTree')
            .mockImplementation(async () => `new-tree-${read}`);
        const createCommit = jest
            .spyOn(ops, 'createCommit')
            .mockImplementation(async () => `new-commit-${read}`);
        let attempt = 0;
        const updateBranchRef = jest.spyOn(ops, 'updateBranchRef').mockImplementation(async () => {
            const failure = refUpdates[attempt];
            attempt += 1;
            if (failure) throw failure;
        });
        return { ops, createTree, createCommit, updateBranchRef };
    }

    it('commits once when nothing raced it', async () => {
        const { ops, createTree, updateBranchRef } = opsWith([undefined]);

        await ops.commitTreeToBranch('o', 'r', 'main', ENTRIES, 'chore: add blocks');

        expect(createTree).toHaveBeenCalledTimes(1);
        expect(updateBranchRef).toHaveBeenCalledTimes(1);
    });

    it('rebuilds on the NEW base after losing the race', async () => {
        // The whole point. Retrying the same commit would re-apply a tree built
        // before their push and revert them anyway.
        const { ops, createTree } = opsWith([staleRef(), undefined]);

        await ops.commitTreeToBranch('o', 'r', 'main', ENTRIES, 'chore: add blocks');

        expect(createTree).toHaveBeenCalledTimes(2);
        expect(createTree).toHaveBeenNthCalledWith(1, 'o', 'r', ENTRIES, 'tree-1');
        expect(createTree).toHaveBeenNthCalledWith(2, 'o', 'r', ENTRIES, 'tree-2');
    });

    it('parents the retried commit on the new head', async () => {
        const { ops, createCommit } = opsWith([staleRef(), undefined]);

        await ops.commitTreeToBranch('o', 'r', 'main', ENTRIES, 'chore: add blocks');

        expect(createCommit).toHaveBeenNthCalledWith(2, 'o', 'r', 'chore: add blocks', 'new-tree-2', 'head-2');
    });

    it('never forces, on any attempt', async () => {
        const { ops, updateBranchRef } = opsWith([staleRef(), undefined]);

        await ops.commitTreeToBranch('o', 'r', 'main', ENTRIES, 'chore: add blocks');

        for (const call of updateBranchRef.mock.calls) {
            expect(call[4]).not.toBe(true);
        }
    });

    it('gives up rather than looping, and says the branch moved', async () => {
        const { ops, updateBranchRef } = opsWith([staleRef(), staleRef(), staleRef(), staleRef()]);

        await expect(
            ops.commitTreeToBranch('o', 'r', 'main', ENTRIES, 'chore: add blocks'),
        ).rejects.toThrow(/moved|fast forward/i);

        expect(updateBranchRef.mock.calls.length).toBeLessThanOrEqual(3);
    });

    it('does NOT retry a ruleset rejection — also a 422, and retrying cannot fix it', async () => {
        const ruleset = Object.assign(
            new Error('Repository rule violations found for refs/heads/main'),
            { status: 422 },
        );
        const { ops, updateBranchRef } = opsWith([ruleset, undefined]);

        await expect(
            ops.commitTreeToBranch('o', 'r', 'main', ENTRIES, 'chore: add blocks'),
        ).rejects.toThrow(/rule violations/i);

        expect(updateBranchRef).toHaveBeenCalledTimes(1);
    });

    it('rethrows an unrelated failure immediately', async () => {
        const { ops, updateBranchRef } = opsWith([new Error('ENOTFOUND'), undefined]);

        await expect(
            ops.commitTreeToBranch('o', 'r', 'main', ENTRIES, 'chore: add blocks'),
        ).rejects.toThrow('ENOTFOUND');

        expect(updateBranchRef).toHaveBeenCalledTimes(1);
    });
});
