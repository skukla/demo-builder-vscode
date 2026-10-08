/**
 * GitHubFileOperations — the read/write calls the setup pipeline makes.
 *
 * Every method here is a thin wrapper over one Octokit request, which is exactly
 * why the ARGUMENTS matter more than the answers: a wrapper that sends the wrong
 * ref, forgets `recursive`, or drops `base_tree` returns a perfectly plausible
 * value and writes the wrong thing. The 404 handling is the other half — three
 * of these treat "not found" as an answer rather than a failure, and the rest
 * must not.
 */

import {
    GitHubFileOperations,
    mockOctokitConstructed,
    mockRequest,
} from './githubFileOperations.testUtils';
import type { GitHubTokenService } from '@/features/eds/services/github/githubTokenService';
import type { GitHubApiError } from '@/features/eds/services/types';

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
    mockOctokitConstructed.mockClear();
});

const ops = () => new GitHubFileOperations(tokenService);

describe('ensureAuthenticated', () => {
    it('refuses every operation when there is no GitHub token', async () => {
        const noToken = { getToken: jest.fn().mockResolvedValue(null) } as unknown as GitHubTokenService;

        await expect(new GitHubFileOperations(noToken).getLatestCommitSha('o', 'r')).rejects.toThrow(
            'Not authenticated',
        );
        expect(mockRequest).not.toHaveBeenCalled();
    });

    it('builds the client once and reuses it across operations', async () => {
        mockRequest.mockResolvedValue({ data: { commit: { sha: 'head-sha' } } });
        const service = ops();

        await service.getLatestCommitSha('me', 'shop');
        await service.getLatestCommitSha('me', 'shop');

        expect(mockOctokitConstructed).toHaveBeenCalledTimes(1);
    });

    it('builds a fresh client after the token changes', async () => {
        mockRequest.mockResolvedValue({ data: { commit: { sha: 'head-sha' } } });
        const service = ops();

        await service.getLatestCommitSha('me', 'shop');
        service.invalidateOctokit();
        await service.getLatestCommitSha('me', 'shop');

        expect(mockOctokitConstructed).toHaveBeenCalledTimes(2);
    });
});

describe('getLatestCommitMessage', () => {
    it("answers the branch's latest commit message, and null for a branch or repository that is not there", async () => {
        mockRequest.mockResolvedValueOnce({ data: { commit: { sha: 'head', commit: { message: 'Add storefront from a zip file' } } } });
        await expect(ops().getLatestCommitMessage('me', 'shop', 'main')).resolves.toBe('Add storefront from a zip file');
        expect(mockRequest).toHaveBeenLastCalledWith('GET /repos/{owner}/{repo}/branches/{branch}', { owner: 'me', repo: 'shop', branch: 'main' });

        mockRequest.mockRejectedValueOnce(Object.assign(new Error('Not Found'), { status: 404 }));
        await expect(ops().getLatestCommitMessage('me', 'gone')).resolves.toBeNull();

        mockRequest.mockRejectedValueOnce(Object.assign(new Error('Bad credentials'), { status: 401 }));
        await expect(ops().getLatestCommitMessage('me', 'shop')).rejects.toThrow('Bad credentials');
    });
});

describe('getFileContent', () => {
    it('decodes the file and reports its sha and path', async () => {
        mockRequest.mockResolvedValue({
            data: {
                content: Buffer.from('fstab', 'utf-8').toString('base64'),
                sha: 'blob-1',
                path: 'fstab.yaml',
                encoding: 'base64',
            },
        });

        await expect(ops().getFileContent('me', 'shop', 'fstab.yaml', 'develop')).resolves.toEqual({
            content: 'fstab',
            sha: 'blob-1',
            path: 'fstab.yaml',
            encoding: 'base64',
        });
        expect(optionsSentTo('/contents/{path}')).toEqual({
            owner: 'me',
            repo: 'shop',
            path: 'fstab.yaml',
            ref: 'develop',
        });
    });

    it('omits the ref entirely when the caller named none', async () => {
        mockRequest.mockResolvedValue({
            data: { content: '', sha: 's', path: 'p', encoding: 'base64' },
        });

        await ops().getFileContent('me', 'shop', 'fstab.yaml');

        expect(optionsSentTo('/contents/{path}')).toEqual({
            owner: 'me',
            repo: 'shop',
            path: 'fstab.yaml',
        });
    });

    it('answers null for a file that is not there', async () => {
        mockRequest.mockRejectedValue(notFound());

        await expect(ops().getFileContent('me', 'shop', 'fstab.yaml')).resolves.toBeNull();
    });

    it('lets any other GitHub failure through — a 500 is not an absent file', async () => {
        mockRequest.mockRejectedValue(Object.assign(new Error('Server Error'), { status: 500 }));

        await expect(ops().getFileContent('me', 'shop', 'fstab.yaml')).rejects.toThrow(
            'Server Error',
        );
    });
});

