/**
 * ComponentDependencies Tests
 *
 * `installNpmDependencies` and `installDependenciesForComponent` share an
 * identical install-then-optional-build core (duplication scan, 2026-07-31);
 * they differ only in return type, an extra `skipDependencies` gate, and a
 * trailing log. This suite was written BEFORE extracting that core — the file
 * had no tests at all, so the refactor needed something to prove itself against.
 *
 * The command executor is a plain handed-in fake and fs is mocked; nothing spawns.
 */

import * as fs from 'fs/promises';
import { ComponentDependencies } from '@/features/components/services/componentDependencies';
import { DEFAULT_SHELL } from '@/core/shell/defaultShell';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { TransformedComponentDefinition } from '@/types/components';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';

jest.mock('fs/promises');

const mockExecute = jest.fn();
/**
 * CONVERTED 2026-08-28 (ADR-015): the executor is handed IN now, so this suite
 * mocks the service registry NOT AT ALL — the fake is a plain object and the
 * assertions are unchanged.
 */
const executor = createMockCommandExecutor({ execute: mockExecute });

const mockedFs = fs as jest.Mocked<typeof fs>;

function logger(): Logger {
    return createMockLogger() as unknown as Logger;
}

function componentDef(
    overrides: Partial<TransformedComponentDefinition> = {}
): TransformedComponentDefinition {
    return {
        id: 'demo',
        name: 'Demo Component',
        configuration: { nodeVersion: '20' },
        ...overrides,
    } as TransformedComponentDefinition;
}

/** package.json present (fs.access resolves) or absent (it rejects). */
function packageJsonExists(exists: boolean): void {
    if (exists) {
        mockedFs.access.mockResolvedValue(undefined);
    } else {
        mockedFs.access.mockRejectedValue(new Error('ENOENT'));
    }
}

beforeEach(() => {
    jest.clearAllMocks();
    mockExecute.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
});

