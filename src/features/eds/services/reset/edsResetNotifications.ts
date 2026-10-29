/**
 * What the SC is told when a reset finishes: the post-success warnings, the
 * missing-App error with its install link, and the failure message.
 *
 * Extracted from `edsResetUI` (EDS-8, 2026-10-08) so that file keeps only the
 * reset door's orchestration.
 *
 * @module features/eds/services/reset/edsResetNotifications
 */

import type { EdsResetResult } from './edsResetParams';

/** One warning a successful reset ends with. */
interface ResetWarning {
    message: string;
}

/**
 * What a successful reset could not do, in the order the SC should read it. One
 * list for both surfaces: notifications without a modal, the modal's last view
 * with one (found on the 2026-10-16 release walk, where a reset in the modal
 * finished clean and its warning arrived in the corner).
 */
function successWarnings(result: EdsResetResult): ResetWarning[] {
    const warnings: ResetWarning[] = [];
    // First: a site with no code serves nothing, whatever else went right.
    if (result.codeNotPublished) warnings.push({ message: result.codeNotPublished });
    // Not a progress line: `report()` writes to a line the steps after it
    // overwrite within seconds, so the remedy was gone before it could be read.
    if (result.errorType === 'CONFIG_WRITE_FAILED') {
        warnings.push({ message: result.error ?? 'Site configuration incomplete.' });
    }
    if (result.errorType === 'MESH_REDEPLOY_FAILED') {
        warnings.push({
            message: `${result.error} Commerce features may not work until mesh is manually redeployed.`,
        });
    }
    // A page step that left something undone: a category page not published, product
    // pages left live. They reached only the Debug Logs until 2026-10-23.
    for (const message of result.pageWarnings ?? []) warnings.push({ message });
    // What the content pipeline could not do (EDS-55): old pages that may still be live,
    // pages the source has that the storefront does not serve, an empty block palette.
    for (const message of result.pipelineWarnings ?? []) warnings.push({ message });
    return warnings;
}

/**
 * A reset's result for the modal that ran it: its warnings joined onto the modal's
 * last view, where the SC is looking, instead of notifications beside it. What the
 * page steps did (and the copy's broken links) go below, one line each, as `details`:
 * joined into one paragraph they read as a run-on (owner, 2026-10-23).
 *
 * @param result - the reset's result
 * @returns the result, with `warning` when a success has any and `details` for its notes
 */
export function withModalWarning(result: EdsResetResult): EdsResetResult & { details?: string[] } {
    if (!result.success) return result;
    const warning = successWarnings(result).map(({ message }) => message).join(' ');
    const details = pageNotes(result);
    if (!warning && details.length === 0) return result;
    return { ...result, ...(warning ? { warning } : {}), ...(details.length ? { details } : {}) };
}

/**
 * The page sentences that report nothing wrong ("Removed 49 product pages"): lines for the
 * modal's last view, where there is room for them. A notification shows only warnings.
 */
function pageNotes(result: EdsResetResult): string[] {
    const warned = new Set(result.pageWarnings ?? []);
    return [result.catalogMenu, result.productPages, result.brokenLinks].filter(
        (sentence): sentence is string => sentence !== undefined && !warned.has(sentence),
    );
}

/** Show result notifications after reset completes; in a modal, only what it cannot show. */
export async function showResetResultNotifications(
    vscode: typeof import('vscode'),
    result: EdsResetResult,
    projectName: string,
    showLogsOnError: boolean,
    inModal: boolean,
): Promise<void> {
    if (result.success) {
        // No timed success toast: a success closes the modal, and the notification
        // it may have handed over to ends with "— done" (PL-59 R6). In a modal the
        // warnings are on its last view (`withModalWarning`).
        if (inModal) return;
        for (const { message } of successWarnings(result)) vscode.window.showWarningMessage(message);
    } else if (result.errorType === 'GITHUB_APP_NOT_INSTALLED') {
        const selection = await vscode.window.showErrorMessage(
            `Cannot reset EDS project: The AEM Code Sync GitHub App is not installed on ${result.errorDetails?.owner}/${result.errorDetails?.repo}. ` +
                `Please install the app and try again.`,
            'Install GitHub App',
        );
        if (selection === 'Install GitHub App' && result.errorDetails?.installUrl) {
            await vscode.env.openExternal(
                vscode.Uri.parse(result.errorDetails.installUrl as string),
            );
        }
    } else if (result.error && !inModal) {
        // In a modal the reason is already on screen, with Debug Logs beside it.
        if (showLogsOnError) {
            const { getLogger } = await import('@/core/logging/debugLogger');
            vscode.window
                .showErrorMessage(`Failed to reset EDS project: ${result.error}`, 'Show Logs')
                .then((sel) => {
                    if (sel === 'Show Logs') {
                        getLogger().show(false);
                    }
                });
        } else {
            vscode.window.showErrorMessage(`Failed to reset EDS project: ${result.error}`);
        }
    }
}
