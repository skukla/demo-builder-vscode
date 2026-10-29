/**
 * Site access webview command (`demoBuilder.manageSiteAccess`).
 *
 * Its own webview rather than a modal on the dashboard: Site access must open
 * with no project at all — from the palette, from a toast, by a teammate
 * granting a role on someone else's behalf — and a modal needs a host screen.
 * Like the Data Installer it does not dispose the dashboard or projects list.
 *
 * @module features/eds/commands/showSiteAccess
 */

import { StandalonePanelCommand } from '@/commands/standalonePanelCommand';
import { siteAccessHandlers } from '@/features/eds/handlers/siteAccessHandlers';
import type { HandlerMap } from '@/types/handlers';
import { getEdsRepoParts } from '@/types/typeGuards';
import type { SiteAccessInitialData } from '@/types/webviewPayloads';

export class ShowSiteAccessCommand extends StandalonePanelCommand<SiteAccessInitialData> {
    protected readonly bundleName = 'siteAccess';

    protected getWebviewId(): string {
        return 'demoBuilder.siteAccess';
    }

    protected getWebviewTitle(): string {
        return 'Site Access';
    }

    protected getLoadingMessage(): string {
        return 'Loading Site Access';
    }

    protected handlerMaps(): readonly HandlerMap[] {
        return [siteAccessHandlers];
    }

    protected async getInitialData(): Promise<SiteAccessInitialData> {
        const project = await this.stateManager.getCurrentProject();
        return {
            theme: this.themeMode(),
            projectName: this.projectNameOf(project),
            hasStorefront: Boolean(getEdsRepoParts(project)),
        };
    }
}
