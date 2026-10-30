/**
 * Review on the update notification opens the Updates window (PL-80).
 *
 * Owner, 2026-10-30: the dashboard of one project was open, the background check found
 * two updates for ANOTHER project, and Review swapped the dashboard for the projects
 * list with no Updates window on it.
 *
 * The real chain runs here: the registered `demoBuilder.checkForUpdates` and
 * `demoBuilder.showProjectsList` handlers, the real dashboard and projects list
 * commands, and the disposal callback `extension.ts` installs. Only VS Code, the
 * webview channel, the page load and the check itself are faked. The page load is the
 * part that matters: it takes at least `TIMEOUTS.UI.MIN_LOADING`, and every load
 * replaces the screen, so a screen loaded twice loses the Updates window the first
 * load opened.
 */

import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { createMockExtensionContext } from '../helpers/extensionContextFake';
import { createMockHandlerContext } from '../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../helpers/loggerFake';
import { createMockProject } from '../helpers/projectFake';
import { createMockStateManager } from '../helpers/stateManagerFake';
import { CommandManager } from '@/commands/commandManager';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import { createWebviewCommunication } from '@/core/communication/webviewCommunicationManager';
import { setLoadingState } from '@/core/utils/loadingHTML';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { ConfigureProjectWebviewCommand } from '@/features/dashboard/commands/configure';
import { ProjectDashboardWebviewCommand, screenAfterClose } from '@/features/dashboard/commands/showDashboard';
import { CreateProjectWebviewCommand } from '@/features/project-creation/commands/createProject';
import { presentedRows } from '@/features/updates/handlers/updatesModalHandlers';
import { handleTakeUpdatesRequest } from '@/features/updates/handlers/updatesModalRequest';
import { findAllUpdates, type FoundUpdates } from '@/features/updates/services/allUpdates';
import type { PendingUpdateRow } from '@/types/pendingUpdates';

jest.mock('@/core/communication/webviewCommunicationManager', () => ({
    createWebviewCommunication: jest.fn(),
}));
jest.mock('@/core/utils/loadingHTML', () => ({ setLoadingState: jest.fn() }));
jest.mock('@/features/updates/services/allUpdates', () => ({ findAllUpdates: jest.fn() }));
// The check's context needs the activated extension's services; the check is faked.
jest.mock('@/features/ai/server/headlessHandlerContext', () => ({ createHeadlessHandlerContext: jest.fn(() => ({})) }));

const PROJECTS_ROOT = path.join(os.homedir(), '.demo-builder', 'projects');
const OPEN_PROJECT = createMockProject({ name: 'scratch-1028', path: path.join(PROJECTS_ROOT, 'scratch-1028') });
const OTHER_PROJECT = createMockProject({ name: 'justrite', path: path.join(PROJECTS_ROOT, 'justrite') });

/** Two updates, both for the project that is NOT open. */
const FOUND: FoundUpdates = {
    selections: {
        forkSync: [],
        template: [{ project: OTHER_PROJECT }],
        boilerplate: [],
        finish: [],
        component: [{ project: OTHER_PROJECT, componentId: 'commerce-mesh', latestVersion: '1.2.0' }],
        adobeMcp: [],
        blockLibrary: [],
        blockLibraryInstall: [],
        inspector: [],
        integration: [],
    },
    currentProjectPath: OPEN_PROJECT.path,
    count: 2,
};

/** What the projects list screen shows, as its React hook would. */
interface Screen {
    loads: number;
    updatesWindow: PendingUpdateRow[] | null;
    /** The page loaded and has not had its `init` yet, so the app has not rendered. */
    waitingForInit: boolean;
}

/** A screen before any page has loaded. */
const NO_SCREEN = (): Screen => ({ loads: 0, updatesWindow: null, waitingForInit: false });

let screen: Screen;
/** How long a page load takes; MIN_LOADING unless a test models a slower machine. */
let loadMs: number = TIMEOUTS.UI.MIN_LOADING;
const commandsById = new Map<string, (...args: unknown[]) => unknown>();

/** A panel whose `dispose` fires its disposal listeners, as VS Code's does. */
function mintPanel(): vscode.WebviewPanel {
    const onDispose: Array<() => void> = [];
    const disposable = { dispose: jest.fn() };
    return {
        webview: {
            html: '',
            postMessage: jest.fn(),
            onDidReceiveMessage: jest.fn(() => disposable),
            asWebviewUri: jest.fn((uri: unknown) => uri),
            cspSource: '',
        },
        onDidDispose: jest.fn((listener: () => void) => {
            onDispose.push(listener);
            return disposable;
        }),
        onDidChangeViewState: jest.fn(() => disposable),
        reveal: jest.fn(),
        dispose: jest.fn(() => onDispose.splice(0).forEach((listener) => listener())),
        visible: true,
    } as unknown as vscode.WebviewPanel;
}

