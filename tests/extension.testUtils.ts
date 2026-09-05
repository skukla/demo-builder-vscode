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
    // Typed so `mock.calls[0][0]` is the LISTENER rather than an empty tuple —
    // a bare `jest.fn(() => ...)` infers no parameters and the specs that capture
    // the callback then fail to compile.
    event: jest.fn((_listener: (project: { name?: string } | undefined) => void) => ({
        dispose: jest.fn(),
    })),
};
/**
 * The activation SWEEPS read the project list. Without these the very first call
 * in `loadAllProjects` threw, each sweep's own catch swallowed it, and all four
 * upkeep passes were no-ops that no test could tell apart from working ones.
 */
export const mockGetAllProjects = jest.fn();
export const mockLoadProjectFromPath = jest.fn();
export const mockSaveProjectConfigOnly = jest.fn();
export const mockStateManagerDispose = jest.fn();

jest.mock('@/core/state/stateManager', () => ({
    StateManager: jest.fn().mockImplementation(() => ({
        initialize: mockInitialize.mockResolvedValue(undefined),
        hasProject: mockHasProject,
        getCurrentProject: mockGetCurrentProject,
        onProjectChanged: mockOnProjectChanged.event,
        getAllProjects: mockGetAllProjects,
        loadProjectFromPath: mockLoadProjectFromPath,
        saveProjectConfigOnly: mockSaveProjectConfigOnly,
        dispose: mockStateManagerDispose,
    })),
}));

/**
 * The four activation upkeep sweeps. Stubbed so their ARGUMENTS are readable —
 * the glue in extension.ts is what these tests are about, and the decision each
 * sweep makes lives in its own module with its own suite.
 */
export const mockRefreshAiBundles = jest.fn();
export const mockRenewPublishKeys = jest.fn();
export const mockSweepCommerceSecrets = jest.fn();
export const mockSweepManifestFormat = jest.fn();

jest.mock('@/features/project-creation/services/aiBundle/aiBundleActivationRefresh', () => ({
    refreshAiBundlesOnActivation: (...a: unknown[]) => mockRefreshAiBundles(...a),
}));
jest.mock('@/features/eds/services/pdp/publishKeyRenewalSweep', () => ({
    renewPublishKeys: (...a: unknown[]) => mockRenewPublishKeys(...a),
}));
jest.mock('@/features/components/services/commerceSecretSweep', () => ({
    sweepCommerceSecrets: (...a: unknown[]) => mockSweepCommerceSecrets(...a),
}));
jest.mock('@/core/state/manifestFormatSweep', () => ({
    sweepManifestFormat: (...a: unknown[]) => mockSweepManifestFormat(...a),
}));

/**
 * The in-extension MCP server, stubbed.
 *
 * Unmocked it binds a REAL Unix socket on every activation, and these suites
 * activate ~50 times — which pushed individual tests past jest's 10s budget and
 * past Stryker's 5s sandbox budget non-deterministically. The server has its own
 * suite; what activation owes it is the OPTIONS, which this makes readable.
 */
export const mockMcpStart = jest.fn();
export const mockMcpDispose = jest.fn();
export const mockMcpServerCtor = jest.fn();
jest.mock('@/features/ai/server/inExtensionMcpServer', () => ({
    InExtensionMcpServer: jest.fn().mockImplementation((...args: unknown[]) => {
        mockMcpServerCtor(...args);
        return {
            start: mockMcpStart.mockResolvedValue(undefined),
            dispose: mockMcpDispose,
            registerTool: jest.fn(),
            server: { registerTool: jest.fn() },
        };
    }),
}));

/**
 * The READERS matter as much as the writers. Activation registers its services
 * and then reads them back to build the MCP server's context factory; a locator
 * that only has setters throws there — inside activation's own try/catch, so the
 * error is logged and swallowed and every later line silently never runs.
 */
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        setSidebarProvider: jest.fn(),
        setCommandExecutor: jest.fn(),
        setAuthenticationService: jest.fn(),
        setStateManager: jest.fn(),
        setSecretStorage: jest.fn(),
        getSecretStorage: jest.fn(() => null),
        getCommandExecutor: jest.fn(() => ({ execute: jest.fn(), dispose: jest.fn() })),
        getAuthenticationService: jest.fn(() => ({ dispose: jest.fn() })),
        getStateManager: jest.fn(() => undefined),
        getSidebarProvider: jest.fn(() => undefined),
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

export const mockWatcherManagerCtor = jest.fn();
jest.mock('@/core/vscode/workspaceWatcherManager', () => ({
    WorkspaceWatcherManager: jest.fn().mockImplementation(() => {
        mockWatcherManagerCtor();
        return { dispose: jest.fn() };
    }),
}));

