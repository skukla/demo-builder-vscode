/**
 * MCP Server Tests
 *
 * Tests for the standalone Demo Builder MCP server:
 * - toolHandlers.getProject: reads .demo-builder.json
 * - toolHandlers.getComponentConfig: reads config files with path traversal protection
 * - toolHandlers.updateProjectConfig: writes .demo-builder.json or .env files
 * - toolHandlers.syncStorefront: git add/commit/push
 * - toolHandlers.listBlocks: lists block directories
 * - toolHandlers.getBlockSource: reads block source files
 * - validateEnvContent: allowlist-based .env content validator
 */

import * as fsProm from 'fs/promises';
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

jest.mock('child_process', () => ({
    execFile: jest.fn(),
}));

import { toolHandlers, validateEnvContent } from '@/mcp-server';

const PROJECT_PATH = '/projects/my-project';
const STOREFRONT_PATH = '/projects/my-project/components/eds-storefront';

// ─── toolHandlers.getProject ──────────────────────────────────────────────────

describe('toolHandlers.getProject', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('reads .demo-builder.json and returns formatted JSON string', async () => {
        const projectData = { name: 'test-project', status: 'ready' };
        (fsProm.readFile as jest.Mock).mockResolvedValue(JSON.stringify(projectData));

        const result = await toolHandlers.getProject(PROJECT_PATH);

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

        const result = await toolHandlers.getProject(PROJECT_PATH);

        expect(result).toContain('Error reading project state');
    });

    it('returns error text when readFile returns invalid JSON', async () => {
        (fsProm.readFile as jest.Mock).mockResolvedValue('{ invalid json }');

        const result = await toolHandlers.getProject(PROJECT_PATH);

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

        const result = await toolHandlers.getComponentConfig(PROJECT_PATH, '.demo-builder.json');

        const expectedPath = path.resolve(PROJECT_PATH, '.demo-builder.json');
        expect(fsProm.readFile as jest.Mock).toHaveBeenCalledWith(expectedPath, 'utf-8');
        expect(result).toBe('{"name":"test"}');
    });

    it('reads a .env file inside projectPath', async () => {
        (fsProm.readFile as jest.Mock).mockResolvedValue('KEY=value');

        const result = await toolHandlers.getComponentConfig(PROJECT_PATH, 'components/storefront/.env');

        expect(result).toBe('KEY=value');
    });

    it('throws when path is not in the read allowlist (e.g. src/config.json)', async () => {
        await expect(
            toolHandlers.getComponentConfig(PROJECT_PATH, 'src/config.json'),
        ).rejects.toThrow(/not permitted/i);
    });

    it('throws when relative path contains ../ (path traversal)', async () => {
        await expect(
            toolHandlers.getComponentConfig(PROJECT_PATH, '../outside/file.txt'),
        ).rejects.toThrow(/escapes project directory/i);
    });

    it('throws when resolved path is outside projectPath', async () => {
        await expect(
            toolHandlers.getComponentConfig(PROJECT_PATH, '../../etc/passwd'),
        ).rejects.toThrow(/escapes project directory/i);
    });

    it('allows a .env file when realpath resolves a symlink that stays inside the project', async () => {
        // Simulate a symlink: components/eds-link → components/eds-storefront (both inside project).
        // First realpath call is for projectPath (no symlink). Second is for the resolved path.
        (fsProm.realpath as jest.Mock)
            .mockImplementationOnce((p: string) => Promise.resolve(p)) // projectPath — no symlink
            .mockImplementationOnce((p: string) =>                      // resolved — symlink target
                Promise.resolve(p.replace('eds-link', 'eds-storefront')),
            );
        (fsProm.readFile as jest.Mock).mockResolvedValue('KEY=value');

        const result = await toolHandlers.getComponentConfig(PROJECT_PATH, 'components/eds-link/.env');

        expect(result).toBe('KEY=value');
    });

    it('allows access when projectPath is a symlink (e.g. macOS /tmp → /private/tmp)', async () => {
        const symlinkedProjectPath = '/tmp/my-project';
        const canonicalProjectPath = '/private/tmp/my-project';

        (fsProm.realpath as jest.Mock)
            .mockImplementationOnce(() => Promise.resolve(canonicalProjectPath)) // projectPath symlink resolved
            .mockImplementationOnce(() => Promise.resolve(canonicalProjectPath + '/.demo-builder.json')); // resolved
        (fsProm.readFile as jest.Mock).mockResolvedValue('{"name":"test"}');

        // Should NOT throw even though lexical paths differ after symlink resolution
        const result = await toolHandlers.getComponentConfig(symlinkedProjectPath, '.demo-builder.json');
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
            PROJECT_PATH,
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
            PROJECT_PATH,
            'components/eds-storefront/.env',
            'KEY=value',
        );

        expect(fsProm.writeFile as jest.Mock).toHaveBeenCalled();
        expect(result).toContain('.env');
    });

    it('throws when path resolves outside projectPath', async () => {
        await expect(
            toolHandlers.updateProjectConfig(PROJECT_PATH, '../../etc/hosts', 'content'),
        ).rejects.toThrow(/not permitted|escapes/i);
    });

    it('throws for a non-manifest, non-.env file even if inside projectPath', async () => {
        await expect(
            toolHandlers.updateProjectConfig(PROJECT_PATH, 'src/index.ts', 'code'),
        ).rejects.toThrow(/not permitted/i);
    });

    it('throws for a .env file inside node_modules', async () => {
        await expect(
            toolHandlers.updateProjectConfig(PROJECT_PATH, 'node_modules/some-dep/.env', 'secret'),
        ).rejects.toThrow(/not permitted/i);
    });

    it('throws for a .env file inside .git', async () => {
        await expect(
            toolHandlers.updateProjectConfig(PROJECT_PATH, '.git/hooks/.env', 'secret'),
        ).rejects.toThrow(/not permitted/i);
    });

    it('throws when .env content contains subshell syntax', async () => {
        await expect(
            toolHandlers.updateProjectConfig(PROJECT_PATH, '.env', 'KEY=$(dangerous)'),
        ).rejects.toThrow(/subshell/i);
    });

    it('accepts well-formed .env content', async () => {
        const result = await toolHandlers.updateProjectConfig(
            PROJECT_PATH,
            '.env',
            'API_URL=https://example.com\nDEBUG=false\n',
        );
        expect(result).toContain('.env');
    });

    it('throws when a parent directory symlink resolves outside the project (new file write)', async () => {
        // New file: realpath on the resolved path throws ENOENT, then we canonicalize the parent.
        // If the parent symlink points outside the project, the write must be rejected.
        (fsProm.realpath as jest.Mock)
            .mockImplementationOnce((p: string) => Promise.resolve(p))            // #1: projectPath
            .mockImplementationOnce(() =>                                          // #2: resolved — ENOENT (new file)
                Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
            )
            .mockImplementationOnce(() => Promise.resolve('/etc'));                // #3: parent dir → /etc (escapes)

        await expect(
            toolHandlers.updateProjectConfig(PROJECT_PATH, 'components/link/.env', 'KEY=value'),
        ).rejects.toThrow(/escapes project directory/i);
    });

    it('allows writing a new .env file when the parent symlink resolves inside the project', async () => {
        const insideParent = `${PROJECT_PATH}/components/eds-storefront`;
        (fsProm.realpath as jest.Mock)
            .mockImplementationOnce((p: string) => Promise.resolve(p))            // #1: projectPath
            .mockImplementationOnce(() =>                                          // #2: resolved — ENOENT (new file)
                Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
            )
            .mockImplementationOnce(() => Promise.resolve(insideParent));          // #3: parent dir stays inside

        const result = await toolHandlers.updateProjectConfig(PROJECT_PATH, 'components/link/.env', 'KEY=value');

        expect(fsProm.writeFile as jest.Mock).toHaveBeenCalled();
        expect(result).toContain('.env');
    });

    it('rejects when a symlinked .demo-builder.json points to a different file (allowlist uses canonical path)', async () => {
        // Defense-in-depth: if .demo-builder.json is a symlink whose target is another file
        // inside the project (e.g. src/secret.ts), a lexical allowlist check would pass because
        // the lexical path matches `.demo-builder.json` — but the write would land on the target.
        // isAllowedConfigPath must operate on the canonical path returned by assertInsideProject.
        (fsProm.realpath as jest.Mock)
            .mockImplementationOnce((p: string) => Promise.resolve(p))                                  // #1: projectPath
            .mockImplementationOnce(() => Promise.resolve(`${PROJECT_PATH}/src/secret.ts`));            // #2: symlinked config → secret

        await expect(
            toolHandlers.updateProjectConfig(PROJECT_PATH, '.demo-builder.json', '{"name":"evil"}'),
        ).rejects.toThrow(/not permitted/i);
        expect(fsProm.writeFile as jest.Mock).not.toHaveBeenCalled();
    });

    it('rejects reading a symlinked .demo-builder.json that resolves to a non-allowlisted file', async () => {
        (fsProm.realpath as jest.Mock)
            .mockImplementationOnce((p: string) => Promise.resolve(p))                                  // #1: projectPath
            .mockImplementationOnce(() => Promise.resolve(`${PROJECT_PATH}/src/secret.ts`));            // #2: symlink target

        await expect(
            toolHandlers.getComponentConfig(PROJECT_PATH, '.demo-builder.json'),
        ).rejects.toThrow(/not permitted/i);
        expect(fsProm.readFile as jest.Mock).not.toHaveBeenCalled();
    });

    it('throws when both resolved path and parent directory do not exist (cannot canonicalize)', async () => {
        // branch 3: both realpath(resolved) and realpath(parent) throw — reject instead of lexical fallback
        (fsProm.realpath as jest.Mock)
            .mockImplementationOnce((p: string) => Promise.resolve(p))            // #1: projectPath
            .mockImplementationOnce(() =>                                          // #2: resolved — ENOENT
                Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
            )
            .mockImplementationOnce(() =>                                          // #3: parent dir — ENOENT
                Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
            );

        await expect(
            toolHandlers.updateProjectConfig(PROJECT_PATH, 'deep/nonexistent/dir/.env', 'KEY=value'),
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
        // KEY=safe>/etc/passwd parses as assignment + redirection when sourced,
        // truncating the target file. Must be blocked even without $(...), `, or <(.
        expect(() => validateEnvContent('KEY=safe>/etc/passwd')).toThrow(/metacharacter/i);
    });

    it('throws when value contains bare < redirection', () => {
        expect(() => validateEnvContent('KEY=x</dev/tcp/host/80')).toThrow(/metacharacter/i);
    });

    it('throws when value contains | pipe', () => {
        expect(() => validateEnvContent('KEY=x|tee /tmp/log')).toThrow(/metacharacter/i);
    });

    it('throws when value contains & backgrounding (e.g. unquoted URL query)', () => {
        // KEY=https://api.com?a=1&b=2 is unsafe when sourced — the &b=2 backgrounds
        // an assignment to $b. AI-generated .env values with URL query strings
        // must quote the value.
        expect(() => validateEnvContent('KEY=https://api.com?a=1&b=2')).toThrow(/metacharacter/i);
    });

    it('throws when value contains ; sequencing', () => {
        expect(() => validateEnvContent('KEY=x;whoami')).toThrow(/metacharacter/i);
    });

    // ── Allowlist backstop tests ─────────────────────────────────────────────
    // The specific-category guards above catch common dangerous patterns. The allowlist
    // backstop catches shell grammar that no specific guard recognizes: whitespace
    // (prefix-env command), glob metachars, tilde, deprecated arithmetic.

    it('throws when unquoted value contains whitespace (bash prefix-env command bypass)', () => {
        // Confirmed RCE vector: KEY=x whoami parses as assignment + command on source.
        // No $(, no <(, no $X, no <>|&; — the only signal is whitespace.
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
        // $[ is not caught by the parameter-expansion regex (which requires [A-Za-z_0-9@?!#*$\-{]).
        // The allowlist backstop catches it.
        expect(() => validateEnvContent('KEY=$[1+1]')).toThrow(/safe-chars-only/i);
    });

    it('throws when unquoted value contains brace expansion {a,b}', () => {
        expect(() => validateEnvContent('KEY={a,b}')).toThrow(/safe-chars-only/i);
    });

    it('accepts empty value (KEY=)', () => {
        expect(() => validateEnvContent('KEY=')).not.toThrow();
    });

    it('accepts single-quoted value with embedded special characters', () => {
        // Single quotes prevent all shell expansion. Even $(...) is literal.
        expect(() => validateEnvContent("KEY='$(whoami) && rm -rf /'")).not.toThrow();
    });

    it('accepts single-quoted value with spaces', () => {
        expect(() => validateEnvContent("KEY='hello world with spaces'")).not.toThrow();
    });

    it('throws when single-quoted value contains embedded single quote', () => {
        // 'foo'bar' is not a valid single-quoted string — the second ' closes the quoting.
        expect(() => validateEnvContent("KEY='foo'bar'")).toThrow(/safe-chars-only|subshell|expansion|metacharacter/i);
    });

    it('accepts double-quoted value with spaces and safe chars', () => {
        expect(() => validateEnvContent('KEY="hello world 123"')).not.toThrow();
    });

    it('throws when double-quoted value contains $ (expansion would trigger)', () => {
        // Double quotes still expand $, backtick, and \ — so they are NOT safe in the validator.
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

    it('throws when storefrontPath is not an absolute path', async () => {
        await expect(
            toolHandlers.syncStorefront(PROJECT_PATH, 'relative/path', 'AI: test'),
        ).rejects.toThrow(/absolute path/i);
    });

    it('throws when storefrontPath is outside the project directory', async () => {
        await expect(
            toolHandlers.syncStorefront(PROJECT_PATH, '/other/path', 'AI: test'),
        ).rejects.toThrow(/escapes project directory/i);
    });

    it('calls execFile for git add -A, git commit, git push in sequence', async () => {
        (childProcess.execFile as jest.Mock)
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', ''))
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', ''))
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', ''));

        const result = await toolHandlers.syncStorefront(PROJECT_PATH, STOREFRONT_PATH, 'AI: update config');

        expect(childProcess.execFile as jest.Mock).toHaveBeenCalledTimes(3);
        const calls = (childProcess.execFile as jest.Mock).mock.calls;
        expect(calls[0][1]).toContain('add');
        expect(calls[1][1]).toContain('commit');
        expect(calls[2][1]).toContain('push');
        expect(result).toContain('success');
    });

    it('strips newlines from commit message before passing to git', async () => {
        (childProcess.execFile as jest.Mock)
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', ''))
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', ''))
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', ''));

        // Newlines in the commit message (via execFile, not a shell) are not injection vectors
        // but produce malformed commit messages. Verify newlines are stripped.
        await toolHandlers.syncStorefront(PROJECT_PATH, STOREFRONT_PATH, 'AI: sync\nline2');

        const calls = (childProcess.execFile as jest.Mock).mock.calls;
        const commitArgs: string[] = calls[1][1];
        const messageIndex = commitArgs.indexOf('-m') + 1;
        expect(commitArgs[messageIndex]).not.toContain('\n');
        expect(commitArgs[messageIndex]).toBe('AI: sync line2');
    });

    it('returns success message when git commit fails with "nothing to commit"', async () => {
        // Simulate the real execFile error shape: { message, stderr } from promisify
        const nothingToCommitErr = Object.assign(
            new Error('Command failed: git -C /path commit'),
            { stderr: 'nothing to commit, working tree clean' },
        );
        (childProcess.execFile as jest.Mock)
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', ''))
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) =>
                cb(nothingToCommitErr, '', ''),
            );

        const result = await toolHandlers.syncStorefront(PROJECT_PATH, STOREFRONT_PATH, 'AI: no changes');

        expect(result).toContain('Nothing to commit');
    });

    it('uses the default commit message when commitMessage collapses to empty after trim', async () => {
        (childProcess.execFile as jest.Mock)
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', ''))
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', ''))
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', ''));

        await toolHandlers.syncStorefront(PROJECT_PATH, STOREFRONT_PATH, '  \n\r  ');

        const calls = (childProcess.execFile as jest.Mock).mock.calls;
        const commitArgs: string[] = calls[1][1];
        const messageIndex = commitArgs.indexOf('-m') + 1;
        expect(commitArgs[messageIndex]).toBe('AI: sync files');
    });

    it('throws when storefrontPath is not a git repository root', async () => {
        (fsProm.stat as jest.Mock).mockRejectedValueOnce(
            Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
        );

        await expect(
            toolHandlers.syncStorefront(PROJECT_PATH, STOREFRONT_PATH, 'AI: test'),
        ).rejects.toThrow(/not a git repository root/i);
    });

    it('throws when git push fails with a real error', async () => {
        (childProcess.execFile as jest.Mock)
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', ''))
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) => cb(null, '', ''))
            .mockImplementationOnce((_cmd: string, _args: string[], cb: (...args: unknown[]) => void) =>
                cb(new Error('rejected: remote rejected push'), '', ''),
            );

        await expect(
            toolHandlers.syncStorefront(PROJECT_PATH, STOREFRONT_PATH, 'AI: update'),
        ).rejects.toThrow(/rejected/i);
    });
});

