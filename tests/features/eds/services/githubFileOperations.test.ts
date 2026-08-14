/**
 * GitHub File Operations Tests
 *
 * Tests for file operations extracted from GitHubService.
 */

export {};

// Mock Octokit
const mockOctokitRequest = jest.fn();
jest.mock('@octokit/core', () => ({
    Octokit: {
        plugin: jest.fn(() =>
            jest.fn().mockImplementation(() => ({
                request: mockOctokitRequest,
            }))
        ),
    },
}));

jest.mock('@octokit/plugin-retry', () => ({
    retry: jest.fn(() => ({})),
}));

// Mock logger
jest.mock('@/core/logging', () => ({
    getLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

describe('buildArchiveUrl', () => {
    // Test the SHA-vs-branch URL routing directly. The wider
    // `downloadRepoContents`/`resetRepoToTemplate` integration brings extensive
    // Octokit + zip-buffer mocking that obscures this one load-bearing branch.
    // ADR-006 Step 4: thin-layer reset passes the LKG SHA, forked reset passes `main`.

     
    let buildArchiveUrl: any;

    beforeEach(async () => {
        jest.resetModules();
        const module = await import('@/features/eds/services/githubFileOperations');
        buildArchiveUrl = module.buildArchiveUrl;
    });

    it('uses the branch URL shape for "main"', () => {
        const { url, isSha } = buildArchiveUrl('skukla', 'citisignal-b2b', 'main');
        expect(isSha).toBe(false);
        expect(url).toBe('https://github.com/skukla/citisignal-b2b/archive/refs/heads/main.zip');
    });

    it('uses the branch URL shape for any non-SHA ref (custom branches)', () => {
        const { url, isSha } = buildArchiveUrl('skukla', 'citisignal-b2b', 'feature/x');
        expect(isSha).toBe(false);
        expect(url).toBe('https://github.com/skukla/citisignal-b2b/archive/refs/heads/feature/x.zip');
    });

    it('uses the SHA URL shape for a full 40-hex commit SHA (lowercase)', () => {
        const sha = 'a1b2c3d4e5f6789012345678901234567890abcd';
        const { url, isSha } = buildArchiveUrl('skukla', 'citisignal-b2b', sha);
        expect(isSha).toBe(true);
        expect(url).toBe(`https://github.com/skukla/citisignal-b2b/archive/${sha}.zip`);
    });

    it('uses the SHA URL shape for a full 40-hex commit SHA (mixed case)', () => {
        const sha = 'A1B2C3D4E5F6789012345678901234567890ABCD';
        const { url, isSha } = buildArchiveUrl('skukla', 'citisignal-b2b', sha);
        expect(isSha).toBe(true);
        expect(url).toBe(`https://github.com/skukla/citisignal-b2b/archive/${sha}.zip`);
    });

    it('treats a short SHA (7 chars) as a branch ref, not a SHA', () => {
        // GitHub's archive URL endpoint only resolves full SHAs; short SHAs
        // would 404 there but work as a ref/branch in some contexts. Defensive
        // routing: if it's not exactly 40 hex chars, treat as branch.
        const { isSha } = buildArchiveUrl('skukla', 'citisignal-b2b', 'a1b2c3d');
        expect(isSha).toBe(false);
    });

    it('treats a 40-char non-hex string as a branch ref (defensive)', () => {
        const { isSha } = buildArchiveUrl('skukla', 'citisignal-b2b', 'g'.repeat(40));
        expect(isSha).toBe(false);
    });
});

describe('isStaleShaFailure', () => {
    // Classifies the Contents API update-with-SHA rejection. Shared by the
    // publishers (brandAssetPublisher, pdp404HandlerPublisher) for their
    // re-read-and-retry-once handling.


    let isStaleShaFailure: any;

    beforeEach(async () => {
        jest.resetModules();
        const module = await import('@/features/eds/services/githubFileOperations');
        isStaleShaFailure = module.isStaleShaFailure;
    });

    it('matches GitHub\'s "does not match" stale-SHA rejection (case-insensitive)', () => {
        expect(isStaleShaFailure(new Error('styles/x.css does not match sha'))).toBe(true);
        expect(isStaleShaFailure(new Error('X Does Not Match Y'))).toBe(true);
    });

    it('does not match other failures', () => {
        expect(isStaleShaFailure(new Error('403 Forbidden'))).toBe(false);
        expect(isStaleShaFailure(new Error('Not Found'))).toBe(false);
    });

    it('is false for non-Error and message-less values', () => {
        expect(isStaleShaFailure(undefined)).toBe(false);
        expect(isStaleShaFailure('does not match')).toBe(false);
        expect(isStaleShaFailure({})).toBe(false);
    });
});

describe('resetRepoToTemplate — target branch vs template ref separation', () => {
    // Regression test for an ADR-006 Step 4 bug: `resetRepoToTemplate` previously
    // used a single `branch` parameter for BOTH the target branch lookup (getBranchInfo
    // / updateBranchRef on the user's repo) AND the template download ref. When the
    // thin-layer wiring started passing the LKG SHA as the template ref, getBranchInfo
    // hit the GitHub branches API with the SHA → 404 "Branch not found", killing every
    // thin-layer reset before any file changed. The target branch is always `main`;
    // only the template download accepts a SHA.

     
    let GitHubFileOperations: any;
     
    let mockTokenService: any;

    const LKG_SHA = 'a1b2c3d4e5f6789012345678901234567890abcd';

    beforeEach(async () => {
        jest.clearAllMocks();
        jest.resetModules();
        mockTokenService = {
            getToken: jest.fn().mockResolvedValue({ token: 'ghp_test' }),
            clearToken: jest.fn(),
        };
        const module = await import('@/features/eds/services/githubFileOperations');
        GitHubFileOperations = module.GitHubFileOperations;
    });

    it('calls getBranchInfo with the target branch "main" — NOT the templateRef', async () => {
        const service = new GitHubFileOperations(mockTokenService);

        // Stub the internals just enough: getBranchInfo + downloadRepoContents +
        // createTree + createCommit + updateBranchRef. We're asserting the
        // arguments passed to getBranchInfo, not exercising the full Tree API.
        const getBranchInfoSpy = jest.spyOn(service, 'getBranchInfo')
            .mockResolvedValue({ commitSha: 'parent-sha', treeSha: 'parent-tree' });
         
        // One file, not an empty Map: an empty template now throws rather than
        // committing a tree that would empty the repository.
        (service as any).downloadRepoContents = jest
            .fn()
            .mockResolvedValue(new Map([['index.html', '<html></html>']]));
         
        (service as any).createTree = jest.fn().mockResolvedValue('new-tree-sha');
         
        (service as any).createCommit = jest.fn().mockResolvedValue('new-commit-sha');
         
        (service as any).updateBranchRef = jest.fn().mockResolvedValue(undefined);

        await service.resetRepoToTemplate(
            'hlxsites', 'aem-boilerplate-commerce',
            'user', 'user-storefront',
            new Map(),
            LKG_SHA, // <-- the LKG SHA, NOT 'main'
        );

        // Target branch lookup MUST be 'main' even though templateRef is a SHA.
        expect(getBranchInfoSpy).toHaveBeenCalledWith('user', 'user-storefront', 'main');
    });

    it('passes the templateRef (SHA-shaped or branch) through to downloadRepoContents', async () => {
        const service = new GitHubFileOperations(mockTokenService);
        jest.spyOn(service, 'getBranchInfo')
            .mockResolvedValue({ commitSha: 'parent-sha', treeSha: 'parent-tree' });
         
        // Non-empty: an empty template now refuses rather than emptying the repo.
        const downloadSpy = jest.fn().mockResolvedValue(new Map([['index.html', '<html></html>']]));
         
        (service as any).downloadRepoContents = downloadSpy;
         
        (service as any).createTree = jest.fn().mockResolvedValue('new-tree-sha');
         
        (service as any).createCommit = jest.fn().mockResolvedValue('new-commit-sha');
         
        (service as any).updateBranchRef = jest.fn().mockResolvedValue(undefined);

        await service.resetRepoToTemplate(
            'hlxsites', 'aem-boilerplate-commerce',
            'user', 'user-storefront',
            new Map(),
            LKG_SHA,
        );

        expect(downloadSpy).toHaveBeenCalledWith('hlxsites', 'aem-boilerplate-commerce', LKG_SHA);
    });

    it('calls updateBranchRef with the target branch "main" — NOT the templateRef', async () => {
        const service = new GitHubFileOperations(mockTokenService);
        jest.spyOn(service, 'getBranchInfo')
            .mockResolvedValue({ commitSha: 'parent-sha', treeSha: 'parent-tree' });
         
        // One file, not an empty Map: an empty template now throws rather than
        // committing a tree that would empty the repository.
        (service as any).downloadRepoContents = jest
            .fn()
            .mockResolvedValue(new Map([['index.html', '<html></html>']]));
         
        (service as any).createTree = jest.fn().mockResolvedValue('new-tree-sha');
         
        (service as any).createCommit = jest.fn().mockResolvedValue('new-commit-sha');
         
        const updateRefSpy = jest.fn().mockResolvedValue(undefined);
         
        (service as any).updateBranchRef = updateRefSpy;

        await service.resetRepoToTemplate(
            'hlxsites', 'aem-boilerplate-commerce',
            'user', 'user-storefront',
            new Map(),
            LKG_SHA,
        );

        expect(updateRefSpy).toHaveBeenCalledWith('user', 'user-storefront', 'main', 'new-commit-sha');
    });
});

describe('GitHub File Operations', () => {
    let GitHubFileOperations: any;
    let mockTokenService: any;

    beforeEach(async () => {
        jest.clearAllMocks();
        jest.resetModules();

        mockTokenService = {
            getToken: jest.fn().mockResolvedValue({ token: 'ghp_test' }),
            clearToken: jest.fn(),
        };

        const module = await import('@/features/eds/services/githubFileOperations');
        GitHubFileOperations = module.GitHubFileOperations;
    });

    describe('getFileContent', () => {
        it('should return decoded file content', async () => {
            // Given: File exists in repo
            const service = new GitHubFileOperations(mockTokenService);
            const content = 'Hello World';
            const base64Content = Buffer.from(content).toString('base64');
            mockOctokitRequest.mockResolvedValue({
                data: {
                    content: base64Content,
                    sha: 'abc123',
                    path: 'README.md',
                    encoding: 'base64',
                },
            });

            // When: Getting file content
            const result = await service.getFileContent('owner', 'repo', 'README.md');

            // Then: Content should be decoded
            expect(result).not.toBeNull();
            expect(result!.content).toBe('Hello World');
            expect(result!.sha).toBe('abc123');
        });

        it('should return null for 404', async () => {
            // Given: File not found
            const service = new GitHubFileOperations(mockTokenService);
            mockOctokitRequest.mockRejectedValue({ status: 404 });

            // When: Getting non-existent file
            const result = await service.getFileContent('owner', 'repo', 'missing.txt');

            // Then: Should return null
            expect(result).toBeNull();
        });

        it('should support ref parameter for specific branch/commit', async () => {
            // Given: File on specific branch
            const service = new GitHubFileOperations(mockTokenService);
            mockOctokitRequest.mockResolvedValue({
                data: {
                    content: Buffer.from('branch content').toString('base64'),
                    sha: 'def456',
                    path: 'file.txt',
                    encoding: 'base64',
                },
            });

            // When: Getting file from specific ref
            await service.getFileContent('owner', 'repo', 'file.txt', 'feature-branch');

            // Then: Request should include ref
            expect(mockOctokitRequest).toHaveBeenCalledWith(
                'GET /repos/{owner}/{repo}/contents/{path}',
                expect.objectContaining({ ref: 'feature-branch' })
            );
        });
    });

    describe('createOrUpdateFile', () => {
        it('should create new file with base64 encoded content', async () => {
            // Given: API accepts file creation
            const service = new GitHubFileOperations(mockTokenService);
            mockOctokitRequest.mockResolvedValue({
                data: {
                    content: { sha: 'newsha' },
                    commit: { sha: 'commitsha' },
                },
            });

            // When: Creating file
            const result = await service.createOrUpdateFile(
                'owner',
                'repo',
                'new-file.txt',
                'File content',
                'Add new file'
            );

            // Then: Should return file and commit SHAs
            expect(result.sha).toBe('newsha');
            expect(result.commitSha).toBe('commitsha');

            // Verify content is base64 encoded
            const callArgs = mockOctokitRequest.mock.calls[0][1];
            expect(callArgs.content).toBe(Buffer.from('File content').toString('base64'));
        });

        /**
         * A real 2026-08-11 report died with GitHub's raw text — "Repository rule
         * violations found / Secret detected in content" — which names no file. This
         * pipeline writes eight of them, so the reporter could not tell which was
         * refused. The path is known right here; these pin that it reaches the message.
         */
        it('names the blocked file when push protection rejects the write', async () => {
            const service = new GitHubFileOperations(mockTokenService);
            const rejection = new Error(
                'Repository rule violations found\n\nSecret detected in content'
            ) as Error & { status?: number };
            rejection.status = 422;
            mockOctokitRequest.mockRejectedValue(rejection);

            await expect(
                service.createOrUpdateFile('owner', 'repo', 'fstab.yaml', 'body', 'msg')
            ).rejects.toThrow(/fstab\.yaml/);
        });

        it('says nothing was written, so the repo is not assumed half-updated', async () => {
            const service = new GitHubFileOperations(mockTokenService);
            const rejection = new Error('Repository rule violations found') as Error & {
                status?: number;
            };
            rejection.status = 422;
            mockOctokitRequest.mockRejectedValue(rejection);

            await expect(
                service.createOrUpdateFile('owner', 'repo', 'config.json', 'body', 'msg')
            ).rejects.toThrow(/nothing was written/i);
        });

        it('logs the full GitHub response body, not just the tidy message', async () => {
            // The block cannot be reproduced locally — it comes from policy on the
            // reporting user's account. What GitHub said is the only evidence there
            // will ever be, so it has to reach the debug log.
            const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), trace: jest.fn() };
            const service = new GitHubFileOperations(mockTokenService, logger);
            const rejection = new Error('Repository rule violations found') as Error & {
                status?: number;
                response?: unknown;
            };
            rejection.status = 422;
            rejection.response = {
                headers: { 'x-github-request-id': 'REQ:9' },
                data: {
                    message: 'Repository rule violations found',
                    errors: [{ resource: 'PushRule', message: 'Adobe Client Secret' }],
                },
            };
            mockOctokitRequest.mockRejectedValue(rejection);

            await expect(
                service.createOrUpdateFile('owner', 'repo', 'fstab.yaml', 'body', 'msg')
            ).rejects.toThrow(/fstab\.yaml/);

            // Debug channel only: User Logs keeps the clean headline, which already
            // names the secret. debugLogger.ts:100-104 defines that split.
            const logged = logger.debug.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
            expect(logged).toContain('Adobe Client Secret');
            expect(logged).toContain('REQ:9');
            expect(logged).toContain('422');
        });

        it('leaves an unrelated failure untouched', async () => {
            // 422 is also a stale-SHA conflict, which has a different remedy. Relabelling
            // it as a secret block would send the reader to the wrong place entirely.
            const service = new GitHubFileOperations(mockTokenService);
            const staleSha = new Error('is at abc123 but expected def456') as Error & {
                status?: number;
            };
            staleSha.status = 422;
            mockOctokitRequest.mockRejectedValue(staleSha);

            await expect(
                service.createOrUpdateFile('owner', 'repo', 'fstab.yaml', 'body', 'msg')
            ).rejects.toThrow('is at abc123 but expected def456');
        });

        it('should update existing file with SHA', async () => {
            // Given: Existing file SHA
            const service = new GitHubFileOperations(mockTokenService);
            mockOctokitRequest.mockResolvedValue({
                data: {
                    content: { sha: 'updatedsha' },
                    commit: { sha: 'commitsha2' },
                },
            });

            // When: Updating file
            await service.createOrUpdateFile(
                'owner',
                'repo',
                'existing.txt',
                'Updated content',
                'Update file',
                'existingsha'
            );

            // Then: Request should include SHA
            expect(mockOctokitRequest).toHaveBeenCalledWith(
                'PUT /repos/{owner}/{repo}/contents/{path}',
                expect.objectContaining({ sha: 'existingsha' })
            );
        });
    });
});

/**
 * Chunked tree creation.
 *
 * `resetRepoToTemplate` sent every file's content inline in ONE create-tree.
 * Measured on `adobe-commerce/boilerplate-b2b-template`: 3,340 files and a
 * 13.55 MB request body, which GitHub times out on with its own error naming
 * the remedy ("Consider building the tree incrementally"). Reset was broken
 * outright for any project on a template that size, every time.
 */
describe('resetRepoToTemplate — chunked tree creation', () => {
    let GitHubFileOperations: any;
    let mockTokenService: any;

    /** An entry whose JSON weighs roughly `kb` kilobytes. */
    const bigFile = (name: string, kb: number): [string, string] => [name, 'x'.repeat(kb * 1024)];

    async function runReset(contents: Map<string, string>) {
        const service = new GitHubFileOperations(mockTokenService);
        jest.spyOn(service, 'getBranchInfo').mockResolvedValue({
            commitSha: 'parent-sha',
            treeSha: 'parent-tree',
        });
        (service as any).downloadRepoContents = jest.fn().mockResolvedValue(contents);
        const createTree = jest
            .fn()
            .mockImplementation(async (_o: string, _r: string, entries: unknown[], base?: string) =>
                `tree-after-${entries.length}-${base ?? 'none'}`,
            );
        (service as any).createTree = createTree;
        const createCommit = jest.fn().mockResolvedValue('new-commit-sha');
        (service as any).createCommit = createCommit;
        (service as any).updateBranchRef = jest.fn().mockResolvedValue(undefined);

        await service.resetRepoToTemplate('t-owner', 't-repo', 'u', 'u-repo', new Map(), 'main');
        return { createTree, createCommit };
    }

    beforeEach(async () => {
        jest.clearAllMocks();
        jest.resetModules();
        mockTokenService = {
            getToken: jest.fn().mockResolvedValue({ token: 'ghp_test' }),
            clearToken: jest.fn(),
        };
        GitHubFileOperations = (await import('@/features/eds/services/githubFileOperations'))
            .GitHubFileOperations;
    });

    it('splits a large template across several create-tree requests', async () => {
        // ~6 MB of content: one request would be the shape that times out.
        const contents = new Map(Array.from({ length: 12 }, (_, i) => bigFile(`f${i}.js`, 512)));

        const { createTree } = await runReset(contents);

        expect(createTree.mock.calls.length).toBeGreaterThan(1);
        // Every entry still ships exactly once — chunking must not drop files.
        const shipped = createTree.mock.calls.flatMap((c: any[]) => c[2]).map((e: any) => e.path);
        expect(new Set(shipped).size).toBe(12);
    });

    /**
     * The load-bearing one. A reset REPLACES the repo, so the first batch must
     * carry NO base_tree — basing it on the branch's existing tree would let
     * files the template deleted survive the reset. Later batches chain on the
     * previous batch so the final tree is the union of all of them.
     */
    it('bases the FIRST batch on nothing, then chains each batch on the previous', async () => {
        const contents = new Map(Array.from({ length: 12 }, (_, i) => bigFile(`f${i}.js`, 512)));

        const { createTree, createCommit } = await runReset(contents);

        const bases = createTree.mock.calls.map((c: any[]) => c[3]);
        expect(bases[0]).toBeUndefined();
        expect(bases[0]).not.toBe('parent-tree'); // never the existing tree
        for (let i = 1; i < bases.length; i++) {
            expect(bases[i]).toBe(await createTree.mock.results[i - 1].value);
        }
        // The commit uses the LAST tree, not the first.
        const finalTree = await createTree.mock.results[createTree.mock.calls.length - 1].value;
        expect(createCommit).toHaveBeenCalledWith('u', 'u-repo', expect.any(String), finalTree, 'parent-sha');
    });

    it('still issues a single request for a small template', async () => {
        const { createTree } = await runReset(new Map([['a.js', 'hello'], ['b.js', 'world']]));

        expect(createTree).toHaveBeenCalledTimes(1);
        expect(createTree.mock.calls[0][3]).toBeUndefined();
    });

    // Measured: one file in this template is 3.5 MB on its own. A budget-based
    // batcher must never split an entry — an oversized one becomes its own batch.
    it('gives an entry larger than the budget its own request rather than splitting it', async () => {
        const contents = new Map([bigFile('huge.js', 4096), bigFile('small.js', 1)]);

        const { createTree } = await runReset(contents);

        const perCall = createTree.mock.calls.map((c: any[]) => c[2].length);
        expect(perCall).toEqual([1, 1]);
        const huge = createTree.mock.calls[0][2][0];
        expect(huge.path).toBe('huge.js');
        expect(huge.content.length).toBe(4096 * 1024); // intact, not truncated
    });
});

/**
 * Empty-template guard.
 *
 * Before chunking, zero entries went to `createTree` unguarded — producing an
 * EMPTY tree, committing it, and moving the branch ref, which empties the
 * repository. A silently failed template download was one step from destroying
 * a user's storefront. Refuse instead.
 */
describe('resetRepoToTemplate — empty template', () => {
    let GitHubFileOperations: any;

    beforeEach(async () => {
        jest.clearAllMocks();
        jest.resetModules();
        GitHubFileOperations = (await import('@/features/eds/services/githubFileOperations'))
            .GitHubFileOperations;
    });

    it('refuses to commit when the template produced no files', async () => {
        const service = new GitHubFileOperations({
            getToken: jest.fn().mockResolvedValue({ token: 'ghp_test' }),
            clearToken: jest.fn(),
        } as any);
        jest.spyOn(service, 'getBranchInfo').mockResolvedValue({
            commitSha: 'parent-sha',
            treeSha: 'parent-tree',
        });
        (service as any).downloadRepoContents = jest.fn().mockResolvedValue(new Map());
        const createCommit = jest.fn();
        const updateBranchRef = jest.fn();
        (service as any).createTree = jest.fn().mockResolvedValue('t');
        (service as any).createCommit = createCommit;
        (service as any).updateBranchRef = updateBranchRef;

        await expect(
            service.resetRepoToTemplate('t-o', 't-r', 'u', 'u-r', new Map(), 'main'),
        ).rejects.toThrow(/no files/i);

        // The branch must be untouched — this is the data-loss path.
        expect(createCommit).not.toHaveBeenCalled();
        expect(updateBranchRef).not.toHaveBeenCalled();
    });
});
