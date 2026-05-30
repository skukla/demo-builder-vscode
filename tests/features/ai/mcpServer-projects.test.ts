/**
 * MCP Server Tests — Project & config reads
 *
 * resolveProjectPath, toolHandlers.listProjects, getProject, and
 * getComponentConfig (path-traversal protection). Shared setup lives in
 * mcpServer.testUtils.ts.
 */

import {
    fsProm,
    fsSync,
    path,
    toolHandlers,
    resolveProjectPath,
    PROJECTS_DIR,
    PROJECT_NAME,
    PROJECT_PATH,
} from './mcpServer.testUtils';

// ─── resolveProjectPath ─────────────────────────────────────────────────────

describe('resolveProjectPath', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns absolute project path for a valid project name', () => {
        const result = resolveProjectPath(PROJECTS_DIR, 'my-project');
        expect(result).toBe(path.join(PROJECTS_DIR, 'my-project'));
    });

    it('throws when project name contains forward slash', () => {
        expect(() => resolveProjectPath(PROJECTS_DIR, 'foo/bar')).toThrow(/invalid project name/i);
    });

    it('throws when project name contains backslash', () => {
        expect(() => resolveProjectPath(PROJECTS_DIR, 'foo\\bar')).toThrow(/invalid project name/i);
    });

    it('throws when project name contains ..', () => {
        expect(() => resolveProjectPath(PROJECTS_DIR, '..')).toThrow(/invalid project name/i);
    });

    it('throws when project name contains ../secret', () => {
        expect(() => resolveProjectPath(PROJECTS_DIR, '../secret')).toThrow(/invalid project name/i);
    });

    it('throws when project name contains null byte', () => {
        expect(() => resolveProjectPath(PROJECTS_DIR, 'foo\0bar')).toThrow(/invalid project name/i);
    });

    it('throws when project name is empty', () => {
        expect(() => resolveProjectPath(PROJECTS_DIR, '')).toThrow(/invalid project name/i);
    });

    it('calls assertPathInsideSync to verify resolved path is inside projects dir', () => {
        resolveProjectPath(PROJECTS_DIR, 'safe-name');
        expect(fsSync.realpathSync).toHaveBeenCalled();
    });
});

// ─── toolHandlers.listProjects ──────────────────────────────────────────────

describe('toolHandlers.listProjects', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns JSON array of projects with name, path, and status', async () => {
        (fsProm.readdir as jest.Mock).mockResolvedValue([
            { name: 'project-a', isDirectory: () => true },
            { name: 'project-b', isDirectory: () => true },
        ]);
        (fsProm.stat as jest.Mock).mockResolvedValue({ size: 0 }); // .demo-builder.json exists
        (fsProm.readFile as jest.Mock).mockImplementation((p: string) => {
            if (String(p).includes('project-a')) {
                return Promise.resolve(JSON.stringify({ name: 'Project A', status: 'ready' }));
            }
            if (String(p).includes('project-b')) {
                return Promise.resolve(JSON.stringify({ name: 'Project B', status: 'creating' }));
            }
            return Promise.reject(new Error(`Unexpected readFile: ${p}`));
        });

        const result = await toolHandlers.listProjects(PROJECTS_DIR);
        const parsed = JSON.parse(result);

        expect(parsed).toHaveLength(2);
        expect(parsed[0]).toEqual(expect.objectContaining({
            name: 'Project A',
            path: path.join(PROJECTS_DIR, 'project-a'),
            status: 'ready',
        }));
        expect(parsed[1]).toEqual(expect.objectContaining({
            name: 'Project B',
            path: path.join(PROJECTS_DIR, 'project-b'),
            status: 'creating',
        }));
    });

    it('returns empty array when projects directory is empty', async () => {
        (fsProm.readdir as jest.Mock).mockResolvedValue([]);

        const result = await toolHandlers.listProjects(PROJECTS_DIR);

        expect(JSON.parse(result)).toEqual([]);
    });

    it('skips directories that do not contain .demo-builder.json', async () => {
        (fsProm.readdir as jest.Mock).mockResolvedValue([
            { name: 'valid-project', isDirectory: () => true },
            { name: 'random-dir', isDirectory: () => true },
        ]);
        // stat succeeds for valid-project, fails for random-dir
        (fsProm.stat as jest.Mock).mockImplementation((p: string) => {
            if (String(p).includes('valid-project')) return Promise.resolve({ size: 0 });
            return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        });
        (fsProm.readFile as jest.Mock).mockResolvedValue(
            JSON.stringify({ name: 'Valid', status: 'ready' }),
        );

        const result = await toolHandlers.listProjects(PROJECTS_DIR);
        const parsed = JSON.parse(result);

        expect(parsed).toHaveLength(1);
        expect(parsed[0].name).toBe('Valid');
    });

    it('skips non-directory entries (files)', async () => {
        (fsProm.readdir as jest.Mock).mockResolvedValue([
            { name: 'project-a', isDirectory: () => true },
            { name: 'README.md', isDirectory: () => false },
        ]);
        (fsProm.stat as jest.Mock).mockResolvedValue({ size: 0 });
        (fsProm.readFile as jest.Mock).mockResolvedValue(
            JSON.stringify({ name: 'Project A', status: 'ready' }),
        );

        const result = await toolHandlers.listProjects(PROJECTS_DIR);
        const parsed = JSON.parse(result);

        expect(parsed).toHaveLength(1);
    });

    it('returns empty array when projects directory does not exist', async () => {
        (fsProm.readdir as jest.Mock).mockRejectedValue(
            Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
        );

        const result = await toolHandlers.listProjects(PROJECTS_DIR);

        expect(JSON.parse(result)).toEqual([]);
    });

    it('applies offset and limit when paginating', async () => {
        (fsProm.readdir as jest.Mock).mockResolvedValue([
            { name: 'project-a', isDirectory: () => true },
            { name: 'project-b', isDirectory: () => true },
            { name: 'project-c', isDirectory: () => true },
        ]);
        (fsProm.stat as jest.Mock).mockResolvedValue({ size: 0 });
        (fsProm.readFile as jest.Mock).mockImplementation((p: string) =>
            Promise.resolve(JSON.stringify({ name: path.basename(path.dirname(String(p))), status: 'ready' })),
        );

        const result = await toolHandlers.listProjects(PROJECTS_DIR, 1, 1);
        const parsed = JSON.parse(result);

        expect(parsed).toHaveLength(1);
        expect(parsed[0].name).toBe('project-b');
    });
});

