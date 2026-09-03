/**
 * Shared preamble for the extension-activation suites
 * (extension-activation-navigation, extension-context).
 *
 * Both suites drove the REAL activate() through an identical ~220-line mock
 * scaffold, duplicated wholesale (PL-9's top cluster, 5 clones). The scaffold
 * lives here once; per webview-test-authoring §3 this file also owns the SUT
 * import — a spec importing `../src/extension` directly would bind it before
 * these mocks register. Specs import EVERYTHING from here, `vscode` included.
 */

jest.mock('@/core/logging/debugLogger', () => {
    const { createMockLogger } = require('./helpers/loggerFake');
    // initializeLogger hands back a DebugLogger, which is a Logger plus three
    // methods the canonical builder deliberately excludes (nothing else in the
    // corpus fakes them). The builder supplies the Logger surface; the extras
    // stay explicit so it is visible that they are NOT part of Logger.
    return {
        initializeLogger: jest.fn(() => ({
            ...createMockLogger(),
        replayLogsFromFile: jest.fn().mockResolvedValue(undefined),
        show: jest.fn(),
        showDebug: jest.fn(),
        })),
        getLogger: jest.fn(() => createMockLogger()),
    };
});



// StateManager knobs the specs steer per test.
export const mockHasProject = jest.fn();
export const mockInitialize = jest.fn();
export const mockGetCurrentProject = jest.fn();
export const mockOnProjectChanged = {
    event: jest.fn(() => ({ dispose: jest.fn() })),
};

jest.mock('@/core/state/stateManager', () => ({
    StateManager: jest.fn().mockImplementation(() => ({
        initialize: mockInitialize.mockResolvedValue(undefined),
        hasProject: mockHasProject,
        getCurrentProject: mockGetCurrentProject,
        onProjectChanged: mockOnProjectChanged.event,
        dispose: jest.fn(),
    })),
}));

jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        setSidebarProvider: jest.fn(),
        setCommandExecutor: jest.fn(),
        setAuthenticationService: jest.fn(),
        setStateManager: jest.fn(),
        setSecretStorage: jest.fn(),
        getSecretStorage: jest.fn(() => null),
        reset: jest.fn(),
    },
}));

jest.mock('@/features/sidebar/providers/sidebarProvider', () => ({
    SidebarProvider: jest.fn().mockImplementation(() => ({
        viewId: 'demoBuilder.sidebar',
    })),
}));

jest.mock('@/features/authentication/services/authenticationService', () => ({
    AuthenticationService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@/commands/commandManager', () => ({
    CommandManager: jest.fn().mockImplementation(() => ({
        registerCommands: jest.fn(),
    })),
}));

jest.mock('@/core/vscode/workspaceWatcherManager', () => ({
    WorkspaceWatcherManager: jest.fn().mockImplementation(() => ({
        dispose: jest.fn(),
    })),
}));

jest.mock('@/core/vscode/envFileWatcherService', () => ({
    EnvFileWatcherService: jest.fn().mockImplementation(() => ({
        initialize: jest.fn(),
        dispose: jest.fn(),
    })),
}));

jest.mock('@/core/shell/commandExecutor', () => ({
    CommandExecutor: jest.fn().mockImplementation(() => ({
        dispose: jest.fn(),
    })),
}));

jest.mock('@/utils/autoUpdater', () => ({
    AutoUpdater: jest.fn().mockImplementation(() => ({
        checkForUpdates: jest.fn().mockResolvedValue(undefined),
        dispose: jest.fn(),
    })),
}));

// Deterministic filesystem: the onboarding flag file "doesn't exist" on every
// machine, instead of whatever the runner's real home directory holds.
jest.mock('fs/promises', () => ({
    access: jest.fn().mockRejectedValue(new Error('ENOENT')),
    readFile: jest.fn().mockRejectedValue(new Error('ENOENT')),
    unlink: jest.fn().mockResolvedValue(undefined),
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
}));


// The SUT and the mocked vscode module — imported AFTER the mocks above
// register (jest hoists the mock calls over these imports within this module),
// and re-exported so specs never bind the real ones.
import * as vscode from 'vscode';
import { createMockExtensionContext as createMockExtensionContextBase } from './helpers/extensionContextFake';
export { activate, deactivate, shouldReHomeToRoot } from '../src/extension';
export { vscode };

/**
 * The activation harness's context.
 *
 * RENAMED from `createMockExtensionContext` 2026-08-28: it now delegates to the
 * canonical fake, and a delegating wrapper that keeps the canonical's name is
 * still a second definition of it.
 *
 * Delegates to the canonical base (ADR-016) and keeps this suite's own
 * extensionPath — activation assertions reference '/mock/extension/path', so
 * inheriting the canonical default would have moved them.
 */
export function createActivationContext(): vscode.ExtensionContext {
    return createMockExtensionContextBase({}, '/mock/extension/path');
}
