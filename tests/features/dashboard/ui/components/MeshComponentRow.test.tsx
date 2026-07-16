/**
 * MeshComponentRow Component Tests (ADR-011 D3 Step 08)
 *
 * The mesh's row in the dashboard integrations list — the ONE mesh surface
 * after Step 08 retires the masthead badge and the Deploy Mesh tile. Renders
 * the live mesh status (the same StatusDisplay the badge used) and routes its
 * Deploy/Redeploy action to the EXISTING mesh deploy path (the injected
 * onDeploy → 'deployMesh'), NOT the keyed `aio app deploy` messages. Mesh has
 * NO Manage APIs and NO Remove (mesh lifecycle is owned by the project config).
 *
 * Strict TDD: written BEFORE the component exists.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MeshComponentRow } from '@/features/dashboard/ui/components/MeshComponentRow';
import '@testing-library/jest-dom';

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
        onMessage: jest.fn(() => jest.fn()),
        request: jest.fn(() => new Promise(() => {})),
    },
}));

jest.mock('@adobe/react-spectrum', () => ({
    View: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    Flex: ({ children, ...props }: any) => (
        <div style={{ display: 'flex' }} {...props}>
            {children}
        </div>
    ),
    Button: ({ children, onPress, isDisabled, variant, ...props }: any) => (
        <button onClick={onPress} disabled={isDisabled} data-variant={variant} {...props}>
            {children}
        </button>
    ),
    Link: ({ children, onPress, href, ...props }: any) => (
        <a onClick={onPress} href={href} {...props}>
            {children}
        </a>
    ),
    ProgressCircle: ({ ...props }: any) => <div data-testid="progress-circle" {...props} />,
    Text: ({ children, ...props }: any) => <span {...props}>{children}</span>,
}));

jest.mock('@/core/ui/components/feedback', () => ({
    StatusCard: ({ label, status, color, action }: any) => (
        <div data-testid={`status-card-${label}`} data-color={color}>
            {label}: {status}
            {action && (
                <a data-testid={action.testId ?? 'status-card-action'} onClick={action.onPress}>
                    {action.label}
                </a>
            )}
        </div>
    ),
}));

function renderRow(overrides: Partial<React.ComponentProps<typeof MeshComponentRow>> = {}) {
    const onDeploy = jest.fn();
    const onReAuthenticate = jest.fn();
    const props: React.ComponentProps<typeof MeshComponentRow> = {
        statusDisplay: { color: 'green', text: 'Deployed' },
        status: 'deployed',
        isActionDisabled: false,
        onDeploy,
        onReAuthenticate,
        ...overrides,
    };
    render(<MeshComponentRow {...props} />);
    return { onDeploy, onReAuthenticate };
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('MeshComponentRow', () => {
    it('renders the API Mesh status card with the live display text and color', () => {
        renderRow({ statusDisplay: { color: 'green', text: 'Deployed' }, status: 'deployed' });

        const card = screen.getByTestId('status-card-API Mesh');
        expect(card).toHaveTextContent('API Mesh: Deployed');
        expect(card).toHaveAttribute('data-color', 'green');
    });

    it('offers Redeploy (→ onDeploy, the mesh deploy path) when deployed', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        const { onDeploy } = renderRow({ status: 'deployed' });

        await user.click(screen.getByRole('button', { name: /^redeploy$/i }));

        expect(onDeploy).toHaveBeenCalledTimes(1);
    });

    it('offers Deploy (→ onDeploy) when not deployed', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        const { onDeploy } = renderRow({
            statusDisplay: { color: 'gray', text: 'Not deployed' },
            status: 'not-deployed',
        });

        await user.click(screen.getByRole('button', { name: /^deploy$/i }));

        expect(onDeploy).toHaveBeenCalledTimes(1);
    });

    it('offers Redeploy for config-changed (stale) status', () => {
        renderRow({
            statusDisplay: { color: 'yellow', text: 'Redeploy Mesh' },
            status: 'config-changed',
        });

        expect(screen.getByRole('button', { name: /^redeploy$/i })).toBeInTheDocument();
    });

    it('offers Redeploy for error status (the retry path)', () => {
        renderRow({ statusDisplay: { color: 'red', text: 'Error' }, status: 'error' });

        expect(screen.getByRole('button', { name: /^redeploy$/i })).toBeInTheDocument();
    });

    it('renders the deploying spinner + message with NO action buttons', () => {
        renderRow({
            statusDisplay: { color: 'blue', text: 'Building mesh configuration...' },
            status: 'deploying',
        });

        expect(screen.getByTestId('progress-circle')).toBeInTheDocument();
        expect(screen.getByText(/Building mesh configuration/i)).toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('surfaces the Sign in remediation (→ onReAuthenticate) for needs-auth, with no deploy button', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        const { onReAuthenticate, onDeploy } = renderRow({
            statusDisplay: { color: 'yellow', text: 'Session expired' },
            status: 'needs-auth',
        });

        expect(screen.queryByRole('button', { name: /deploy/i })).not.toBeInTheDocument();
        await user.click(screen.getByText(/^sign in$/i));

        expect(onReAuthenticate).toHaveBeenCalledTimes(1);
        expect(onDeploy).not.toHaveBeenCalled();
    });

    it('shows no action button while checking', () => {
        renderRow({
            statusDisplay: { color: 'blue', text: 'Checking status...' },
            status: 'checking',
        });

        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('disables the action button when isActionDisabled', () => {
        renderRow({ status: 'deployed', isActionDisabled: true });

        expect(screen.getByRole('button', { name: /^redeploy$/i })).toBeDisabled();
    });

    it('never renders Manage APIs or Remove (mesh is not a keyed-action row)', () => {
        renderRow({ status: 'deployed' });

        expect(screen.queryByRole('button', { name: /manage apis/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
    });
});
