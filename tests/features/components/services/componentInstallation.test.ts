/**
 * ComponentInstallation — the git-clone install path.
 *
 * WRITTEN 2026-08-28 as phase-2 of the ADR-015 convergence: the largest of the
 * untested queue files (347 lines, TWO ServiceLocator fetch points), and the
 * one carrying an explicit SECURITY contract — refs and URLs are interpolated
 * into a shell-executed command, so the module validates them against tight
 * charsets first. Its own comment says sources "can come from user-supplied
 * custom integrations and imported settings files".
 *
 * The witness pins, in priority order:
 *  1. the injection guards (URL, tag, branch, and the `..` rule) — a refactor
 *     that drops one hands a shell-executed string to attacker-influenced input
 *  2. the seam the conversion moves: the fetched executor, the exact clone
 *     command, and its options
 *  3. the tag-resolution rule (a fetched latest release WINS over the
 *     configured fallback; the fetch happens only when a tag is configured)
 *  4. a non-zero clone exit throws rather than reporting success
 *
 * Version detection and the GitHub release lookup have their own suites.
 */

import {
    COMPONENT_PATH,
    DEFAULT_SHELL,
    TIMEOUTS,
    cloneCall,
    install,
    makeDef,
    mockExecute,
    mockFs,
    resetDoubles,
} from './componentInstallation.testUtils';
import type { TransformedComponentDefinition } from '@/types/components';

beforeEach(resetDoubles);

describe('installGitComponent — the shell-injection guards', () => {
    it('REJECTS a URL outside the safe charset before it reaches the shell', async () => {
        const def = makeDef({ source: { url: 'https://github.com/a/b;$(curl evil)' } });

        await expect(install(def)).rejects.toThrow(/Invalid git URL/);
        expect(mockExecute).not.toHaveBeenCalled();
    });

    it('REJECTS a URL whose unsafe characters come FIRST', async () => {
        // The charset is anchored at BOTH ends. Without the leading anchor a
        // command prefix would pass, because the tail still matches.
        const def = makeDef({ source: { url: '$(curl evil)https://github.com/a/b' } });

        await expect(install(def)).rejects.toThrow(/Invalid git URL/);
        expect(mockExecute).not.toHaveBeenCalled();
    });

    it('REJECTS a branch containing shell metacharacters', async () => {
        const def = makeDef({ source: { url: 'https://github.com/a/b', branch: 'main`whoami`' } });

        await expect(install(def)).rejects.toThrow(/Invalid git branch/);
        expect(mockExecute).not.toHaveBeenCalled();
    });

    it('REJECTS a traversal sequence even inside the safe charset', async () => {
        const def = makeDef({ source: { url: 'https://github.com/a/../../etc/passwd' } });

        await expect(install(def)).rejects.toThrow(/Invalid git URL/);
        expect(mockExecute).not.toHaveBeenCalled();
    });

    it('REJECTS an unsafe TAG resolved from config', async () => {
        const def = makeDef({
            source: {
                url: 'https://github.com/a/b',
                gitOptions: { tag: 'v1.0.0 && rm -rf /' },
            },
        });

        await expect(install(def)).rejects.toThrow(/Invalid git tag/);
        expect(mockExecute).not.toHaveBeenCalled();
    });

    it('throws when no source URL is configured at all', async () => {
        await expect(install(makeDef({ source: {} }))).rejects.toThrow(
            /Git source URL not provided/
        );
    });

    it('throws, rather than failing on the read, when the definition has no source block', async () => {
        const sourceless = { id: 'eds-storefront', name: 'EDS Storefront' };

        await expect(install(sourceless as TransformedComponentDefinition)).rejects.toThrow(
            /Git source URL not provided/
        );
    });
});

