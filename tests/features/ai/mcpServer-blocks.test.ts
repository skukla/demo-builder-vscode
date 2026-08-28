/**
 * MCP Server Tests — Storefront & blocks
 *
 * toolHandlers.syncStorefront (git add/commit/push), listBlocks, and
 * getBlockSource — all deriving the storefront from the manifest. Shared setup
 * lives in mcpServer.testUtils.ts.
 */

import {
    fsProm,
    childProcess,
    toolHandlers,
    PROJECTS_DIR,
    PROJECT_NAME,
    mockManifestWithStorefront,
    mockManifestWithoutStorefront,
    mockManifestWithBlockLibraries,
} from './mcpServer.testUtils';

// ─── toolHandlers.syncStorefront ─────────────────────────────────────────────

describe('toolHandlers.syncStorefront', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('throws when project has no EDS storefront configured', async () => {
        mockManifestWithoutStorefront();

        await expect(
            toolHandlers.syncStorefront(PROJECTS_DIR, PROJECT_NAME, 'AI: test'),
        ).rejects.toThrow(/No EDS storefront configured/i);
    });

    it('throws when storefrontPath derived from manifest is outside the project directory', async () => {
        mockManifestWithStorefront('/other/path');

        await expect(
            toolHandlers.syncStorefront(PROJECTS_DIR, PROJECT_NAME, 'AI: test'),
        ).rejects.toThrow(/escapes allowed directory/i);
    });

    // syncAndPublish now runs a best-effort `git pull --ff-only` BEFORE staging
    // (pre-sync fast-forward, so the push fast-forwards instead of being
    // rejected). With no token in the MCP path that adds one leading call, so
    // the sequence is: pull → add → commit → push.
    it('calls execFile for git pull --ff-only, add, commit, push in sequence', async () => {
        mockManifestWithStorefront();
        (childProcess.execFile as unknown as jest.Mock)
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', ''))
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', ''))
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', ''))
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', ''))
            // Trailing default: syncAndPublish also reads `git rev-parse` for the
            // pushed sha. A chain of `Once` impls with nothing behind it leaves any
            // later call hanging on a promise that never settles, which surfaces as a
            // test timeout rather than a failed assertion.
            .mockImplementation((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', ''));

        const result = await toolHandlers.syncStorefront(PROJECTS_DIR, PROJECT_NAME, 'AI: update config');

        // pull → add → commit → push → rev-parse (the sha reported back).
        expect(childProcess.execFile as unknown as jest.Mock).toHaveBeenCalledTimes(5);
        const calls = (childProcess.execFile as unknown as jest.Mock).mock.calls;
        expect(calls[0][1]).toContain('pull');
        expect(calls[1][1]).toContain('add');
        expect(calls[2][1]).toContain('commit');
        expect(calls[3][1]).toContain('push');
        expect(calls[4][1]).toContain('rev-parse');
        expect(result).toContain('success');
    });

    it('strips newlines from commit message before passing to git', async () => {
        mockManifestWithStorefront();
        (childProcess.execFile as unknown as jest.Mock)
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', '')) // pull --ff-only
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', ''))
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', ''))
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', ''))
            // Trailing default: syncAndPublish also reads `git rev-parse` for the
            // pushed sha. A chain of `Once` impls with nothing behind it leaves any
            // later call hanging on a promise that never settles, which surfaces as a
            // test timeout rather than a failed assertion.
            .mockImplementation((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', ''));

        await toolHandlers.syncStorefront(PROJECTS_DIR, PROJECT_NAME, 'AI: sync\nline2');

        const calls = (childProcess.execFile as unknown as jest.Mock).mock.calls;
        const commitArgs: string[] = calls[2][1];
        const messageIndex = commitArgs.indexOf('-m') + 1;
        expect(commitArgs[messageIndex]).not.toContain('\n');
        expect(commitArgs[messageIndex]).toBe('AI: sync line2');
    });

    it('returns success message when git commit fails with "nothing to commit"', async () => {
        mockManifestWithStorefront();
        const nothingToCommitErr = Object.assign(
            new Error('Command failed: git -C /path commit'),
            { stderr: 'nothing to commit, working tree clean' },
        );
        (childProcess.execFile as unknown as jest.Mock)
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', '')) // pull --ff-only
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', ''))
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) =>
                cb(nothingToCommitErr, '', ''),
            );

        const result = await toolHandlers.syncStorefront(PROJECTS_DIR, PROJECT_NAME, 'AI: no changes');

        expect(result).toContain('Nothing to commit');
    });

    it('uses the default commit message when commitMessage collapses to empty after trim', async () => {
        mockManifestWithStorefront();
        (childProcess.execFile as unknown as jest.Mock)
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', '')) // pull --ff-only
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', ''))
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', ''))
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', ''))
            // Trailing default: syncAndPublish also reads `git rev-parse` for the
            // pushed sha. A chain of `Once` impls with nothing behind it leaves any
            // later call hanging on a promise that never settles, which surfaces as a
            // test timeout rather than a failed assertion.
            .mockImplementation((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', ''));

        await toolHandlers.syncStorefront(PROJECTS_DIR, PROJECT_NAME, '  \n\r  ');

        const calls = (childProcess.execFile as unknown as jest.Mock).mock.calls;
        const commitArgs: string[] = calls[2][1];
        const messageIndex = commitArgs.indexOf('-m') + 1;
        expect(commitArgs[messageIndex]).toBe('AI: sync files');
    });

    it('throws when storefrontPath is not a git repository root', async () => {
        mockManifestWithStorefront();
        // The first stat call (for .git check) should fail
        (fsProm.stat as jest.Mock).mockRejectedValueOnce(
            Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
        );

        await expect(
            toolHandlers.syncStorefront(PROJECTS_DIR, PROJECT_NAME, 'AI: test'),
        ).rejects.toThrow(/not a git repository root/i);
    });

    it('throws when git push fails with a real error', async () => {
        mockManifestWithStorefront();
        (childProcess.execFile as unknown as jest.Mock)
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', '')) // pull --ff-only
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', '')) // add
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', '')) // commit
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) =>
                cb(new Error('rejected: remote rejected push'), '', ''),
            );

        await expect(
            toolHandlers.syncStorefront(PROJECTS_DIR, PROJECT_NAME, 'AI: update'),
        ).rejects.toThrow(/rejected/i);
    });
});

// ─── toolHandlers.syncStorefront — losing the push race ──────────────────────

/**
 * The extension writes config.json to the same branch through the GitHub API
 * while an agent holds a local clone, so a non-fast-forward rejection is routine
 * rather than exotic. It used to be handed straight back to the caller with
 * "Pull and rebase, then retry" and no retry — and the caller that got it pulled
 * and MERGED instead, leaving merge commits in a user's storefront.
 */
describe('toolHandlers.syncStorefront — rebase and retry', () => {
    type Cb = (err: Error | null, result?: { stdout: string; stderr: string }) => void;

    function gitError(stderr: string): Error {
        return Object.assign(new Error('Command failed: git push'), { stderr });
    }

    const NON_FAST_FORWARD =
        '! [rejected] main -> main (non-fast-forward)\nerror: failed to push some refs';
    const RULESET =
        'remote: error: GH013: Repository rule violations found for refs/heads/main.\n' +
        '! [remote rejected] main -> main (push declined due to repository rule violations)';

    /**
     * Script git by argument rather than by call index: the retry path re-enters
     * syncAndPublish, so a positional chain would have to encode the whole
     * sequence and would break on any reordering.
     */
    function scriptGit(opts: { pushFailures: string[]; rebaseFails?: boolean }): void {
        const pushFailures = [...opts.pushFailures];
        (childProcess.execFile as unknown as jest.Mock).mockImplementation(
            (_cmd: string, args: string[], cb: Cb) => {
                if (args.includes('push')) {
                    const stderr = pushFailures.shift();
                    cb(stderr ? gitError(stderr) : null, { stdout: '', stderr: stderr ?? '' });
                    return;
                }
                if (args.includes('--rebase') && opts.rebaseFails) {
                    cb(gitError('CONFLICT (content): Merge conflict in blocks/hero/hero.js'));
                    return;
                }
                if (args.includes('rev-parse')) {
                    // promisify(jest.fn()) resolves with the FIRST callback
                    // value, so the shape here must be the {stdout} object the
                    // caller destructures — not a bare string.
                    cb(null, { stdout: 'a1b2c3d\n', stderr: '' });
                    return;
                }
                cb(null, { stdout: '', stderr: '' });
            },
        );
    }

    function gitCalls(): string[][] {
        return (childProcess.execFile as unknown as jest.Mock).mock.calls.map((c) => c[1]);
    }

    beforeEach(() => {
        jest.clearAllMocks();
        mockManifestWithStorefront();
    });

    it('rebases onto the remote and succeeds on the retry', async () => {
        scriptGit({ pushFailures: [NON_FAST_FORWARD] });

        const result = await toolHandlers.syncStorefront(PROJECTS_DIR, PROJECT_NAME, 'AI: edit block');

        expect(gitCalls().some((a) => a.includes('--rebase'))).toBe(true);
        expect(gitCalls().filter((a) => a.includes('push'))).toHaveLength(2);
        expect(result).toContain('success');
    });

    it('does not re-commit on the retry — the commit already exists', async () => {
        scriptGit({ pushFailures: [NON_FAST_FORWARD] });

        await toolHandlers.syncStorefront(PROJECTS_DIR, PROJECT_NAME, 'AI: edit block');

        // One commit for the original attempt; the retry runs skipCommit, so a
        // second would be an empty commit sitting on top of the rebased head.
        expect(gitCalls().filter((a) => a.includes('commit'))).toHaveLength(1);
    });

    it('does not rebase when a repository ruleset refused the push', async () => {
        // Same "rejected" shape, opposite remedy: replaying the push cannot
        // change why a rule refused it.
        scriptGit({ pushFailures: [RULESET] });

        await expect(
            toolHandlers.syncStorefront(PROJECTS_DIR, PROJECT_NAME, 'AI: edit block'),
        ).rejects.toThrow(/rule/i);

        expect(gitCalls().some((a) => a.includes('--rebase'))).toBe(false);
        expect(gitCalls().filter((a) => a.includes('push'))).toHaveLength(1);
    });

    it('aborts the rebase and reports when it conflicts', async () => {
        scriptGit({ pushFailures: [NON_FAST_FORWARD], rebaseFails: true });

        await expect(
            toolHandlers.syncStorefront(PROJECTS_DIR, PROJECT_NAME, 'AI: edit block'),
        ).rejects.toThrow(/aborted/i);

        // The checkout must be exactly as we found it — half-rebased is worse
        // than the rejected push we were recovering from.
        expect(gitCalls().some((a) => a.includes('rebase') && a.includes('--abort'))).toBe(true);
        expect(gitCalls().filter((a) => a.includes('push'))).toHaveLength(1);
    });

    it('says nothing was lost when the rebase conflicts', async () => {
        scriptGit({ pushFailures: [NON_FAST_FORWARD], rebaseFails: true });

        await expect(
            toolHandlers.syncStorefront(PROJECTS_DIR, PROJECT_NAME, 'AI: edit block'),
        ).rejects.toThrow(/nothing was lost/i);
    });

    it('retries once and no more when the remote moves again', async () => {
        scriptGit({ pushFailures: [NON_FAST_FORWARD, NON_FAST_FORWARD] });

        await expect(
            toolHandlers.syncStorefront(PROJECTS_DIR, PROJECT_NAME, 'AI: edit block'),
        ).rejects.toThrow(/does not retry a second time/i);

        expect(gitCalls().filter((a) => a.includes('--rebase'))).toHaveLength(1);
        expect(gitCalls().filter((a) => a.includes('push'))).toHaveLength(2);
    });

    it('names the pushed commit so the caller can confirm it in git', async () => {
        // The fact that separates "the CDN has not caught up" from "my work is
        // gone" — the confusion that produced a bug report for a defect that
        // did not exist.
        scriptGit({ pushFailures: [] });

        const result = await toolHandlers.syncStorefront(PROJECTS_DIR, PROJECT_NAME, 'AI: edit block');

        expect(result).toContain('a1b2c3d');
    });
});

// ─── toolHandlers.listBlocks ──────────────────────────────────────────────────

describe('toolHandlers.listBlocks', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns JSON array of objects with `name` for each block directory', async () => {
        mockManifestWithStorefront();
        (fsProm.readdir as jest.Mock)
            // First readdir call is NOT for listBlocks (manifest read uses readFile).
            // readdir is for the blocks dir:
            .mockResolvedValue([
                { name: 'hero', isDirectory: () => true, isFile: () => false },
                { name: 'banner', isDirectory: () => true, isFile: () => false },
            ]);

        const result = await toolHandlers.listBlocks(PROJECTS_DIR, PROJECT_NAME);

        expect(JSON.parse(result)).toEqual([{ name: 'hero' }, { name: 'banner' }]);
    });

    it('returns empty JSON array when blocks/ directory does not exist (ENOENT)', async () => {
        mockManifestWithStorefront();
        (fsProm.readdir as jest.Mock).mockRejectedValue(
            Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
        );

        const result = await toolHandlers.listBlocks(PROJECTS_DIR, PROJECT_NAME);

        expect(JSON.parse(result)).toEqual([]);
    });

    it('filters out files — only returns directory entries', async () => {
        mockManifestWithStorefront();
        (fsProm.readdir as jest.Mock).mockResolvedValue([
            { name: 'hero', isDirectory: () => true, isFile: () => false },
            { name: 'README.md', isDirectory: () => false, isFile: () => true },
        ]);

        const result = await toolHandlers.listBlocks(PROJECTS_DIR, PROJECT_NAME);

        expect(JSON.parse(result)).toEqual([{ name: 'hero' }]);
    });

    describe('originLibrary cross-reference', () => {
        it('attaches originLibrary metadata when the block came from an installed library', async () => {
            mockManifestWithBlockLibraries([
                {
                    name: 'Isle5 Block Collection',
                    source: { owner: 'stephen-garner-adobe', repo: 'isle5', branch: 'main' },
                    blockIds: ['hero', 'carousel'],
                },
            ]);
            (fsProm.readdir as jest.Mock).mockResolvedValue([
                { name: 'hero', isDirectory: () => true, isFile: () => false },
                { name: 'carousel', isDirectory: () => true, isFile: () => false },
            ]);

            const result = JSON.parse(await toolHandlers.listBlocks(PROJECTS_DIR, PROJECT_NAME));
            expect(result).toEqual([
                { name: 'hero', originLibrary: { name: 'Isle5 Block Collection', owner: 'stephen-garner-adobe', repo: 'isle5' } },
                { name: 'carousel', originLibrary: { name: 'Isle5 Block Collection', owner: 'stephen-garner-adobe', repo: 'isle5' } },
            ]);
        });

        it('omits originLibrary for blocks not declared in any installed library', async () => {
            mockManifestWithBlockLibraries([
                {
                    name: 'Isle5 Block Collection',
                    source: { owner: 'stephen-garner-adobe', repo: 'isle5', branch: 'main' },
                    blockIds: ['hero'],
                },
            ]);
            (fsProm.readdir as jest.Mock).mockResolvedValue([
                { name: 'hero', isDirectory: () => true, isFile: () => false },
                { name: 'custom-banner', isDirectory: () => true, isFile: () => false },
            ]);

            const result = JSON.parse(await toolHandlers.listBlocks(PROJECTS_DIR, PROJECT_NAME));
            expect(result).toEqual([
                { name: 'hero', originLibrary: { name: 'Isle5 Block Collection', owner: 'stephen-garner-adobe', repo: 'isle5' } },
                { name: 'custom-banner' },
            ]);
        });

        it('handles projects with no installedBlockLibraries (returns plain entries)', async () => {
            mockManifestWithStorefront();
            (fsProm.readdir as jest.Mock).mockResolvedValue([
                { name: 'hero', isDirectory: () => true, isFile: () => false },
            ]);

            const result = JSON.parse(await toolHandlers.listBlocks(PROJECTS_DIR, PROJECT_NAME));
            expect(result).toEqual([{ name: 'hero' }]);
        });

        it('attributes a block to the first matching library when multiple libraries declare the same blockId', async () => {
            mockManifestWithBlockLibraries([
                {
                    name: 'Library A',
                    source: { owner: 'org-a', repo: 'repo-a', branch: 'main' },
                    blockIds: ['hero'],
                },
                {
                    name: 'Library B',
                    source: { owner: 'org-b', repo: 'repo-b', branch: 'main' },
                    blockIds: ['hero'],
                },
            ]);
            (fsProm.readdir as jest.Mock).mockResolvedValue([
                { name: 'hero', isDirectory: () => true, isFile: () => false },
            ]);

            const result = JSON.parse(await toolHandlers.listBlocks(PROJECTS_DIR, PROJECT_NAME));
            expect(result[0].originLibrary.owner).toBe('org-a');
        });
    });

    it('throws when project has no EDS storefront configured (listBlocks)', async () => {
        mockManifestWithoutStorefront();

        await expect(
            toolHandlers.listBlocks(PROJECTS_DIR, PROJECT_NAME),
        ).rejects.toThrow(/No EDS storefront configured/i);
    });

    it('applies offset and limit when paginating', async () => {
        mockManifestWithStorefront();
        (fsProm.readdir as jest.Mock).mockResolvedValue([
            { name: 'a', isDirectory: () => true, isFile: () => false },
            { name: 'b', isDirectory: () => true, isFile: () => false },
            { name: 'c', isDirectory: () => true, isFile: () => false },
            { name: 'd', isDirectory: () => true, isFile: () => false },
        ]);

        const result = await toolHandlers.listBlocks(PROJECTS_DIR, PROJECT_NAME, 1, 2);

        expect(JSON.parse(result)).toEqual([{ name: 'b' }, { name: 'c' }]);
    });
});

