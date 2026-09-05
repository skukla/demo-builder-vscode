/**
 * resetRepoToTemplate — replacing a repository with a template revision.
 *
 * Two decisions here have already been defects. The FIRST batch deliberately
 * passes no `base_tree`: a reset REPLACES the repository, and basing it on the
 * branch's existing tree lets files the template no longer contains survive.
 * And the target branch is always `main` — conflating it with the template ref
 * sent a 40-hex SHA to the branches API and 404'd every thin-layer reset.
 *
 * The archive path is driven through a stubbed zip so the root-folder stripping
 * (`owner-repo-sha/`) is asserted rather than assumed.
 */

import { GitHubFileOperations, mockRequest } from './githubFileOperations.testUtils';
import { batchTreeEntries } from '@/features/eds/services/github/githubFileOperations';
import type { GitHubTokenService } from '@/features/eds/services/github/githubTokenService';
import type { GitHubTreeInput } from '@/features/eds/services/types';

const mockZipEntries = jest.fn();
jest.mock('adm-zip', () => ({
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({ getEntries: () => mockZipEntries() })),
}));

const tokenService = {
    getToken: jest.fn().mockResolvedValue({ token: 'gh-token' }),
} as unknown as GitHubTokenService;

/** A zip entry as adm-zip presents it. */
function zipEntry(entryName: string, content?: string) {
    return {
        entryName,
        isDirectory: content === undefined,
        getData: () => Buffer.from(content ?? '', 'utf-8'),
    };
}

const ROOT = 'me-template-abc123/';

interface TreeCall {
    tree: Array<{ path: string; content?: string }>;
    base_tree?: string;
}

function stubGitHub() {
    const treeCalls: TreeCall[] = [];
    const refCalls: Array<Record<string, unknown>> = [];
    let treeCount = 0;
    mockRequest.mockImplementation((route: string, options: Record<string, unknown>) => {
        if (route.includes('/branches/{branch}')) {
            return Promise.resolve({
                data: { sha: 'target-head', commit: { sha: 'target-head', commit: { tree: { sha: 'target-tree' } } } },
            });
        }
        if (route.includes('/git/trees')) {
            treeCalls.push(options as unknown as TreeCall);
            return Promise.resolve({ data: { sha: `tree-${++treeCount}` } });
        }
        if (route.includes('/git/commits')) {
            return Promise.resolve({ data: { sha: 'reset-commit-sha' } });
        }
        if (route.includes('/git/refs/heads/')) {
            refCalls.push(options);
            return Promise.resolve({ data: {} });
        }
        return Promise.reject(new Error(`unexpected route ${route}`));
    });
    return { treeCalls, refCalls };
}

function stubArchive(entries: ReturnType<typeof zipEntry>[]): void {
    mockZipEntries.mockReturnValue(entries);
    global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    }) as unknown as typeof fetch;
}

beforeEach(() => {
    mockRequest.mockReset();
    mockZipEntries.mockReset();
});

const ops = () => new GitHubFileOperations(tokenService);

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
        expect(batchTreeEntries([])).toEqual([]);
    });
});

describe('resetRepoToTemplate — what lands in the tree', () => {
    it('strips the archive root folder and keeps every template file', async () => {
        const { treeCalls } = stubGitHub();
        stubArchive([
            zipEntry(ROOT),
            zipEntry(`${ROOT}head.html`, '<head/>'),
            zipEntry(`${ROOT}scripts/scripts.js`, 'console.log(1)'),
        ]);

        const result = await ops().resetRepoToTemplate(
            'me',
            'template',
            'me',
            'shop',
            new Map(),
        );

        expect(treeCalls).toHaveLength(1);
        expect(treeCalls[0].tree).toEqual([
            { path: 'head.html', mode: '100644', type: 'blob', content: '<head/>' },
            { path: 'scripts/scripts.js', mode: '100644', type: 'blob', content: 'console.log(1)' },
        ]);
        expect(result).toEqual({ commitSha: 'reset-commit-sha', fileCount: 2 });
    });

    it('replaces a template file with the caller’s override', async () => {
        const { treeCalls } = stubGitHub();
        stubArchive([zipEntry(ROOT), zipEntry(`${ROOT}fstab.yaml`, 'template fstab')]);

        await ops().resetRepoToTemplate(
            'me',
            'template',
            'me',
            'shop',
            new Map([['fstab.yaml', 'generated fstab']]),
        );

        expect(treeCalls[0].tree).toEqual([
            { path: 'fstab.yaml', mode: '100644', type: 'blob', content: 'generated fstab' },
        ]);
    });

    it('adds an override the template does not contain', async () => {
        const { treeCalls } = stubGitHub();
        stubArchive([zipEntry(ROOT), zipEntry(`${ROOT}head.html`, '<head/>')]);

        await ops().resetRepoToTemplate(
            'me',
            'template',
            'me',
            'shop',
            new Map([['config.json', '{}']]),
        );

        expect(treeCalls[0].tree).toEqual([
            { path: 'head.html', mode: '100644', type: 'blob', content: '<head/>' },
            { path: 'config.json', mode: '100644', type: 'blob', content: '{}' },
        ]);
    });

    it('takes the root prefix from the first DIRECTORY entry, not the first entry', async () => {
        const { treeCalls } = stubGitHub();
        // adm-zip does not promise the folder entry comes first.
        stubArchive([
            zipEntry(`${ROOT}head.html`, '<head/>'),
            zipEntry(ROOT),
            zipEntry(`${ROOT}scripts/scripts.js`, 'console.log(1)'),
        ]);

        await ops().resetRepoToTemplate('me', 'template', 'me', 'shop', new Map());

        expect(treeCalls[0].tree.map((e) => e.path)).toEqual([
            'head.html',
            'scripts/scripts.js',
        ]);
    });

    it('drops nested directory entries — a tree entry is not a file', async () => {
        const { treeCalls } = stubGitHub();
        stubArchive([
            zipEntry(ROOT),
            zipEntry(`${ROOT}scripts/`),
            zipEntry(`${ROOT}scripts/scripts.js`, 'console.log(1)'),
        ]);

        await ops().resetRepoToTemplate('me', 'template', 'me', 'shop', new Map());

        expect(treeCalls[0].tree.map((e) => e.path)).toEqual(['scripts/scripts.js']);
    });

    it('drops an entry whose path is nothing but the root prefix', async () => {
        const { treeCalls } = stubGitHub();
        // Some archives write the root folder as a zero-length FILE entry rather
        // than a directory one; stripping the prefix leaves an empty path, which
        // is not a file GitHub can be asked to create.
        stubArchive([
            zipEntry(ROOT),
            zipEntry(ROOT, ''),
            zipEntry(`${ROOT}head.html`, '<head/>'),
        ]);

        await ops().resetRepoToTemplate('me', 'template', 'me', 'shop', new Map());

        expect(treeCalls[0].tree.map((e) => e.path)).toEqual(['head.html']);
    });

    it('refuses to commit when the archive produced no files', async () => {
        stubGitHub();
        stubArchive([zipEntry(ROOT)]);

        await expect(
            ops().resetRepoToTemplate('me', 'template', 'me', 'shop', new Map()),
        ).rejects.toThrow('Template produced no files to commit');
    });
});

