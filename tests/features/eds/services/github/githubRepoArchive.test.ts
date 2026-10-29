/**
 * GitHubRepoArchive — the archive URL, the download, and what the reset asks of
 * the tree-commits unit.
 *
 * The reset's end-to-end shape (what lands in the tree, batching, the branch it
 * moves) is in `-resetTemplate`; binaries and modes in `-resetBinary`. This suite
 * drives the archive unit over a STUBBED tree-commits unit and asserts the
 * ARGUMENTS it passes: the target branch is always `main` while only the download
 * takes the template ref (ADR-006 Step 4 — a 40-hex SHA sent to the branches API
 * 404'd every thin-layer reset), the first batch has no base tree, and an empty
 * template never reaches a commit.
 */

import { GitHubRepoArchive, GitHubTreeCommits, mockRequest } from './githubFileOperations.testUtils';
import { buildArchiveUrl } from '@/features/eds/services/github/githubRepoArchive';
import type { GitHubTokenService } from '@/features/eds/services/github/githubTokenService';

const tokenService = {
    getToken: jest.fn().mockResolvedValue({ token: 'gh-token' }),
} as unknown as GitHubTokenService;

const LKG_SHA = 'a1b2c3d4e5f6789012345678901234567890abcd';

/** An archived file as `downloadRepoContents` answers it: text bytes, plain mode. */
const archived = (text: string) => ({ data: Buffer.from(text), mode: '100644' as const });

/** An entry whose JSON weighs roughly `kb` kilobytes. */
const bigFile = (name: string, kb: number): [string, ReturnType<typeof archived>] => [
    name,
    archived('x'.repeat(kb * 1024)),
];

const ONE_FILE = new Map([['index.html', archived('<html></html>')]]);

/**
 * The archive over a tree-commits unit whose five primitives are spied, and a
 * stubbed download, so the test reads what the reset ASKS for.
 */
function harness(contents: Map<string, ReturnType<typeof archived>>) {
    const treeCommits = new GitHubTreeCommits(tokenService);
    const getBranchInfo = jest
        .spyOn(treeCommits, 'getBranchInfo')
        .mockResolvedValue({ commitSha: 'parent-sha', treeSha: 'parent-tree' });
    const createBlob = jest.spyOn(treeCommits, 'createBlob').mockResolvedValue('blob-sha');
    const createTree = jest
        .spyOn(treeCommits, 'createTree')
        .mockImplementation(
            async (_o: string, _r: string, entries: unknown[], base?: string) =>
                `tree-after-${entries.length}-${base ?? 'none'}`,
        );
    const createCommit = jest.spyOn(treeCommits, 'createCommit').mockResolvedValue('new-commit-sha');
    const updateBranchRef = jest.spyOn(treeCommits, 'updateBranchRef').mockResolvedValue(undefined);

    const archive = new GitHubRepoArchive(tokenService, treeCommits);
    const downloadRepoContents = jest.fn().mockResolvedValue(contents);
    (archive as unknown as { downloadRepoContents: jest.Mock }).downloadRepoContents =
        downloadRepoContents;

    return { archive, getBranchInfo, createBlob, createTree, createCommit, updateBranchRef, downloadRepoContents };
}

beforeEach(() => {
    mockRequest.mockReset();
});

