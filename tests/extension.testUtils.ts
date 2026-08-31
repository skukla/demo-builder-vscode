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

jest.mock('@/core/logging/debugLogger', () => ({
    initializeLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        replayLogsFromFile: jest.fn().mockResolvedValue(undefined),
        show: jest.fn(),
        showDebug: jest.fn(),
    })),
    getLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

jest.mock('@/core/logging', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
    initializeLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        replayLogsFromFile: jest.fn().mockResolvedValue(undefined),
        show: jest.fn(),
        showDebug: jest.fn(),
    })),
    getLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

// StateManager knobs the specs steer per test.
export const mockHasProject = jest.fn();
export const mockInitialize = jest.fn();
export const mockGetCurrentProject = jest.fn();
export const mockOnProjectChanged = {
    event: jest.fn(() => ({ dispose: jest.fn() })),
};

jest.mock('@/core/state', () => ({
    StateManager: jest.fn().mockImplementation(() => ({
        initialize: mockInitialize.mockResolvedValue(undefined),
        hasProject: mockHasProject,
        getCurrentProject: mockGetCurrentProject,
        onProjectChanged: mockOnProjectChanged.event,
        dispose: jest.fn(),
    })),
}));

jest.mock('@/core/di', () => ({
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

jest.mock('@/core/vscode', () => ({
    WorkspaceWatcherManager: jest.fn().mockImplementation(() => ({
        dispose: jest.fn(),
    })),
    EnvFileWatcherService: jest.fn().mockImplementation(() => ({
        initialize: jest.fn(),
        dispose: jest.fn(),
    })),
}));

jest.mock('@/core/shell', () => ({
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

jest.mock('vscode', () => ({
    workspace: {
        isTrusted: true,
        getConfiguration: jest.fn(() => ({
            get: jest.fn().mockReturnValue(false), // Disable auto-update for tests
        })),
        onDidChangeConfiguration: jest.fn(() => ({ dispose: jest.fn() })),
        workspaceFolders: [],
    },
    window: {
        // activate() creates the Agent Activity channel (AI-2c).
        createOutputChannel: jest.fn(() => ({ appendLine: jest.fn(), dispose: jest.fn() })),
        createTreeView: jest.fn(() => ({
            title: '',
            dispose: jest.fn(),
        })),
        registerWebviewViewProvider: jest.fn(() => ({ dispose: jest.fn() })),
        showWarningMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        activeColorTheme: { kind: 2 },
    },
    commands: {
        registerCommand: jest.fn(() => ({ dispose: jest.fn() })),
        executeCommand: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
    },
    Uri: {
        file: (path: string) => ({ fsPath: path, path }),
    },
    EventEmitter: class {
        private _listeners: Array<(data: unknown) => void> = [];
        get event() {
            return (listener: (data: unknown) => void) => {
                this._listeners.push(listener);
                return { dispose: jest.fn() };
            };
        }
        fire(data?: unknown) {
            this._listeners.forEach((listener) => listener(data));
        }
        dispose() {
            this._listeners = [];
        }
    },
    ExtensionMode: {
        Test: 3,
    },
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