describe('resetRepoToTemplate — batching and the base tree', () => {
    it('sends no base_tree on the first batch and chains every later one', async () => {
        const { treeCalls } = stubGitHub();
        // Two entries, each comfortably over half the byte budget, so they cannot
        // share a request.
        const big = 'x'.repeat(700_000);
        stubArchive([
            zipEntry(ROOT),
            zipEntry(`${ROOT}a.txt`, big),
            zipEntry(`${ROOT}b.txt`, big),
        ]);

        await ops().resetRepoToTemplate('me', 'template', 'me', 'shop', new Map());

        expect(treeCalls).toHaveLength(2);
        // No base_tree at all on the first: a reset must not inherit the branch's
        // existing tree, or files the template dropped would survive it.
        expect(treeCalls[0].base_tree).toBeUndefined();
        expect(treeCalls[1].base_tree).toBe('tree-1');
    });
});

describe('resetRepoToTemplate — the branch it moves', () => {
    it('always targets main, and force-moves it because the commit is not a descendant', async () => {
        const { refCalls } = stubGitHub();
        stubArchive([zipEntry(ROOT), zipEntry(`${ROOT}head.html`, '<head/>')]);
        const lkgSha = 'a1b2c3d4e5f6789012345678901234567890abcd';

        await ops().resetRepoToTemplate('me', 'template', 'me', 'shop', new Map(), lkgSha);

        expect(refCalls).toEqual([
            { owner: 'me', repo: 'shop', branch: 'main', sha: 'reset-commit-sha', force: true },
        ]);
    });

    it('downloads the template revision the caller pinned, by SHA', async () => {
        stubGitHub();
        stubArchive([zipEntry(ROOT), zipEntry(`${ROOT}head.html`, '<head/>')]);
        const lkgSha = 'a1b2c3d4e5f6789012345678901234567890abcd';

        await ops().resetRepoToTemplate('me', 'template', 'me', 'shop', new Map(), lkgSha);

        expect(global.fetch).toHaveBeenCalledWith(
            `https://github.com/me/template/archive/${lkgSha}.zip`,
            { headers: { 'User-Agent': 'Demo-Builder-VSCode' } },
        );
    });

    it('downloads the template branch when no revision was pinned', async () => {
        stubGitHub();
        stubArchive([zipEntry(ROOT), zipEntry(`${ROOT}head.html`, '<head/>')]);

        await ops().resetRepoToTemplate('me', 'template', 'me', 'shop', new Map());

        expect(global.fetch).toHaveBeenCalledWith(
            'https://github.com/me/template/archive/refs/heads/main.zip',
            { headers: { 'User-Agent': 'Demo-Builder-VSCode' } },
        );
    });
});

describe('resetRepoToTemplate — when the archive cannot be fetched', () => {
    it('fails with the HTTP status rather than writing a partial tree', async () => {
        const { treeCalls } = stubGitHub();
        mockZipEntries.mockReturnValue([]);
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch;

        await expect(
            ops().resetRepoToTemplate('me', 'template', 'me', 'shop', new Map()),
        ).rejects.toThrow('Failed to download archive: HTTP 404');
        expect(treeCalls).toEqual([]);
    });

    it('refuses without a GitHub token', async () => {
        stubGitHub();
        const noToken = {
            getToken: jest
                .fn()
                .mockResolvedValueOnce({ token: 'gh-token' })
                .mockResolvedValue(null),
        } as unknown as GitHubTokenService;

        await expect(
            new GitHubFileOperations(noToken).resetRepoToTemplate(
                'me',
                'template',
                'me',
                'shop',
                new Map(),
            ),
        ).rejects.toThrow('Not authenticated');
    });
});