// ─── toolHandlers.getProject ──────────────────────────────────────────────────

describe('toolHandlers.getProject', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('reads .demo-builder.json and returns formatted JSON string', async () => {
        const projectData = { name: 'test-project', status: 'ready' };
        (fsProm.readFile as jest.Mock).mockResolvedValue(JSON.stringify(projectData));

        const result = await toolHandlers.getProject(PROJECTS_DIR, PROJECT_NAME);

        expect(fsProm.readFile as jest.Mock).toHaveBeenCalledWith(
            path.join(PROJECT_PATH, '.demo-builder.json'),
            'utf-8',
        );
        expect(JSON.parse(result)).toEqual(projectData);
    });

    it('returns error text (does not throw) when readFile throws ENOENT', async () => {
        (fsProm.readFile as jest.Mock).mockRejectedValue(
            Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
        );

        const result = await toolHandlers.getProject(PROJECTS_DIR, PROJECT_NAME);

        expect(result).toContain('Error reading project state');
    });

    it('returns error text when readFile returns invalid JSON', async () => {
        (fsProm.readFile as jest.Mock).mockResolvedValue('{ invalid json }');

        const result = await toolHandlers.getProject(PROJECTS_DIR, PROJECT_NAME);

        expect(result).toContain('Error reading project state');
    });

    it('returns compact JSON (no pretty-print indentation)', async () => {
        (fsProm.readFile as jest.Mock).mockResolvedValue(
            JSON.stringify({ name: 'test-project', status: 'ready' }),
        );

        const result = await toolHandlers.getProject(PROJECTS_DIR, PROJECT_NAME);

        expect(result).not.toContain('\n');
    });

    describe('summary mode (default)', () => {
        const manifestWithLargeFields = JSON.stringify({
            name: 'test-project',
            status: 'ready',
            aiPrompts: [{ title: 'a' }, { title: 'b' }, { title: 'c' }],
            installedBlockLibraries: [
                { name: 'Lib A', source: { owner: 'o', repo: 'r' }, blockIds: ['x', 'y', 'z'] },
            ],
            componentInstances: {
                'eds-storefront': { path: '/p/storefront', metadata: { huge: 'blob', more: 'data' } },
            },
        });

        it('collapses aiPrompts to a count placeholder', async () => {
            (fsProm.readFile as jest.Mock).mockResolvedValue(manifestWithLargeFields);

            const parsed = JSON.parse(await toolHandlers.getProject(PROJECTS_DIR, PROJECT_NAME));

            expect(parsed.aiPrompts).toContain('3 prompt');
        });

        it('replaces installedBlockLibraries blockIds with a blockCount', async () => {
            (fsProm.readFile as jest.Mock).mockResolvedValue(manifestWithLargeFields);

            const parsed = JSON.parse(await toolHandlers.getProject(PROJECTS_DIR, PROJECT_NAME));

            expect(parsed.installedBlockLibraries[0]).toEqual({
                name: 'Lib A',
                source: { owner: 'o', repo: 'r' },
                blockCount: 3,
            });
            expect(parsed.installedBlockLibraries[0].blockIds).toBeUndefined();
        });

        it('drops component metadata, keeping only the path', async () => {
            (fsProm.readFile as jest.Mock).mockResolvedValue(manifestWithLargeFields);

            const parsed = JSON.parse(await toolHandlers.getProject(PROJECTS_DIR, PROJECT_NAME));

            expect(parsed.componentInstances['eds-storefront']).toEqual({ path: '/p/storefront' });
        });

        it('returns the untouched manifest when full=true', async () => {
            (fsProm.readFile as jest.Mock).mockResolvedValue(manifestWithLargeFields);

            const parsed = JSON.parse(await toolHandlers.getProject(PROJECTS_DIR, PROJECT_NAME, true));

            expect(parsed.aiPrompts).toHaveLength(3);
            expect(parsed.installedBlockLibraries[0].blockIds).toEqual(['x', 'y', 'z']);
            expect(parsed.componentInstances['eds-storefront'].metadata).toEqual({ huge: 'blob', more: 'data' });
        });
    });
});

