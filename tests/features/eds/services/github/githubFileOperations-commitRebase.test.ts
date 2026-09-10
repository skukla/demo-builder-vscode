/**
 * commitTreeToBranch — losing the race without losing anyone's work.
 *
 * The four-step dance (read the branch, build a tree on its base, commit, move
 * the ref) is a read-modify-write across several round-trips, so a commit that
 * lands in that window makes the ref update a non-fast-forward. The retry has to
 * REBUILD on the new head: re-pushing the same commit would move the ref to a
 * tree built before the other person's push and revert their files anyway — the
 * original damage, arrived at politely.
 *
 * Only a stale-ref rejection is retried. A repository-ruleset rejection carries
 * the same 422 and cannot succeed however many times it is repeated.
 */

import { GitHubFileOperations, mockRequest } from './githubFileOperations.testUtils';
import type { GitHubTokenService } from '@/features/eds/services/github/githubTokenService';
import type { GitHubTreeInput } from '@/features/eds/services/types';

const tokenService = {
    getToken: jest.fn().mockResolvedValue({ token: 'gh-token' }),
} as unknown as GitHubTokenService;

const ENTRIES: GitHubTreeInput[] = [
    { path: 'head.html', mode: '100644', type: 'blob', content: '<head/>' },
];

interface RouteState {
    /** Branch heads handed out in order, one per attempt. */
    heads: Array<{ commitSha: string; treeSha: string }>;
    /** Ref-update outcomes in order; an Error is thrown, undefined succeeds. */
    refResults: Array<Error | undefined>;
}

/** Route the operations' four requests through one steerable implementation. */
function stubGitHub(state: RouteState) {
    let headIndex = 0;
    let refIndex = 0;
    const treeBases: unknown[] = [];
    mockRequest.mockImplementation((route: string, options: Record<string, unknown>) => {
        if (route.includes('/branches/{branch}')) {
            const head = state.heads[Math.min(headIndex++, state.heads.length - 1)];
            return Promise.resolve({
                data: { sha: head.commitSha, commit: { sha: head.commitSha, commit: { tree: { sha: head.treeSha } } } },
            });
        }
        if (route.includes('/git/trees')) {
            treeBases.push(options.base_tree);
            return Promise.resolve({ data: { sha: `tree-from-${String(options.base_tree)}` } });
        }
        if (route.includes('/git/commits')) {
            return Promise.resolve({ data: { sha: `commit-on-${String(options.tree)}` } });
        }
        if (route.includes('/git/refs/heads/')) {
            const outcome = state.refResults[Math.min(refIndex++, state.refResults.length - 1)];
            return outcome ? Promise.reject(outcome) : Promise.resolve({ data: {} });
        }
        return Promise.reject(new Error(`unexpected route ${route}`));
    });
    return { treeBases };
}

const staleRef = () =>
    Object.assign(new Error('Update is not a fast forward'), { status: 422 });

beforeEach(() => {
    mockRequest.mockReset();
});

describe('commitTreeToBranch', () => {
    it('commits onto the branch head it read and returns the new commit', async () => {
        const { treeBases } = stubGitHub({
            heads: [{ commitSha: 'head-1', treeSha: 'tree-1' }],
            refResults: [undefined],
        });
        const ops = new GitHubFileOperations(tokenService);

        const sha = await ops.commitTreeToBranch('me', 'shop', 'main', ENTRIES, 'chore: x');

        expect(treeBases).toEqual(['tree-1']);
        expect(sha).toBe('commit-on-tree-from-tree-1');
    });

    it('rebuilds on the NEW head when the branch moved, not on the stale one', async () => {
        const { treeBases } = stubGitHub({
            heads: [
                { commitSha: 'head-1', treeSha: 'tree-1' },
                { commitSha: 'head-2', treeSha: 'tree-2' },
            ],
            refResults: [staleRef(), undefined],
        });
        const ops = new GitHubFileOperations(tokenService);

        const sha = await ops.commitTreeToBranch('me', 'shop', 'main', ENTRIES, 'chore: x');

        // The second tree is based on the head read AFTER the rejection.
        expect(treeBases).toEqual(['tree-1', 'tree-2']);
        expect(sha).toBe('commit-on-tree-from-tree-2');
    });

    it('gives up after three attempts and says nothing was overwritten', async () => {
        const { treeBases } = stubGitHub({
            heads: [{ commitSha: 'head-1', treeSha: 'tree-1' }],
            refResults: [staleRef()],
        });
        const ops = new GitHubFileOperations(tokenService);

        await expect(
            ops.commitTreeToBranch('me', 'shop', 'main', ENTRIES, 'chore: x'),
        ).rejects.toThrow(
            'Could not commit to main: it moved during every attempt (3). Nothing was overwritten. ' +
                'Last rejection: Update is not a fast forward',
        );
        expect(treeBases).toHaveLength(3);
    });

    it('does not retry a repository-ruleset rejection — repeating it cannot work', async () => {
        const { treeBases } = stubGitHub({
            heads: [{ commitSha: 'head-1', treeSha: 'tree-1' }],
            refResults: [
                Object.assign(new Error('Repository rule violations found for refs/heads/main'), {
                    status: 422,
                }),
            ],
        });
        const ops = new GitHubFileOperations(tokenService);

        await expect(
            ops.commitTreeToBranch('me', 'shop', 'main', ENTRIES, 'chore: x'),
        ).rejects.toThrow(
            // updateBranchRef translates it: the raw message names no commit, and
            // a multi-file commit has no single path to blame.
            "GitHub blocked writing commit commit- — the repository's rules rejected " +
                'the content. Nothing was written.',
        );
        expect(treeBases).toEqual(['tree-1']);
    });

    it('does not retry an unrelated failure', async () => {
        const { treeBases } = stubGitHub({
            heads: [{ commitSha: 'head-1', treeSha: 'tree-1' }],
            refResults: [Object.assign(new Error('Bad credentials'), { status: 401 })],
        });
        const ops = new GitHubFileOperations(tokenService);

        await expect(
            ops.commitTreeToBranch('me', 'shop', 'main', ENTRIES, 'chore: x'),
        ).rejects.toThrow('Bad credentials');
        expect(treeBases).toEqual(['tree-1']);
    });
});
