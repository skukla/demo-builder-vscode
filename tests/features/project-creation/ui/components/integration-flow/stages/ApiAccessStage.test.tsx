/**
 * ApiAccessStage Tests (Add Integration flow — API-access stage)
 *
 * Wires the shared ApiAccessPicker into the wizard: fetches the org's console APIs
 * once per mount via 'list-org-console-apis' { componentIds }, shows a COMPACT
 * loading state (not a tall centered band), an inline error + Retry on failure,
 * and the grouped picker (with the add-later guidance copy) on success. It NEVER
 * blocks the footer — there is no canProceed wiring.
 *
 * `webviewClient.request` is mocked at the module boundary; the REAL ApiAccessPicker
 * renders (it is pure), so locked/toggle behavior is exercised end-to-end.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';

const mockRequest = jest.fn();

jest.mock('@/core/ui/utils/vscode-api', () => ({
    webviewClient: {
        request: (...args: unknown[]) => mockRequest(...args),
    },
}));

import { ApiAccessStage } from '@/features/project-creation/ui/components/integration-flow/stages/ApiAccessStage';

const APIS = [
    { code: 'GraphQLServiceSDK', name: 'API Mesh', locked: true },
    { code: 'AnalyticsSDK', name: 'Adobe Analytics', locked: false },
    { code: 'TargetSDK', name: 'Adobe Target', locked: false },
];

const COMPONENT_IDS = ['app-builder-shell'];

type Props = React.ComponentProps<typeof ApiAccessStage>;

function renderStage(props: Partial<Props> = {}): { onToggle: jest.Mock } {
    const onToggle = jest.fn();
    render(
        <Provider theme={defaultTheme} colorScheme="light">
            <ApiAccessStage
                componentIds={props.componentIds ?? COMPONENT_IDS}
                suggested={props.suggested}
                selected={props.selected ?? []}
                onToggle={onToggle}
            />
        </Provider>
    );
    return { onToggle };
}

describe('ApiAccessStage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('issues exactly one list-org-console-apis request on mount with the componentIds', () => {
        mockRequest.mockReturnValue(new Promise(() => {})); // stays in flight

        renderStage();

        expect(mockRequest).toHaveBeenCalledTimes(1);
        expect(mockRequest).toHaveBeenCalledWith('list-org-console-apis', {
            componentIds: COMPONENT_IDS,
        });
    });

    it('shows a compact loading state while the request is in flight', () => {
        mockRequest.mockReturnValue(new Promise(() => {}));

        renderStage();

        expect(screen.getByRole('progressbar')).toBeInTheDocument();
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('renders the picker with the returned APIs on success (locked checked + disabled)', async () => {
        mockRequest.mockResolvedValue({ success: true, data: { apis: APIS } });

        renderStage();

        await waitFor(() => {
            expect(screen.getByText('API Mesh')).toBeInTheDocument();
        });
        expect(screen.getByText('Adobe Analytics')).toBeInTheDocument();
        const locked = screen
            .getByText('API Mesh')
            .closest('label')
            ?.querySelector('input[type="checkbox"]') as HTMLInputElement;
        expect(locked).toBeChecked();
        expect(locked).toBeDisabled();
    });

    it('renders the add-later guidance copy with the picker', async () => {
        mockRequest.mockResolvedValue({ success: true, data: { apis: APIS } });

        renderStage();

        await waitFor(() => {
            expect(screen.getByText(/add(ed)? .*later/i)).toBeInTheDocument();
        });
        expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
        expect(screen.getByText(/asking the AI/i)).toBeInTheDocument();
    });

    it('toggling an unlocked API passes the code through onToggle', async () => {
        mockRequest.mockResolvedValue({ success: true, data: { apis: APIS } });

        const { onToggle } = renderStage();

        await waitFor(() => {
            expect(screen.getByText('Adobe Analytics')).toBeInTheDocument();
        });
        const checkbox = screen
            .getByText('Adobe Analytics')
            .closest('label')
            ?.querySelector('input[type="checkbox"]') as HTMLInputElement;
        fireEvent.click(checkbox);
        expect(onToggle).toHaveBeenCalledWith('AnalyticsSDK');
    });

    it('handler failure shows the inline error with a Retry button (no picker)', async () => {
        mockRequest.mockResolvedValue({ success: false, error: 'org listing failed' });

        renderStage();

        await waitFor(() => {
            expect(screen.getByText('org listing failed')).toBeInTheDocument();
        });
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('a transport rejection also lands in the inline error state', async () => {
        mockRequest.mockRejectedValue(new Error('socket closed'));

        renderStage();

        await waitFor(() => {
            expect(screen.getByText('socket closed')).toBeInTheDocument();
        });
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    it('Retry refetches and renders the picker on success', async () => {
        mockRequest.mockResolvedValueOnce({ success: false, error: 'nope' });

        renderStage();

        await waitFor(() => {
            expect(screen.getByText('nope')).toBeInTheDocument();
        });

        mockRequest.mockResolvedValueOnce({ success: true, data: { apis: APIS } });
        fireEvent.click(screen.getByRole('button', { name: /retry/i }));

        await waitFor(() => {
            expect(screen.getByText('Adobe Analytics')).toBeInTheDocument();
        });
        expect(mockRequest).toHaveBeenCalledTimes(2);
    });
});
