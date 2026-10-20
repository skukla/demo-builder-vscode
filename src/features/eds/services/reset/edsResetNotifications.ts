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

/** The reset result's button to the storefront report, where the fixes that fit are offered. */
const SEE_REPORT = 'See the storefront report';

/** The storefront report's command title, as the Command Palette shows it. */
const REPORT_TITLE = 'Storefront Report';

/** One warning a successful reset ends with. */
interface ResetWarning {
    message: string;
    /** The demo's fixes are on offer in the storefront report. */
    offersReport?: boolean;
}

/**
 * What a successful reset could not do, in the order the SC should read it. One
 * list for both surfaces: notifications without a modal, the modal's last view
 * with one (found on the 2026-10-16 release walk, where a reset in the modal
 * finished clean and its warning arrived in the corner).
 */
function successWarnings(result: EdsResetResult): ResetWarning[] {
    const warnings: ResetWarning[] = [];
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
    // The fix pass's lines for an added demo (D23, EDS-13f): the same sentences the
    // wizard's completion card shows. When fixes fit, the one door to accept them is
    // the storefront report.
    if (result.demoCaveats?.length) {
        warnings.push({
            message: `A few things to know about this demo: ${result.demoCaveats.join(' ')}`,
            offersReport: !!result.demoFixes?.offered?.length,
        });
    }
    // What the content pipeline could not do (EDS-55): old pages that may still be live,
    // pages the source has that the storefront does not serve, an empty block palette.
    for (const message of result.pipelineWarnings ?? []) warnings.push({ message });
    return warnings;
}

/**
 * A reset's result for the modal that ran it: its warnings joined onto the modal's
 * last view, where the SC is looking, instead of notifications beside it.
 *
 * @param result - the reset's result
 * @returns the result, with `warning` when a success has any
 */
export function withModalWarning(result: EdsResetResult): EdsResetResult {
    if (!result.success) return result;
    const sentences = successWarnings(result).map(({ message, offersReport }) =>
        offersReport ? `${message} ${REPORT_TITLE} offers fixes for this.` : message,
    );
    return sentences.length > 0 ? { ...result, warning: sentences.join(' ') } : result;
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
        for (const { message, offersReport } of successWarnings(result)) {
            if (!offersReport) {
                vscode.window.showWarningMessage(message);
                continue;
            }
            void vscode.window.showWarningMessage(message, SEE_REPORT).then((choice) => {
                if (choice === SEE_REPORT) void vscode.commands.executeCommand('demoBuilder.storefrontReport');
            });
        }
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
