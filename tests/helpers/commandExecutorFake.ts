/**
 * The canonical CommandExecutor fake (ADR-016 § Fixtures).
 *
 * NINE definitions existed under two names. `createMockCommandManager` (4,
 * byte-identical) and `createMockCommandExecutor` (5) are the same subject —
 * "manager" is the legacy name for the same collaborator — which grouping by
 * function name concealed.
 *
 * They ranged from `{ execute: jest.fn() }` to the full ten-method surface, and
 * one carried a mesh-specific canned response as its default. A caller of the
 * minimal one that reached for `executeExclusive` got `undefined is not a
 * function`; a caller of the full one got a working stub. Same name, different
 * capability.
 *
 * The method list is read from `src/core/shell/commandExecutor.ts`, not
 * remembered (ADR-016 rule 3), and the return type is the real class, so this
 * file stops compiling when that surface changes.
 */

import type { CommandExecutor } from '@/core/shell/commandExecutor';

/**
 * @param overrides - give a method real behaviour, e.g.
 *   `{ execute: jest.fn().mockResolvedValue(createSuccessResult('...')) }`.
 */
export function createMockCommandExecutor(
    overrides: Partial<Record<keyof CommandExecutor, unknown>> = {}
): jest.Mocked<CommandExecutor> {
    return {
        execute: jest.fn(),
        executeExclusive: jest.fn(),
        pollUntilCondition: jest.fn(),
        waitForFileSystem: jest.fn(),
        executeSequence: jest.fn(),
        executeParallel: jest.fn(),
        queueCommand: jest.fn(),
        commandExists: jest.fn(),
        isPortAvailable: jest.fn(),
        dispose: jest.fn(),
        ...overrides,
    } as unknown as jest.Mocked<CommandExecutor>;
}
