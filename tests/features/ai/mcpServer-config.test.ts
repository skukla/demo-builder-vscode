/**
 * MCP Server Tests — Config writes & .env validation
 *
 * toolHandlers.updateProjectConfig (manifest/.env writes) and validateEnvContent
 * (allowlist-based .env content validator). Shared setup lives in
 * mcpServer.testUtils.ts.
 */

import {
    fsProm,
    path,
    toolHandlers,
    validateEnvContent,
    PROJECTS_DIR,
    PROJECT_NAME,
    PROJECT_PATH,
} from './mcpServer.testUtils';

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

        // Atomic write: content goes to a sibling .tmp, then rename(2) swaps it in.
        const manifestPath = path.resolve(PROJECT_PATH, '.demo-builder.json');
        expect(fsProm.writeFile as jest.Mock).toHaveBeenCalledWith(
            `${manifestPath}.tmp`,
            '{"name":"test"}',
        );
        expect(fsProm.rename as jest.Mock).toHaveBeenCalledWith(`${manifestPath}.tmp`, manifestPath);
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