describe('ComponentDependencies', () => {
    describe('the shared install + build core', () => {
        // Asserted through BOTH entry points, since that is the behaviour the
        // extraction must keep identical.
        it.each([
            ['installNpmDependencies', false],
            ['installDependenciesForComponent', true],
        ])('%s runs npm install with the component Node version', async (method, needsSkipArg) => {
            packageJsonExists(true);
            const deps = new ComponentDependencies(logger(), executor);

            if (needsSkipArg) {
                await deps.installDependenciesForComponent('/p', componentDef(), false);
            } else {
                await deps.installNpmDependencies('/p', componentDef());
            }

            expect(mockExecute).toHaveBeenCalledWith(
                'npm install',
                expect.objectContaining({
                    cwd: '/p',
                    useNodeVersion: '20',
                    enhancePath: true,
                    timeout: TIMEOUTS.VERY_LONG,
                })
            );
        });

        it('honours a configured install timeout over the default', async () => {
            packageJsonExists(true);
            const deps = new ComponentDependencies(logger(), executor);

            await deps.installNpmDependencies(
                '/p',
                componentDef({ source: { type: 'git', timeouts: { install: 1234 } } })
            );

            expect(mockExecute).toHaveBeenCalledWith(
                'npm install',
                expect.objectContaining({ timeout: 1234 })
            );
        });

        it('runs the build script when configured, at the LONG timeout', async () => {
            packageJsonExists(true);
            const deps = new ComponentDependencies(logger(), executor);

            await deps.installNpmDependencies(
                '/p',
                componentDef({ configuration: { nodeVersion: '20', buildScript: 'build' } })
            );

            expect(mockExecute).toHaveBeenNthCalledWith(1, 'npm install', expect.anything());
            expect(mockExecute).toHaveBeenNthCalledWith(
                2,
                'npm run build',
                expect.objectContaining({ cwd: '/p', timeout: TIMEOUTS.LONG })
            );
        });

        it('skips the build step when no build script is configured', async () => {
            packageJsonExists(true);
            const deps = new ComponentDependencies(logger(), executor);

            await deps.installNpmDependencies('/p', componentDef());

            expect(mockExecute).toHaveBeenCalledTimes(1);
        });

        // Neither failure is fatal — a component can still be usable.
        it('WARNS rather than failing when npm install exits non-zero', async () => {
            packageJsonExists(true);
            const log = logger();
            mockExecute.mockResolvedValue({ code: 1, stdout: '', stderr: 'boom' });

            const result = await new ComponentDependencies(log, executor).installNpmDependencies(
                '/p',
                componentDef()
            );

            expect(log.warn).toHaveBeenCalledWith(
                expect.stringContaining('npm install had warnings')
            );
            expect(result).toEqual({ success: true });
        });

        it('WARNS rather than failing when the build exits non-zero', async () => {
            packageJsonExists(true);
            const log = logger();
            mockExecute
                .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' })
                .mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'build boom' });

            await new ComponentDependencies(log, executor).installNpmDependencies(
                '/p',
                componentDef({ configuration: { nodeVersion: '20', buildScript: 'build' } })
            );

            expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('Build failed'));
        });
    });

    // Where the two entry points legitimately differ.
    describe('installNpmDependencies', () => {
        it('returns success and installs nothing when there is no package.json', async () => {
            packageJsonExists(false);

            const result = await new ComponentDependencies(logger(), executor).installNpmDependencies(
                '/p',
                componentDef()
            );

            expect(result).toEqual({ success: true });
            expect(mockExecute).not.toHaveBeenCalled();
        });
    });

    describe('installDependenciesForComponent', () => {
        it('installs nothing when there is no package.json', async () => {
            packageJsonExists(false);

            const result = await new ComponentDependencies(
                logger(),
                executor
            ).installDependenciesForComponent('/p', componentDef(), false);

            expect(result).toEqual({ success: true });
            expect(mockExecute).not.toHaveBeenCalled();
        });

        // The gate the other entry point does not have.
        it('installs nothing when skipDependencies is set', async () => {
            packageJsonExists(true);

            const result = await new ComponentDependencies(
                logger(),
                executor
            ).installDependenciesForComponent('/p', componentDef(), true);

            expect(result).toEqual({ success: true });
            expect(mockExecute).not.toHaveBeenCalled();
        });

        it('reports success when the install and build both go through', async () => {
            packageJsonExists(true);

            const result = await new ComponentDependencies(
                logger(),
                executor
            ).installDependenciesForComponent('/p', componentDef(), false);

            expect(result).toEqual({ success: true });
        });
    });
});

