/**
 * MCP Server Tests
 *
 * Tests for the standalone Demo Builder MCP server (multi-project mode):
 * - resolveProjectPath: validates project names and resolves paths
 * - toolHandlers.listProjects: lists valid projects in projects directory
 * - toolHandlers.getProject: reads .demo-builder.json
 * - toolHandlers.getComponentConfig: reads config files with path traversal protection
 * - toolHandlers.updateProjectConfig: writes .demo-builder.json or .env files
 * - toolHandlers.syncStorefront: git add/commit/push (derives storefront from manifest)
 * - toolHandlers.listBlocks: lists block directories (derives storefront from manifest)
 * - toolHandlers.getBlockSource: reads block source files (derives storefront from manifest)
 * - validateEnvContent: allowlist-based .env content validator
 */

import * as fsProm from 'fs/promises';
import * as fsSync from 'fs';
import * as childProcess from 'child_process';
import * as path from 'path';

// Mock fs/promises module (covers `import * as fsPromises from 'fs/promises'`)
// Note: jest.clearAllMocks() (called in beforeEach) resets call history and return values for
// mocks created with jest.fn() — but it does NOT remove factory-level default implementations
// set here (e.g. stat resolves to { size: 0 }, realpath is identity). Tests that need different
// behavior override with mockResolvedValueOnce/mockRejectedValueOnce, which take precedence for
// one call and then fall back to the factory default on subsequent calls.
jest.mock('fs/promises', () => ({
    readFile: jest.fn(),
    writeFile: jest.fn(),
    readdir: jest.fn(),
    mkdir: jest.fn(),
    stat: jest.fn().mockResolvedValue({ size: 0 }), // default: .git exists, size 0 (below MAX_FILE_BYTES)
    // realpath: identity by default — all test paths are treated as their own real path
    realpath: jest.fn().mockImplementation((p: string) => Promise.resolve(p)),
}));

// Mock synchronous fs for assertPathInsideSync used by resolveProjectPath
jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    realpathSync: jest.fn((p: string) => p), // identity by default
}));

jest.mock('child_process', () => ({
    execFile: jest.fn(),
}));

import { toolHandlers, validateEnvContent, resolveProjectPath } from '@/mcp-server';

const PROJECTS_DIR = '/projects';
const PROJECT_NAME = 'my-project';
const PROJECT_PATH = path.join(PROJECTS_DIR, PROJECT_NAME);
const STOREFRONT_PATH = path.join(PROJECT_PATH, 'components', 'eds-storefront');

/** Helper: mock manifest read to return a project with EDS storefront */
function mockManifestWithStorefront(storefrontPath: string = STOREFRONT_PATH): void {
    const manifest = {
        name: 'my-project',
        status: 'ready',
        componentInstances: {
            'eds-storefront': { path: storefrontPath },
        },
    };
    (fsProm.readFile as jest.Mock).mockImplementation((p: string) => {
        if (String(p).endsWith('.demo-builder.json')) {
            return Promise.resolve(JSON.stringify(manifest));
        }
        return Promise.reject(new Error(`Unexpected readFile: ${p}`));
    });
}

/** Helper: mock manifest read to return a project without EDS storefront */
function mockManifestWithoutStorefront(): void {
    const manifest = {
        name: 'my-project',
        status: 'ready',
        componentInstances: {},
    };
    (fsProm.readFile as jest.Mock).mockImplementation((p: string) => {
        if (String(p).endsWith('.demo-builder.json')) {
            return Promise.resolve(JSON.stringify(manifest));
        }
        return Promise.reject(new Error(`Unexpected readFile: ${p}`));
    });
}

/** Helper: mock manifest with EDS storefront AND installed block libraries */
function mockManifestWithBlockLibraries(
    libraries: Array<{ name: string; source: { owner: string; repo: string; branch?: string }; blockIds: string[] }>,
    storefrontPath: string = STOREFRONT_PATH,
): void {
    const manifest = {
        name: 'my-project',
        status: 'ready',
        componentInstances: {
            'eds-storefront': { path: storefrontPath },
        },
        installedBlockLibraries: libraries.map(lib => ({
            ...lib,
            commitSha: 'abc123',
            installedAt: '2026-01-01T00:00:00Z',
        })),
    };
    (fsProm.readFile as jest.Mock).mockImplementation((p: string) => {
        if (String(p).endsWith('.demo-builder.json')) {
            return Promise.resolve(JSON.stringify(manifest));
        }
        return Promise.reject(new Error(`Unexpected readFile: ${p}`));
    });
}

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
        const symlinkedProjectPath = path.join(symlinkedProjectsDir, PROJECT_NAME);

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

