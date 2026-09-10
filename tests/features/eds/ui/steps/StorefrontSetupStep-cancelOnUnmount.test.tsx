/**
 * StorefrontSetupStep — cancel-on-unmount coverage.
 *
 * Closing the wizard mid-setup must send `storefront-setup-cancel` so the
 * backend can offer cleanup of the repo/content created so far. The phase
 * that historically fell through this net is `auth-recovery` (setup paused
 * for a DA.live re-auth): it was missing from the active-phase list, so a
 * user giving up at the re-auth prompt orphaned the created resources
 * silently. Decided 2026-08-22: the pause counts as active.
 */

import {
    StorefrontSetupStep,
} from './StorefrontSetupStep.testUtils';
import React from 'react';
import { render, act } from '@testing-library/react';

// ---- vscode-api mock: capture listeners, record posts ----
const mockPostMessage = jest.fn();
const messageHandlers = new Map<string, (data: unknown) => void>();
jest.mock('@/core/ui/utils/vscode-api', () => ({
    vscode: {
        postMessage: (type: string, payload?: unknown) => mockPostMessage(type, payload),
        onMessage: (type: string, handler: (data: unknown) => void) => {
            messageHandlers.set(type, handler);
            return () => messageHandlers.delete(type);
        },
    },
}));

import type { WizardState } from '@/types/webview';
import type { StorefrontSetupProgressPayload } from '@/types/webviewPayloads';

const makeState = (): WizardState => ({
    currentStep: 'storefront-setup',
    projectName: 'test-project',
    adobeAuth: { isAuthenticated: true, isChecking: false },
    edsConfig: {
        accsHost: 'https://accs.example.com',
        storeViewCode: 'default',
        customerGroup: 'general',
        repoName: 'test-repo',
        daLiveOrg: 'test-org',
        daLiveSite: 'test-site',
    },
});

function renderStep() {
    return render(
        <StorefrontSetupStep
            state={makeState()}
            updateState={jest.fn()}
            onBack={jest.fn()}
            setCanProceed={jest.fn()}
        />
    );
}

function pushProgress(payload: StorefrontSetupProgressPayload): void {
    const handler = messageHandlers.get('storefront-setup-progress');
    expect(handler).toBeDefined();
    act(() => handler?.(payload));
}

beforeEach(() => {
    mockPostMessage.mockClear();
    messageHandlers.clear();
});

describe('StorefrontSetupStep — cancel on unmount', () => {
    it('sends storefront-setup-cancel when unmounted mid-pipeline', () => {
        const { unmount } = renderStep();
        pushProgress({ phase: 'content', message: 'Copying content...', progress: 40 });

        unmount();

        expect(mockPostMessage).toHaveBeenCalledWith(
            'storefront-setup-cancel',
            expect.objectContaining({ partialState: expect.anything() })
        );
    });

    it('counts the auth-recovery pause as active setup (the give-up moment)', () => {
        const { unmount } = renderStep();
        pushProgress({ phase: 'content', message: 'Copying content...', progress: 40 });
        pushProgress({
            phase: 'auth-recovery',
            message: 'DA.live session expired. Please re-authenticate to continue.',
            progress: -1,
        });

        unmount();

        expect(mockPostMessage).toHaveBeenCalledWith(
            'storefront-setup-cancel',
            expect.objectContaining({ partialState: expect.anything() })
        );
    });

    it('does not send cancel after setup completed', () => {
        const { unmount } = renderStep();
        const complete = messageHandlers.get('storefront-setup-complete');
        expect(complete).toBeDefined();
        act(() => complete?.({ message: 'Storefront setup completed successfully!' }));

        unmount();

        expect(mockPostMessage).not.toHaveBeenCalledWith(
            'storefront-setup-cancel',
            expect.anything()
        );
    });
});
