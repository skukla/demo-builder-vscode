/**
 * The Datapacks panel commands: one screen, opened two ways (owner, 2026-11-07).
 *
 * - `project` (`demoBuilder.showDataInstaller`, from a project's dashboard): the open project's
 *   Datapacks, named in its header, with Import, Save Changes and the store's other actions.
 * - `library` (`demoBuilder.showDatapackLibrary`, from the sidebar and the palette): the Datapack
 *   Library, which browses and manages packs and touches no store. One screen that silently
 *   acted on the project opened last was the finding (F65).
 *
 * The Command Palette's Clear doors (step 06 C5, P6-Q5) open a project's Datapacks with one of its
 * Clear windows open (`openClearWindow`): held for a screen not open yet, pushed to one already open.
 *
 * Both are standalone surfaces: opening one does NOT dispose the dashboard or projects list.
 * Each has its own panel, so a project's Datapacks and the library can be open side by side.
 *
 * @module features/data-installer/commands/showDataInstaller
 */

import * as vscode from 'vscode';
import { StandalonePanelCommand } from '@/commands/standalonePanelCommand';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import type { WebviewCommunicationManager } from '@/core/communication/webviewCommunicationManager';
import { handleGetOperationProgress, handleOpenDebugLogs } from '@/core/vscode/operationProgress';
import { handleTakeClearRequest, requestClearWindow } from '@/features/data-installer/handlers/clearWindowRequest';
import { dataInstallerHandlers } from '@/features/data-installer/handlers/dataInstallerHandlers';
import { importHandlers } from '@/features/data-installer/handlers/importHandlers';
import { handleOpenDataInstallerSettings } from '@/features/data-installer/handlers/settingsHandlers';
import { commerceBackendOf } from '@/features/data-installer/services/commerceBackend';
import { affectsDatapackList } from '@/features/data-installer/services/dataInstallerConfig';
import { onDatapacksChanged } from '@/features/data-installer/services/datapackChanges';
import { DATAPACK_LIST_CHANGED_MESSAGE } from '@/features/data-installer/types';
import type { Project } from '@/types/base';
import type { ClearWindowKind, OpenClearWindowPayload } from '@/types/demoDataWipe';
import type { HandlerMap } from '@/types/handlers';
import type { Logger } from '@/types/logger';
import type { StateManager } from '@/types/state';
import type { DataInstallerInitialData } from '@/types/webviewPayloads';

const WEBVIEW_ID = 'demoBuilder.dataInstaller';
const LIBRARY_WEBVIEW_ID = 'demoBuilder.datapackLibrary';

/**
 * Registered as its own map because it belongs in NEITHER of the others: it is
 * a VS Code UI action, and the read map is mirrored by the MCP descriptors, where
 * a window-opening command has no business being offered to an agent.
 *
 * The panel needs it for the same reason the wizard does. `apiBaseUrl` has no
 * default, so an unconfigured install meets the refusal before it meets a
 * catalog, and naming a settings key the user must then hunt for is half an
 * answer.
 */
const settingsHandlers: HandlerMap = {
    'open-data-installer-settings': handleOpenDataInstallerSettings,
};

/**
 * The house progress window's own two messages (`OperationProgressModal`), which "Save store
 * changes to this pack" opens (datapack-engine step 05): where a reopened run is, and the Debug
 * Logs a failure offers. Screen-only for the same reason as the settings link: an agent has no
 * window to reopen. `backgroundOperation` and `answerOperationPrompt` are already in the import map.
 */
const progressWindowHandlers: HandlerMap = {
    getOperationProgress: handleGetOperationProgress,
    openDebugLogs: handleOpenDebugLogs,
};

/** The Clear window the Command Palette held for this screen (C5). Screen-only: an agent has no window. */
const arrivalHandlers: HandlerMap = {
    takeClearRequest: handleTakeClearRequest,
};

/** The refusal when no project is open, by window. */
const NO_PROJECT: Record<ClearWindowKind, string> = {
    project: 'Open a project before clearing its demo data.',
    instance: 'Open a project before clearing its Commerce instance.',
};

