/**
 * CommandManager — the five handlers that decide something.
 *
 * Most command ids forward to one command object (the delegation sibling covers
 * those). These five carry their own logic and their own failure shapes, and
 * none of it had ever been executed:
 *
 *   loadProject       — refuses to switch away from a RUNNING demo without asking
 *   navigate          — the sidebar's internal router
 *   signInAdobe       — the already-signed-in re-login offer
 *   signInDaLive      — success, failure, and the cancel that must stay silent
 *   registerGlobalMcp — a write to ~/.claude.json, and what it says when it fails
 *   openComponent     — four guards over a component's local files
 */

import {
    commandInstance,
    harness,
    mockAccess,
    mockDaLiveAuthQuickPick,
    mockGetTokenStatus,
    mockLogin,
    mockRegisterGlobalMcp,
    resetVsCode,
    vscode,
} from './commandManager.testUtils';

import { ConfigureProjectWebviewCommand } from '@/features/dashboard/commands/configure';
import { ProjectDashboardWebviewCommand } from '@/features/dashboard/commands/showDashboard';
import { CheckUpdatesCommand } from '@/features/updates/commands/checkUpdates';
import type { Project } from '@/types/base';
import { createMockProject } from '../helpers/projectFake';

beforeEach(() => {
    jest.clearAllMocks();
    resetVsCode();
    mockGetTokenStatus.mockReset().mockResolvedValue({ isAuthenticated: false });
    mockLogin.mockReset().mockResolvedValue(true);
    mockDaLiveAuthQuickPick.mockReset().mockResolvedValue({ success: true });
    mockRegisterGlobalMcp.mockReset().mockResolvedValue('/home/sc/.claude.json');
    mockAccess.mockReset().mockResolvedValue(undefined);
});

const project = (over: Partial<Project> = {}): Project =>
    createMockProject({ name: 'bodea', path: '/p/bodea', status: 'stopped', ...over });

// =============================================================================
// loadProject — switching away from a running demo
// =============================================================================

describe('loadProject', () => {
    it('loads straight away when no demo is running', async () => {
        const h = harness();
        h.stateManager.loadProjectFromPath.mockResolvedValue(project());

        await h.handlerFor('demoBuilder.loadProject')('/p/bodea');

        expect(h.stateManager.loadProjectFromPath).toHaveBeenCalledWith('/p/bodea');
        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'demoBuilder.showProjectDashboard'
        );
    });

    // A running demo holds ports and processes belonging to the project being
    // switched away from. Switching without stopping strands them.
    it('asks before switching away from a RUNNING demo, and stops it on consent', async () => {
        const h = harness();
        h.stateManager.getCurrentProject.mockResolvedValue(project({ status: 'running' }));
        h.stateManager.loadProjectFromPath.mockResolvedValue(project({ name: 'other' }));
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Stop & Switch');

        await h.handlerFor('demoBuilder.loadProject')('/p/other');

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.stopDemo');
        expect(h.stateManager.loadProjectFromPath).toHaveBeenCalledWith('/p/other');
    });

    it('abandons the switch when the user cancels', async () => {
        const h = harness();
        h.stateManager.getCurrentProject.mockResolvedValue(project({ status: 'running' }));
        h.stateManager.hasProject.mockResolvedValue(true);
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Cancel');

        await h.handlerFor('demoBuilder.loadProject')('/p/other');

        expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('demoBuilder.stopDemo');
        expect(h.stateManager.loadProjectFromPath).not.toHaveBeenCalled();
    });

    // Cancelling with no project left open would otherwise leave an empty
    // window with nothing to click.
    it('reopens the projects list when the cancelled user has no project', async () => {
        const h = harness();
        h.stateManager.getCurrentProject.mockResolvedValue(project({ status: 'running' }));
        h.stateManager.hasProject.mockResolvedValue(false);
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);

        await h.handlerFor('demoBuilder.loadProject')('/p/other');

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.showProjectsList');
    });

    it('does not reopen the projects list when a project is still open', async () => {
        const h = harness();
        h.stateManager.getCurrentProject.mockResolvedValue(project({ status: 'running' }));
        h.stateManager.hasProject.mockResolvedValue(true);
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Cancel');

        await h.handlerFor('demoBuilder.loadProject')('/p/other');

        expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
            'demoBuilder.showProjectsList'
        );
    });

    // A project that is present but NOT running needs no prompt at all.
    it('does not prompt for a project that is merely open', async () => {
        const h = harness();
        h.stateManager.getCurrentProject.mockResolvedValue(project({ status: 'ready' }));
        h.stateManager.loadProjectFromPath.mockResolvedValue(project());

        await h.handlerFor('demoBuilder.loadProject')('/p/bodea');

        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    });

    it('reports a path that would not load, and opens no dashboard', async () => {
        const h = harness();
        h.stateManager.loadProjectFromPath.mockResolvedValue(null);

        await h.handlerFor('demoBuilder.loadProject')('/p/missing');

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            'Failed to load project from /p/missing'
        );
        expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
            'demoBuilder.showProjectDashboard'
        );
    });
});