describe('buildArchiveUrl', () => {
    // The SHA-vs-branch URL routing, directly. ADR-006 Step 4: thin-layer reset
    // passes the LKG SHA, forked reset passes `main`.

    it('uses the branch URL shape for "main"', () => {
        const { url, isSha } = buildArchiveUrl('skukla', 'citisignal-b2b', 'main');
        expect(isSha).toBe(false);
        expect(url).toBe('https://github.com/skukla/citisignal-b2b/archive/refs/heads/main.zip');
    });

    it('uses the branch URL shape for any non-SHA ref (custom branches)', () => {
        const { url, isSha } = buildArchiveUrl('skukla', 'citisignal-b2b', 'feature/x');
        expect(isSha).toBe(false);
        expect(url).toBe(
            'https://github.com/skukla/citisignal-b2b/archive/refs/heads/feature/x.zip',
        );
    });

    it('uses the SHA URL shape for a full 40-hex commit SHA (lowercase)', () => {
        const { url, isSha } = buildArchiveUrl('skukla', 'citisignal-b2b', LKG_SHA);
        expect(isSha).toBe(true);
        expect(url).toBe(`https://github.com/skukla/citisignal-b2b/archive/${LKG_SHA}.zip`);
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

    // The SHA test is anchored at BOTH ends. A branch whose name merely contains
    // forty hex characters is still a branch, and sending it down the SHA URL
    // shape produces a 404 from GitHub's archive endpoint rather than an error
    // anyone can read.
    it('treats a ref that only STARTS with 40 hex characters as a branch', () => {
        const { isSha } = buildArchiveUrl('skukla', 'citisignal-b2b', `${'a'.repeat(40)}-wip`);
        expect(isSha).toBe(false);
    });

    it('treats a ref that only ENDS with 40 hex characters as a branch', () => {
        const { isSha } = buildArchiveUrl('skukla', 'citisignal-b2b', `release/${'a'.repeat(40)}`);
        expect(isSha).toBe(false);
    });
});

describe('downloadRepoArchive', () => {
    const archive = () => new GitHubRepoArchive(tokenService, new GitHubTreeCommits(tokenService));

    it('fetches the branch archive with the extension named as the agent, and answers its bytes', async () => {
        const bytes = Buffer.from('PK\u0003\u0004zip');
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            arrayBuffer: () => Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
        }) as unknown as typeof fetch;

        const got = await archive().downloadRepoArchive('me', 'shop', 'develop');

        expect(global.fetch).toHaveBeenCalledWith(
            'https://github.com/me/shop/archive/refs/heads/develop.zip',
            { headers: { 'User-Agent': 'Demo-Builder-VSCode' } },
        );
        expect(got.equals(bytes)).toBe(true);
    });

    it('defaults to the main branch', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        }) as unknown as typeof fetch;

        await archive().downloadRepoArchive('me', 'shop');

        expect(global.fetch).toHaveBeenCalledWith(
            'https://github.com/me/shop/archive/refs/heads/main.zip',
            expect.anything(),
        );
    });

    it('fails with the HTTP status when GitHub refuses', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch;

        await expect(archive().downloadRepoArchive('me', 'shop')).rejects.toThrow(
            'Failed to download archive: HTTP 404',
        );
    });

    it('refuses without a GitHub token, before any download', async () => {
        global.fetch = jest.fn() as unknown as typeof fetch;
        const noToken = { getToken: jest.fn().mockResolvedValue(null) } as unknown as GitHubTokenService;

        await expect(
            new GitHubRepoArchive(noToken, new GitHubTreeCommits(noToken)).downloadRepoArchive('me', 'shop'),
        ).rejects.toThrow('Not authenticated');
        expect(global.fetch).not.toHaveBeenCalled();
    });
});

