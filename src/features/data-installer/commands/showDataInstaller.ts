/**
 * Data Installer panel command.
 *
 * A standalone surface, unlike the project-scoped tabs: the datapack catalog is
 * global to the service, so this panel deliberately does NOT dispose the dashboard
 * or projects list when it opens. Browsing datapacks should not close what the user
 * was looking at.
 *
 * @module features/data-installer/commands/showDataInstaller
 */

import { StandalonePanelCommand } from '@/commands/standalonePanelCommand';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import { dataInstallerHandlers } from '@/features/data-installer/handlers/dataInstallerHandlers';
import { importHandlers } from '@/features/data-installer/handlers/importHandlers';
import { handleOpenDataInstallerSettings } from '@/features/data-installer/handlers/settingsHandlers';
import type { HandlerMap } from '@/types/handlers';
import type { DataInstallerInitialData } from '@/types/webviewPayloads';

const WEBVIEW_ID = 'demoBuilder.dataInstaller';

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

export class ShowDataInstallerCommand extends StandalonePanelCommand<DataInstallerInitialData> {
    protected readonly bundleName = 'dataInstaller';

    protected getWebviewId(): string {
        return WEBVIEW_ID;
    }

    protected getWebviewTitle(): string {
        return 'Data Installer';
    }

    protected getLoadingMessage(): string {
        return 'Loading Data Installer';
    }

    /**
     * Two maps kept separate at the source: the READ map is what the MCP
     * descriptors mirror, and datapack writes are held back from agents on
     * purpose. The panel needs both, so it registers their union.
     */
    protected handlerMaps(): readonly HandlerMap[] {
        return [dataInstallerHandlers, importHandlers, settingsHandlers];
    }

    /**
     * Deliberately project-independent: the catalog is not project-scoped, so this
     * panel opens and works with no project selected. The project name rides along
     * only so the import flow can name a default target without a second round trip.
     */
    protected async getInitialData(): Promise<DataInstallerInitialData> {
        const project = await this.stateManager.getCurrentProject();
        return { theme: this.themeMode(), projectName: this.projectNameOf(project) };
    }

    /** Dispose any active Data Installer panel (used by sibling surfaces on swap). */
    public static disposeActivePanel(): void {
        BaseWebviewCommand.disposePanel(WEBVIEW_ID);
    }
}