// =============================================================================
// navigate — the sidebar's router
// =============================================================================

describe('navigate routes a sidebar click to its surface', () => {
    it('overview opens the project dashboard', async () => {
        const h = harness();

        await h.handlerFor('demoBuilder.navigate')({ target: 'overview' });

        expect(commandInstance(ProjectDashboardWebviewCommand).execute).toHaveBeenCalledTimes(1);
    });

    it('configure opens the configure surface', async () => {
        const h = harness();

        await h.handlerFor('demoBuilder.navigate')({ target: 'configure' });

        expect(commandInstance(ConfigureProjectWebviewCommand).execute).toHaveBeenCalledTimes(1);
    });

    it('updates runs the update check', async () => {
        const h = harness();

        await h.handlerFor('demoBuilder.navigate')({ target: 'updates' });

        expect(commandInstance(CheckUpdatesCommand).execute).toHaveBeenCalledTimes(1);
    });

    // Invoked with nothing at all — the router must fall through rather than
    // reading `target` off undefined and taking the command down.
    it('falls through when invoked with no payload', async () => {
        const h = harness();

        await expect(h.handlerFor('demoBuilder.navigate')()).resolves.toBeUndefined();
        expect(commandInstance(ProjectDashboardWebviewCommand).execute).not.toHaveBeenCalled();
    });
});

// =============================================================================
// signInAdobe
// =============================================================================

describe('signInAdobe', () => {
    it('reports success on the status bar', async () => {
        const h = harness();

        await h.handlerFor('demoBuilder.signInAdobe')();

        expect(vscode.window.setStatusBarMessage).toHaveBeenCalledWith(
            '$(check) Signed in to Adobe',
            5000
        );
        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    });

    // A sign-in that did not complete has to say so: the browser half of the
    // flow happens outside VS Code, so silence reads as success.
    it('warns when the login did not complete', async () => {
        const h = harness();
        mockLogin.mockResolvedValue(false);

        await h.handlerFor('demoBuilder.signInAdobe')();

        expect(vscode.window.setStatusBarMessage).not.toHaveBeenCalled();
        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            expect.stringContaining('did not complete')
        );
    });

    it('runs the login inside a progress notification', async () => {
        const h = harness();

        await h.handlerFor('demoBuilder.signInAdobe')();

        expect((vscode.window.withProgress as jest.Mock).mock.calls[0][0]).toEqual({
            location: vscode.ProgressLocation.Notification,
            title: 'Signing in to Adobe…',
        });
    });

    // The expiry is only offered when the status carries one. A missing value
    // would otherwise render as the word "undefined" in a prompt.
    it('omits the expiry when the status does not report one', async () => {
        const h = harness();
        mockGetTokenStatus.mockResolvedValue({ isAuthenticated: true });
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Sign in again');

        await h.handlerFor('demoBuilder.signInAdobe')();

        expect((vscode.window.showInformationMessage as jest.Mock).mock.calls[0][0]).toBe(
            'Already signed in to Adobe.'
        );
    });
});

// =============================================================================
// signInDaLive
// =============================================================================

describe('signInDaLive', () => {
    it('hands the QuickPick the extension context and logger', async () => {
        const h = harness();

        await h.handlerFor('demoBuilder.signInDaLive')();

        expect(mockDaLiveAuthQuickPick).toHaveBeenCalledWith({
            context: h.context,
            logger: h.logger,
        });
    });

    it('reports success on the status bar', async () => {
        const h = harness();

        await h.handlerFor('demoBuilder.signInDaLive')();

        expect(vscode.window.setStatusBarMessage).toHaveBeenCalledWith(
            '$(check) Signed in to DA.live',
            5000
        );
    });

    it('reports a failure with the reason the flow gave', async () => {
        const h = harness();
        mockDaLiveAuthQuickPick.mockResolvedValue({ success: false, error: 'token rejected' });

        await h.handlerFor('demoBuilder.signInDaLive')();

        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            'DA.live sign-in failed: token rejected.'
        );
    });

    it('still reports a failure that names no reason', async () => {
        const h = harness();
        mockDaLiveAuthQuickPick.mockResolvedValue({ success: false });

        await h.handlerFor('demoBuilder.signInDaLive')();

        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('DA.live sign-in failed.');
    });

    // Cancelling is a choice, not a failure. Warning about it would scold the
    // user for closing a picker they opened.
    it('says nothing when the user cancelled', async () => {
        const h = harness();
        mockDaLiveAuthQuickPick.mockResolvedValue({ success: false, cancelled: true });

        await h.handlerFor('demoBuilder.signInDaLive')();

        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
        expect(vscode.window.setStatusBarMessage).not.toHaveBeenCalled();
    });
});