describe('installGitComponent — preparing the component directory', () => {
    it('creates the components directory, parents included', async () => {
        await install();

        expect(mockFs.mkdir).toHaveBeenCalledWith('/projects/demo/components', {
            recursive: true,
        });
    });

    it('honours a custom componentsDir (edit mode) over the project default', async () => {
        await install(makeDef(), { componentsDir: '/elsewhere/components' });

        expect(mockFs.mkdir).toHaveBeenCalledWith('/elsewhere/components', { recursive: true });
        expect(cloneCall()[0]).toContain('"/elsewhere/components/eds-storefront"');
    });

    it('REMOVES a leftover component directory from a previous failed attempt', async () => {
        mockFs.access.mockResolvedValue(undefined);

        await install();

        expect(mockFs.rm).toHaveBeenCalledWith(COMPONENT_PATH, { recursive: true, force: true });
    });

    it('removes nothing when there is no leftover directory', async () => {
        await install();

        expect(mockFs.rm).not.toHaveBeenCalled();
    });
});

describe('installGitComponent — the clone seam', () => {
    it('clones through the HANDED-IN executor with the exact command and options', async () => {
        await install();

        const [command, options] = cloneCall();
        expect(command).toBe(
            'git clone -b "main" "https://github.com/skukla/kukla-bodea" "/projects/demo/components/eds-storefront"'
        );
        expect(options).toEqual({
            timeout: TIMEOUTS.LONG,
            enhancePath: true,
            shell: DEFAULT_SHELL,
        });
    });

    it('honours a configured clone timeout over the default', async () => {
        const def = makeDef({
            source: { url: 'https://github.com/a/b', timeouts: { clone: 1234 } },
        });

        await install(def);

        expect(cloneCall()[1].timeout).toBe(1234);
    });

    it('an explicit branch option wins over the one in the definition', async () => {
        await install(makeDef(), { branch: 'release-2' });

        expect(cloneCall()[0]).toContain('-b "release-2"');
    });

    it('falls back to main when neither the option nor the definition names a branch', async () => {
        const def = makeDef({ source: { url: 'https://github.com/a/b' } });

        const result = await install(def);

        expect(cloneCall()[0]).toContain('-b "main"');
        expect(result.component?.branch).toBe('main');
    });

    it('adds --depth=1 only when the component asks for a shallow clone', async () => {
        const def = makeDef({
            source: {
                url: 'https://github.com/a/b',
                branch: 'main',
                gitOptions: { shallow: true },
            },
        });

        await install(def);

        expect(cloneCall()[0]).toContain('--depth=1');
    });

    it('omits --depth=1 when it is not asked for', async () => {
        await install();

        expect(cloneCall()[0]).not.toContain('--depth=1');
    });

    it('a NON-ZERO clone exit throws — never a success result', async () => {
        mockExecute.mockResolvedValue({ code: 128, stdout: '', stderr: 'repository not found' });

        await expect(install()).rejects.toThrow(/Git clone failed: repository not found/);
    });

    it('reports success and returns the instance when the clone lands', async () => {
        const result = await install();

        expect(result.success).toBe(true);
        expect(result.component?.status).toBe('cloning');
        expect(result.component?.repoUrl).toBe('https://github.com/skukla/kukla-bodea');
        expect(result.component?.path).toBe(COMPONENT_PATH);
    });
});

describe('installGitComponent — tag resolution', () => {
    it('a fetched LATEST release wins over the configured fallback tag', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => [{ tag_name: 'v9.9.9', prerelease: true }],
        });
        const def = makeDef({
            source: { url: 'https://github.com/skukla/kukla-bodea', gitOptions: { tag: 'v1.0.0' } },
        });

        await install(def);

        expect(cloneCall()[0]).toContain('--branch "v9.9.9"');
    });

    it('a resolved tag replaces the branch flag entirely', async () => {
        const def = makeDef({
            source: {
                url: 'https://github.com/skukla/kukla-bodea',
                branch: 'main',
                gitOptions: { tag: 'v1.0.0' },
            },
        });

        await install(def);

        expect(cloneCall()[0]).toContain('--branch "v1.0.0"');
        expect(cloneCall()[0]).not.toContain('-b "main"');
    });

    it('falls back to the configured tag when the release lookup fails', async () => {
        const def = makeDef({
            source: { url: 'https://github.com/skukla/kukla-bodea', gitOptions: { tag: 'v1.0.0' } },
        });

        await install(def);

        expect(cloneCall()[0]).toContain('--branch "v1.0.0"');
    });

    it('does NOT consult GitHub when no tag is configured (branch installs stay offline)', async () => {
        await install();

        expect(global.fetch).not.toHaveBeenCalled();
    });
});
