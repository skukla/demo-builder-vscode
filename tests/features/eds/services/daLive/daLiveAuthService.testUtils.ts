/**
 * Shared setup for the daLiveAuthService suites — THE AGREED PART ONLY.
 *
 * This family does NOT agree about how to fake all of its dependencies, and
 * picking a winner would change what some suites exercise while every one of
 * them stayed green. So only the mocks that EVERY spec already declared
 * IDENTICALLY were moved here. Each spec keeps its own disputed mocks inline,
 * and therefore ends up with exactly the set it started with.
 *
 * Moved here (all specs agreed): @/core/logging, vscode
 * Left inline (specs disagree):  @/features/eds/services/daAuthHelperToken
 *
 * Extracted 2026-08-30 (lane C2). Resolving the disputed ones is a separate
 * decision, deliberately not taken here.
 */

import { DaLiveAuthService } from '@/features/eds/services/daLive/daLiveAuthService';
import { ExtensionContext } from 'vscode';

// Mock vscode before imports
jest.mock('vscode', () => ({
    env: {
        openExternal: jest.fn().mockResolvedValue(true),
    },
    Uri: {
        parse: jest.fn((s: string) => s),
    },
    EventEmitter: require('../../../../helpers/vscodeEventEmitter').VscodeEventEmitter,
}));
// Mock logger

export { DaLiveAuthService };
export { ExtensionContext };
