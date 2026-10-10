/**
 * GitHubTreeCommits — the Git Data primitives, one request each.
 *
 * Every method is a thin wrapper over one Octokit request, which is why the
 * ARGUMENTS matter more than the answers: a wrapper that drops `base_tree`, sends
 * the wrong encoding or parents a commit on nothing returns a perfectly plausible
 * sha and writes the wrong thing. The sibling suites cover the compositions:
 * `-commitRebase` and `-branchRef` for the rebase-on-race commit and the ref's
 * force flag.
 */

import { GitHubTreeCommits, mockRequest } from './githubFileOperations.testUtils';
import { batchTreeEntries } from '@/features/eds/services/github/githubTreeCommits';
import type { GitHubTokenService } from '@/features/eds/services/github/githubTokenService';
import type { GitHubApiError } from '@/features/eds/services/types';
import type { GitHubTreeInput } from '@/features/eds/services/types';

const tokenService = {
    getToken: jest.fn().mockResolvedValue({ token: 'gh-token' }),
} as unknown as GitHubTokenService;

/** GitHub's own not-found shape, as the operations read it. */
function notFound(): GitHubApiError {
    return Object.assign(new Error('Not Found'), { status: 404 }) as GitHubApiError;
}

/** The options object sent with the first request matching a route fragment. */
function optionsSentTo(routeFragment: string): Record<string, unknown> | undefined {
    const call = mockRequest.mock.calls.find(
        ([route]) => typeof route === 'string' && route.includes(routeFragment),
    );
    return call?.[1] as Record<string, unknown> | undefined;
}

beforeEach(() => {
    mockRequest.mockReset();
});

const ops = () => new GitHubTreeCommits(tokenService);

describe('getBranchInfo', () => {
    it('returns the branch tree and its head commit', async () => {
        mockRequest.mockResolvedValue({
            data: { commit: { sha: 'commit-sha', commit: { tree: { sha: 'tree-sha' } } } },
        });

        await expect(ops().getBranchInfo('me', 'shop', 'develop')).resolves.toEqual({
            treeSha: 'tree-sha',
            commitSha: 'commit-sha',
        });
        expect(optionsSentTo('/branches/{branch}')).toEqual({
            owner: 'me',
            repo: 'shop',
            branch: 'develop',
        });
    });

    it('defaults to the main branch', async () => {
        mockRequest.mockResolvedValue({
            data: { commit: { sha: 'commit-sha', commit: { tree: { sha: 'tree-sha' } } } },
        });

        await ops().getBranchInfo('me', 'shop');

        expect(optionsSentTo('/branches/{branch}')?.branch).toBe('main');
    });

    it('does not swallow a missing branch — the bulk path needs to know', async () => {
        mockRequest.mockRejectedValue(notFound());

        await expect(ops().getBranchInfo('me', 'shop')).rejects.toThrow('Not Found');
    });
});

describe('createBlob', () => {
    it('sends the bytes as base64 and answers the blob sha', async () => {
        mockRequest.mockResolvedValue({ data: { sha: 'blob-sha' } });
        const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64');

        await expect(ops().createBlob('me', 'shop', bytes)).resolves.toBe('blob-sha');
        expect(optionsSentTo('/git/blobs')).toEqual({
            owner: 'me',
            repo: 'shop',
            content: bytes,
            encoding: 'base64',
        });
    });
});

describe('createTree', () => {
    const entries = [
        { path: 'head.html', mode: '100644' as const, type: 'blob' as const, content: '<head/>' },
    ];

    it('bases the tree on an existing one when told to', async () => {
        mockRequest.mockResolvedValue({ data: { sha: 'new-tree' } });

        await expect(ops().createTree('me', 'shop', entries, 'base-tree')).resolves.toBe('new-tree');
        expect(optionsSentTo('/git/trees')).toEqual({
            owner: 'me',
            repo: 'shop',
            tree: entries,
            base_tree: 'base-tree',
        });
    });

    it('omits base_tree entirely when there is none — a based tree keeps stale files', async () => {
        mockRequest.mockResolvedValue({ data: { sha: 'new-tree' } });

        await ops().createTree('me', 'shop', entries);

        expect(optionsSentTo('/git/trees')).toEqual({
            owner: 'me',
            repo: 'shop',
            tree: entries,
        });
    });
});

describe('createCommit', () => {
    it('commits the tree onto exactly one parent', async () => {
        mockRequest.mockResolvedValue({ data: { sha: 'commit-sha' } });

        await expect(
            ops().createCommit('me', 'shop', 'chore: x', 'tree-sha', 'parent-sha'),
        ).resolves.toBe('commit-sha');
        expect(optionsSentTo('/git/commits')).toEqual({
            owner: 'me',
            repo: 'shop',
            message: 'chore: x',
            tree: 'tree-sha',
            parents: ['parent-sha'],
        });
    });
});

describe('batchTreeEntries', () => {
    const entry = (path: string, content: string): GitHubTreeInput => ({
        path,
        mode: '100644',
        type: 'blob',
        content,
    });
    const sizeOf = (e: GitHubTreeInput) => JSON.stringify(e).length;

    it('keeps entries together while they fit the budget exactly', () => {
        const a = entry('a.txt', 'x'.repeat(100));
        const b = entry('b.txt', 'x'.repeat(100));
        // The budget is the combined size to the byte: the guard splits on
        // exceeding it, not on reaching it.
        const budget = sizeOf(a) + sizeOf(b);

        expect(batchTreeEntries([a, b], budget)).toEqual([[a, b]]);
    });

    it('starts a new batch as soon as one more entry would exceed the budget', () => {
        const a = entry('a.txt', 'x'.repeat(100));
        const b = entry('b.txt', 'x'.repeat(100));

        expect(batchTreeEntries([a, b], sizeOf(a) + sizeOf(b) - 1)).toEqual([[a], [b]]);
    });

    it('never splits a single entry, however far over the budget it is', () => {
        const huge = entry('huge.bin', 'x'.repeat(5000));

        expect(batchTreeEntries([huge], 10)).toEqual([[huge]]);
    });

    it('produces no batches for no entries', () => {
        expect(batchTreeEntries([])).toStrictEqual([]);
    });

    it('splits at one megabyte when no budget is named — the measured safe request size', () => {
        // Two entries of ~700 KB cannot share a 1 MB request; one can.
        const big = 'x'.repeat(700_000);

        expect(batchTreeEntries([entry('a.txt', big), entry('b.txt', big)])).toHaveLength(2);
        expect(batchTreeEntries([entry('a.txt', big)])).toHaveLength(1);
    });
});