// ─── strictInstall (AB-3) ────────────────────────────────────────────────────
// Measured live 2026-08-27: the starter kit (engine-strict node ^24) had npm
// REFUSE to install under the system node; the old warn-and-continue let the
// deploy proceed to a misleading downstream npx failure. strictInstall makes
// the refusal fatal with npm's own error — the actionable one.
describe('strictInstall', () => {
    beforeEach(() => jest.clearAllMocks());

    it('a failed npm install is FATAL for a strictInstall component, with npm stderr', async () => {
        packageJsonExists(true);
        mockExecute.mockResolvedValue({
            code: 1,
            stderr: 'npm error engine Unsupported engine\nnpm error notsup Required: {"node":"^24.0.0"}',
        });

        const result = await new ComponentDependencies(logger(), executor).installNpmDependencies(
            '/p',
            componentDef({ configuration: { strictInstall: true } })
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('npm install failed');
        expect(result.error).toContain('Unsupported engine');
    });

    it('installDependenciesForComponent surfaces the same fatal error', async () => {
        packageJsonExists(true);
        mockExecute.mockResolvedValue({ code: 1, stderr: 'npm error nope' });

        const result = await new ComponentDependencies(logger(), executor).installDependenciesForComponent(
            '/p',
            componentDef({ configuration: { strictInstall: true } }),
            false
        );

        expect(result).toEqual({ success: false, error: expect.stringContaining('nope') });
    });

    it('a NON-strict component keeps the historical warn-and-continue', async () => {
        packageJsonExists(true);
        mockExecute.mockResolvedValue({ code: 1, stderr: 'warnings' });

        const result = await new ComponentDependencies(logger(), executor).installNpmDependencies(
            '/p',
            componentDef()
        );

        expect(result).toEqual({ success: true });
    });
});

// ─── the optional shapes, and what the build call carries ────────────────────
// Every `?.` in this module guards a component definition that omits a whole
// block — `configuration` and `source` are both optional on the catalog type,
// and a storefront entry that declares neither is ordinary, not exotic. Removing
// any one of them throws a TypeError mid-install; measured 2026-09-06, no test
// entered any of those shapes.
describe('component definitions that omit a block', () => {
    it('installs with the default Node when the definition has no configuration', async () => {
        packageJsonExists(true);

        await new ComponentDependencies(logger(), executor).installNpmDependencies(
            '/p',
            componentDef({ configuration: undefined })
        );

        expect(mockExecute).toHaveBeenCalledWith(
            'npm install',
            expect.objectContaining({ useNodeVersion: null })
        );
    });

    it('still warns-and-continues on a failed install with no configuration', async () => {
        packageJsonExists(true);
        mockExecute.mockResolvedValue({ code: 1, stdout: '', stderr: 'boom' });

        const result = await new ComponentDependencies(logger(), executor).installNpmDependencies(
            '/p',
            componentDef({ configuration: undefined })
        );

        expect(result).toEqual({ success: true });
    });

    it('falls back to the default install timeout when the source declares none', async () => {
        packageJsonExists(true);

        await new ComponentDependencies(logger(), executor).installNpmDependencies(
            '/p',
            componentDef({ source: { type: 'git' } })
        );

        expect(mockExecute).toHaveBeenCalledWith(
            'npm install',
            expect.objectContaining({ timeout: TIMEOUTS.VERY_LONG })
        );
    });
});

describe('the build step', () => {
    const withBuild = () =>
        componentDef({ configuration: { nodeVersion: '20', buildScript: 'build' } });

    it('runs under the component Node version, on an enhanced PATH, in the default shell', async () => {
        packageJsonExists(true);

        await new ComponentDependencies(logger(), executor).installNpmDependencies(
            '/p',
            withBuild()
        );

        expect(mockExecute).toHaveBeenNthCalledWith(
            2,
            'npm run build',
            expect.objectContaining({
                enhancePath: true,
                useNodeVersion: '20',
                shell: DEFAULT_SHELL,
            })
        );
    });

    it('says nothing when the build succeeds', async () => {
        packageJsonExists(true);
        const log = logger();

        await new ComponentDependencies(log, executor).installNpmDependencies('/p', withBuild());

        expect(log.warn).not.toHaveBeenCalled();
    });
});

// The detail a strictInstall failure carries is the ONLY npm output the user
// sees — the deploy that follows would otherwise bury it under an npx failure.
describe('the strictInstall failure detail', () => {
    const strict = () => componentDef({ configuration: { strictInstall: true } });

    it('is the last six lines of npm stderr, joined into one line', async () => {
        packageJsonExists(true);
        mockExecute.mockResolvedValue({
            code: 1,
            stderr: ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'].join('\n'),
        });

        const result = await new ComponentDependencies(logger(), executor).installNpmDependencies(
            '/p',
            strict()
        );

        expect(result.error).toBe(
            'npm install failed for Demo Component: three four five six seven eight'
        );
    });

    it('falls back to the exit code when npm printed nothing at all', async () => {
        packageJsonExists(true);
        mockExecute.mockResolvedValue({ code: 137 });

        const result = await new ComponentDependencies(logger(), executor).installNpmDependencies(
            '/p',
            strict()
        );

        expect(result.error).toBe(
            'npm install failed for Demo Component: npm install exited with code 137'
        );
    });

    it('a strictInstall component whose install SUCCEEDS is not a failure', async () => {
        packageJsonExists(true);

        const result = await new ComponentDependencies(logger(), executor).installNpmDependencies(
            '/p',
            strict()
        );

        expect(result).toEqual({ success: true });
    });
});
