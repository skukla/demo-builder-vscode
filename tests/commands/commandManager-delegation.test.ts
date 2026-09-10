/**
 * CommandManager — what each registered id actually DOES when invoked.
 *
 * The sibling suite proves the right ids get registered. That is half the
 * contract: the other half is which command object each id runs, and what it
 * closes first. Nothing invoked those handlers, so every arrow in this file
 * could have been replaced with one that did nothing and the suite would have
 * stayed green — which is exactly what mutation testing did, thirty times over.
 *
 * The disposal calls are not incidental either. These surfaces replace each
 * other in the same tab, so a handler that opens without disposing leaves two
 * project-scoped panels claiming to be the current one.
 */

import {
    CommandManager,
    commandInstance,
    harness,
    mockIsSidebarInitialized,
    mockOpenUrl,
    mockSetShowingProjectsList,
    resetVsCode,
    vscode,
} from './commandManager.testUtils';

import { ConfigureCommand } from '@/commands/configure';
import { DiagnosticsCommand } from '@/commands/diagnostics';
import { ManageSiteAccessCommand } from '@/commands/manageSiteAccess';
import { MigrateStorefrontNamesCommand } from '@/commands/migrateStorefrontNames';
import { OpenInClaudeCommand } from '@/commands/openInClaude';
import { OpenModernizationAgentCommand } from '@/commands/openModernizationAgent';
import { RefreshBlockLibraryCommand } from '@/commands/refreshBlockLibrary';
import { RepairSiteConfigurationCommand } from '@/commands/repairSiteConfiguration';
import { ResetAiOnboardingCommand } from '@/commands/ResetAiOnboardingCommand';
import { ResetAllCommand } from '@/commands/ResetAllCommand';
import { ShowPromptsPickerCommand } from '@/commands/showPromptsPicker';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import { ConfigureProjectWebviewCommand } from '@/features/dashboard/commands/configure';
import { ShowAiCommand } from '@/features/dashboard/commands/openAi';
import { ProjectDashboardWebviewCommand } from '@/features/dashboard/commands/showDashboard';
import { ShowIntegrationsCommand } from '@/features/dashboard/commands/showIntegrations';
import { ShowDataInstallerCommand } from '@/features/data-installer/commands/showDataInstaller';
import { DeleteProjectCommand } from '@/features/lifecycle/commands/deleteProject';
import { StartDemoCommand } from '@/features/lifecycle/commands/startDemo';
import { StopDemoCommand } from '@/features/lifecycle/commands/stopDemo';
import { SyncStorefrontCommand } from '@/features/lifecycle/commands/syncStorefront';
import { ViewStatusCommand } from '@/features/lifecycle/commands/viewStatus';
import { DeployMeshCommand } from '@/features/mesh/commands/deployMesh';
import { CreateProjectWebviewCommand } from '@/features/project-creation/commands/createProject';
import { ShowProjectsListCommand } from '@/features/projects-dashboard/commands/showProjectsList';
import { CheckUpdatesCommand } from '@/features/updates/commands/checkUpdates';

beforeEach(() => {
    jest.clearAllMocks();
    resetVsCode();
});

/** The static every tab-replacing surface exposes. */
const disposeOf = (cls: unknown): jest.Mock =>
    (cls as unknown as { disposeActivePanel: jest.Mock }).disposeActivePanel;

// =============================================================================
// The ids that do nothing but run one command
// =============================================================================

describe('a command id runs the command object it was built for', () => {
    it.each([
        ['demoBuilder.startDemo', StartDemoCommand],
        ['demoBuilder.stopDemo', StopDemoCommand],
        ['demoBuilder.deleteProject', DeleteProjectCommand],
        ['demoBuilder.viewStatus', ViewStatusCommand],
        ['demoBuilder.configure', ConfigureCommand],
        ['demoBuilder.configureProject', ConfigureProjectWebviewCommand],
        ['demoBuilder.deployMesh', DeployMeshCommand],
        ['demoBuilder.syncStorefront', SyncStorefrontCommand],
        ['demoBuilder.refreshBlockLibrary', RefreshBlockLibraryCommand],
        ['demoBuilder.manageSiteAccess', ManageSiteAccessCommand],
        ['demoBuilder.repairSiteConfiguration', RepairSiteConfigurationCommand],
        ['demoBuilder.checkForUpdates', CheckUpdatesCommand],
        ['demoBuilder.showPromptsPicker', ShowPromptsPickerCommand],
        ['demoBuilder.openModernizationAgent', OpenModernizationAgentCommand],
        ['demoBuilder.showDataInstaller', ShowDataInstallerCommand],
        ['demoBuilder.migrateStorefrontNames', MigrateStorefrontNamesCommand],
        ['demoBuilder.diagnostics', DiagnosticsCommand],
    ])('%s', async (commandId, cls) => {
        const h = harness();

        await h.handlerFor(commandId)();

        expect(commandInstance(cls).execute).toHaveBeenCalledTimes(1);
    });
});

