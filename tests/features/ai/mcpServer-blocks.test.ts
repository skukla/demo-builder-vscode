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
    STOREFRONT_PATH,
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

    it('calls execFile for git add -A, git commit, git push in sequence', async () => {
        mockManifestWithStorefront();
        (childProcess.execFile as jest.Mock)
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', ''))
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', ''))
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', ''));

        const result = await toolHandlers.syncStorefront(PROJECTS_DIR, PROJECT_NAME, 'AI: update config');

        expect(childProcess.execFile as jest.Mock).toHaveBeenCalledTimes(3);
        const calls = (childProcess.execFile as jest.Mock).mock.calls;
        expect(calls[0][1]).toContain('add');
        expect(calls[1][1]).toContain('commit');
        expect(calls[2][1]).toContain('push');
        expect(result).toContain('success');
    });

    it('strips newlines from commit message before passing to git', async () => {
        mockManifestWithStorefront();
        (childProcess.execFile as jest.Mock)
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', ''))
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', ''))
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', ''));

        await toolHandlers.syncStorefront(PROJECTS_DIR, PROJECT_NAME, 'AI: sync\nline2');

        const calls = (childProcess.execFile as jest.Mock).mock.calls;
        const commitArgs: string[] = calls[1][1];
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
        (childProcess.execFile as jest.Mock)
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', ''))
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) =>
                cb(nothingToCommitErr, '', ''),
            );

        const result = await toolHandlers.syncStorefront(PROJECTS_DIR, PROJECT_NAME, 'AI: no changes');

        expect(result).toContain('Nothing to commit');
    });

    it('uses the default commit message when commitMessage collapses to empty after trim', async () => {
        mockManifestWithStorefront();
        (childProcess.execFile as jest.Mock)
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', ''))
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', ''))
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', ''));

        await toolHandlers.syncStorefront(PROJECTS_DIR, PROJECT_NAME, '  \n\r  ');

        const calls = (childProcess.execFile as jest.Mock).mock.calls;
        const commitArgs: string[] = calls[1][1];
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
        (childProcess.execFile as jest.Mock)
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', ''))
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', ''))
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) =>
                cb(new Error('rejected: remote rejected push'), '', ''),
            );

        await expect(
            toolHandlers.syncStorefront(PROJECTS_DIR, PROJECT_NAME, 'AI: update'),
        ).rejects.toThrow(/rejected/i);
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

// ─── toolHandlers.getBlockSource ─────────────────────────────────────────────