// ─── toolHandlers.updateProjectConfig ────────────────────────────────────────

describe('toolHandlers.updateProjectConfig', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (fsProm.mkdir as jest.Mock).mockResolvedValue(undefined);
        (fsProm.writeFile as jest.Mock).mockResolvedValue(undefined);
    });

    it('allows writing to .demo-builder.json', async () => {
        const result = await toolHandlers.updateProjectConfig(
            PROJECTS_DIR,
            PROJECT_NAME,
            '.demo-builder.json',
            '{"name":"test"}',
        );

        expect(fsProm.writeFile as jest.Mock).toHaveBeenCalledWith(
            path.resolve(PROJECT_PATH, '.demo-builder.json'),
            '{"name":"test"}',
            'utf-8',
        );
        expect(result).toContain('.demo-builder.json');
    });

    it('allows writing a .env file one level inside projectPath', async () => {
        const result = await toolHandlers.updateProjectConfig(
            PROJECTS_DIR,
            PROJECT_NAME,
            'components/eds-storefront/.env',
            'KEY=value',
        );

        expect(fsProm.writeFile as jest.Mock).toHaveBeenCalled();
        expect(result).toContain('.env');
    });

    it('throws when path resolves outside projectPath', async () => {
        await expect(
            toolHandlers.updateProjectConfig(PROJECTS_DIR, PROJECT_NAME, '../../etc/hosts', 'content'),
        ).rejects.toThrow(/not permitted|escapes/i);
    });

    it('throws for a non-manifest, non-.env file even if inside projectPath', async () => {
        await expect(
            toolHandlers.updateProjectConfig(PROJECTS_DIR, PROJECT_NAME, 'src/index.ts', 'code'),
        ).rejects.toThrow(/not permitted/i);
    });

    it('throws for a .env file inside node_modules', async () => {
        await expect(
            toolHandlers.updateProjectConfig(PROJECTS_DIR, PROJECT_NAME, 'node_modules/some-dep/.env', 'secret'),
        ).rejects.toThrow(/not permitted/i);
    });

    it('throws for a .env file inside .git', async () => {
        await expect(
            toolHandlers.updateProjectConfig(PROJECTS_DIR, PROJECT_NAME, '.git/hooks/.env', 'secret'),
        ).rejects.toThrow(/not permitted/i);
    });

    it('throws when .env content contains subshell syntax', async () => {
        await expect(
            toolHandlers.updateProjectConfig(PROJECTS_DIR, PROJECT_NAME, '.env', 'KEY=$(dangerous)'),
        ).rejects.toThrow(/subshell/i);
    });

    it('accepts well-formed .env content', async () => {
        const result = await toolHandlers.updateProjectConfig(
            PROJECTS_DIR,
            PROJECT_NAME,
            '.env',
            'API_URL=https://example.com\nDEBUG=false\n',
        );
        expect(result).toContain('.env');
    });

    it('throws when a parent directory symlink resolves outside the project (new file write)', async () => {
        (fsProm.realpath as jest.Mock)
            .mockImplementationOnce((p: string) => Promise.resolve(p))
            .mockImplementationOnce(() =>
                Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
            )
            .mockImplementationOnce(() => Promise.resolve('/etc'));

        await expect(
            toolHandlers.updateProjectConfig(PROJECTS_DIR, PROJECT_NAME, 'components/link/.env', 'KEY=value'),
        ).rejects.toThrow(/escapes allowed directory/i);
    });

    it('allows writing a new .env file when the parent symlink resolves inside the project', async () => {
        const resolvedTarget = path.resolve(PROJECT_PATH, 'components/link/.env');
        const insideParent = `${PROJECT_PATH}/components/eds-storefront`;
        const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });

        (fsProm.realpath as jest.Mock).mockImplementation((p: string) => {
            if (String(p) === resolvedTarget) return Promise.reject(enoent);
            if (String(p) === path.dirname(resolvedTarget)) return Promise.resolve(insideParent);
            return Promise.resolve(p);
        });

        const result = await toolHandlers.updateProjectConfig(PROJECTS_DIR, PROJECT_NAME, 'components/link/.env', 'KEY=value');

        expect(fsProm.writeFile as jest.Mock).toHaveBeenCalled();
        expect(result).toContain('.env');
    });

    it('rejects when a symlinked .demo-builder.json points to a different file (allowlist uses canonical path)', async () => {
        const resolvedTarget = path.resolve(PROJECT_PATH, '.demo-builder.json');

        (fsProm.realpath as jest.Mock).mockImplementation((p: string) => {
            if (String(p) === resolvedTarget) return Promise.resolve(`${PROJECT_PATH}/src/secret.ts`);
            return Promise.resolve(p);
        });

        await expect(
            toolHandlers.updateProjectConfig(PROJECTS_DIR, PROJECT_NAME, '.demo-builder.json', '{"name":"evil"}'),
        ).rejects.toThrow(/not permitted/i);
        expect(fsProm.writeFile as jest.Mock).not.toHaveBeenCalled();
    });

    it('rejects reading a symlinked .demo-builder.json that resolves to a non-allowlisted file', async () => {
        const resolvedTarget = path.resolve(PROJECT_PATH, '.demo-builder.json');

        (fsProm.realpath as jest.Mock).mockImplementation((p: string) => {
            if (String(p) === resolvedTarget) return Promise.resolve(`${PROJECT_PATH}/src/secret.ts`);
            return Promise.resolve(p);
        });

        await expect(
            toolHandlers.getComponentConfig(PROJECTS_DIR, PROJECT_NAME, '.demo-builder.json'),
        ).rejects.toThrow(/not permitted/i);
        expect(fsProm.readFile as jest.Mock).not.toHaveBeenCalled();
    });

    it('throws when both resolved path and parent directory do not exist (cannot canonicalize)', async () => {
        const resolvedTarget = path.resolve(PROJECT_PATH, 'deep/nonexistent/dir/.env');
        const parentDir = path.dirname(resolvedTarget);
        const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });

        (fsProm.realpath as jest.Mock).mockImplementation((p: string) => {
            if (String(p) === resolvedTarget || String(p) === parentDir) return Promise.reject(enoent);
            return Promise.resolve(p);
        });

        await expect(
            toolHandlers.updateProjectConfig(PROJECTS_DIR, PROJECT_NAME, 'deep/nonexistent/dir/.env', 'KEY=value'),
        ).rejects.toThrow(/Cannot verify path safety/i);
    });
});