// =============================================================================
// The surfaces that replace each other in the tab
// =============================================================================

describe('opening a project surface closes the ones it replaces', () => {
    it('showProjectsList closes the dashboard and configure panels', async () => {
        const h = harness();

        await h.handlerFor('demoBuilder.showProjectsList')();

        expect(disposeOf(ProjectDashboardWebviewCommand)).toHaveBeenCalled();
        expect(disposeOf(ConfigureProjectWebviewCommand)).toHaveBeenCalled();
        expect(commandInstance(ShowProjectsListCommand).execute).toHaveBeenCalledTimes(1);
    });

    it('showIntegrations closes the projects list and configure panels', async () => {
        const h = harness();

        await h.handlerFor('demoBuilder.showIntegrations')();

        expect(disposeOf(ShowProjectsListCommand)).toHaveBeenCalled();
        expect(disposeOf(ConfigureProjectWebviewCommand)).toHaveBeenCalled();
        expect(commandInstance(ShowIntegrationsCommand).execute).toHaveBeenCalledTimes(1);
    });

    it('createProject opens a transition, closes all four, then executes', async () => {
        const h = harness();

        await h.handlerFor('demoBuilder.createProject')();

        // The transition suppresses disposal side-effects — without it, closing
        // the wizard panel re-creates it.
        expect(BaseWebviewCommand.startWebviewTransition).toHaveBeenCalled();
        expect(disposeOf(CreateProjectWebviewCommand)).toHaveBeenCalled();
        expect(disposeOf(ShowProjectsListCommand)).toHaveBeenCalled();
        expect(disposeOf(ProjectDashboardWebviewCommand)).toHaveBeenCalled();
        expect(disposeOf(ConfigureProjectWebviewCommand)).toHaveBeenCalled();
        expect(commandInstance(CreateProjectWebviewCommand).execute).toHaveBeenCalledWith(
            undefined
        );
    });

    // The Import flow launches creation with settings already chosen; dropping
    // the argument would silently start an empty wizard instead.
    it('createProject forwards the options it was launched with', async () => {
        const h = harness();
        const options = { importedSettings: { name: 'imported' }, sourceDescription: 'a manifest' };

        await h.handlerFor('demoBuilder.createProject')(options);

        expect(commandInstance(CreateProjectWebviewCommand).execute).toHaveBeenCalledWith(options);
    });
});

describe('showProjectDashboard', () => {
    it('clears the projects-list context and closes the integrations panel', async () => {
        const h = harness();

        await h.handlerFor('demoBuilder.showProjectDashboard')();

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'setContext',
            'demoBuilder.showingProjectsList',
            false
        );
        expect(disposeOf(ShowIntegrationsCommand)).toHaveBeenCalled();
        expect(commandInstance(ProjectDashboardWebviewCommand).execute).toHaveBeenCalledTimes(1);
    });

    it('tells an initialised sidebar it is no longer showing the projects list', async () => {
        mockIsSidebarInitialized.mockReturnValue(true);
        const h = harness();

        await h.handlerFor('demoBuilder.showProjectDashboard')();

        expect(mockSetShowingProjectsList).toHaveBeenCalledWith(false);
    });

    it('leaves an uninitialised sidebar alone', async () => {
        mockIsSidebarInitialized.mockReturnValue(false);
        const h = harness();

        await h.handlerFor('demoBuilder.showProjectDashboard')();

        expect(mockSetShowingProjectsList).not.toHaveBeenCalled();
    });
});

// =============================================================================
// The AI doors — three ids, one command object, three different arguments
// =============================================================================

