/**
 * MeshApiEnableRow Tests
 *
 * The self-contained status row that auto-runs the idempotent
 * `ensure-mesh-api-subscribed` request when a workspace commits and reports its
 * outcome (running → enabled ✓ / failed ⚠ + Retry). It has NO "Change".
 *
 * `webviewClient.request` is mocked so we can drive success/failure/timing —
 * including deferred promises for the stale-resolve race.
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

import { MeshApiEnableRow } from '@/features/project-creation/ui/components/MeshApiEnableRow';

interface RowProps {
    orgId?: string;
    projectId?: string;
    workspaceId?: string;
    backendId?: string;
    frontendId?: string;
    initialResult?: {
        success: boolean;
        error?: string;
        code?: string;
        data?: { apis: Array<{ code: string; name?: string }> };
    };
}

const BASE: RowProps = {
    orgId: 'org-1',
    projectId: 'proj-1',
    workspaceId: 'ws-1',
    backendId: 'backend-1',
    frontendId: 'frontend-1',
};

function renderRow(props: RowProps = BASE) {
    return render(
        <Provider theme={defaultTheme} colorScheme="light">
            <MeshApiEnableRow {...props} />
        </Provider>,
    );
}

/** A promise whose resolution we control (for ordering races). */
function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(res => {
        resolve = res;
    });
    return { promise, resolve };
}