// =============================================================================
// registerGlobalMcp
// =============================================================================

describe('registerGlobalMcp', () => {
    it('registers against the extension’s dist directory and confirms', async () => {
        const h = harness();

        await h.handlerFor('demoBuilder.registerGlobalMcp')();

        expect(mockRegisterGlobalMcp).toHaveBeenCalledWith('/test/extension/path/dist');
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
            expect.stringContaining('~/.claude.json')
        );
    });

    it('reports a failed registration with its own reason', async () => {
        const h = harness();
        mockRegisterGlobalMcp.mockRejectedValue(new Error('EACCES'));

        await h.handlerFor('demoBuilder.registerGlobalMcp')();

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            'Could not register the global MCP entry: EACCES'
        );
        expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
    });

    it('reports a rejection that is not an Error at all', async () => {
        const h = harness();
        mockRegisterGlobalMcp.mockRejectedValue('disk full');

        await h.handlerFor('demoBuilder.registerGlobalMcp')();

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            'Could not register the global MCP entry: disk full'
        );
    });
});

// =============================================================================
// openComponent
// =============================================================================

describe('openComponent', () => {
    const withComponent = (path = '/p/bodea/components/eds-storefront'): Project =>
        project({
            componentInstances: {
                'eds-storefront': {
                    id: 'eds-storefront',
                    name: 'EDS Storefront',
                    type: 'frontend',
                    status: 'ready',
                    path,
                },
            },
        });

    it('reveals the component in the Explorer and opens its README', async () => {
        const h = harness();

        await h.handlerFor('demoBuilder.openComponent')('eds-storefront', withComponent());

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.view.explorer');
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'revealInExplorer',
            expect.anything()
        );
        expect(mockAccess).toHaveBeenCalledWith('/p/bodea/components/eds-storefront/README.md');
    });

    it('falls back to package.json when there is no README', async () => {
        const h = harness();
        mockAccess.mockRejectedValueOnce(new Error('ENOENT')).mockResolvedValueOnce(undefined);

        await h.handlerFor('demoBuilder.openComponent')('eds-storefront', withComponent());

        expect(mockAccess).toHaveBeenNthCalledWith(
            2,
            '/p/bodea/components/eds-storefront/package.json'
        );
    });

    // Neither file present is not an error: the folder is still revealed, which
    // is what the command is for.
    it('still reveals the folder when neither file exists', async () => {
        const h = harness();
        mockAccess.mockRejectedValue(new Error('ENOENT'));

        await h.handlerFor('demoBuilder.openComponent')('eds-storefront', withComponent());

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            'revealInExplorer',
            expect.anything()
        );
        expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    });

    it('resolves the current project when none was passed', async () => {
        const h = harness();
        h.stateManager.getCurrentProject.mockResolvedValue(withComponent());

        await h.handlerFor('demoBuilder.openComponent')('eds-storefront');

        expect(h.stateManager.getCurrentProject).toHaveBeenCalled();
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.view.explorer');
    });

    // Nothing to fall back to: the current project is null, so the guard has to
    // answer rather than dereference it.
    it('reports not-found when there is no current project either', async () => {
        const h = harness();
        h.stateManager.getCurrentProject.mockResolvedValue(undefined);

        await h.handlerFor('demoBuilder.openComponent')('eds-storefront');

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            'Component eds-storefront not found'
        );
    });

    // A project restored from a manifest that predates componentInstances has
    // the key missing entirely, not empty.
    it('reports not-found for a project with no instance map at all', async () => {
        const h = harness();
        const bare = project();
        delete (bare as { componentInstances?: unknown }).componentInstances;

        await h.handlerFor('demoBuilder.openComponent')('eds-storefront', bare);

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            'Component eds-storefront not found'
        );
    });

    it('reports a component the project does not have', async () => {
        const h = harness();

        await h.handlerFor('demoBuilder.openComponent')('missing', withComponent());

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Component missing not found');
        expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('workbench.view.explorer');
    });

    // A remote-only component has a record and no files. Revealing an empty
    // path would open the Explorer on nothing.
    it('reports a component with no local files, by name', async () => {
        const h = harness();

        await h.handlerFor('demoBuilder.openComponent')('eds-storefront', withComponent(''));

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            'Component EDS Storefront has no local files'
        );
        expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('workbench.view.explorer');
    });

    it('reports a failure from the Explorer rather than throwing out of the command', async () => {
        const h = harness();
        (vscode.commands.executeCommand as jest.Mock).mockImplementation(async (id: string) => {
            if (id === 'workbench.view.explorer') throw new Error('no workbench');
            return undefined;
        });

        await h.handlerFor('demoBuilder.openComponent')('eds-storefront', withComponent());

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            'Failed to open component: no workbench'
        );
    });
});