/** A channel whose pushes reach the screen: `showUpdates` opens the Updates window. */
function fakeChannel(): unknown {
    return {
        on: jest.fn(),
        onStreaming: jest.fn(),
        request: jest.fn(),
        dispose: jest.fn(),
        sendMessage: jest.fn(async (type: string, payload?: { rows?: PendingUpdateRow[] }) => {
            if (type === 'showUpdates' && payload?.rows?.length) screen.updatesWindow = payload.rows;
            // WebviewApp renders the app on its first `init`; the app then asks once.
            if (type === 'init' && screen.waitingForInit) {
                screen.waitingForInit = false;
                const answer = await handleTakeUpdatesRequest(createMockHandlerContext());
                screen.updatesWindow = answer.data?.rows ?? null;
            }
        }),
    };
}

function wireVsCode(): void {
    (vscode.commands.registerCommand as jest.Mock).mockImplementation((id: string, run: () => unknown) => {
        commandsById.set(id, run);
        return { dispose: jest.fn() };
    });
    (vscode.commands.executeCommand as jest.Mock).mockImplementation(async (id: string, ...args: unknown[]) =>
        commandsById.get(id)?.(...args),
    );
    (vscode.window.createWebviewPanel as jest.Mock).mockImplementation(() => mintPanel());
    Object.assign(vscode.window, { onDidChangeActiveColorTheme: jest.fn(() => ({ dispose: jest.fn() })) });
    // The window is homed at the projects root, where closing the dashboard reopens the list.
    const home: vscode.WorkspaceFolder[] = [{ uri: vscode.Uri.file(PROJECTS_ROOT), name: 'projects', index: 0 }];
    Object.assign(vscode.workspace, { workspaceFolders: home });
    (createWebviewCommunication as jest.Mock).mockImplementation(async () => fakeChannel());
    // A page load: the loading screen for at least MIN_LOADING, then a fresh page, which
    // replaces whatever the last one showed and waits for its `init`.
    (setLoadingState as jest.Mock).mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, loadMs));
        screen = { loads: screen.loads + 1, updatesWindow: null, waitingForInit: true };
    });
    // The disposal callback extension.ts installs (activate, `setDisposalCallback`).
    BaseWebviewCommand.setDisposalCallback(async (webviewId: string) => {
        const next = screenAfterClose(webviewId, {
            workspaceFolderPath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
            transitionInProgress: BaseWebviewCommand.isWebviewTransitionInProgress(),
            openScreens: BaseWebviewCommand.getActivePanelCount(),
        });
        if (next) await vscode.commands.executeCommand(next);
    });
}

type Deps = ConstructorParameters<typeof ProjectDashboardWebviewCommand>;

/** The extension's commands, registered as activation registers them. */
function activate(): Deps {
    const context = createMockExtensionContext();
    const stateManager = createMockStateManager();
    stateManager.getCurrentProject.mockResolvedValue(OPEN_PROJECT);
    const logger = createMockLogger();
    new CommandManager(context, stateManager, logger).registerCommands();
    return [context, stateManager, logger];
}

/** A screen whose panel can be opened without loading its page. */
type PanelScreen = ProjectDashboardWebviewCommand | ConfigureProjectWebviewCommand | CreateProjectWebviewCommand;

/** Open a screen's panel, as its command does before loading the page. */
async function openPanelOf(command: PanelScreen): Promise<void> {
    await (command as unknown as { createOrRevealPanel(): Promise<unknown> }).createOrRevealPanel();
}

/** Let every timer the click starts run out. */
async function settle(): Promise<void> {
    await jest.advanceTimersByTimeAsync(TIMEOUTS.UI.MIN_LOADING * 4);
}

