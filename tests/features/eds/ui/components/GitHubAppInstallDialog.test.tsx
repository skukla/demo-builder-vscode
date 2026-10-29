/**
 * GitHubAppInstallDialog — the AEM Code Sync install prompt in storefront setup.
 *
 * Driven through the shared webview client stand-in: `check-github-app` answers
 * the way the host handler does.
 */

import '../../../../helpers/webviewClientMock';
import { mockRequest } from '../../../../helpers/webviewClientMock';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Provider, defaultTheme } from '@adobe/react-spectrum';

// Below the mock on purpose — see webview-test-authoring §3.
import { GitHubAppInstallDialog } from '@/features/eds/ui/components/GitHubAppInstallDialog';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

function renderDialog(onInstallDetected: () => void) {
    return render(
        <Provider theme={defaultTheme}>
            <GitHubAppInstallDialog
                owner="me"
                repo="my-store"
                installUrl="https://github.com/apps/aem-code-sync"
                message="Install the app"
                onInstallDetected={onInstallDetected}
            />
        </Provider>,
    );
}

beforeEach(() => {
    mockRequest.mockReset();
});

describe('GitHubAppInstallDialog', () => {
    it('confirms the app is installed for a moment before setup carries on (owner, 2026-10-15)', async () => {
        mockRequest.mockResolvedValue({ success: true, isInstalled: true });
        const onInstallDetected = jest.fn();
        renderDialog(onInstallDetected);

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /check again/i }));
        });

        expect(await screen.findByText('AEM Code Sync is installed')).toBeInTheDocument();
        expect(onInstallDetected).not.toHaveBeenCalled();

        act(() => {
            jest.advanceTimersByTime(TIMEOUTS.UI.RESULT_GLANCE);
        });
        expect(onInstallDetected).toHaveBeenCalledTimes(1);
    });

    it('says the app was not found when it is still missing, and does not carry on', async () => {
        mockRequest.mockResolvedValue({ success: true, isInstalled: false });
        const onInstallDetected = jest.fn();
        renderDialog(onInstallDetected);

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /check again/i }));
        });

        expect(await screen.findByText(/App not detected yet/)).toBeInTheDocument();
        act(() => {
            jest.advanceTimersByTime(TIMEOUTS.UI.RESULT_GLANCE);
        });
        expect(onInstallDetected).not.toHaveBeenCalled();
    });
});
