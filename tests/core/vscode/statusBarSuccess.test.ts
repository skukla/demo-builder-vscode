import * as vscode from 'vscode';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { showSuccessInStatusBar } from '@/core/vscode/statusBarSuccess';

/** The one success line: ✅, for the standard success time (owner, 2026-10-15). */
describe('showSuccessInStatusBar', () => {
    it('shows a ✅ line for the standard success time', () => {
        showSuccessInStatusBar('Signed in to Adobe');

        expect(vscode.window.setStatusBarMessage).toHaveBeenCalledWith(
            '✅ Signed in to Adobe',
            TIMEOUTS.STATUS_BAR_SUCCESS,
        );
    });
});