/** The refusal when the project has no Commerce backend. */
const NO_BACKEND = 'This project has no Adobe Commerce backend, so there is nothing to clear.';

/** Why a Clear window cannot open for this project, or undefined when it can. */
function refusalOf(window: ClearWindowKind, project: Project | undefined): string | undefined {
    if (!project) return NO_PROJECT[window];
    return commerceBackendOf(project) ? undefined : NO_BACKEND;
}

export class ShowDataInstallerCommand extends StandalonePanelCommand<DataInstallerInitialData> {
    protected readonly bundleName = 'dataInstaller';

    /** @param mode - `library` opens the Datapack Library; `project`, the open project's Datapacks */
    constructor(
        context: vscode.ExtensionContext,
        stateManager: StateManager,
        logger: Logger,
        private readonly mode: DataInstallerInitialData['mode'] = 'project',
    ) {
        super(context, stateManager, logger);
    }

    protected getWebviewId(): string {
        return this.mode === 'library' ? LIBRARY_WEBVIEW_ID : WEBVIEW_ID;
    }

    protected getWebviewTitle(): string {
        return this.mode === 'library' ? 'Datapack Library' : 'Datapacks';
    }

    protected getLoadingMessage(): string {
        return this.mode === 'library' ? 'Loading Datapack Library' : 'Loading Datapacks';
    }

    /**
     * Two maps kept separate at the source: the READ map is what the MCP
     * descriptors mirror, and datapack writes are held back from agents on
     * purpose. The panel needs both, so it registers their union.
     */
    protected handlerMaps(): readonly HandlerMap[] {
        return [dataInstallerHandlers, importHandlers, settingsHandlers, progressWindowHandlers, arrivalHandlers];
    }

    /**
     * Open the current project's Datapacks with this Clear window open (C5, P6-Q5). Refused, with a
     * message, when no project is open or it has no Commerce backend: nothing opens, nothing is held.
     *
     * @param window - Clear Demo Data (`project`) or Clear Commerce Instance (`instance`)
     */
    public async openClearWindow(window: ClearWindowKind): Promise<void> {
        const refusal = refusalOf(window, await this.stateManager.getCurrentProject());
        if (refusal) {
            void vscode.window.showWarningMessage(refusal);
            return;
        }
        const open = BaseWebviewCommand.getActivePanel(WEBVIEW_ID) !== undefined;
        if (!open) requestClearWindow(window);
        await this.execute();
        if (open) await this.sendMessage('openClearWindow', { window } satisfies OpenClearWindowPayload);
    }

    /**
     * The list follows the settings it depends on, as the wizard and Configure follow theirs, and
     * the packs themselves: a change made in the other Datapacks screen, or by an agent (F66).
     */
    protected initializeMessageHandlers(comm: WebviewCommunicationManager): void {
        super.initializeMessageHandlers(comm);
        this.disposables.add(
            vscode.workspace.onDidChangeConfiguration((event) => {
                if (affectsDatapackList(event)) void this.sendMessage(DATAPACK_LIST_CHANGED_MESSAGE);
            }),
        );
        this.disposables.add(onDatapacksChanged(() => void this.sendMessage(DATAPACK_LIST_CHANGED_MESSAGE)));
    }

    /**
     * Deliberately project-independent: the catalog is not project-scoped, so this
     * panel opens and works with no project selected. The project name rides along
     * only so the import flow can name a default target without a second round trip.
     */
    protected async getInitialData(): Promise<DataInstallerInitialData> {
        // The library reads no project: nothing in it acts on one.
        const project = this.mode === 'library' ? undefined : await this.stateManager.getCurrentProject();
        return { theme: this.themeMode(), projectName: this.projectNameOf(project), mode: this.mode };
    }

    /** Dispose any active Data Installer panel (used by sibling surfaces on swap). */
    public static disposeActivePanel(): void {
        BaseWebviewCommand.disposePanel(WEBVIEW_ID);
    }
}