describe('resetRepoToTemplate — target branch vs template ref separation', () => {
    it('reads the target branch "main" — NOT the templateRef', async () => {
        const { archive, getBranchInfo } = harness(ONE_FILE);

        await archive.resetRepoToTemplate(
            'hlxsites',
            'aem-boilerplate-commerce',
            'user',
            'user-storefront',
            new Map(),
            LKG_SHA, // the LKG SHA, NOT 'main'
        );

        expect(getBranchInfo).toHaveBeenCalledWith('user', 'user-storefront', 'main');
    });

    it('passes the templateRef (SHA-shaped or branch) through to the download', async () => {
        const { archive, downloadRepoContents } = harness(ONE_FILE);

        await archive.resetRepoToTemplate(
            'hlxsites',
            'aem-boilerplate-commerce',
            'user',
            'user-storefront',
            new Map(),
            LKG_SHA,
        );

        expect(downloadRepoContents).toHaveBeenCalledWith('hlxsites', 'aem-boilerplate-commerce', LKG_SHA);
    });

    it('downloads the template branch main when no revision was pinned', async () => {
        const { archive, downloadRepoContents } = harness(ONE_FILE);

        await archive.resetRepoToTemplate('hlxsites', 'aem-boilerplate-commerce', 'user', 'user-storefront', new Map());

        expect(downloadRepoContents).toHaveBeenCalledWith('hlxsites', 'aem-boilerplate-commerce', 'main');
    });

    it('moves the target branch "main" — NOT the templateRef — and asks for force explicitly', async () => {
        // Assert the ARGUMENT, not the outcome: `updateBranchRef` is stubbed, and a
        // stub moves no ref whatever it is handed. What is under test is what reset
        // ASKS for — after the force default flipped to false, a reset that stays
        // silent would quietly stop replacing history.
        const { archive, updateBranchRef } = harness(ONE_FILE);

        await archive.resetRepoToTemplate(
            'hlxsites',
            'aem-boilerplate-commerce',
            'user',
            'user-storefront',
            new Map(),
            LKG_SHA,
        );

        expect(updateBranchRef).toHaveBeenCalledWith(
            'user',
            'user-storefront',
            'main',
            'new-commit-sha',
            true,
        );
    });

    it('parents the reset commit on the target branch head it read', async () => {
        const { archive, createCommit } = harness(ONE_FILE);

        await archive.resetRepoToTemplate('t', 't', 'u', 'u-repo', new Map());

        expect(createCommit).toHaveBeenCalledWith(
            'u',
            'u-repo',
            'chore: reset repository to template',
            'tree-after-1-none',
            'parent-sha',
        );
    });

    it('answers the commit and how many files it carries', async () => {
        const { archive } = harness(new Map([['a.js', archived('a')], ['b.js', archived('b')]]));

        await expect(
            archive.resetRepoToTemplate('t', 't', 'u', 'u-repo', new Map([['c.js', 'c']])),
        ).resolves.toEqual({ commitSha: 'new-commit-sha', fileCount: 3 });
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
    async function runReset(contents: Map<string, ReturnType<typeof archived>>) {
        const h = harness(contents);
        await h.archive.resetRepoToTemplate('t-owner', 't-repo', 'u', 'u-repo', new Map(), 'main');
        return h;
    }

    it('splits a large template across several create-tree requests', async () => {
        // ~6 MB of content: one request would be the shape that times out.
        const contents = new Map(Array.from({ length: 12 }, (_, i) => bigFile(`f${i}.js`, 512)));

        const { createTree } = await runReset(contents);

        expect(createTree.mock.calls.length).toBeGreaterThan(1);
        // Every entry still ships exactly once — chunking must not drop files.
        const shipped = createTree.mock.calls.flatMap((c) => c[2]).map((e) => e.path);
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

        const bases = createTree.mock.calls.map((c) => c[3]);
        expect(bases[0]).toBeUndefined();
        expect(bases[0]).not.toBe('parent-tree'); // never the existing tree
        for (let i = 1; i < bases.length; i++) {
            expect(bases[i]).toBe(await createTree.mock.results[i - 1].value);
        }
        // The commit uses the LAST tree, not the first.
        const finalTree = await createTree.mock.results[createTree.mock.calls.length - 1].value;
        expect(createCommit).toHaveBeenCalledWith(
            'u',
            'u-repo',
            expect.any(String),
            finalTree,
            'parent-sha',
        );
    });

    it('still issues a single request for a small template', async () => {
        const { createTree } = await runReset(
            new Map([
                ['a.js', archived('hello')],
                ['b.js', archived('world')],
            ]),
        );

        expect(createTree).toHaveBeenCalledTimes(1);
        expect(createTree.mock.calls[0][3]).toBeUndefined();
    });

    // Measured: one file in this template is 3.5 MB on its own. A budget-based
    // batcher must never split an entry — an oversized one becomes its own batch.
    it('gives an entry larger than the budget its own request rather than splitting it', async () => {
        const contents = new Map([bigFile('huge.js', 4096), bigFile('small.js', 1)]);

        const { createTree } = await runReset(contents);

        const perCall = createTree.mock.calls.map((c) => c[2].length);
        expect(perCall).toEqual([1, 1]);
        const huge = createTree.mock.calls[0][2][0];
        expect(huge.path).toBe('huge.js');
        expect(huge.content).toHaveLength(4096 * 1024); // intact, not truncated
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
    it('refuses to commit when the template produced no files', async () => {
        const { archive, createCommit, updateBranchRef } = harness(new Map());

        await expect(
            archive.resetRepoToTemplate('t-o', 't-r', 'u', 'u-r', new Map(), 'main'),
        ).rejects.toThrow(/no files/i);

        // The branch must be untouched — this is the data-loss path.
        expect(createCommit).not.toHaveBeenCalled();
        expect(updateBranchRef).not.toHaveBeenCalled();
    });
});