describe('the AI entry points differ only in what they hand the launcher', () => {
    it('openInClaude passes the project it was invoked with', async () => {
        const h = harness();
        const project = { name: 'bodea', path: '/p/bodea' };

        await h.handlerFor('demoBuilder.openInClaude')(project);

        expect(commandInstance(OpenInClaudeCommand).execute).toHaveBeenCalledWith(project);
    });

    it('openInClaude passes undefined when invoked from the palette', async () => {
        const h = harness();

        await h.handlerFor('demoBuilder.openInClaude')();

        expect(commandInstance(OpenInClaudeCommand).execute).toHaveBeenCalledWith(undefined);
    });

    it('openAiExperience launches with no argument at all', async () => {
        const h = harness();

        await h.handlerFor('demoBuilder.openAiExperience')();

        expect(commandInstance(OpenInClaudeCommand).execute).toHaveBeenCalledWith();
    });

    // `fresh` is the deliberate escape from `--continue`: every other door
    // resumes, so a long conversation never re-reads AGENTS.md. Dropping the
    // flag would make this id a duplicate of openAiExperience.
    it('newAiChat asks for a FRESH conversation', async () => {
        const h = harness();

        await h.handlerFor('demoBuilder.newAiChat')();

        expect(commandInstance(OpenInClaudeCommand).execute).toHaveBeenCalledWith({ fresh: true });
    });

    it('openAi runs the prompt library, not the launcher', async () => {
        const h = harness();

        await h.handlerFor('demoBuilder.openAi')();

        expect(commandInstance(ShowAiCommand).execute).toHaveBeenCalledTimes(1);
    });
});

// =============================================================================
// The ids that only forward to a built-in VS Code command
// =============================================================================

describe('the sidebar and bookmarklet ids', () => {
    it('toggleSidebar toggles the workbench sidebar', async () => {
        const h = harness();

        await h.handlerFor('demoBuilder.toggleSidebar')();

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'workbench.action.toggleSidebarVisibility'
        );
    });

    it('showSidebar opens the Demo Builder view container', async () => {
        const h = harness();

        await h.handlerFor('demoBuilder.showSidebar')();

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'workbench.view.extension.demoBuilder'
        );
    });

    it('the bookmarklet setup page is built from the bookmarklet URL and opened', async () => {
        const h = harness();

        await h.handlerFor('demoBuilder.openDaLiveBookmarkletSetup')();

        expect(mockOpenUrl).toHaveBeenCalledWith(
            'https://setup.page/bookmarklet',
            'demo-builder-bookmarklet-setup.html'
        );
    });
});

// =============================================================================
// The development-only ids
// =============================================================================

describe('the reset commands exist only in development', () => {
    it('registers and runs resetAll and resetAiOnboarding in development mode', async () => {
        const h = harness({ extensionMode: vscode.ExtensionMode.Development });

        await h.handlerFor('demoBuilder.resetAll')();
        await h.handlerFor('demoBuilder.resetAiOnboarding')();

        expect(commandInstance(ResetAllCommand).execute).toHaveBeenCalledTimes(1);
        expect(commandInstance(ResetAiOnboardingCommand).execute).toHaveBeenCalledTimes(1);
    });

    it('registers neither outside development', () => {
        const h = harness({ extensionMode: vscode.ExtensionMode.Production });

        expect(() => h.handlerFor('demoBuilder.resetAll')).toThrow(/no handler/);
        expect(() => h.handlerFor('demoBuilder.resetAiOnboarding')).toThrow(/no handler/);
    });
});

// =============================================================================
// dispose
// =============================================================================

describe('dispose', () => {
    it('disposes every registered command and forgets them', () => {
        const disposables: Array<{ dispose: jest.Mock }> = [];
        (vscode.commands.registerCommand as jest.Mock).mockImplementation(() => {
            const d = { dispose: jest.fn() };
            disposables.push(d);
            return d;
        });
        const h = harness();
        expect(disposables.length).toBeGreaterThan(0);

        h.manager.dispose();

        for (const d of disposables) {
            expect(d.dispose).toHaveBeenCalledTimes(1);
        }
        // Forgotten, not merely disposed: a second dispose must be a no-op
        // rather than a second round of dispose() calls.
        h.manager.dispose();
        for (const d of disposables) {
            expect(d.dispose).toHaveBeenCalledTimes(1);
        }
    });

    it('is safe on a manager that never registered anything', () => {
        const h = harness();
        const manager = new CommandManager(h.context, h.stateManager, h.logger);

        expect(() => manager.dispose()).not.toThrow();
    });
});