/** Click Review on the background check's notification; resolves once it has finished. */
function startReview(): Thenable<unknown> {
    (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Review');
    return vscode.commands.executeCommand('demoBuilder.checkForUpdates', { background: true });
}

/** Click Review, and let it finish. */
async function clickReview(): Promise<void> {
    const run = startReview();
    await settle();
    await run;
}

/** The sidebar's way in (`sidebarProvider.ts`, `openMainDashboard`): the bare command. */
function clickSidebar(): Thenable<unknown> {
    return vscode.commands.executeCommand('demoBuilder.showProjectsList');
}

describe('Review on the update notification', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        commandsById.clear();
        screen = NO_SCREEN();
        loadMs = TIMEOUTS.UI.MIN_LOADING;
        BaseWebviewCommand.disposeAllActivePanels();
        BaseWebviewCommand.endWebviewTransition();
        wireVsCode();
        (findAllUpdates as jest.Mock).mockResolvedValue(FOUND);
    });

    afterEach(() => {
        BaseWebviewCommand.disposeAllActivePanels();
        BaseWebviewCommand.endWebviewTransition();
        jest.useRealTimers();
    });

    it('opens the Updates window on the rows for the other project, from the dashboard', async () => {
        await openPanelOf(new ProjectDashboardWebviewCommand(...activate()));

        await clickReview();

        expect(presentedRows().map((row) => row.group.key)).toEqual([OTHER_PROJECT.path, OTHER_PROJECT.path]);
        // One page load: the dashboard closing must not open the projects list again.
        expect(screen.loads).toBe(1);
        expect(screen.updatesWindow).toEqual(presentedRows());
    });

    it('opens it the same way from Check for Updates, from the dashboard', async () => {
        await openPanelOf(new ProjectDashboardWebviewCommand(...activate()));

        const run = vscode.commands.executeCommand('demoBuilder.checkForUpdates');
        await settle();
        await run;

        expect(screen.loads).toBe(1);
        expect(screen.updatesWindow).toEqual(presentedRows());
    });

    it('opens it from Configure, without opening the dashboard behind it', async () => {
        await openPanelOf(new ConfigureProjectWebviewCommand(...activate()));

        await clickReview();

        expect(screen.loads).toBe(1);
        expect(screen.updatesWindow).toEqual(presentedRows());
        expect(BaseWebviewCommand.getActivePanel('demoBuilder.projectDashboard')).toBeUndefined();
    });

    it('opens it with no Demo Builder screen open', async () => {
        activate();

        await clickReview();

        expect(screen.loads).toBe(1);
        expect(screen.updatesWindow).toEqual(presentedRows());
    });

    it('pushes it to a projects list already open, without reloading it', async () => {
        activate();
        const opening = vscode.commands.executeCommand('demoBuilder.showProjectsList');
        await settle();
        await opening;
        screen = NO_SCREEN();

        await clickReview();

        expect(screen.loads).toBe(0);
        expect(screen.updatesWindow).toEqual(presentedRows());
    });

    it("leaves a caller's own transition running (the dashboard's Back swap)", async () => {
        activate();
        await BaseWebviewCommand.startWebviewTransition();

        const opening = vscode.commands.executeCommand('demoBuilder.showProjectsList');
        // The page load, and no further: the transition's own safety timeout would end it.
        await jest.advanceTimersByTimeAsync(TIMEOUTS.UI.MIN_LOADING);
        await opening;

        expect(screen.loads).toBe(1);
        expect(BaseWebviewCommand.isWebviewTransitionInProgress()).toBe(true);
    });

    // A second open while the first page is still loading joins that load: loading the
    // page again would replace the screen, and with it any Updates window it opened.
    describe('a second open while the list is still loading', () => {
        it('Review during a plain open still opens the Updates window', async () => {
            activate();
            const opening = clickSidebar();
            await jest.advanceTimersByTimeAsync(TIMEOUTS.UI.MIN_LOADING / 2);

            const review = startReview();
            await settle();
            await Promise.all([opening, review]);

            expect(screen.loads).toBe(1);
            expect(screen.updatesWindow).toEqual(presentedRows());
        });

        it("a sidebar click during Review's load keeps the Updates window", async () => {
            activate();
            const review = startReview();
            await jest.advanceTimersByTimeAsync(TIMEOUTS.UI.MIN_LOADING / 2);

            const opening = clickSidebar();
            await settle();
            await Promise.all([opening, review]);

            expect(screen.loads).toBe(1);
            expect(screen.updatesWindow).toEqual(presentedRows());
        });

        it("closing the wizard during a slow load keeps the Updates window", async () => {
            // Slower than the transition's safety timeout, which then no longer holds back
            // the reopen the wizard's dispose() runs (createProject.ts).
            loadMs = TIMEOUTS.WEBVIEW_TRANSITION + TIMEOUTS.UI.MIN_LOADING;
            await openPanelOf(new CreateProjectWebviewCommand(...activate()));
            const review = startReview();
            await jest.advanceTimersByTimeAsync(TIMEOUTS.WEBVIEW_TRANSITION + TIMEOUTS.UI.UPDATE_DELAY);

            CreateProjectWebviewCommand.disposeActivePanel();
            await jest.advanceTimersByTimeAsync(loadMs * 2);
            await review;

            expect(screen.loads).toBe(1);
            expect(screen.updatesWindow).toEqual(presentedRows());
        });
    });
});