export const mockEnvWatcherInitialize = jest.fn();
jest.mock('@/core/vscode/envFileWatcherService', () => ({
    EnvFileWatcherService: jest.fn().mockImplementation(() => ({
        initialize: mockEnvWatcherInitialize,
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
    // The home AI-context writer reaches for `rm`. Absent, it threw and the
    // best-effort wrapper reported "could not write home AI context" on every run.
    rm: jest.fn().mockResolvedValue(undefined),
    readdir: jest.fn().mockResolvedValue([]),
    stat: jest.fn().mockRejectedValue(new Error('ENOENT')),
}));


/**
 * The home AI-context writers and the global-MCP repair. All three are
 * best-effort file work with their own suites; here they are seams whose
 * ARGUMENTS say whether activation wired them right.
 */
export const mockEnsureHomeAiContext = jest.fn();
export const mockRefreshHomeAgentsMd = jest.fn();
jest.mock('@/features/project-creation/services/aiBundle/homeAiContextWriter', () => ({
    ensureHomeAiContext: (...a: unknown[]) => mockEnsureHomeAiContext(...a),
    refreshHomeAgentsMd: (...a: unknown[]) => mockRefreshHomeAgentsMd(...a),
}));

export const mockRefreshGlobalMcpIfPresent = jest.fn();
jest.mock('@/features/project-creation/services/aiBundle/globalMcpRegistration', () => ({
    ...jest.requireActual('@/features/project-creation/services/aiBundle/globalMcpRegistration'),
    refreshGlobalMcpIfPresent: (...a: unknown[]) => mockRefreshGlobalMcpIfPresent(...a),
}));

/**
 * The DA.live session, the EW-setting listener, and the two palette commands
 * activation registers callbacks for. Each is a seam whose ARGUMENTS say whether
 * activation wired it right; their own behaviour has its own suites.
 */
export const mockOnDidSignIn = jest.fn((_listener: () => void) => ({ dispose: jest.fn() }));
export const mockGetAccessToken = jest.fn();
export const mockGetGitHubToken = jest.fn();
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    ...jest.requireActual('@/features/eds/handlers/edsHelpers'),
    getDaLiveAuthService: jest.fn(() => ({
        onDidSignIn: (listener: () => void) => mockOnDidSignIn(listener),
        getAccessToken: (...a: unknown[]) => mockGetAccessToken(...a),
        dispose: jest.fn(),
    })),
    getGitHubServices: jest.fn(() => ({
        tokenService: { getToken: (...a: unknown[]) => mockGetGitHubToken(...a) },
    })),
}));

export const mockRegisterEwListener = jest.fn((_options: Record<string, unknown>) => ({
    dispose: jest.fn(),
}));
jest.mock('@/features/eds/services/ewSettingChangeListener', () => ({
    registerEwSettingChangeListener: (options: Record<string, unknown>) =>
        mockRegisterEwListener(options),
}));

export const mockCleanupDaLiveSitesCommand = jest.fn();
jest.mock('@/features/eds/commands/cleanupDaLiveSites', () => ({
    cleanupDaLiveSitesCommand: (...a: unknown[]) => mockCleanupDaLiveSitesCommand(...a),
}));
export const mockManageGitHubReposCommand = jest.fn();
jest.mock('@/features/eds/commands/manageGitHubRepos', () => ({
    manageGitHubReposCommand: (...a: unknown[]) => mockManageGitHubReposCommand(...a),
}));

/** The agent-trace sinks, and the recorder that fans an entry out to them. */
export const mockTraceSink = jest.fn();
export const mockCreateAgentTraceFileSink = jest.fn(() => ({ sink: mockTraceSink }));
jest.mock('@/features/ai/server/agentTraceSink', () => ({
    createAgentTraceFileSink: (...a: unknown[]) => mockCreateAgentTraceFileSink(...(a as [])),
}));

// NOT mocked: `ToolTraceRecorder` is constructed at MODULE LOAD (extension.ts
// assigns `agentTrace` at the top level), which runs before any const in this
// file is initialized — a factory reaching for a spy here dies in the temporal
// dead zone. The recorder is cheap and pure, so the real one is used.

/** The tool registrars whose CALLBACKS activation owns. */
export const mockRegisterSettingsTools = jest.fn();
export const mockRegisterViewTools = jest.fn();
export const mockRegisterDescriptorTools = jest.fn();
jest.mock('@/features/ai/server/settingsTools', () => ({
    registerSettingsTools: (...a: unknown[]) => mockRegisterSettingsTools(...a),
}));
jest.mock('@/features/ai/server/viewTools', () => ({
    registerViewTools: (...a: unknown[]) => mockRegisterViewTools(...a),
}));
export const mockRegisterLifecycleTools = jest.fn();
jest.mock('@/features/ai/server/lifecycleTools', () => ({
    registerLifecycleTools: (...a: unknown[]) => mockRegisterLifecycleTools(...a),
}));
export const mockRegisterEventProviderTools = jest.fn();
jest.mock('@/features/ai/server/eventProviderTools', () => ({
    registerEventProviderTools: (...a: unknown[]) => mockRegisterEventProviderTools(...a),
}));
jest.mock('@/features/ai/server/toolDescriptors', () => ({
    ...jest.requireActual('@/features/ai/server/toolDescriptors'),
    registerDescriptorTools: (...a: unknown[]) => mockRegisterDescriptorTools(...a),
}));

export const mockSeedDefaultAiPrompts = jest.fn();
jest.mock('@/features/dashboard/services/defaultPromptsSeeder', () => ({
    seedDefaultAiPrompts: (...a: unknown[]) => mockSeedDefaultAiPrompts(...a),
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
