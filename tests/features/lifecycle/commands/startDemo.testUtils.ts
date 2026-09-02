/**
 * Shared setup for the StartDemoCommand suites.
 *
 * THIS FILE OWNS THE MOCKS AND THE SUT IMPORT. Specs import `StartDemoCommand`
 * (and the mock handles) from HERE, never from `@/features/...`, and declare no
 * `jest.mock` calls of their own.
 *
 * Why: `babel-plugin-jest-hoist` lifts `jest.mock` above the imports of the module
 * it appears in — not across modules. A spec importing the command directly could
 * load it before these mocks were registered, binding it to the real ProcessCleanup
 * and the real CommandExecutor. Re-exporting the command from here removes the
 * ordering question (`webview-test-authoring` §3; 59 precedents in this repo).
 *
 * Extracted 2026-08-30 (lane C1). The block below was byte-identical in
 * startDemo.lifecycle / .portConflict / .error — verified before it moved.
 * startDemo.concurrency declares no mocks and is deliberately untouched.
 *
 * Note the mocked `fs.promises.access` REJECTS by default: the command treats a
 * successful access as "the project directory is there". Tests that need it to
 * succeed override it themselves.
 */

import { ProcessCleanup } from '@/core/shell/processCleanup';

// Mock ProcessCleanup
jest.mock('@/core/shell/processCleanup');
const MockProcessCleanup = ProcessCleanup as jest.MockedClass<typeof ProcessCleanup>;

// Mock fs.promises for file access checks
jest.mock('fs', () => ({
    promises: {
        access: jest.fn().mockRejectedValue(new Error('ENOENT')),
    },
}));

// Mock ServiceLocator for CommandExecutor
const mockCommandExecutor = {
    execute: jest.fn(),
    isPortAvailable: jest.fn(),
};
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getCommandExecutor: jest.fn(() => mockCommandExecutor),
        reset: jest.fn(),
    },
}));

// Mock logging

// The SUT, re-exported so specs never import it directly — see the header.
export { StartDemoCommand } from '@/features/lifecycle/commands/startDemo';

// The mocked collaborators the specs drive and assert against.
export { ProcessCleanup, MockProcessCleanup, mockCommandExecutor };

/**
 * The writable views moved to `tests/helpers/vscodeMockViews.ts` on 2026-09-01 —
 * the same shape was in 10 files across four features, so it belongs beside the other
 * canonical fakes rather than in one family's setup. Re-exported so this family's
 * specs keep importing from here.
 */
export { mockWindow, mockCommands, mockWorkspace } from '../../../helpers/vscodeMockViews';
