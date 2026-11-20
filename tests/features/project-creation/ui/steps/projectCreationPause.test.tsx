/**
 * The creation screen while a failed step waits for the SC (F307): the step's line, why it
 * failed, the buttons that run it again, and Skip This Step beside Cancel in the footer.
 * Each button posts what it says to the extension (`creation-pause-answer`).
 */

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import React from 'react';

import type { CreationProgress } from '@/types/webview';

const mockPostMessage = jest.fn();

jest.mock('@/core/ui/utils/vscode-api', () => ({
    vscode: { postMessage: (...args: unknown[]) => mockPostMessage(...args) },
}));

// Below the mock on purpose: `jest.mock` hoists above this file's imports only.
import { StepContentArea } from '@/features/project-creation/ui/steps/projectCreationStepContent';
import { StepFooterArea } from '@/features/project-creation/ui/steps/projectCreationStepFooter';

const PAUSED: CreationProgress = {
    currentOperation: 'Installing Release Save Test 2',
    progress: 92,
    message: 'Checking for conflicts',
    logs: [],
    position: { index: 8, total: 11 },
    pause: {
        reason: 'A category already uses this web address.',
        actions: ['Fix with AI', 'Check Again'],
        canSkip: true,
    },
};

const user = () => userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

function renderBody(progress: CreationProgress) {
    return render(
        <Provider theme={defaultTheme}>
            <StepContentArea
                phase="creating"
                progress={progress}
                isActive
                isCompleted={false}
                isOpeningProject={false}
                showGenericError={false}
                isCancelled={false}
                githubAppInstallData={null}
                onGitHubAppInstalled={jest.fn()}
            />
        </Provider>
    );
}

function renderFooter(canSkipStep: boolean, isCancelling = false) {
    return render(
        <Provider theme={defaultTheme}>
            <StepFooterArea
                isActive
                isStarting={false}
                isGitHubAppInstall={false}
                isCompleted={false}
                isOpeningProject={false}
                showGenericError={false}
                isCancelling={isCancelling}
                hasError={false}
                onBack={jest.fn()}
                onCancel={jest.fn()}
                onOpenProject={jest.fn()}
                canSkipStep={canSkipStep}
            />
        </Provider>
    );
}

beforeEach(() => {
    mockPostMessage.mockReset();
});

describe('a paused step', () => {
    it('shows the step, why it failed and its buttons in place of the spinner', () => {
        renderBody(PAUSED);

        expect(screen.getByText('Installing Release Save Test 2 (8 of 11)')).toBeInTheDocument();
        expect(screen.getByText('A category already uses this web address.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Fix with AI' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Check Again' })).toBeInTheDocument();
        expect(screen.queryByText('Checking for conflicts')).not.toBeInTheDocument();
    });

    it('posts the button pressed to the extension', async () => {
        renderBody(PAUSED);

        await user().click(screen.getByRole('button', { name: 'Check Again' }));

        expect(mockPostMessage).toHaveBeenCalledWith('creation-pause-answer', {
            answer: 'Check Again',
        });
    });

    it('shows the running step again once the pause is taken down', () => {
        renderBody({ ...PAUSED, pause: undefined });

        expect(screen.getByText('Checking for conflicts')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Check Again' })).not.toBeInTheDocument();
    });
});

describe('the footer of a paused step', () => {
    it('offers Skip This Step beside Cancel, and posts it when pressed', async () => {
        renderFooter(true);

        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
        await user().click(screen.getByRole('button', { name: 'Skip This Step' }));

        expect(mockPostMessage).toHaveBeenCalledWith('creation-pause-answer', {
            answer: 'Skip This Step',
        });
    });

    it('offers no Skip This Step while the run is not paused, or is being cancelled', () => {
        const { unmount } = renderFooter(false);
        expect(screen.queryByRole('button', { name: 'Skip This Step' })).not.toBeInTheDocument();
        unmount();

        renderFooter(true, true);
        expect(screen.queryByRole('button', { name: 'Skip This Step' })).not.toBeInTheDocument();
    });
});