// ─── validateEnvContent ───────────────────────────────────────────────────────

describe('validateEnvContent', () => {
    it('accepts blank lines, comments, and KEY=VALUE pairs', () => {
        expect(() => validateEnvContent('# comment\nKEY=value\n\nFOO=bar')).not.toThrow();
    });

    it('accepts lowercase keys', () => {
        expect(() => validateEnvContent('debug=true')).not.toThrow();
    });

    it('throws for lines that are not KEY=VALUE, blank, or comments', () => {
        expect(() => validateEnvContent('invalid line without equals')).toThrow(/KEY=VALUE/i);
    });

    it('throws when value contains $(...) subshell syntax', () => {
        expect(() => validateEnvContent('KEY=$(malicious command)')).toThrow(/subshell/i);
    });

    it('throws when value contains backtick subshell syntax', () => {
        expect(() => validateEnvContent('KEY=`malicious`')).toThrow(/subshell/i);
    });

    it('throws when value contains ${VAR} shell variable expansion', () => {
        expect(() => validateEnvContent('KEY=${HOME}/.ssh/id_rsa')).toThrow(/parameter expansion/i);
    });

    it('throws when value contains $VAR bare variable expansion', () => {
        expect(() => validateEnvContent('KEY=$SECRET_TOKEN')).toThrow(/parameter expansion/i);
    });

    it('throws when value contains $1 positional parameter', () => {
        expect(() => validateEnvContent('KEY=$1')).toThrow(/parameter expansion/i);
    });

    it('throws when value contains $@ special shell parameter', () => {
        expect(() => validateEnvContent('KEY=$@')).toThrow(/parameter expansion/i);
    });

    it('throws when value contains $? exit status parameter', () => {
        expect(() => validateEnvContent('KEY=$?')).toThrow(/parameter expansion/i);
    });

    it('throws when value contains $$ shell PID parameter', () => {
        expect(() => validateEnvContent('KEY=$$')).toThrow(/parameter expansion/i);
    });

    it('throws when value contains $- shell flags parameter', () => {
        expect(() => validateEnvContent('KEY=$-')).toThrow(/parameter expansion/i);
    });

    it('throws when value contains <(...) process substitution syntax', () => {
        expect(() => validateEnvContent('KEY=x<(touch /tmp/pwned)')).toThrow(/process substitution/i);
    });

    it('throws when value contains >(...) process substitution syntax', () => {
        expect(() => validateEnvContent('KEY=y>(tee /tmp/log)')).toThrow(/process substitution/i);
    });

    it('throws when value contains zsh =(...) process substitution', () => {
        expect(() => validateEnvContent('KEY=x=(touch /tmp/pwned)')).toThrow(/process substitution/i);
    });

    it('throws when value contains bare > redirection', () => {
        expect(() => validateEnvContent('KEY=safe>/etc/passwd')).toThrow(/metacharacter/i);
    });

    it('throws when value contains bare < redirection', () => {
        expect(() => validateEnvContent('KEY=x</dev/tcp/host/80')).toThrow(/metacharacter/i);
    });

    it('throws when value contains | pipe', () => {
        expect(() => validateEnvContent('KEY=x|tee /tmp/log')).toThrow(/metacharacter/i);
    });

    it('throws when value contains & backgrounding (e.g. unquoted URL query)', () => {
        expect(() => validateEnvContent('KEY=https://api.com?a=1&b=2')).toThrow(/metacharacter/i);
    });

    it('throws when value contains ; sequencing', () => {
        expect(() => validateEnvContent('KEY=x;whoami')).toThrow(/metacharacter/i);
    });

    it('throws when unquoted value contains whitespace (bash prefix-env command bypass)', () => {
        expect(() => validateEnvContent('KEY=x whoami')).toThrow(/safe-chars-only/i);
    });

    it('throws when unquoted value contains glob metacharacter *', () => {
        expect(() => validateEnvContent('KEY=/root/.ssh/*')).toThrow(/safe-chars-only/i);
    });

    it('throws when unquoted value contains glob metacharacter ?', () => {
        expect(() => validateEnvContent('KEY=https://api.com/path?a=1')).toThrow(/safe-chars-only/i);
    });

    it('throws when unquoted value contains glob metacharacter [', () => {
        expect(() => validateEnvContent('KEY=[abc]')).toThrow(/safe-chars-only/i);
    });

    it('throws when unquoted value contains tilde (user enumeration)', () => {
        expect(() => validateEnvContent('KEY=~root')).toThrow(/safe-chars-only/i);
    });

    it('throws when value contains deprecated arithmetic $[...]', () => {
        expect(() => validateEnvContent('KEY=$[1+1]')).toThrow(/safe-chars-only/i);
    });

    it('throws when unquoted value contains brace expansion {a,b}', () => {
        expect(() => validateEnvContent('KEY={a,b}')).toThrow(/safe-chars-only/i);
    });

    it('accepts empty value (KEY=)', () => {
        expect(() => validateEnvContent('KEY=')).not.toThrow();
    });

    it('accepts single-quoted value with embedded special characters', () => {
        expect(() => validateEnvContent("KEY='$(whoami) && rm -rf /'")).not.toThrow();
    });

    it('accepts single-quoted value with spaces', () => {
        expect(() => validateEnvContent("KEY='hello world with spaces'")).not.toThrow();
    });

    it('throws when single-quoted value contains embedded single quote', () => {
        expect(() => validateEnvContent("KEY='foo'bar'")).toThrow(/safe-chars-only|subshell|expansion|metacharacter/i);
    });

    it('accepts double-quoted value with spaces and safe chars', () => {
        expect(() => validateEnvContent('KEY="hello world 123"')).not.toThrow();
    });

    it('throws when double-quoted value contains $ (expansion would trigger)', () => {
        expect(() => validateEnvContent('KEY="hello $USER"')).toThrow();
    });

    it('throws when double-quoted value contains backtick', () => {
        expect(() => validateEnvContent('KEY="text `cmd` more"')).toThrow();
    });

    it('throws when double-quoted value contains backslash', () => {
        expect(() => validateEnvContent('KEY="hello\\world"')).toThrow();
    });

    it('accepts URL-encoded value with % character', () => {
        expect(() => validateEnvContent('KEY=hello%20world')).not.toThrow();
    });

    it('accepts email address (with @)', () => {
        expect(() => validateEnvContent('EMAIL=user@example.com')).not.toThrow();
    });

    it('accepts postgres connection URL (no query string)', () => {
        expect(() => validateEnvContent('DATABASE_URL=postgres://user:pass@host:5432/db')).not.toThrow();
    });
});

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

    describe('originLibrary cross-reference (Cycle B Step 6j)', () => {
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
});