describe('createOrUpdateFile', () => {
    it('base64-encodes the content and sends the sha when updating', async () => {
        mockRequest.mockResolvedValue({
            data: { content: { sha: 'new-blob' }, commit: { sha: 'new-commit' } },
        });

        await expect(
            ops().createOrUpdateFile('me', 'shop', 'fstab.yaml', 'body', 'chore: x', 'old-blob'),
        ).resolves.toEqual({ sha: 'new-blob', commitSha: 'new-commit' });
        expect(optionsSentTo('/contents/{path}')).toEqual({
            owner: 'me',
            repo: 'shop',
            path: 'fstab.yaml',
            message: 'chore: x',
            content: Buffer.from('body').toString('base64'),
            sha: 'old-blob',
        });
    });

    it('omits the sha entirely when creating a new file', async () => {
        mockRequest.mockResolvedValue({
            data: { content: { sha: 'new-blob' }, commit: { sha: 'new-commit' } },
        });

        await ops().createOrUpdateFile('me', 'shop', 'fstab.yaml', 'body', 'chore: x');

        expect(optionsSentTo('/contents/{path}')).toEqual({
            owner: 'me',
            repo: 'shop',
            path: 'fstab.yaml',
            message: 'chore: x',
            content: Buffer.from('body').toString('base64'),
        });
    });

    it('reports empty shas rather than throwing when the response carries neither', async () => {
        mockRequest.mockResolvedValue({ data: {} });

        await expect(
            ops().createOrUpdateFile('me', 'shop', 'fstab.yaml', 'body', 'chore: x'),
        ).resolves.toEqual({ sha: '', commitSha: '' });
    });

    it('names the refused file when a repository rule blocks the write', async () => {
        mockRequest.mockRejectedValue(
            Object.assign(new Error('Repository rule violations found'), { status: 422 }),
        );

        await expect(
            ops().createOrUpdateFile('me', 'shop', 'scripts/delayed.js', 'body', 'chore: x'),
        ).rejects.toThrow('GitHub blocked writing scripts/delayed.js');
    });
});

describe('listRepoFiles', () => {
    const branchResponse = { data: { commit: { commit: { tree: { sha: 'tree-sha' } } } } };
    const treeResponse = {
        data: {
            tree: [
                { path: 'scripts/scripts.js', type: 'blob', sha: 'blob-1', size: 120 },
                { path: 'scripts', type: 'tree', sha: 'tree-1' },
                { path: 'head.html', type: 'blob', sha: 'blob-2' },
            ],
        },
    };

    it('reads the branch, then its tree recursively, and returns only files', async () => {
        mockRequest.mockResolvedValueOnce(branchResponse).mockResolvedValueOnce(treeResponse);

        const files = await ops().listRepoFiles('me', 'shop', 'develop');

        expect(optionsSentTo('/branches/{branch}')).toEqual({
            owner: 'me',
            repo: 'shop',
            branch: 'develop',
        });
        expect(optionsSentTo('/git/trees/{tree_sha}')).toEqual({
            owner: 'me',
            repo: 'shop',
            tree_sha: 'tree-sha',
            recursive: '1',
        });
        expect(files).toEqual([
            { path: 'scripts/scripts.js', type: 'blob', sha: 'blob-1', size: 120 },
            { path: 'head.html', type: 'blob', sha: 'blob-2', size: undefined },
        ]);
    });

    it('defaults to the main branch', async () => {
        mockRequest.mockResolvedValueOnce(branchResponse).mockResolvedValueOnce(treeResponse);

        await ops().listRepoFiles('me', 'shop');

        expect(optionsSentTo('/branches/{branch}')).toEqual({
            owner: 'me',
            repo: 'shop',
            branch: 'main',
        });
    });

    it('reports an empty repository rather than failing when the branch is missing', async () => {
        mockRequest.mockRejectedValue(notFound());

        await expect(ops().listRepoFiles('me', 'shop')).resolves.toStrictEqual([]);
    });

    it('lets any other GitHub failure through', async () => {
        mockRequest.mockRejectedValue(Object.assign(new Error('Bad credentials'), { status: 401 }));

        await expect(ops().listRepoFiles('me', 'shop')).rejects.toThrow('Bad credentials');
    });
});

