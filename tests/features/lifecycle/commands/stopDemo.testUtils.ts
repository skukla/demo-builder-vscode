/**
 * Shared setup for the stopDemo suites — THE AGREED PART ONLY.
 *
 * This family does NOT agree about how to fake all of its dependencies, and
 * picking a winner would change what some suites exercise while every one of
 * them stayed green. So only the mocks that EVERY spec already declared
 * IDENTICALLY were moved here. Each spec keeps its own disputed mocks inline,
 * and therefore ends up with exactly the set it started with.
 *
 * Moved here (all specs agreed): @/core/di, @/core/logging, @/core/shell/processCleanup
 * Left inline (specs disagree):  @/core/utils/sleep
 *
 * Extracted 2026-08-30 (lane C2). Resolving the disputed ones is a separate
 * decision, deliberately not taken here.
 */

import { StopDemoCommand } from '@/features/lifecycle/commands/stopDemo';
import { ProcessCleanup } from '@/core/shell/processCleanup';
import { ServiceLocator as _ServiceLocator } from '@/core/di';

// Mock ProcessCleanup
jest.mock('@/core/shell/processCleanup');
jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getCommandExecutor: jest.fn(() => mockCommandExecutor),
        reset: jest.fn(),
    },
}));
// Mock logging
// Mock ServiceLocator for CommandExecutor (lsof commands)
const mockCommandExecutor = {
    execute: jest.fn(),
};

export { StopDemoCommand };
export { ProcessCleanup };
export { _ServiceLocator };

export {
    mockCommandExecutor,
};