// ─── toolHandlers.listBlocks ──────────────────────────────────────────────────

describe('toolHandlers.listBlocks', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns JSON array of directory names from blocks/ directory', async () => {
        (fsProm.readdir as jest.Mock).mockResolvedValue([
            { name: 'hero', isDirectory: () => true, isFile: () => false },
            { name: 'banner', isDirectory: () => true, isFile: () => false },
        ]);

        const result = await toolHandlers.listBlocks(PROJECT_PATH, STOREFRONT_PATH);

        expect(JSON.parse(result)).toEqual(['hero', 'banner']);
    });

    it('returns empty JSON array when blocks/ directory does not exist (ENOENT)', async () => {
        (fsProm.readdir as jest.Mock).mockRejectedValue(
            Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
        );

        const result = await toolHandlers.listBlocks(PROJECT_PATH, STOREFRONT_PATH);

        expect(JSON.parse(result)).toEqual([]);
    });

    it('filters out files — only returns directory names', async () => {
        (fsProm.readdir as jest.Mock).mockResolvedValue([
            { name: 'hero', isDirectory: () => true, isFile: () => false },
            { name: 'README.md', isDirectory: () => false, isFile: () => true },
        ]);

        const result = await toolHandlers.listBlocks(PROJECT_PATH, STOREFRONT_PATH);

        expect(JSON.parse(result)).toEqual(['hero']);
    });

    it('throws when storefrontPath is outside project directory (listBlocks)', async () => {
        await expect(
            toolHandlers.listBlocks(PROJECT_PATH, '/other/path/storefront'),
        ).rejects.toThrow(/escapes project directory/i);
    });

    it('throws when storefrontPath is a relative path (listBlocks)', async () => {
        await expect(
            toolHandlers.listBlocks(PROJECT_PATH, 'relative/path'),
        ).rejects.toThrow(/absolute path/i);
    });
});

