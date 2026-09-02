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

import type { Project } from '@/types/base';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import type * as vscode from 'vscode';
import type { StateManager } from '@/types/state';

/**
 * The project the start-demo suites drive: one frontend component, ready, on 3000.
 *
 * Built on the canonical `createMockProject` rather than a literal — the
 * canonical-fakes enforcer caught the first version of this helper doing exactly
 * what it exists to stop, "a new fake bypassed the builder", and it was right.
 * Only the component instance is specific to these suites.
 */
export function startableProject(overrides: Partial<Project> = {}): Project {
    return createMockProject({
        name: 'test-project',
        path: '/test/path',
        status: 'ready',
        componentInstances: {
            headless: {
                id: 'headless',
                name: 'CitiSignal Frontend',
                type: 'frontend',
                status: 'ready',
                path: '/test/path/frontend',
                port: 3000,
                metadata: { nodeVersion: '20' },
            },
        } as unknown as Project['componentInstances'],
        ...overrides,
    });
}

/** A state manager holding {@link startableProject}. */
export function startableStateManager(project: Project = startableProject()): StateManager {
    return createMockStateManager({
        getCurrentProject: jest.fn().mockResolvedValue(project),
        saveProject: jest.fn().mockResolvedValue(undefined),
    });
}

/**
 * The extension context these suites hand the command.
 *
 * Built from the canonical fake rather than the four-field literal each suite had
 * behind an `as any` — the cast was load-bearing precisely because the literal was
 * not an ExtensionContext.
 */
export function startDemoExtensionContext(): jest.Mocked<vscode.ExtensionContext> {
    return createMockExtensionContext({
        extensionPath: '/mock/extension/path',
    }) as unknown as jest.Mocked<vscode.ExtensionContext>;
}

/** The terminal the command creates, with the calls these suites assert on. */
export function fakeTerminal(name = 'test-project - Frontend'): {
    name: string;
    dispose: jest.Mock;
    sendText: jest.Mock;
    show: jest.Mock;
} {
    return { name, dispose: jest.fn(), sendText: jest.fn(), show: jest.fn() };
}