describe('toolHandlers.getBlockSource', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('without fileName (manifest mode)', () => {
        it('returns a { files: [{ name, bytes }] } manifest — names and sizes, no contents', async () => {
            mockManifestWithStorefront();
            (fsProm.stat as jest.Mock).mockResolvedValue({ size: 1_000 });
            (fsProm.readdir as jest.Mock).mockResolvedValue([
                { name: 'hero.js', isFile: () => true, isDirectory: () => false },
                { name: 'hero.css', isFile: () => true, isDirectory: () => false },
            ]);

            const result = await toolHandlers.getBlockSource(PROJECTS_DIR, PROJECT_NAME, 'hero');
            const parsed = JSON.parse(result) as { files: Array<{ name: string; bytes: number }> };

            expect(parsed.files).toEqual([
                { name: 'hero.js', bytes: 1_000 },
                { name: 'hero.css', bytes: 1_000 },
            ]);
            // No file contents read in manifest mode (only the manifest read + stats).
            expect(fsProm.readFile as jest.Mock).toHaveBeenCalledTimes(1);
        });

        it('returns an empty files manifest when the block directory has no files', async () => {
            mockManifestWithStorefront();
            (fsProm.readdir as jest.Mock).mockResolvedValue([]);

            const result = await toolHandlers.getBlockSource(PROJECTS_DIR, PROJECT_NAME, 'empty-block');
            const parsed = JSON.parse(result) as { files: unknown[] };

            expect(parsed.files).toHaveLength(0);
        });

        it('caps the manifest at MAX_BLOCK_FILES entries', async () => {
            mockManifestWithStorefront();
            (fsProm.stat as jest.Mock).mockResolvedValue({ size: 10 });
            const many = Array.from({ length: 60 }, (_, i) => ({
                name: `f${i}.js`, isFile: () => true, isDirectory: () => false,
            }));
            (fsProm.readdir as jest.Mock).mockResolvedValue(many);

            const result = await toolHandlers.getBlockSource(PROJECTS_DIR, PROJECT_NAME, 'hero');
            const parsed = JSON.parse(result) as { files: unknown[] };

            expect(parsed.files).toHaveLength(50);
        });
    });

    describe('with fileName (single-file mode)', () => {
        it('returns { name, content } for a file within the size limit', async () => {
            mockManifestWithStorefront();
            (fsProm.readdir as jest.Mock).mockResolvedValue([
                { name: 'hero.js', isFile: () => true, isDirectory: () => false },
            ]);
            (fsProm.stat as jest.Mock).mockResolvedValueOnce({ size: 1_000 });
            (fsProm.readFile as jest.Mock).mockImplementation((p: string) => {
                if (String(p).endsWith('.demo-builder.json')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'my-project',
                        status: 'ready',
                        componentInstances: { 'eds-storefront': { path: STOREFRONT_PATH } },
                    }));
                }
                return Promise.resolve('// hero source');
            });

            const result = await toolHandlers.getBlockSource(PROJECTS_DIR, PROJECT_NAME, 'hero', 'hero.js');
            const parsed = JSON.parse(result) as { name: string; content: string };

            expect(parsed).toEqual({ name: 'hero.js', content: '// hero source' });
        });

        it('returns a truncation placeholder for a file exceeding MAX_FILE_BYTES', async () => {
            mockManifestWithStorefront();
            (fsProm.readdir as jest.Mock).mockResolvedValue([
                { name: 'large.min.js', isFile: () => true, isDirectory: () => false },
            ]);
            (fsProm.stat as jest.Mock).mockResolvedValueOnce({ size: 200_000 });

            const result = await toolHandlers.getBlockSource(PROJECTS_DIR, PROJECT_NAME, 'hero', 'large.min.js');
            const parsed = JSON.parse(result) as { name: string; content: string };

            expect(parsed.name).toBe('large.min.js');
            expect(parsed.content).toContain('[truncated:');
        });

        it('throws when the requested fileName is not a file in the block', async () => {
            mockManifestWithStorefront();
            (fsProm.readdir as jest.Mock).mockResolvedValue([
                { name: 'hero.js', isFile: () => true, isDirectory: () => false },
            ]);

            await expect(
                toolHandlers.getBlockSource(PROJECTS_DIR, PROJECT_NAME, 'hero', 'missing.js'),
            ).rejects.toThrow(/not found in block/i);
        });
    });

    it('throws when blockName contains ../', async () => {
        mockManifestWithStorefront();

        await expect(
            toolHandlers.getBlockSource(PROJECTS_DIR, PROJECT_NAME, '../secret'),
        ).rejects.toThrow(/escapes allowed directory/i);
    });

    it('throws when block directory does not exist', async () => {
        mockManifestWithStorefront();
        (fsProm.readdir as jest.Mock).mockRejectedValue(
            Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
        );

        await expect(
            toolHandlers.getBlockSource(PROJECTS_DIR, PROJECT_NAME, 'nonexistent'),
        ).rejects.toThrow(/ENOENT/);
    });

    it('throws when project has no EDS storefront configured (getBlockSource)', async () => {
        mockManifestWithoutStorefront();

        await expect(
            toolHandlers.getBlockSource(PROJECTS_DIR, PROJECT_NAME, 'hero'),
        ).rejects.toThrow(/No EDS storefront configured/i);
    });

    it('throws when a symlink inside blocks/ resolves to a path outside the storefront', async () => {
        mockManifestWithStorefront();
        (fsProm.realpath as jest.Mock)
            .mockImplementationOnce((p: string) => Promise.resolve(p))
            .mockImplementationOnce((p: string) => Promise.resolve(p))
            .mockImplementationOnce((p: string) => Promise.resolve(p))
            .mockImplementationOnce(() => Promise.resolve('/etc/secret'));

        await expect(
            toolHandlers.getBlockSource(PROJECTS_DIR, PROJECT_NAME, 'evil-block'),
        ).rejects.toThrow(/escapes allowed directory/i);
    });

    it('allows access when a block directory symlink resolves to a renamed path inside blocks/', async () => {
        mockManifestWithStorefront();
        (fsProm.realpath as jest.Mock)
            .mockImplementationOnce((p: string) => Promise.resolve(p))
            .mockImplementationOnce((p: string) => Promise.resolve(p))
            .mockImplementationOnce((p: string) => Promise.resolve(p))
            .mockImplementationOnce((p: string) =>
                Promise.resolve(p.replace('block-alias', 'hero')),
            );
        (fsProm.stat as jest.Mock).mockResolvedValue({ size: 42 });
        (fsProm.readdir as jest.Mock).mockResolvedValue([
            { name: 'hero.js', isFile: () => true, isDirectory: () => false },
        ]);

        const result = await toolHandlers.getBlockSource(PROJECTS_DIR, PROJECT_NAME, 'block-alias');
        const parsed = JSON.parse(result) as { files: Array<{ name: string; bytes: number }> };

        expect(parsed.files[0].name).toBe('hero.js');
    });
});
