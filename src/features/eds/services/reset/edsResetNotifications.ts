/**
 * What the SC is told when a reset finishes: the post-success warnings, the
 * missing-App error with its install link, and the failure message.
 *
 * Extracted from `edsResetUI` (EDS-8, 2026-10-08) so that file keeps only the
 * reset door's orchestration.
 *
 * @module features/eds/services/reset/edsResetNotifications
 */

import { LEFTOVERS_MAY_REMAIN } from '../storefront/leftoverPages';
import type { EdsResetResult } from './edsResetParams';

/** The reset result's button to the storefront report, where the fixes that fit are offered. */
const SEE_REPORT = 'See the storefront report';

/** Show result notifications after reset completes. */
export async function showResetResultNotifications(
    vscode: typeof import('vscode'),
    result: EdsResetResult,
    projectName: string,
    showLogsOnError: boolean,
    inModal: boolean,
): Promise<void> {
    if (result.success) {
        // No timed success toast: a success closes the modal, and the notification
        // it may have handed over to ends with "— done" (PL-59 R6). It used to sit
        // on screen for its own timer after the work had finished.
        if (result.errorType === 'CONFIG_WRITE_FAILED') {
            // A dialog, not a progress line: `report()` writes to the single-line
            // notification that steps 8-11 overwrite within seconds, so the
            // remedy was gone before it could be read.
            vscode.window.showWarningMessage(result.error ?? 'Site configuration incomplete.');
        }

        if (result.errorType === 'MESH_REDEPLOY_FAILED') {
            vscode.window.showWarningMessage(
                `${result.error} Commerce features may not work until mesh is manually redeployed.`,
            );
        }

        // The fix pass's lines for an added demo (D23, EDS-13f): the same sentences
        // the wizard's completion card shows, on the reset's own surface. When fixes
        // fit, the one door to accept them is the storefront report.
        if (result.demoCaveats?.length) {
            const message = `A few things to know about this demo: ${result.demoCaveats.join(' ')}`;
            if (result.demoFixes?.offered?.length) {
                void vscode.window.showWarningMessage(message, SEE_REPORT).then((choice) => {
                    if (choice === SEE_REPORT) void vscode.commands.executeCommand('demoBuilder.storefrontReport');
                });
            } else {
                vscode.window.showWarningMessage(message);
            }
        }

        // Pages from before the reset that are, or may be, still live (EDS-33). A
        // dialog for the same reason as the config remedy: the progress line that
        // said it is overwritten by the steps after it.
        if (result.leftoverPages && LEFTOVERS_MAY_REMAIN.has(result.leftoverPages.status)) {
            vscode.window.showWarningMessage(result.leftoverPages.summary);
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