// ─── toolHandlers.getBlockSource ─────────────────────────────────────────────

describe('toolHandlers.getBlockSource', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('reads all files in blocks/<blockName>/ and returns JSON array of {name, content}', async () => {
        // Use an explicit size below MAX_FILE_BYTES so the test does not rely on
        // `undefined > 100_000` evaluating to false (JS coercion side-effect).
        (fsProm.stat as jest.Mock).mockResolvedValue({ size: 1_000 });
        (fsProm.readdir as jest.Mock).mockResolvedValue([
            { name: 'hero.js', isFile: () => true, isDirectory: () => false },
            { name: 'hero.css', isFile: () => true, isDirectory: () => false },
        ]);
        (fsProm.readFile as jest.Mock)
            .mockResolvedValueOnce('// hero js')
            .mockResolvedValueOnce('.hero { color: red; }');

        const result = await toolHandlers.getBlockSource(PROJECT_PATH, STOREFRONT_PATH, 'hero');
        const parsed = JSON.parse(result) as Array<{ name: string; content: string }>;

        expect(parsed).toHaveLength(2);
        expect(parsed[0].name).toBe('hero.js');
        expect(parsed[0].content).toBe('// hero js');
    });

    it('throws when blockName contains ../', async () => {
        await expect(
            toolHandlers.getBlockSource(PROJECT_PATH, STOREFRONT_PATH, '../secret'),
        ).rejects.toThrow(/escapes project directory/i);
    });

    it('throws when block directory does not exist', async () => {
        (fsProm.readdir as jest.Mock).mockRejectedValue(
            Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
        );

        await expect(
            toolHandlers.getBlockSource(PROJECT_PATH, STOREFRONT_PATH, 'nonexistent'),
        ).rejects.toThrow(/ENOENT/);
    });

    it('returns empty array when block directory exists but has no files', async () => {
        (fsProm.readdir as jest.Mock).mockResolvedValue([]);

        const result = await toolHandlers.getBlockSource(PROJECT_PATH, STOREFRONT_PATH, 'empty-block');
        const parsed = JSON.parse(result) as unknown[];

        expect(parsed).toHaveLength(0);
    });

    it('reads file content when file is within the size limit', async () => {
        (fsProm.readdir as jest.Mock).mockResolvedValue([
            { name: 'hero.js', isFile: () => true, isDirectory: () => false },
        ]);
        (fsProm.stat as jest.Mock).mockResolvedValueOnce({ size: 1_000 }); // 1 KB — within limit
        (fsProm.readFile as jest.Mock).mockResolvedValueOnce('// hero source');

        const result = await toolHandlers.getBlockSource(PROJECT_PATH, STOREFRONT_PATH, 'hero');
        const parsed = JSON.parse(result) as Array<{ name: string; content: string }>;

        expect(parsed[0].content).toBe('// hero source');
    });

    it('returns a truncation placeholder for files exceeding MAX_FILE_BYTES', async () => {
        (fsProm.readdir as jest.Mock).mockResolvedValue([
            { name: 'large.min.js', isFile: () => true, isDirectory: () => false },
        ]);
        (fsProm.stat as jest.Mock).mockResolvedValueOnce({ size: 200_000 }); // 200 KB — over limit

        const result = await toolHandlers.getBlockSource(PROJECT_PATH, STOREFRONT_PATH, 'hero');
        const parsed = JSON.parse(result) as Array<{ name: string; content: string }>;

        expect(parsed[0].name).toBe('large.min.js');
        expect(parsed[0].content).toContain('[truncated:');
        expect(fsProm.readFile as jest.Mock).not.toHaveBeenCalled();
    });

    it('throws when storefrontPath is outside project directory (getBlockSource)', async () => {
        await expect(
            toolHandlers.getBlockSource(PROJECT_PATH, '/other/path/storefront', 'hero'),
        ).rejects.toThrow(/escapes project directory/i);
    });

    it('throws when storefrontPath is a relative path (getBlockSource)', async () => {
        await expect(
            toolHandlers.getBlockSource(PROJECT_PATH, 'relative/path', 'hero'),
        ).rejects.toThrow(/absolute path/i);
    });

    it('throws when a symlink inside blocks/ resolves to a path outside the storefront', async () => {
        // assertInsideProject is called twice: once for storefrontPath, once for blockDir.
        // Each call canonicalizes two paths — 4 realpath calls total.
        (fsProm.realpath as jest.Mock)
            .mockImplementationOnce((p: string) => Promise.resolve(p))   // #1: projectPath
            .mockImplementationOnce((p: string) => Promise.resolve(p))   // #2: storefrontPath (inside project)
            .mockImplementationOnce((p: string) => Promise.resolve(p))   // #3: blocks/ dir
            .mockImplementationOnce(() => Promise.resolve('/etc/secret')); // #4: block dir resolves outside

        await expect(
            toolHandlers.getBlockSource(PROJECT_PATH, STOREFRONT_PATH, 'evil-block'),
        ).rejects.toThrow(/escapes project directory/i);
    });

    it('allows access when a block directory symlink resolves to a renamed path inside blocks/', async () => {
        (fsProm.realpath as jest.Mock)
            .mockImplementationOnce((p: string) => Promise.resolve(p))  // #1: projectPath
            .mockImplementationOnce((p: string) => Promise.resolve(p))  // #2: storefrontPath
            .mockImplementationOnce((p: string) => Promise.resolve(p))  // #3: blocks/ dir
            .mockImplementationOnce((p: string) =>                       // #4: block-alias → hero (still inside)
                Promise.resolve(p.replace('block-alias', 'hero')),
            );
        (fsProm.readdir as jest.Mock).mockResolvedValue([
            { name: 'hero.js', isFile: () => true, isDirectory: () => false },
        ]);
        (fsProm.readFile as jest.Mock).mockResolvedValue('// hero js');

        const result = await toolHandlers.getBlockSource(PROJECT_PATH, STOREFRONT_PATH, 'block-alias');
        const parsed = JSON.parse(result) as Array<{ name: string; content: string }>;

        expect(parsed[0].name).toBe('hero.js');
    });
});
