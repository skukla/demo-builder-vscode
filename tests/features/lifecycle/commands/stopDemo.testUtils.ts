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
import { ServiceLocator as _ServiceLocator } from '@/core/di/serviceLocator';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';

// Mock ProcessCleanup
jest.mock('@/core/shell/processCleanup');
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getCommandExecutor: jest.fn(() => mockCommandExecutor),
        reset: jest.fn(),
    },
}));
// Mock logging
// Mock ServiceLocator for CommandExecutor (lsof commands)
const mockCommandExecutor = createMockCommandExecutor({ execute: jest.fn() });

export { StopDemoCommand };
export { ProcessCleanup };
export { _ServiceLocator };

export {
    mockCommandExecutor,
};

import type { Project } from '@/types/base';
import type { StateManager } from '@/types/state';
import type { Logger } from '@/types/logger';
import type * as vscode from 'vscode';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import {
    createMockTerminal,
    mockCommands,
    mockWindow,
    mockWorkspace,
} from '../../../helpers/vscodeMockViews';

/** A running project with one EDS frontend on 3000 — what stopping acts on. */
export function runningProject(overrides: Partial<Project> = {}): Project {
    return createMockProject({
        name: 'test-project',
        path: '/test/path',
        status: 'running',
        componentInstances: {
            eds: {
                id: 'eds',
                name: 'Edge Delivery Services',
                type: 'frontend',
                status: 'running',
                port: 3000,
            },
        } as unknown as Project['componentInstances'],
        ...overrides,
    });
}

export interface StopDemoHarness {
    command: StopDemoCommand;
    mockContext: jest.Mocked<vscode.ExtensionContext>;
    mockStateManager: jest.Mocked<StateManager>;
    mockLogger: jest.Mocked<Logger>;
    mockProcessCleanup: jest.Mocked<ProcessCleanup>;
    mockTerminal: ReturnType<typeof createMockTerminal>;
}

/**
 * Everything the stop-demo suites set up before each test — 93 lines, identical
 * in two of the three.
 *
 * The vscode surface is stubbed here too (`withProgress` running its task
 * straight through, the status-bar message, `executeCommand`, and a
 * configuration returning port 3000), because a suite that omitted any of them
 * failed on an unrelated missing function rather than on its subject.
 */
export function setupStopDemo(project: Project = runningProject()): StopDemoHarness {
    const mockTerminal = createMockTerminal({
        name: 'test-project - Frontend',
        dispose: jest.fn(),
    });
    mockWindow.terminals = [mockTerminal];

    const mockProcessCleanup = {
        killProcessTree: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ProcessCleanup>;
    (ProcessCleanup as jest.MockedClass<typeof ProcessCleanup>).mockImplementation(
        () => mockProcessCleanup
    );

    // lsof answers with a PID by default; a suite about "nothing on the port"
    // overrides it.
    mockCommandExecutor.execute.mockResolvedValue({
        code: 0,
        stdout: '12345',
        stderr: '',
        duration: 0,
    });

    const mockContext = createMockExtensionContext({
        extensionPath: '/mock/extension/path',
    }) as unknown as jest.Mocked<vscode.ExtensionContext>;

    const mockStateManager = createMockStateManager({
        getCurrentProject: jest.fn().mockResolvedValue(project),
        saveProject: jest.fn().mockResolvedValue(undefined),
    }) as jest.Mocked<StateManager>;

    const mockLogger = createMockLogger() as jest.Mocked<Logger>;

    mockWindow.withProgress = jest
        .fn()
        .mockImplementation(async (_options: unknown, task: (p: unknown) => unknown) =>
            task({ report: jest.fn() })
        );
    mockWindow.setStatusBarMessage = jest.fn();
    mockCommands.executeCommand = jest.fn().mockResolvedValue(undefined);
    mockWorkspace.getConfiguration = jest.fn().mockReturnValue({
        get: jest.fn().mockReturnValue(3000),
    });

    const command = new StopDemoCommand(mockContext, mockStateManager, mockLogger);
    return { command, mockContext, mockStateManager, mockLogger, mockProcessCleanup, mockTerminal };
}