describe('MeshApiEnableRow', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('issues exactly one request on mount and shows the spinner', () => {
        mockRequest.mockReturnValue(new Promise(() => {})); // never resolves → stays running

        renderRow();

        expect(mockRequest).toHaveBeenCalledTimes(1);
        expect(mockRequest).toHaveBeenCalledWith('ensure-mesh-api-subscribed', {
            orgId: 'org-1',
            projectId: 'proj-1',
            workspaceId: 'ws-1',
            backendId: 'backend-1',
            frontendId: 'frontend-1',
        });
        expect(screen.getByText(/enabling/i)).toBeInTheDocument();
    });

    it('renders Enabled ✓ on success with no Retry and no Change', async () => {
        mockRequest.mockResolvedValue({ success: true });

        renderRow();

        await waitFor(() => {
            expect(screen.getByText('Enabled')).toBeInTheDocument();
        });
        expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /change/i })).not.toBeInTheDocument();
    });

    it('renders Failed + Retry on failure; clicking Retry re-issues the request', async () => {
        mockRequest.mockResolvedValue({ success: false, error: 'nope' });

        renderRow();

        await waitFor(() => {
            expect(screen.getByText('Failed')).toBeInTheDocument();
        });
        const retry = screen.getByRole('button', { name: /retry/i });

        mockRequest.mockClear();
        mockRequest.mockResolvedValue({ success: true });
        fireEvent.click(retry);

        await waitFor(() => {
            expect(screen.getByText('Enabled')).toBeInTheDocument();
        });
        expect(mockRequest).toHaveBeenCalledTimes(1);
        expect(mockRequest).toHaveBeenCalledWith(
            'ensure-mesh-api-subscribed',
            expect.objectContaining({ workspaceId: 'ws-1' }),
        );
    });

    it('renders the error on its own line (outside the row) while keeping Retry reachable', async () => {
        const longError = 'x'.repeat(300);
        mockRequest.mockResolvedValue({ success: false, error: longError });

        const { container } = renderRow();

        await waitFor(() => {
            expect(screen.getByText('Failed')).toBeInTheDocument();
        });
        // Retry survives regardless of error length.
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
        // The error lives in its own .int-enable-error element, a SIBLING of the row —
        // not inside .int-chosen, where it would displace the Retry button.
        const errorEl = container.querySelector('.int-enable-error');
        expect(errorEl).toHaveTextContent(longError);
        const row = container.querySelector('.int-chosen');
        expect(row).not.toBeNull();
        expect(row?.contains(errorEl)).toBe(false);
    });

    it('re-issues once for a new workspaceId when the workspace changes', async () => {
        mockRequest.mockResolvedValue({ success: true });

        const { rerender } = renderRow();

        await waitFor(() => {
            expect(screen.getByText('Enabled')).toBeInTheDocument();
        });
        expect(mockRequest).toHaveBeenCalledTimes(1);

        rerender(
            <Provider theme={defaultTheme} colorScheme="light">
                <MeshApiEnableRow {...BASE} workspaceId="ws-2" />
            </Provider>,
        );

        await waitFor(() => {
            expect(mockRequest).toHaveBeenCalledWith(
                'ensure-mesh-api-subscribed',
                expect.objectContaining({ workspaceId: 'ws-2' }),
            );
        });
        expect(mockRequest).toHaveBeenCalledTimes(2);
    });

    it('does NOT re-issue when re-rendered with the same full payload', async () => {
        mockRequest.mockResolvedValue({ success: true });

        const { rerender } = renderRow();

        await waitFor(() => {
            expect(screen.getByText('Enabled')).toBeInTheDocument();
        });
        expect(mockRequest).toHaveBeenCalledTimes(1);

        // Identical payload (fresh object/prop references) — the composite run-once
        // guard recognises the unchanged key and blocks re-issue.
        rerender(
            <Provider theme={defaultTheme} colorScheme="light">
                <MeshApiEnableRow {...BASE} />
            </Provider>,
        );

        expect(mockRequest).toHaveBeenCalledTimes(1);
    });

    it('re-issues once when the stack (backendId/frontendId) changes and workspaceId is unchanged', async () => {
        mockRequest.mockResolvedValue({ success: true });

        const { rerender } = renderRow();

        await waitFor(() => {
            expect(screen.getByText('Enabled')).toBeInTheDocument();
        });
        expect(mockRequest).toHaveBeenCalledTimes(1);

        // A stack/architecture change keeps the same committed workspace but changes
        // the backend/frontend ids — the composite guard must re-issue exactly once.
        rerender(
            <Provider theme={defaultTheme} colorScheme="light">
                <MeshApiEnableRow {...BASE} backendId="backend-2" frontendId="frontend-2" />
            </Provider>,
        );

        await waitFor(() => {
            expect(mockRequest).toHaveBeenCalledWith(
                'ensure-mesh-api-subscribed',
                expect.objectContaining({
                    workspaceId: 'ws-1',
                    backendId: 'backend-2',
                    frontendId: 'frontend-2',
                }),
            );
        });
        expect(mockRequest).toHaveBeenCalledTimes(2);
    });

    it('ignores a stale resolve after the workspace changed (latest id wins)', async () => {
        const first = deferred<{ success: boolean; error?: string }>();
        const second = deferred<{ success: boolean; error?: string }>();
        mockRequest.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

        const { rerender } = renderRow();

        rerender(
            <Provider theme={defaultTheme} colorScheme="light">
                <MeshApiEnableRow {...BASE} workspaceId="ws-2" />
            </Provider>,
        );

        // The NEW workspace resolves first → Enabled.
        second.resolve({ success: true });
        await waitFor(() => {
            expect(screen.getByText('Enabled')).toBeInTheDocument();
        });

        // The stale (old workspace) resolution must NOT overwrite the status.
        first.resolve({ success: false, error: 'stale' });
        await Promise.resolve();

        expect(screen.getByText('Enabled')).toBeInTheDocument();
        expect(screen.queryByText('Failed')).not.toBeInTheDocument();
    });

    it('renders nothing when no workspaceId is provided', () => {
        renderRow({ ...BASE, workspaceId: undefined });

        expect(screen.queryByText('API access')).not.toBeInTheDocument();
        expect(mockRequest).not.toHaveBeenCalled();
    });

    describe('subscribed API names (data.apis)', () => {
        it('renders the joined API names when the result carries data.apis', async () => {
            mockRequest.mockResolvedValue({
                success: true,
                data: {
                    apis: [
                        { code: 'GraphQLServiceSDK', name: 'API Mesh' },
                        { code: 'AdobeIOManagementAPISDK', name: 'I/O Management API' },
                    ],
                },
            });

            renderRow();

            await waitFor(() => {
                expect(screen.getByText('API Mesh · I/O Management API')).toBeInTheDocument();
            });
            expect(screen.queryByText('Enabled')).not.toBeInTheDocument();
        });

        it('falls back to the code for a name-less entry', async () => {
            mockRequest.mockResolvedValue({
                success: true,
                data: {
                    apis: [
                        { code: 'GraphQLServiceSDK' },
                        { code: 'AdobeIOManagementAPISDK', name: 'I/O Management API' },
                    ],
                },
            });

            renderRow();

            await waitFor(() => {
                expect(
                    screen.getByText('GraphQLServiceSDK · I/O Management API'),
                ).toBeInTheDocument();
            });
        });

        it('keeps the "Enabled" fallback when data.apis is empty', async () => {
            mockRequest.mockResolvedValue({ success: true, data: { apis: [] } });

            renderRow();

            await waitFor(() => {
                expect(screen.getByText('Enabled')).toBeInTheDocument();
            });
        });
    });

    describe('initialResult (pre-resolved by a parent flow)', () => {
        const APIS = [
            { code: 'GraphQLServiceSDK', name: 'API Mesh' },
            { code: 'AdobeIOManagementAPISDK', name: 'I/O Management API' },
        ];

        it('adopts a successful initialResult without issuing a request and renders the names', () => {
            renderRow({ ...BASE, initialResult: { success: true, data: { apis: APIS } } });

            expect(mockRequest).not.toHaveBeenCalled();
            expect(screen.getByText('API Mesh · I/O Management API')).toBeInTheDocument();
        });

        it('renders the failed state from a failed initialResult; Retry issues a real request', async () => {
            renderRow({ ...BASE, initialResult: { success: false, error: 'nope' } });

            expect(mockRequest).not.toHaveBeenCalled();
            expect(screen.getByText('Failed')).toBeInTheDocument();
            expect(screen.getByText('nope')).toBeInTheDocument();

            mockRequest.mockResolvedValue({ success: true });
            fireEvent.click(screen.getByRole('button', { name: /retry/i }));

            await waitFor(() => {
                expect(screen.getByText('Enabled')).toBeInTheDocument();
            });
            expect(mockRequest).toHaveBeenCalledTimes(1);
            expect(mockRequest).toHaveBeenCalledWith(
                'ensure-mesh-api-subscribed',
                expect.objectContaining({ workspaceId: 'ws-1' }),
            );
        });

        it('auto-runs normally when the run-key changes after an initialResult was consumed', async () => {
            mockRequest.mockResolvedValue({ success: true });
            const initialResult = { success: true, data: { apis: APIS } };

            const { rerender } = renderRow({ ...BASE, initialResult });
            expect(mockRequest).not.toHaveBeenCalled();

            rerender(
                <Provider theme={defaultTheme} colorScheme="light">
                    <MeshApiEnableRow {...BASE} workspaceId="ws-2" initialResult={initialResult} />
                </Provider>,
            );

            await waitFor(() => {
                expect(mockRequest).toHaveBeenCalledWith(
                    'ensure-mesh-api-subscribed',
                    expect.objectContaining({ workspaceId: 'ws-2' }),
                );
            });
            expect(mockRequest).toHaveBeenCalledTimes(1);
        });
    });
});
