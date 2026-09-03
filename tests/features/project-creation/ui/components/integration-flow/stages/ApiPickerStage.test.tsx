/**
 * ApiPickerStage Tests — the INTERACTIVE api-access step for custom/import apps.
 *
 * Fetches the org's subscribable services (`list-org-console-apis`, with the
 * baseline + already-covered APIs flagged `locked`) and renders the shared
 * ApiAccessPicker so the user can pick the APIs they know the app needs up front.
 *
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';

const mockRequest = jest.fn();
jest.mock('@/core/ui/utils/vscode-api', () => ({
    webviewClient: { request: (...args: unknown[]) => mockRequest(...args) },
}));

import { ApiPickerStage } from '@/features/project-creation/ui/components/integration-flow/stages/ApiPickerStage';

const FFS = { code: 'FireflyServicesSDK', name: 'Firefly Services', locked: false };
const BASELINE = { code: 'AdobeIOManagementAPISDK', name: 'I/O Management API', locked: true };

function renderStage(
    props: {
        componentIds?: string[];
        selected?: string[];
        /** Omitted by default — most cases never reach the signed-out view. */
        onSignIn?: () => Promise<unknown>;
    } = {}
) {
    const onToggle = jest.fn();
    render(
        <Provider theme={defaultTheme} colorScheme="light">
            <ApiPickerStage
                componentIds={props.componentIds ?? []}
                selected={props.selected ?? []}
                onToggle={onToggle}
                onSignIn={props.onSignIn}
            />
        </Provider>
    );
    return { onToggle };
}

beforeEach(() => {
    mockRequest.mockReset();
    mockRequest.mockResolvedValue({ success: true, data: { apis: [FFS, BASELINE] } });
});

describe('ApiPickerStage', () => {
    it('fetches list-org-console-apis with the already-committed component ids', async () => {
        renderStage({ componentIds: ['headless-commerce-mesh'] });
        expect(mockRequest).toHaveBeenCalledWith('list-org-console-apis', {
            componentIds: ['headless-commerce-mesh'],
        });
        await waitFor(() => expect(screen.getByText('Firefly Services')).toBeInTheDocument());
    });

    it('shows a loading state until the list resolves', () => {
        mockRequest.mockReturnValue(new Promise(() => {})); // never resolves
        renderStage();
        expect(screen.getByText(/Loading Adobe APIs/i)).toBeInTheDocument();
    });

    it('renders no redundant "API access" heading (the modal title already carries it)', async () => {
        renderStage();
        await waitFor(() => expect(screen.getByText('Firefly Services')).toBeInTheDocument());
        expect(screen.queryByText('API access')).not.toBeInTheDocument();
    });

    it('renders the picker with the fetched APIs once loaded', async () => {
        renderStage();
        await waitFor(() => {
            expect(screen.getByText('Firefly Services')).toBeInTheDocument();
            expect(screen.getByText('I/O Management API')).toBeInTheDocument();
        });
    });

    it('gives the interactive picker the full-width modal container', async () => {
        renderStage();
        await waitFor(() => expect(screen.getByText('Firefly Services')).toBeInTheDocument());
        expect(screen.getByTestId('api-picker-stage')).toHaveClass('intflow-api-info--full');
    });

    it('surfaces a fetch error inline', async () => {
        // A NON-auth failure: the retryable error view. (An AUTH_REQUIRED code routes
        // to the sign-in view instead — see the sign-in describe below.)
        mockRequest.mockResolvedValue({ success: false, error: 'Adobe API catalog unavailable.' });
        renderStage();
        await waitFor(() =>
            expect(screen.getByText('Adobe API catalog unavailable.')).toBeInTheDocument()
        );
        expect(screen.queryByText('Firefly Services')).not.toBeInTheDocument();
    });

    // Signed out is NOT retryable: Retry re-runs the same unauthenticated call and
    // fails identically. The house treatment (AdobeAuthStep) offers a sign-in action.
    describe('signed out offers sign-in, not Retry', () => {
        const signedOut = {
            success: false,
            error: 'Adobe sign-in required to list Adobe APIs.',
            code: 'AUTH_REQUIRED',
        };

        it('shows Sign In with Adobe and NO Retry', async () => {
            mockRequest.mockResolvedValue(signedOut);
            renderStage({ onSignIn: jest.fn().mockResolvedValue(undefined) });

            await waitFor(() => expect(screen.getByText('Sign in to Adobe')).toBeInTheDocument());
            expect(
                screen.getByRole('button', { name: /sign in with adobe/i }),
            ).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /^retry$/i })).not.toBeInTheDocument();
        });

        it('re-fetches after the host sign-in resolves', async () => {
            mockRequest.mockResolvedValueOnce(signedOut);
            const onSignIn = jest.fn().mockResolvedValue(undefined);
            renderStage({ onSignIn });

            await waitFor(() => expect(screen.getByText('Sign in to Adobe')).toBeInTheDocument());
            fireEvent.click(screen.getByRole('button', { name: /sign in with adobe/i }));

            await waitFor(() => expect(onSignIn).toHaveBeenCalled());
            // The retry hits the beforeEach success default.
            await waitFor(() => expect(screen.getByText('Firefly Services')).toBeInTheDocument());
        });

        it('omits the action when the host provides no sign-in', async () => {
            // Rather than a dead button: the reason still shows.
            mockRequest.mockResolvedValue(signedOut);
            renderStage();

            await waitFor(() => expect(screen.getByText('Sign in to Adobe')).toBeInTheDocument());
            expect(
                screen.queryByRole('button', { name: /sign in with adobe/i }),
            ).not.toBeInTheDocument();
        });
    });

    it('offers a Retry on failure that re-fetches and recovers', async () => {
        // A timed-out or failed list is recoverable: the error view shows a Retry that
        // re-fires list-org-console-apis. The first call fails; the retry hits the
        // beforeEach success default and the picker renders.
        mockRequest.mockResolvedValueOnce({
            success: false,
            error: 'Request timeout: list-org-console-apis',
        });
        renderStage();
        await waitFor(() => expect(screen.getByText(/Request timeout/i)).toBeInTheDocument());
        expect(mockRequest).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: /Retry/i }));

        await waitFor(() => expect(screen.getByText('Firefly Services')).toBeInTheDocument());
        expect(mockRequest).toHaveBeenCalledTimes(2);
    });

    it('toggles a free (unlocked) pick through onToggle', async () => {
        const { onToggle } = renderStage();
        await waitFor(() => expect(screen.getByText('Firefly Services')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('checkbox', { name: /Firefly Services/i }));
        expect(onToggle).toHaveBeenCalledWith('FireflyServicesSDK');
    });
});
