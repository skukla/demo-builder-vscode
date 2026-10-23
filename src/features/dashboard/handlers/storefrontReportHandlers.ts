/**
 * The storefront report's window on the project dashboard (EDS-64).
 *
 * The report used to open as a markdown document beside the dashboard, followed by modals
 * that offered to change the code. It is now a window over the dashboard that only reads:
 * `getStorefrontReport` answers what it shows (Pattern B). Its actions are the dashboard's
 * own (Reset), or open a page in DA.live.
 *
 * `Demo Builder: Storefront Report` from the Command Palette opens the dashboard with the
 * window open. A panel just created cannot be pushed to, because its listeners attach
 * after mount, so the request is held here and the screen takes it once mounted
 * (`takeStorefrontReportRequest`); a panel already open is pushed `showStorefrontReport`.
 * The same shape as the projects list's Updates modal (`updatesModalRequest.ts`).
 *
 * A boundary (ADR-015): it fetches its services here and hands them in.
 *
 * @module features/dashboard/handlers/storefrontReportHandlers
 */

import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import { readStorefrontReport, storefrontReportView } from '@/features/eds/services/storefront/storefrontReport';
import { createStorefrontReportDeps } from '@/features/eds/services/storefront/storefrontReportDeps';
import type { MessageHandler } from '@/types/handlers';
import { toError } from '@/types/typeGuards';
import type { GetStorefrontReportResponse, TakeStorefrontReportRequestResponse } from '@/types/webviewPayloads';

let requested = false;

/** Hold a request for the next dashboard that mounts. */
export function requestStorefrontReport(): void {
    requested = true;
}

/** `takeStorefrontReportRequest`: whether to open the window now; the request is used up either way. */
export const handleTakeStorefrontReportRequest: MessageHandler<unknown, TakeStorefrontReportRequestResponse> =
    async () => {
        const show = requested;
        requested = false;
        return { success: true, data: { show } };
    };

/** `getStorefrontReport`: the report for the dashboard's project, as the window shows it. */
export const handleGetStorefrontReport: MessageHandler<unknown, GetStorefrontReportResponse> = async (context) => {
    const project = await context.stateManager.getCurrentProject();
    if (!project) return { success: false, error: 'No project is open.' };
    try {
        const report = await readStorefrontReport(project, createStorefrontReportDeps(context.context.secrets, context.logger));
        if (!report) {
            return {
                success: false,
                error: `${getProjectDisplayName(project)} has no Edge Delivery storefront to report on.`,
            };
        }
        return { success: true, data: storefrontReportView(report) };
    } catch (error) {
        context.logger.error('[Storefront Report] Could not read the report', toError(error));
        return { success: false, error: `Could not read the storefront report: ${toError(error).message}` };
    }
};
