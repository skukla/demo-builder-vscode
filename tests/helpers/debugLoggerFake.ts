/**
 * The canonical `DebugLogger` fake (ADR-016 § Fixtures).
 *
 * WHY IT EXISTS, and why it is NOT the `Logger` fake. `DebugLogger` is a different
 * interface from `Logger` and both are on `HandlerContext` at once — `logger` and
 * `debugLogger`. `Logger` is the four levels; `DebugLogger` is a CLASS wrapping two
 * VS Code output channels, with `show`, `hide`, `exportDebugLog`, `saveLogsToFile`
 * and a dozen more, plus seven private fields no literal can satisfy.
 *
 * That distinction has now cost two mistakes on this programme, both mine, both
 * caught by something other than review:
 *
 *   Sweeping `debugLogger`, `stepLogger` and `errorLogger` together because the
 *   names rhyme — three different interfaces. 37 tests failed, and the COMPILER did
 *   not object, because those fields are optional on `HandlerContext`.
 *
 *   Then handing `createMockLogger()` to `runDiagnosticsAction`, which declares
 *   `DebugLogger`. That one the compiler DID catch, by name: `'show' does not exist
 *   in type Partial<Mocked<Logger>>`.
 *
 * Twenty-one files hand-roll some subset of this shape today. Most need two or three
 * methods, which is why the subsets drift — and a subset silently becomes wrong the
 * moment production reaches for a fourth.
 */

import type { DebugLogger } from '@/core/logging/debugLogger';

/**
 * A `DebugLogger` whose every method is a jest mock.
 *
 * @param overrides - methods to replace. Typed, so a member that is not on
 *   `DebugLogger` fails `typecheck:tests` rather than quietly faking one the real
 *   class does not have — which is the mistake this file exists to stop.
 */
export function createMockDebugLogger(
    overrides: Partial<jest.Mocked<DebugLogger>> = {}
): jest.Mocked<DebugLogger> {
    return {
        // --- the four levels, shared with Logger ---
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        trace: jest.fn(),

        // --- the channels, which is what makes this NOT a Logger ---
        show: jest.fn(),
        showDebug: jest.fn(),
        hide: jest.fn(),
        hideDebug: jest.fn(),
        clear: jest.fn(),
        clearDebug: jest.fn(),
        dispose: jest.fn(),

        // --- log capture and export ---
        getLogContent: jest.fn().mockReturnValue(''),
        exportDebugLog: jest.fn().mockResolvedValue(undefined),
        saveLogsToFile: jest.fn().mockResolvedValue(undefined),
        replayLogsFromFile: jest.fn().mockResolvedValue(undefined),
        logCommand: jest.fn(),
        logEnvironment: jest.fn(),

        ...overrides,
        // The class carries seven private fields, so no literal can BE one. The cast
        // names its target and lives here once, rather than at every call site.
    } as unknown as jest.Mocked<DebugLogger>;
}
