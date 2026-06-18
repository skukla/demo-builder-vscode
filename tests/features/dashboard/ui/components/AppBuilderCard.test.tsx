/**
 * AppBuilderCard Component Tests
 *
 * The dashboard's "App Builder app" card — sibling of the mesh status card.
 * Renders one of four states from the `app` prop:
 *   - No app     : quiet copy + a public-git-URL input + Add button (gated)
 *   - Deploying  : progress/spinner + the live status message
 *   - Deployed   : status badge + action URLs (quiet Links) + Redeploy + Remove
 *   - Error      : inline message + Retry
 *
 * Buttons post addApp / deployApp / redeployApp / removeApp via the dashboard
 * message client. Strict TDD: written BEFORE the component exists.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppBuilderCard } from '@/features/dashboard/ui/components/AppBuilderCard';
import '@testing-library/jest-dom';

// Mock the dashboard message client
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
        onMessage: jest.fn(() => jest.fn()),
        request: jest.fn(() => new Promise(() => {})),
    },
}));

// Mock Spectrum primitives used by the card
jest.mock('@adobe/react-spectrum', () => ({
    View: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    Flex: ({ children, ...props }: any) => <div style={{ display: 'flex' }} {...props}>{children}</div>,
    Button: ({ children, onPress, isDisabled, variant, ...props }: any) => (
        <button onClick={onPress} disabled={isDisabled} data-variant={variant} {...props}>{children}</button>
    ),
    TextField: ({ label, value, onChange, ...props }: any) => (
        <input
            aria-label={label}
            value={value ?? ''}
            onChange={(e) => onChange?.(e.target.value)}
            {...props}
        />
    ),
    Link: ({ children, onPress, href, ...props }: any) => (
        <a onClick={onPress} href={href} {...props}>{children}</a>
    ),
    ProgressCircle: ({ ...props }: any) => <div data-testid="progress-circle" {...props} />,
    Text: ({ children, ...props }: any) => <span {...props}>{children}</span>,
}));

jest.mock('@/core/ui/components/feedback', () => ({
    StatusCard: ({ label, status, color }: any) => (
        <div data-testid={`status-card-${label}`} data-color={color}>{label}: {status}</div>
    ),
}));

function getClient() {
    const { webviewClient } = require('@/core/ui/utils/WebviewClient');
    return webviewClient as { postMessage: jest.Mock };
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('AppBuilderCard', () => {
    describe('No app state', () => {
        it('renders the URL input and an Add button', () => {
            render(<AppBuilderCard app={{ status: 'not-deployed' }} />);

            expect(screen.getByLabelText(/app.*url|github/i)).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
        });

        it('disables Add until a URL is entered', () => {
            render(<AppBuilderCard app={{ status: 'not-deployed' }} />);

            expect(screen.getByRole('button', { name: /add/i })).toBeDisabled();
        });

        it('enables Add and posts addApp with the entered URL', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<AppBuilderCard app={{ status: 'not-deployed' }} />);

            const input = screen.getByLabelText(/app.*url|github/i);
            await user.type(input, 'https://github.com/acme/my-app');

            const addBtn = screen.getByRole('button', { name: /add/i });
            expect(addBtn).toBeEnabled();
            await user.click(addBtn);

            expect(getClient().postMessage).toHaveBeenCalledWith('addApp', {
                gitUrl: 'https://github.com/acme/my-app',
            });
        });
    });

    describe('Deploying state', () => {
        it('shows a spinner and the live status message', () => {
            render(<AppBuilderCard app={{ status: 'deploying', message: 'Running aio app deploy' }} />);

            expect(screen.getByTestId('progress-circle')).toBeInTheDocument();
            expect(screen.getByText(/running aio app deploy/i)).toBeInTheDocument();
        });

        it('does not render the Add button while deploying', () => {
            render(<AppBuilderCard app={{ status: 'deploying' }} />);

            expect(screen.queryByRole('button', { name: /^add$/i })).not.toBeInTheDocument();
        });
    });

    describe('Deployed state', () => {
        const deployedApp = {
            status: 'deployed' as const,
            url: 'https://app.example.com/index.html',
            deployedUrls: {
                'web/app': 'https://app.example.com/index.html',
                'runtime/api': 'https://adobeioruntime.net/api/v1/web/ns/app/api',
            },
        };

        it('renders the deployed action URLs as links', () => {
            render(<AppBuilderCard app={deployedApp} />);

            const links = screen.getAllByRole('link');
            const hrefs = links.map((l) => l.getAttribute('href'));
            expect(hrefs).toContain('https://app.example.com/index.html');
            expect(hrefs).toContain('https://adobeioruntime.net/api/v1/web/ns/app/api');
        });

        it('renders Redeploy and Remove buttons', () => {
            render(<AppBuilderCard app={deployedApp} />);

            expect(screen.getByRole('button', { name: /redeploy/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
        });

        it('posts redeployApp when Redeploy is pressed', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<AppBuilderCard app={deployedApp} />);

            await user.click(screen.getByRole('button', { name: /redeploy/i }));

            expect(getClient().postMessage).toHaveBeenCalledWith('redeployApp');
        });

        it('posts removeApp when Remove is pressed', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<AppBuilderCard app={deployedApp} />);

            await user.click(screen.getByRole('button', { name: /remove/i }));

            expect(getClient().postMessage).toHaveBeenCalledWith('removeApp');
        });
    });

    describe('Error state', () => {
        it('shows the error message and a Retry button', () => {
            render(<AppBuilderCard app={{ status: 'error', message: 'deploy boom' }} />);

            expect(screen.getByText(/deploy boom/i)).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
        });

        it('posts deployApp when Retry is pressed', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<AppBuilderCard app={{ status: 'error', message: 'deploy boom' }} />);

            await user.click(screen.getByRole('button', { name: /retry/i }));

            expect(getClient().postMessage).toHaveBeenCalledWith('deployApp');
        });
    });
});
