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

    it('returns JSON array of projects with name and path — and NO status field', async () => {
        // The fixtures carry no `status` on purpose: `writeManifest` builds the
        // manifest from an explicit field list that has never included it (it is
        // a runtime fact), so a fixture with `status: 'ready'` describes a shape
        // the writer cannot produce. The old fixtures did exactly that, and the
        // suite stayed green while every real listing answered 'unknown'.
        (fsProm.readdir as jest.Mock).mockResolvedValue([
            { name: 'project-a', isDirectory: () => true },
            { name: 'project-b', isDirectory: () => true },
        ]);
        (fsProm.stat as jest.Mock).mockResolvedValue({ size: 0 }); // .demo-builder.json exists
        (fsProm.readFile as jest.Mock).mockImplementation((p: string) => {
            if (String(p).includes('project-a')) {
                return Promise.resolve(JSON.stringify({ name: 'Project A' }));
            }
            if (String(p).includes('project-b')) {
                return Promise.resolve(JSON.stringify({ name: 'Project B' }));
            }
            return Promise.reject(new Error(`Unexpected readFile: ${p}`));
        });

        const result = await toolHandlers.listProjects(PROJECTS_DIR);
        const parsed = JSON.parse(result);

        expect(parsed).toHaveLength(2);
        expect(parsed[0]).toEqual(expect.objectContaining({
            name: 'Project A',
            path: path.join(PROJECTS_DIR, 'project-a'),
        }));
        expect(parsed[0]).not.toHaveProperty('status');
        expect(parsed[1]).toEqual(expect.objectContaining({
            name: 'Project B',
            path: path.join(PROJECTS_DIR, 'project-b'),
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

/**
 * `pinned` in the list — the READ half of a write nothing could confirm.
 *
 * Measured live 2026-08-17: `set_project_pinned` returned the literal "{}" and
 * NO tool anywhere reported pinned state, so an agent could pin a project and
 * had no way to find out whether it had worked. It was classified as "success is
 * the outcome, paired with a confirming read" — the pairing was assumed, not
 * checked, and did not exist.
 */
// Routes by PATH, not by call order. The old version answered readFile
// calls positionally, so listProjects growing a state.json read displaced
// the whole queue and every row silently failed to build — a fixture
// coupled to HOW MANY reads the handler makes, not to what it reads.
function withManifests(
    manifests: Record<string, unknown>[],
    state?: Record<string, unknown> | 'unreadable',
): void {
    (fsProm.readdir as jest.Mock).mockResolvedValue(
        manifests.map((m) => ({ name: (m as { name: string }).name, isDirectory: () => true })),
    );
    (fsProm.stat as jest.Mock).mockResolvedValue({});
    (fsProm.readFile as jest.Mock).mockImplementation(async (p: string) => {
        if (String(p).endsWith('state.json')) {
            if (state === undefined) throw new Error('ENOENT');
            if (state === 'unreadable') return 'not json {';
            return JSON.stringify(state);
        }
        const m = manifests.find((x) => String(p).includes(String(x.name)));
        if (!m) throw new Error(`Unexpected readFile: ${p}`);
        return JSON.stringify(m);
    });
}

describe('toolHandlers.listProjects — pinned', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });


    it('reports pinned:true for a pinned project', async () => {
        withManifests([{ name: 'pinned-one', pinned: true }]);

        const parsed = JSON.parse(await toolHandlers.listProjects(PROJECTS_DIR));

        expect(parsed[0]).toMatchObject({ name: 'pinned-one', pinned: true });
    });

    // Omitted rather than `pinned: false`: every unpinned project would otherwise
    // pay for the field, and this list is capped at 100 rows.
    it('omits the field entirely when a project is not pinned', async () => {
        withManifests([{ name: 'plain' }]);

        const parsed = JSON.parse(await toolHandlers.listProjects(PROJECTS_DIR));

        expect(parsed[0]).not.toHaveProperty('pinned');
        // Control: the row is otherwise intact, so the assertion above is about
        // the field and not about the row failing to build.
        expect(parsed[0]).toMatchObject({ name: 'plain' });
    });
});

// ─── toolHandlers.listProjects — the current marker ─────────────────────────
//
// `agent-gap-scan` measured half of list_projects' chained follow-ups as
// get_current_project — the agent listing projects and then asking which one
// is active, a question the listing could have answered. The pointer lives in
// `state.json` beside the projects dir, atomically written for exactly this
// kind of file-based reader.
describe('toolHandlers.listProjects — current marker', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('marks the project state.json points at, and only that one', async () => {
        withManifests([{ name: 'alpha' }, { name: 'beta' }], {
            currentProjectPath: path.join(PROJECTS_DIR, 'beta'),
        });

        const parsed = JSON.parse(await toolHandlers.listProjects(PROJECTS_DIR));

        expect(parsed[1]).toMatchObject({ name: 'beta', current: true });
        expect(parsed[0]).not.toHaveProperty('current');
    });

    it('lists with no marker when state.json does not exist', async () => {
        withManifests([{ name: 'alpha' }]);

        const parsed = JSON.parse(await toolHandlers.listProjects(PROJECTS_DIR));

        // Absence degrades to "no marker", never to a failed listing.
        expect(parsed).toHaveLength(1);
        expect(parsed[0]).not.toHaveProperty('current');
    });

    it('lists with no marker when state.json is torn or invalid', async () => {
        withManifests([{ name: 'alpha' }], 'unreadable');

        const parsed = JSON.parse(await toolHandlers.listProjects(PROJECTS_DIR));

        expect(parsed).toHaveLength(1);
        expect(parsed[0]).not.toHaveProperty('current');
    });

    it('ignores a pointer at a project that is not in the listing', async () => {
        // A stale pointer (deleted project) must not invent a marker.
        withManifests([{ name: 'alpha' }], {
            currentProjectPath: path.join(PROJECTS_DIR, 'deleted-long-ago'),
        });

        const parsed = JSON.parse(await toolHandlers.listProjects(PROJECTS_DIR));

        expect(parsed[0]).not.toHaveProperty('current');
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

    /**
     * Found by probing the LIVE server (2026-08-17): a real project's response
     * carried its `ACCS_OAUTH_CLIENT_SECRET` in plaintext, so every agent that
     * read the project put a working Commerce credential into its transcript.
     *
     * The convention it breaks was already written down and already enforced one
     * door over — `export_project_settings` returns `{path, includesSecrets}` and
     * never the values, and `stripSecretValues` exists for exactly this. Only this
     * tool was not using it.
     *
     * Fixtures could never have caught it: an invented manifest has no real
     * secret in it.
     */
    describe('secret values never ride the response', () => {
        const WITH_SECRETS = {
            name: 'test-project',
            componentConfigs: {
                'adobe-commerce-accs': {
                    ACCS_GRAPHQL_ENDPOINT: 'https://example.test/graphql',
                    ACCS_OAUTH_CLIENT_ID: 'client-id-is-not-a-secret',
                    ACCS_OAUTH_CLIENT_SECRET: 'fake-test-pw-not-a-secret',
                },
            },
        };

        it('strips them from the summary', async () => {
            (fsProm.readFile as jest.Mock).mockResolvedValue(JSON.stringify(WITH_SECRETS));

            const result = await toolHandlers.getProject(PROJECTS_DIR, PROJECT_NAME);

            expect(result).not.toContain('fake-test-pw-not-a-secret');
            expect(result).not.toContain('ACCS_OAUTH_CLIENT_SECRET');
        });

        // full:true is the MORE dangerous path, not an exemption from the rule —
        // it is the one an agent reaches for when the summary looks incomplete.
        it('strips them from full:true as well', async () => {
            (fsProm.readFile as jest.Mock).mockResolvedValue(JSON.stringify(WITH_SECRETS));

            const result = await toolHandlers.getProject(PROJECTS_DIR, PROJECT_NAME, true);

            expect(result).not.toContain('fake-test-pw-not-a-secret');
            expect(result).not.toContain('ACCS_OAUTH_CLIENT_SECRET');
        });

        // The control. Stripping the whole config map would also pass the two
        // assertions above while destroying the tool — the non-secret keys beside
        // the secret are most of why an agent reads this.
        it('control: keeps every non-secret key in the same component', async () => {
            (fsProm.readFile as jest.Mock).mockResolvedValue(JSON.stringify(WITH_SECRETS));

            const parsed = JSON.parse(await toolHandlers.getProject(PROJECTS_DIR, PROJECT_NAME));

            expect(parsed.componentConfigs['adobe-commerce-accs']).toEqual({
                ACCS_GRAPHQL_ENDPOINT: 'https://example.test/graphql',
                ACCS_OAUTH_CLIENT_ID: 'client-id-is-not-a-secret',
            });
        });

        it('leaves a project with no componentConfigs alone', async () => {
            (fsProm.readFile as jest.Mock).mockResolvedValue(JSON.stringify({ name: 'bare' }));

            expect(JSON.parse(await toolHandlers.getProject(PROJECTS_DIR, PROJECT_NAME))).toEqual({
                name: 'bare',
            });
        });
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

    it('reads .demo-builder.json and returns content — with manifest secrets STRIPPED', async () => {
        // The tool's whole edge over native Read (see the handler comment): a
        // verbatim manifest is the ACCS_OAUTH_CLIENT_SECRET leak, one tool over.
        (fsProm.readFile as jest.Mock).mockResolvedValue(
            JSON.stringify({
                name: 'test',
                componentConfigs: {
                    'adobe-commerce-accs': {
                        ACCS_OAUTH_CLIENT_SECRET: 'live-credential',
                        ACCS_BASE_URL: 'https://na1.example',
                    },
                },
            })
        );

        const result = await toolHandlers.getComponentConfig(PROJECTS_DIR, PROJECT_NAME, '.demo-builder.json');

        const expectedPath = path.resolve(PROJECT_PATH, '.demo-builder.json');
        expect(fsProm.readFile as jest.Mock).toHaveBeenCalledWith(expectedPath, 'utf-8');
        const parsed = JSON.parse(result);
        expect(parsed.name).toBe('test');
        expect(parsed.componentConfigs['adobe-commerce-accs'].ACCS_BASE_URL).toBe('https://na1.example');
        expect(result).not.toContain('live-credential');
    });

    it('masks secret VALUES in a .env file while keeping the keys visible', async () => {
        // Keys stay: an agent needs to know a credential IS configured. Values
        // go: the transcript must never carry them.
        (fsProm.readFile as jest.Mock).mockResolvedValue(
            '# Commerce\nACCS_OAUTH_CLIENT_SECRET=shh-real-secret\nMESH_ENDPOINT=https://mesh/graphql\n'
        );

        const result = await toolHandlers.getComponentConfig(
            PROJECTS_DIR, PROJECT_NAME, 'components/backend/.env'
        );

        expect(result).toContain('ACCS_OAUTH_CLIENT_SECRET=[secret hidden]');
        expect(result).toContain('MESH_ENDPOINT=https://mesh/graphql');
        expect(result).not.toContain('shh-real-secret');
    });

    it('refuses to return a manifest that does not parse, rather than leak raw content', async () => {
        (fsProm.readFile as jest.Mock).mockResolvedValue('{broken json ACCS_OAUTH_CLIENT_SECRET=x');

        await expect(
            toolHandlers.getComponentConfig(PROJECTS_DIR, PROJECT_NAME, '.demo-builder.json')
        ).rejects.toThrow(/refusing to return unsanitized/);
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
        (fsSync.realpathSync as unknown as jest.Mock).mockImplementation((p: string) => {
            const s = String(p);
            if (s.startsWith('/tmp/')) return s.replace('/tmp/', '/private/tmp/');
            return s;
        });
        (fsProm.readFile as jest.Mock).mockResolvedValue('{"name":"test"}');

        const result = await toolHandlers.getComponentConfig(symlinkedProjectsDir, PROJECT_NAME, '.demo-builder.json');
        // Parse-and-match, not a byte pin: the handler sanitizes and
        // pretty-prints now, and this test's subject is the SYMLINK.
        expect(JSON.parse(result)).toMatchObject({ name: 'test' });
    });
});


// ─── summary collapses the drift map too ─────────────────────────────────────
//
// `aiFileHashes` is one SHA per generated AI file. Measured live 2026-08-16 it
// was 4,479 bytes of a 9,895-byte summary — 45% — on a real project. It
// post-dates the aiPrompts/installedBlockLibraries collapses, which is why it
// slipped through. An agent needs to know the bundle drifted, not the hashes
// that prove it.
describe('toolHandlers.getProject — aiFileHashes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    const manifestWith = (extra: Record<string, unknown>) => {
        (fsProm.readFile as jest.Mock).mockResolvedValue(
            JSON.stringify({ name: PROJECT_NAME, status: 'ready', ...extra }),
        );
    };

    it('collapses the hash map to a count in the summary', async () => {
        manifestWith({
            aiFileHashes: { 'AGENTS.md': 'a'.repeat(64), '.mcp.json': 'b'.repeat(64) },
        });

        const out = await toolHandlers.getProject(PROJECTS_DIR, PROJECT_NAME);

        expect(JSON.parse(out).aiFileHashes).toBe('[2 file hash(es) — pass full:true to expand]');
        expect(out).not.toContain('a'.repeat(64));
    });

    it('returns the real hashes when full:true', async () => {
        const hashes = { 'AGENTS.md': 'a'.repeat(64) };
        manifestWith({ aiFileHashes: hashes });

        expect(JSON.parse(await toolHandlers.getProject(PROJECTS_DIR, PROJECT_NAME, true)).aiFileHashes)
            .toEqual(hashes);
    });

    it('leaves a manifest without the field untouched', async () => {
        manifestWith({});
        expect(JSON.parse(await toolHandlers.getProject(PROJECTS_DIR, PROJECT_NAME))).not.toHaveProperty(
            'aiFileHashes',
        );
    });
});
