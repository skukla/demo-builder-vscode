/**
 * diagnostics — runDiagnosticsAction
 *
 * What remains of `diagnostics-copyReport.test.ts` after the copy-report tests
 * moved to `diagnosticsReport-copyReport.test.ts` on 2026-09-07 (PL-45).
 * `runDiagnosticsAction` IS declared in `diagnostics.ts`, so these five tests
 * were the only ones in that file scored against the right module.
 *
 * Found by running Diagnostics in a real Extension Host for the first time —
 * neither case was visible from unit tests.
 */

import * as vscode from 'vscode';
import { createMockDebugLogger, runDiagnosticsAction } from './diagnostics.testUtils';

describe('runDiagnosticsAction', () => {
    /**
 * `runDiagnosticsAction` declares `DebugLogger`, not `Logger` — it calls `show()`
 * to reveal the output channel. The two are different interfaces and both live on
 * `HandlerContext`; picking the wrong builder here is what the compiler caught.
 */
const logger = createMockDebugLogger();
    const SUMMARY = '=== DIAGNOSTICS SUMMARY ===\nSystem: darwin';

    beforeEach(() => jest.clearAllMocks());

    it('copies the summary when Copy Report is chosen', async () => {
        await runDiagnosticsAction('Copy Report', SUMMARY, logger);

        expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith(SUMMARY);
    });

    it('confirms the copy so the user knows it worked', async () => {
        await runDiagnosticsAction('Copy Report', SUMMARY, logger);

        expect(vscode.window.showInformationMessage).toHaveBeenCalled();
    });

    it('still reveals the channel for Show Logs', async () => {
        await runDiagnosticsAction('Show Logs', SUMMARY, logger);

        expect(logger.show).toHaveBeenCalled();
        expect(vscode.env.clipboard.writeText).not.toHaveBeenCalled();
    });

    it('still exports for Export Log', async () => {
        await runDiagnosticsAction('Export Log', SUMMARY, logger);

        expect(logger.exportDebugLog).toHaveBeenCalled();
        expect(vscode.env.clipboard.writeText).not.toHaveBeenCalled();
    });

    it('does nothing when the notification is dismissed', async () => {
        await runDiagnosticsAction(undefined, SUMMARY, logger);

        expect(vscode.env.clipboard.writeText).not.toHaveBeenCalled();
        expect(logger.show).not.toHaveBeenCalled();
        expect(logger.exportDebugLog).not.toHaveBeenCalled();
    });
});
