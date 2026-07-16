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

// Catalog lookup (rename gate): undefined by default — instance/custom-import
// ids never resolve in the catalog, so rows stay renamable unless a test
// makes the id a pre-built catalog entry.
const mockGetAppBuilderComponentEntry = jest.fn();
jest.mock('@/features/project-creation/services/appBuilderComponentCatalogLoader', () => ({
    getAppBuilderComponentEntry: (...a: unknown[]) => mockGetAppBuilderComponentEntry(...a),
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

// StatusCard renders its action prop so the "Verify" CTA is assertable.
jest.mock('@/core/ui/components/feedback', () => ({
    StatusCard: ({ label, status, color, action }: any) => (
        <div data-testid={`status-card-${label}`} data-color={color}>
            {label}: {status}
            {action && (
                <a data-testid={action.testId} onClick={action.onPress}>
                    {action.label}
                </a>
            )}
        </div>
    ),
}));

function getClient() {
    const { webviewClient } = require('@/core/ui/utils/WebviewClient');
    return webviewClient as { postMessage: jest.Mock };
}

function row(
    overrides: Partial<IdentifiedAppBuilderComponent> = {}
): IdentifiedAppBuilderComponent {
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
            render(
                <AppBuilderComponentRow appBuilderComponent={row({ status: 'not-deployed' })} />
            );

            expect(screen.getByRole('button', { name: /deploy/i })).toBeInTheDocument();
        });

        it('posts deployAppBuilderComponent with the row id when Deploy is pressed', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(
                <AppBuilderComponentRow
                    appBuilderComponent={row({ id: 'erp-sync', status: 'not-deployed' })}
                />
            );

            await user.click(screen.getByRole('button', { name: /deploy/i }));

            expect(getClient().postMessage).toHaveBeenCalledWith('deployAppBuilderComponent', {
                id: 'erp-sync',
            });
        });
    });

    describe('deploying state', () => {
        it('shows a spinner and the live message', () => {
            render(
                <AppBuilderComponentRow
                    appBuilderComponent={row({ status: 'deploying' })}
                    message="Cloning repo"
                />
            );

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
            deployedUrls: {
                'web/app': 'https://erp.example.com',
                'runtime/api': 'https://rt.example.com/api',
            },
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

            expect(getClient().postMessage).toHaveBeenCalledWith('redeployAppBuilderComponent', {
                id: 'erp-sync',
            });
        });

        it('bubbles Remove up via onRemove (so the list can confirm) and does NOT post directly', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            const onRemove = jest.fn();
            render(<AppBuilderComponentRow appBuilderComponent={deployed} onRemove={onRemove} />);

            await user.click(screen.getByRole('button', { name: /remove/i }));

            expect(onRemove).toHaveBeenCalledTimes(1);
            // The row never tears down on its own — the confirm guard lives in the list.
            expect(getClient().postMessage).not.toHaveBeenCalledWith(
                'removeAppBuilderComponent',
                expect.anything()
            );
        });

        it('exposes a per-row Verify action that posts verifyAppBuilderComponent with the id', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<AppBuilderComponentRow appBuilderComponent={deployed} />);

            const verify = screen.getByText(/verify/i);
            await user.click(verify);

            expect(getClient().postMessage).toHaveBeenCalledWith('verifyAppBuilderComponent', {
                id: 'erp-sync',
            });
        });
    });

    describe('Manage APIs action (Step 11 — dashboard API-access parity)', () => {
        const deployed = row({
            id: 'erp-sync',
            status: 'deployed',
            url: 'https://erp.example.com',
        });

        it('renders a Manage APIs action when deployed', () => {
            render(
                <AppBuilderComponentRow
                    appBuilderComponent={deployed}
                    onRemove={jest.fn()}
                    onManageApis={jest.fn()}
                />
            );

            expect(screen.getByRole('button', { name: /manage apis/i })).toBeInTheDocument();
        });

        it('renders a Manage APIs action when stale (still deployed, drift-flagged)', () => {
            render(
                <AppBuilderComponentRow
                    appBuilderComponent={row({ status: 'stale', url: 'https://erp.example.com' })}
                    onRemove={jest.fn()}
                    onManageApis={jest.fn()}
                />
            );

            expect(screen.getByRole('button', { name: /manage apis/i })).toBeInTheDocument();
        });

        it('offers no Manage APIs action while not-deployed, deploying, or errored', () => {
            const { rerender } = render(
                <AppBuilderComponentRow
                    appBuilderComponent={row({ status: 'not-deployed' })}
                    onRemove={jest.fn()}
                    onManageApis={jest.fn()}
                />
            );
            expect(screen.queryByRole('button', { name: /manage apis/i })).not.toBeInTheDocument();

            rerender(
                <AppBuilderComponentRow
                    appBuilderComponent={row({ status: 'deploying' })}
                    onRemove={jest.fn()}
                    onManageApis={jest.fn()}
                />
            );
            expect(screen.queryByRole('button', { name: /manage apis/i })).not.toBeInTheDocument();

            rerender(
                <AppBuilderComponentRow
                    appBuilderComponent={row({ status: 'error' })}
                    onRemove={jest.fn()}
                    onManageApis={jest.fn()}
                />
            );
            expect(screen.queryByRole('button', { name: /manage apis/i })).not.toBeInTheDocument();
        });

        it('bubbles Manage APIs up via onManageApis (the list hosts the shared modal) without posting', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            const onManageApis = jest.fn();
            render(
                <AppBuilderComponentRow
                    appBuilderComponent={deployed}
                    onRemove={jest.fn()}
                    onManageApis={onManageApis}
                />
            );

            await user.click(screen.getByRole('button', { name: /manage apis/i }));

            expect(onManageApis).toHaveBeenCalledTimes(1);
            expect(getClient().postMessage).not.toHaveBeenCalled();
        });
    });

    describe('display name (shell instancing — Step 7)', () => {
        it('deployed label prefers the persisted display name', () => {
            render(
                <AppBuilderComponentRow
                    appBuilderComponent={row({
                        id: 'firefly-image-gen',
                        name: 'Firefly Image Gen',
                        status: 'deployed',
                        url: 'https://firefly.example.com',
                    })}
                    onRemove={jest.fn()}
                    onManageApis={jest.fn()}
                />
            );

            expect(screen.getByTestId('status-card-Firefly Image Gen')).toBeInTheDocument();
            expect(screen.queryByTestId('status-card-firefly-image-gen')).not.toBeInTheDocument();
        });

        it('deployed label falls back to the id when no name is persisted', () => {
            render(
                <AppBuilderComponentRow
                    appBuilderComponent={row({
                        id: 'erp-sync',
                        status: 'deployed',
                        url: 'https://erp.example.com',
                    })}
                    onRemove={jest.fn()}
                    onManageApis={jest.fn()}
                />
            );

            expect(screen.getByTestId('status-card-erp-sync')).toBeInTheDocument();
        });

        it('error label prefers the persisted display name', () => {
            render(
                <AppBuilderComponentRow
                    appBuilderComponent={row({
                        id: 'firefly-image-gen',
                        name: 'Firefly Image Gen',
                        status: 'error',
                    })}
                    message="boom"
                    onRemove={jest.fn()}
                    onManageApis={jest.fn()}
                />
            );

            expect(screen.getByTestId('status-card-Firefly Image Gen')).toBeInTheDocument();
        });

        it('error label falls back to the id when no name is persisted', () => {
            render(
                <AppBuilderComponentRow
                    appBuilderComponent={row({ id: 'erp-sync', status: 'error' })}
                    message="boom"
                    onRemove={jest.fn()}
                    onManageApis={jest.fn()}
                />
            );

            expect(screen.getByTestId('status-card-erp-sync')).toBeInTheDocument();
        });

        it('id-scoped messages keep dispatching the id (never the display name)', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(
                <AppBuilderComponentRow
                    appBuilderComponent={row({
                        id: 'firefly-image-gen',
                        name: 'Firefly Image Gen',
                        status: 'deployed',
                        url: 'https://firefly.example.com',
                    })}
                    onRemove={jest.fn()}
                    onManageApis={jest.fn()}
                />
            );

            await user.click(screen.getByRole('button', { name: /redeploy/i }));

            expect(getClient().postMessage).toHaveBeenCalledWith('redeployAppBuilderComponent', {
                id: 'firefly-image-gen',
            });
        });
    });

    describe('Rename action (shell instancing — Step 10, dashboard rename)', () => {
        const deployed = row({
            id: 'firefly-image-gen',
            name: 'Firefly Image Gen',
            status: 'deployed',
            url: 'https://firefly.example.com',
        });

        it('renders a Rename action when deployed and posts renameAppBuilderComponent with the id', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(
                <AppBuilderComponentRow
                    appBuilderComponent={deployed}
                    onRemove={jest.fn()}
                    onManageApis={jest.fn()}
                />
            );

            await user.click(screen.getByRole('button', { name: /rename/i }));

            // The extension owns the input surface (showInputBox) — the row only
            // dispatches the id-scoped message, never the display name.
            expect(getClient().postMessage).toHaveBeenCalledWith('renameAppBuilderComponent', {
                id: 'firefly-image-gen',
            });
        });

        it('offers no Rename for a pre-built CATALOG integration (redeploy would revert it)', () => {
            // The runner resolves catalog-first and rewrites `name: entry.name`
            // on redeploy — a catalog-id rename would be silently reverted.
            mockGetAppBuilderComponentEntry.mockReturnValue({
                id: 'erp-sync',
                name: 'ERP Sync',
                kind: 'integration',
            });
            render(
                <AppBuilderComponentRow
                    appBuilderComponent={row({
                        id: 'erp-sync',
                        status: 'deployed',
                        url: 'https://erp.example.com',
                    })}
                    onRemove={jest.fn()}
                    onManageApis={jest.fn()}
                />
            );

            expect(screen.queryByRole('button', { name: /rename/i })).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: /redeploy/i })).toBeInTheDocument();
        });

        it('offers no Rename for a mesh-kind entry (fixed "API Mesh" identity)', () => {
            render(
                <AppBuilderComponentRow
                    appBuilderComponent={row({
                        kind: 'mesh',
                        status: 'deployed',
                        url: 'https://mesh.example.com',
                    })}
                    onRemove={jest.fn()}
                    onManageApis={jest.fn()}
                />
            );

            expect(screen.queryByRole('button', { name: /rename/i })).not.toBeInTheDocument();
        });

        it('offers no Rename while not-deployed (deployed/stale rows only, like Manage APIs)', () => {
            render(
                <AppBuilderComponentRow
                    appBuilderComponent={row({ status: 'not-deployed' })}
                    onRemove={jest.fn()}
                    onManageApis={jest.fn()}
                />
            );

            expect(screen.queryByRole('button', { name: /rename/i })).not.toBeInTheDocument();
        });
    });

    describe('error state', () => {
        it('shows the message and a Retry button', () => {
            render(
                <AppBuilderComponentRow
                    appBuilderComponent={row({ status: 'error' })}
                    message="deploy boom"
                />
            );

            expect(screen.getByText(/deploy boom/i)).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
        });

        it('posts deployAppBuilderComponent with the id when Retry is pressed', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(
                <AppBuilderComponentRow
                    appBuilderComponent={row({ id: 'erp-sync', status: 'error' })}
                    message="boom"
                />
            );

            await user.click(screen.getByRole('button', { name: /retry/i }));

            expect(getClient().postMessage).toHaveBeenCalledWith('deployAppBuilderComponent', {
                id: 'erp-sync',
            });
        });
    });
});
