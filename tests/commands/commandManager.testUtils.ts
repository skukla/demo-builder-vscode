/**
 * Shared setup for the commandManager handler suites.
 *
 * THIS FILE OWNS THE MOCKS AND EVERY IMPORT THEY REPLACE. Specs import them from
 * HERE and declare no `jest.mock` of their own — `jest.mock` hoists above the
 * imports of the module it appears in, NOT across modules, so an import left
 * behind in a spec loads the real command class before these mocks register.
 *
 * WHY EVERY COMMAND CLASS IS MOCKED. `CommandManager.registerCommands()`
 * constructs all thirty of them, and each pulls in the feature it fronts. The
 * subject here is the WIRING — which handler a command id gets, what it disposes
 * first, and what it delegates to — so the classes are stand-ins whose only
 * interesting property is that `execute` was called, and with what.
 */

import * as vscode from 'vscode';

import { CommandManager } from '@/commands/commandManager';
import { createMockExtensionContext } from '../helpers/extensionContextFake';
import { createMockLogger } from '../helpers/loggerFake';
import { createMockStateManager } from '../helpers/stateManagerFake';
import type { Logger } from '@/types/logger';
import type { StateManager } from '@/types/state';

// =============================================================================
// Mocks — the command classes, and the four module functions the manager calls
// =============================================================================

jest.mock('@/commands/configure');
jest.mock('@/commands/diagnostics');
jest.mock('@/commands/manageSiteAccess');
jest.mock('@/commands/migrateStorefrontNames');
jest.mock('@/commands/openInClaude');
jest.mock('@/commands/openModernizationAgent');
jest.mock('@/commands/refreshBlockLibrary');
jest.mock('@/commands/repairSiteConfiguration');
jest.mock('@/commands/ResetAiOnboardingCommand');
jest.mock('@/commands/ResetAllCommand');
jest.mock('@/commands/showPromptsPicker');
jest.mock('@/core/base/baseWebviewCommand');
jest.mock('@/features/dashboard/commands/configure');
jest.mock('@/features/dashboard/commands/openAi');
jest.mock('@/features/dashboard/commands/showDashboard');
jest.mock('@/features/dashboard/commands/showIntegrations');
jest.mock('@/features/data-installer/commands/showDataInstaller');
jest.mock('@/features/lifecycle/commands/deleteProject');
jest.mock('@/features/lifecycle/commands/startDemo');
jest.mock('@/features/lifecycle/commands/stopDemo');
jest.mock('@/features/lifecycle/commands/syncStorefront');
jest.mock('@/features/lifecycle/commands/viewStatus');
jest.mock('@/features/mesh/commands/deployMesh');
jest.mock('@/features/project-creation/commands/createProject');
jest.mock('@/features/projects-dashboard/commands/showProjectsList');
jest.mock('@/features/updates/commands/checkUpdates');

const mockRegisterGlobalMcp = jest.fn();
jest.mock('@/features/project-creation/services/aiBundle/globalMcpRegistration', () => ({
    registerGlobalMcp: (...a: unknown[]) => mockRegisterGlobalMcp(...a),
}));

const mockOpenUrl = jest.fn();
jest.mock('@/core/utils/browserUtils', () => ({
    openUrl: (...a: unknown[]) => mockOpenUrl(...a),
}));

jest.mock('@/features/eds/ui/helpers/bookmarkletSetupPage', () => ({
    getBookmarkletSetupPageUrl: jest.fn(() => 'https://setup.page/bookmarklet'),
}));
jest.mock('@/features/eds/utils/daLiveTokenBookmarklet', () => ({
    getBookmarkletUrl: jest.fn(() => 'javascript:void(0)'),
}));

const mockDaLiveAuthQuickPick = jest.fn();
jest.mock('@/features/eds/handlers/daLive/daLiveAuthPrompt', () => ({
    showDaLiveAuthQuickPick: (...a: unknown[]) => mockDaLiveAuthQuickPick(...a),
}));