// ─── toolHandlers.getBlockSource ─────────────────────────────────────────────

describe('toolHandlers.getBlockSource', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('reads all files in blocks/<blockName>/ and returns JSON array of {name, content}', async () => {
        mockManifestWithStorefront();
        (fsProm.stat as jest.Mock).mockResolvedValue({ size: 1_000 });
        (fsProm.readdir as jest.Mock).mockResolvedValue([
            { name: 'hero.js', isFile: () => true, isDirectory: () => false },
            { name: 'hero.css', isFile: () => true, isDirectory: () => false },
        ]);
        (fsProm.readFile as jest.Mock)
            .mockImplementation((p: string) => {
                if (String(p).endsWith('.demo-builder.json')) {
                    return Promise.resolve(JSON.stringify({
                        name: 'my-project',
                        status: 'ready',
                        componentInstances: { 'eds-storefront': { path: STOREFRONT_PATH } },
                    }));
                }
                if (String(p).endsWith('hero.js')) return Promise.resolve('// hero js');
                if (String(p).endsWith('hero.css')) return Promise.resolve('.hero { color: red; }');
                return Promise.reject(new Error(`Unexpected readFile: ${p}`));
            });

        const result = await toolHandlers.getBlockSource(PROJECTS_DIR, PROJECT_NAME, 'hero');
        const parsed = JSON.parse(result) as Array<{ name: string; content: string }>;

        expect(parsed).toHaveLength(2);
        expect(parsed[0].name).toBe('hero.js');
        expect(parsed[0].content).toBe('// hero js');
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

    it('returns empty array when block directory exists but has no files', async () => {
        mockManifestWithStorefront();
        (fsProm.readdir as jest.Mock).mockResolvedValue([]);

        const result = await toolHandlers.getBlockSource(PROJECTS_DIR, PROJECT_NAME, 'empty-block');
        const parsed = JSON.parse(result) as unknown[];

        expect(parsed).toHaveLength(0);
    });

    it('reads file content when file is within the size limit', async () => {
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

        const result = await toolHandlers.getBlockSource(PROJECTS_DIR, PROJECT_NAME, 'hero');
        const parsed = JSON.parse(result) as Array<{ name: string; content: string }>;

        expect(parsed[0].content).toBe('// hero source');
    });

    it('returns a truncation placeholder for files exceeding MAX_FILE_BYTES', async () => {
        mockManifestWithStorefront();
        (fsProm.readdir as jest.Mock).mockResolvedValue([
            { name: 'large.min.js', isFile: () => true, isDirectory: () => false },
        ]);
        (fsProm.stat as jest.Mock).mockResolvedValueOnce({ size: 200_000 });

        const result = await toolHandlers.getBlockSource(PROJECTS_DIR, PROJECT_NAME, 'hero');
        const parsed = JSON.parse(result) as Array<{ name: string; content: string }>;

        expect(parsed[0].name).toBe('large.min.js');
        expect(parsed[0].content).toContain('[truncated:');
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
        (fsProm.readdir as jest.Mock).mockResolvedValue([
            { name: 'hero.js', isFile: () => true, isDirectory: () => false },
        ]);
        (fsProm.readFile as jest.Mock).mockImplementation((p: string) => {
            if (String(p).endsWith('.demo-builder.json')) {
                return Promise.resolve(JSON.stringify({
                    name: 'my-project',
                    status: 'ready',
                    componentInstances: { 'eds-storefront': { path: STOREFRONT_PATH } },
                }));
            }
            return Promise.resolve('// hero js');
        });

        const result = await toolHandlers.getBlockSource(PROJECTS_DIR, PROJECT_NAME, 'block-alias');
        const parsed = JSON.parse(result) as Array<{ name: string; content: string }>;

        expect(parsed[0].name).toBe('hero.js');
    });
});
