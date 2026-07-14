/**
 * ApiPickerStage Tests — the INTERACTIVE api-access step for custom/import apps.
 *
 * Fetches the org's subscribable services (`list-org-console-apis`, with the
 * baseline + already-covered APIs flagged `locked`) and renders the shared
 * ApiAccessPicker so the user can pick the APIs they know the app needs up front.
 *
 * @jest-environment jsdom
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
    props: { componentIds?: string[]; selected?: string[]; confirmed?: boolean } = {}
) {
    const onToggle = jest.fn();
    render(
        <Provider theme={defaultTheme} colorScheme="light">
            <ApiPickerStage
                componentIds={props.componentIds ?? []}
                selected={props.selected ?? []}
                onToggle={onToggle}
                confirmed={props.confirmed}
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

    it('renders the picker with the fetched APIs once loaded', async () => {
        renderStage();
        await waitFor(() => {
            expect(screen.getByText('Firefly Services')).toBeInTheDocument();
            expect(screen.getByText('I/O Management API')).toBeInTheDocument();
        });
    });

    it('surfaces a fetch error inline', async () => {
        mockRequest.mockResolvedValue({ success: false, error: 'Adobe sign-in required.' });
        renderStage();
        await waitFor(() =>
            expect(screen.getByText('Adobe sign-in required.')).toBeInTheDocument()
        );
        expect(screen.queryByText('Firefly Services')).not.toBeInTheDocument();
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
        await waitFor(() =>
            expect(screen.getByText(/Request timeout/i)).toBeInTheDocument()
        );
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

    it('confirmed: shows the picked APIs as a ✓ summary, not the interactive picker', async () => {
        renderStage({ selected: ['FireflyServicesSDK'], confirmed: true });
        await waitFor(() => expect(screen.getByTestId('api-picker-confirmed')).toBeInTheDocument());
        // The chosen API is listed by name; no pickable checkbox on the confirmation.
        expect(screen.getByText('Firefly Services')).toBeInTheDocument();
        expect(screen.queryByRole('checkbox', { name: /Firefly Services/i })).toBeNull();
    });

    it('confirmed with no picks: says the baseline covers the app', async () => {
        renderStage({ selected: [], confirmed: true });
        await waitFor(() => expect(screen.getByTestId('api-picker-confirmed')).toBeInTheDocument());
        expect(screen.getByText(/baseline Adobe I\/O access covers this app/i)).toBeInTheDocument();
    });
});