describe('getLatestCommitSha', () => {
    it('returns the branch head', async () => {
        mockRequest.mockResolvedValue({ data: { commit: { sha: 'head-sha' } } });

        await expect(ops().getLatestCommitSha('me', 'shop', 'develop')).resolves.toBe('head-sha');
        expect(optionsSentTo('/branches/{branch}')).toEqual({
            owner: 'me',
            repo: 'shop',
            branch: 'develop',
        });
    });

    it('defaults to the main branch', async () => {
        mockRequest.mockResolvedValue({ data: { commit: { sha: 'head-sha' } } });

        await ops().getLatestCommitSha('me', 'shop');

        expect(optionsSentTo('/branches/{branch}')).toEqual({
            owner: 'me',
            repo: 'shop',
            branch: 'main',
        });
    });

    it('answers null for a branch or repo that does not exist', async () => {
        mockRequest.mockRejectedValue(notFound());

        await expect(ops().getLatestCommitSha('me', 'shop')).resolves.toBeNull();
    });

    it('lets any other GitHub failure through', async () => {
        mockRequest.mockRejectedValue(Object.assign(new Error('rate limited'), { status: 403 }));

        await expect(ops().getLatestCommitSha('me', 'shop')).rejects.toThrow('rate limited');
    });
});

describe('deleteFile', () => {
    it('sends the path, message and the sha of the file being removed', async () => {
        mockRequest.mockResolvedValue({ data: {} });

        await ops().deleteFile('me', 'shop', 'scripts/old.js', 'chore: drop old script', 'blob-1');

        expect(optionsSentTo('DELETE')).toEqual({
            owner: 'me',
            repo: 'shop',
            path: 'scripts/old.js',
            message: 'chore: drop old script',
            sha: 'blob-1',
        });
    });
});

describe('getBlobContent', () => {
    it('decodes what GitHub sends as base64', async () => {
        mockRequest.mockResolvedValue({
            data: { content: Buffer.from('hello world', 'utf-8').toString('base64') },
        });

        await expect(ops().getBlobContent('me', 'shop', 'blob-1')).resolves.toBe('hello world');
        expect(optionsSentTo('/git/blobs')).toEqual({
            owner: 'me',
            repo: 'shop',
            file_sha: 'blob-1',
        });
    });
});

/**
 * The three forwarders kept by the 2026-10-08 split (EDS-8). Each is reached by
 * callers handed this object whole; the job lives in the unit it names. The
 * default-branch case goes through the REAL unit — a forwarder that re-declared
 * the default would be a second place for it to drift.
 */
describe('kept forwarders', () => {
    it('getBranchInfo is answered by the tree-commits unit, with its main default', async () => {
        mockRequest.mockResolvedValue({
            data: { commit: { sha: 'commit-sha', commit: { tree: { sha: 'tree-sha' } } } },
        });

        await expect(ops().getBranchInfo('me', 'shop')).resolves.toEqual({
            treeSha: 'tree-sha',
            commitSha: 'commit-sha',
        });
        expect(optionsSentTo('/branches/{branch}')?.branch).toBe('main');
    });

    it('commitTreeToBranch hands every argument to the tree-commits unit', async () => {
        const service = ops();
        const owned = jest.spyOn(service.treeCommits, 'commitTreeToBranch').mockResolvedValue('c1');
        const entries = [{ path: 'a.js', mode: '100644' as const, type: 'blob' as const, content: 'x' }];

        await expect(service.commitTreeToBranch('me', 'shop', 'main', entries, 'chore: x')).resolves.toBe('c1');

        expect(owned).toHaveBeenCalledWith('me', 'shop', 'main', entries, 'chore: x');
    });

    it('resetRepoToTemplate hands every argument to the archive unit, the pinned ref included', async () => {
        const service = ops();
        const owned = jest
            .spyOn(service.repoArchive, 'resetRepoToTemplate')
            .mockResolvedValue({ commitSha: 'c1', fileCount: 2 });
        const overrides = new Map([['fstab.yaml', 'x']]);

        await expect(
            service.resetRepoToTemplate('t', 'tpl', 'me', 'shop', overrides, 'a1b2c3d4e5f6789012345678901234567890abcd'),
        ).resolves.toEqual({ commitSha: 'c1', fileCount: 2 });

        expect(owned).toHaveBeenCalledWith('t', 'tpl', 'me', 'shop', overrides, 'a1b2c3d4e5f6789012345678901234567890abcd');
    });
});