const mockGetTokenStatus = jest.fn();
const mockLogin = jest.fn();
const mockSetShowingProjectsList = jest.fn();
const mockIsSidebarInitialized = jest.fn(() => false);
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        isSidebarInitialized: () => mockIsSidebarInitialized(),
        getSidebarProvider: () => ({ setShowingProjectsList: mockSetShowingProjectsList }),
        getAuthenticationService: () => ({
            getTokenStatus: mockGetTokenStatus,
            login: mockLogin,
        }),
    },
}));

const mockAccess = jest.fn();
jest.mock('fs/promises', () => ({ access: (...a: unknown[]) => mockAccess(...a) }));

// =============================================================================
// Re-exports (see the note at the top: specs import these from HERE)
// =============================================================================

export { CommandManager, vscode };
export {
    mockAccess,
    mockDaLiveAuthQuickPick,
    mockGetTokenStatus,
    mockIsSidebarInitialized,
    mockLogin,
    mockOpenUrl,
    mockRegisterGlobalMcp,
    mockSetShowingProjectsList,
};

export interface Harness {
    manager: CommandManager;
    context: vscode.ExtensionContext;
    stateManager: jest.Mocked<StateManager>;
    logger: jest.Mocked<Logger>;
    /** The callback registered for a command id, ready to invoke. */
    handlerFor(commandId: string): (...args: unknown[]) => Promise<unknown>;
}

/**
 * A CommandManager with its commands registered, plus a way to reach any one of
 * their handlers.
 *
 * Registration is what puts the callbacks in reach: `registerCommand` is
 * vscode's, so the only record of which function a command id got is the mock's
 * call list. Handlers are the SUBJECT of these suites — nothing else invokes
 * them, which is why so much of this file had never run.
 */
export function harness(contextOverrides: Partial<vscode.ExtensionContext> = {}): Harness {
    const context = createMockExtensionContext(contextOverrides);
    const stateManager = createMockStateManager();
    const logger = createMockLogger() as jest.Mocked<Logger>;
    const manager = new CommandManager(context, stateManager, logger);
    manager.registerCommands();

    return {
        manager,
        context,
        stateManager,
        logger,
        handlerFor(commandId: string) {
            const call = (vscode.commands.registerCommand as jest.Mock).mock.calls.find(
                (c) => c[0] === commandId
            );
            if (!call) {
                throw new Error(`no handler registered for "${commandId}"`);
            }
            return call[1] as (...args: unknown[]) => Promise<unknown>;
        },
    };
}

/**
 * The single instance `registerCommands` built of a mocked command class.
 *
 * Every command class is constructed exactly once per registration pass, so
 * `instances[0]` is unambiguous — and asserting on the instance rather than on
 * the class is what makes "this id delegates to THAT command" checkable.
 */
export function commandInstance(cls: unknown): { execute: jest.Mock } {
    const instances = (cls as unknown as jest.Mock).mock.instances;
    if (!instances.length) {
        throw new Error('the command class was never constructed');
    }
    return instances[0] as unknown as { execute: jest.Mock };
}

/** Reset the vscode surface these suites drive, between tests. */
export function resetVsCode(): void {
    (vscode.commands.registerCommand as jest.Mock) = jest
        .fn()
        .mockReturnValue({ dispose: jest.fn() });
    (vscode.commands.executeCommand as jest.Mock).mockReset().mockResolvedValue(undefined);
    (vscode.window.showErrorMessage as jest.Mock).mockReset().mockResolvedValue(undefined);
    (vscode.window.showWarningMessage as jest.Mock).mockReset().mockResolvedValue(undefined);
    (vscode.window.showInformationMessage as jest.Mock).mockReset().mockResolvedValue(undefined);
    (vscode.window.setStatusBarMessage as jest.Mock).mockReset();
    (vscode.window.withProgress as jest.Mock)
        .mockReset()
        .mockImplementation(async (_o: unknown, fn: () => Promise<unknown>) => fn());
}
