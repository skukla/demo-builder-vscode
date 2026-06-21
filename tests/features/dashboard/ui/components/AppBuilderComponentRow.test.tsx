/**
 * AppBuilderComponentRow Component Tests (D2 Track B — Step 05)
 *
 * The per-appBuilderComponent row on the dashboard integrations list. Reuses the
 * AppBuilderCard 4-state machine (not-deployed / deploying / deployed / error)
 * but is keyed by an `id`, so every action dispatches an ID-SCOPED message via
 * the dashboard message client:
 *   - not-deployed : Deploy   → deployAppBuilderComponent   {id}
 *   - deployed     : Redeploy → redeployAppBuilderComponent {id}
 *                    Remove   → removeAppBuilderComponent   {id}
 *                    Verify   → verifyAppBuilderComponent   {id}  (StatusCard.action, on-demand)
 *   - error        : Retry    → deployAppBuilderComponent   {id}
 *
 * Strict TDD: written BEFORE the component exists.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppBuilderComponentRow } from '@/features/dashboard/ui/components/AppBuilderComponentRow';
import type { IdentifiedAppBuilderComponent } from '@/features/app-builder/services/appBuilderComponentState';
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
    Flex: ({ children, ...props }: any) => <div style={{ display: 'flex' }} {...props}>{children}</div>,
    Button: ({ children, onPress, isDisabled, variant, ...props }: any) => (
        <button onClick={onPress} disabled={isDisabled} data-variant={variant} {...props}>{children}</button>
    ),
    Link: ({ children, onPress, href, ...props }: any) => (
        <a onClick={onPress} href={href} {...props}>{children}</a>
    ),
    ProgressCircle: ({ ...props }: any) => <div data-testid="progress-circle" {...props} />,
    Text: ({ children, ...props }: any) => <span {...props}>{children}</span>,
}));

// StatusCard renders its action prop so the "Verify" CTA is assertable.
jest.mock('@/core/ui/components/feedback', () => ({
    StatusCard: ({ label, status, color, action }: any) => (
        <div data-testid={`status-card-${label}`} data-color={color}>
            {label}: {status}
            {action && (
                <a data-testid={action.testId} onClick={action.onPress}>{action.label}</a>
            )}
        </div>
    ),
}));

function getClient() {
    const { webviewClient } = require('@/core/ui/utils/WebviewClient');
    return webviewClient as { postMessage: jest.Mock };
}

function row(overrides: Partial<IdentifiedAppBuilderComponent> = {}): IdentifiedAppBuilderComponent {
    return {
        id: 'erp-sync',
        kind: 'integration',
        status: 'not-deployed',
        source: { owner: 'acme', repo: 'erp-sync' },
        ...overrides,
    } as IdentifiedAppBuilderComponent;
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('AppBuilderComponentRow', () => {
    describe('not-deployed state', () => {
        it('renders a Deploy CTA', () => {
            render(<AppBuilderComponentRow appBuilderComponent={row({ status: 'not-deployed' })} />);

            expect(screen.getByRole('button', { name: /deploy/i })).toBeInTheDocument();
        });

        it('posts deployAppBuilderComponent with the row id when Deploy is pressed', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<AppBuilderComponentRow appBuilderComponent={row({ id: 'erp-sync', status: 'not-deployed' })} />);

            await user.click(screen.getByRole('button', { name: /deploy/i }));

            expect(getClient().postMessage).toHaveBeenCalledWith('deployAppBuilderComponent', { id: 'erp-sync' });
        });
    });

    describe('deploying state', () => {
        it('shows a spinner and the live message', () => {
            render(<AppBuilderComponentRow appBuilderComponent={row({ status: 'deploying' })} message="Cloning repo" />);

            expect(screen.getByTestId('progress-circle')).toBeInTheDocument();
            expect(screen.getByText(/cloning repo/i)).toBeInTheDocument();
        });

        it('does not render a Deploy button while deploying', () => {
            render(<AppBuilderComponentRow appBuilderComponent={row({ status: 'deploying' })} />);

            expect(screen.queryByRole('button', { name: /^deploy$/i })).not.toBeInTheDocument();
        });
    });

    describe('deployed state', () => {
        const deployed = row({
            id: 'erp-sync',
            status: 'deployed',
            url: 'https://erp.example.com',
            deployedUrls: { 'web/app': 'https://erp.example.com', 'runtime/api': 'https://rt.example.com/api' },
        });

        it('renders the deployedUrls as quiet links', () => {
            render(<AppBuilderComponentRow appBuilderComponent={deployed} />);

            const hrefs = screen.getAllByRole('link').map((l) => l.getAttribute('href'));
            expect(hrefs).toContain('https://erp.example.com');
            expect(hrefs).toContain('https://rt.example.com/api');
        });

        it('renders Redeploy and Remove buttons', () => {
            render(<AppBuilderComponentRow appBuilderComponent={deployed} />);

            expect(screen.getByRole('button', { name: /redeploy/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
        });

        it('posts redeployAppBuilderComponent with the id when Redeploy is pressed', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<AppBuilderComponentRow appBuilderComponent={deployed} />);

            await user.click(screen.getByRole('button', { name: /redeploy/i }));

            expect(getClient().postMessage).toHaveBeenCalledWith('redeployAppBuilderComponent', { id: 'erp-sync' });
        });

        it('bubbles Remove up via onRemove (so the list can confirm) and does NOT post directly', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            const onRemove = jest.fn();
            render(<AppBuilderComponentRow appBuilderComponent={deployed} onRemove={onRemove} />);

            await user.click(screen.getByRole('button', { name: /remove/i }));

            expect(onRemove).toHaveBeenCalledTimes(1);
            // The row never tears down on its own — the confirm guard lives in the list.
            expect(getClient().postMessage).not.toHaveBeenCalledWith('removeAppBuilderComponent', expect.anything());
        });

        it('exposes a per-row Verify action that posts verifyAppBuilderComponent with the id', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<AppBuilderComponentRow appBuilderComponent={deployed} />);

            const verify = screen.getByText(/verify/i);
            await user.click(verify);

            expect(getClient().postMessage).toHaveBeenCalledWith('verifyAppBuilderComponent', { id: 'erp-sync' });
        });
    });

    describe('error state', () => {
        it('shows the message and a Retry button', () => {
            render(<AppBuilderComponentRow appBuilderComponent={row({ status: 'error' })} message="deploy boom" />);

            expect(screen.getByText(/deploy boom/i)).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
        });

        it('posts deployAppBuilderComponent with the id when Retry is pressed', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<AppBuilderComponentRow appBuilderComponent={row({ id: 'erp-sync', status: 'error' })} message="boom" />);

            await user.click(screen.getByRole('button', { name: /retry/i }));

            expect(getClient().postMessage).toHaveBeenCalledWith('deployAppBuilderComponent', { id: 'erp-sync' });
        });
    });
});
