/**
 * A plain fake of CommandExecutor's machinery.
 *
 * WHY THIS EXISTS. Until 2026-08-28, `CommandExecutor` built its seven
 * collaborators in its own constructor, so a test had no way to reach past them
 * except to intercept the modules. Every executor suite therefore opened with
 * the same six lines:
 *
 *     jest.mock('@/core/shell/commandSequencer');
 *     jest.mock('@/core/shell/environmentSetup');
 *     jest.mock('@/core/shell/fileWatcher');
 *     jest.mock('@/core/shell/pollingService');
 *     jest.mock('@/core/shell/resourceLocker');
 *     jest.mock('@/core/shell/retryStrategyManager');
 *
 * ADR-015 moved those collaborators into a constructor argument. This builder is
 * what replaces the block: one object, handed in, with every method a jest.fn().
 *
 * The method lists below are the methods `CommandExecutor` actually calls, read
 * from the source rather than from the classes' full surfaces — a fake that
 * mirrors a whole class drifts the moment the class grows a method nobody uses.
 *
 * Per PL-16: shared builders are what stop every suite inventing its own fake.
 */

import type { CommandExecutorDeps } from '@/core/shell/commandExecutor';
import { CommandResultCache } from '@/core/shell/commandResultCache';

/** Build an object whose every named key is a fresh jest.fn(). */
function fns<K extends string>(...names: K[]): Record<K, jest.Mock> {
    return Object.fromEntries(names.map((n) => [n, jest.fn()])) as Record<K, jest.Mock>;
}

/**
 * The machinery, all fake. Pass `overrides` to give one part real behaviour —
 * e.g. a retryManager whose executeWithRetry actually invokes its callback.
 */
export function createFakeCommandExecutorDeps(
    overrides: Partial<CommandExecutorDeps> = {}
): CommandExecutorDeps {
    const deps = {
        // Defaults copied from the class-mocking block this replaces
        // (tests/core/shell/commandExecutor.testUtils.ts), so behaviour is
        // unchanged: the environment resolves, and the two wrappers below call
        // straight through instead of swallowing their callback.
        environmentSetup: {
            ...fns('resetSession'),
            findAdobeCLINodeVersion: jest.fn().mockResolvedValue('18'),
            findFnmPath: jest.fn().mockReturnValue('/usr/local/bin/fnm'),
            findNpmGlobalPaths: jest.fn().mockReturnValue(['/usr/local/lib/node_modules/.bin']),
            ensureAdobeCLIConfigured: jest.fn().mockResolvedValue(undefined),
            ensureAdobeCLINodeVersion: jest.fn().mockResolvedValue(undefined),
        },
        retryManager: {
            // PASS-THROUGH: a retry manager that does not invoke its callback
            // makes every command silently do nothing.
            executeWithRetry: jest.fn((executeFn: () => Promise<unknown>) => executeFn()),
            getDefaultStrategy: jest.fn(() => ({
                maxAttempts: 1,
                initialDelay: 1000,
                maxDelay: 5000,
                backoffFactor: 2,
            })),
            getStrategy: jest.fn(() => ({
                maxAttempts: 2,
                initialDelay: 1000,
                maxDelay: 5000,
                backoffFactor: 1.5,
            })),
        },
        resourceLocker: {
            // PASS-THROUGH, same reason.
            executeExclusive: jest.fn(<T>(_resource: string, operation: () => Promise<T>) =>
                operation()
            ),
            clearAllLocks: jest.fn(),
        },
        pollingService: fns('pollUntilCondition'),
        fileWatcher: fns('disposeAll', 'waitForFileSystem'),
        commandSequencer: fns('executeParallel', 'executeSequence'),
        // REAL, deliberately. CommandResultCache was never among the six
        // modules the old suites mocked, so they exercised the real cache — and
        // at least one asserts that a second `aio --version` is served from it.
        // A stub here would have quietly turned that test into a no-op.
        resultCache: new CommandResultCache(),
    } as unknown as CommandExecutorDeps;

    return { ...deps, ...overrides };
}