// ─── toolHandlers.getComponentConfig ─────────────────────────────────────────

describe('toolHandlers.getComponentConfig', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('reads .demo-builder.json and returns content', async () => {
        (fsProm.readFile as jest.Mock).mockResolvedValue('{"name":"test"}');

        const result = await toolHandlers.getComponentConfig(PROJECTS_DIR, PROJECT_NAME, '.demo-builder.json');

        const expectedPath = path.resolve(PROJECT_PATH, '.demo-builder.json');
        expect(fsProm.readFile as jest.Mock).toHaveBeenCalledWith(expectedPath, 'utf-8');
        expect(result).toBe('{"name":"test"}');
    });

    it('reads a .env file inside projectPath', async () => {
        (fsProm.readFile as jest.Mock).mockResolvedValue('KEY=value');

        const result = await toolHandlers.getComponentConfig(PROJECTS_DIR, PROJECT_NAME, 'components/storefront/.env');

        expect(result).toBe('KEY=value');
    });

    it('throws when path is not in the read allowlist (e.g. src/config.json)', async () => {
        await expect(
            toolHandlers.getComponentConfig(PROJECTS_DIR, PROJECT_NAME, 'src/config.json'),
        ).rejects.toThrow(/not permitted/i);
    });

    it('throws when relative path contains ../ (path traversal)', async () => {
        await expect(
            toolHandlers.getComponentConfig(PROJECTS_DIR, PROJECT_NAME, '../outside/file.txt'),
        ).rejects.toThrow(/escapes allowed directory/i);
    });

    it('throws when resolved path is outside projectPath', async () => {
        await expect(
            toolHandlers.getComponentConfig(PROJECTS_DIR, PROJECT_NAME, '../../etc/passwd'),
        ).rejects.toThrow(/escapes allowed directory/i);
    });

    it('allows a .env file when realpath resolves a symlink that stays inside the project', async () => {
        (fsProm.realpath as jest.Mock)
            .mockImplementationOnce((p: string) => Promise.resolve(p))
            .mockImplementationOnce((p: string) =>
                Promise.resolve(p.replace('eds-link', 'eds-storefront')),
            );
        (fsProm.readFile as jest.Mock).mockResolvedValue('KEY=value');

        const result = await toolHandlers.getComponentConfig(PROJECTS_DIR, PROJECT_NAME, 'components/eds-link/.env');

        expect(result).toBe('KEY=value');
    });

    it('allows access when projectPath is a symlink (e.g. macOS /tmp -> /private/tmp)', async () => {
        const symlinkedProjectsDir = '/tmp/projects';

        (fsProm.realpath as jest.Mock).mockImplementation((p: string) => {
            const s = String(p);
            if (s.startsWith('/tmp/')) return Promise.resolve(s.replace('/tmp/', '/private/tmp/'));
            return Promise.resolve(s);
        });
        // Also mock realpathSync for resolveProjectPath
        (fsSync.realpathSync as jest.Mock).mockImplementation((p: string) => {
            const s = String(p);
            if (s.startsWith('/tmp/')) return s.replace('/tmp/', '/private/tmp/');
            return s;
        });
        (fsProm.readFile as jest.Mock).mockResolvedValue('{"name":"test"}');

        const result = await toolHandlers.getComponentConfig(symlinkedProjectsDir, PROJECT_NAME, '.demo-builder.json');
        expect(result).toBe('{"name":"test"}');
    });
});

