/**
 * useOrgConsoleApis tests — the journey-level org console-API PREFETCH hook.
 *
 * Fetches 'list-org-console-apis' as soon as componentIds become defined (the
 * integration pick is known), so the api-access stage's picker is ready before
 * the user reaches it — the fetch is never issued concurrently with (and never
 * starved behind) the mesh enable, and the stage shows at most ONE spinner.
 *
 * Re-fetches when the id KEY changes (a different pick after Back); a plain
 * rerender never refetches. Retry refetches with the current ids.
 *
 * @jest-environment jsdom
 */

import { renderHook, act, waitFor } from '@testing-library/react';

const mockRequest = jest.fn();
jest.mock('@/core/ui/utils/vscode-api', () => ({
    webviewClient: {
        request: (...args: unknown[]) => mockRequest(...args),
    },
}));

import { useOrgConsoleApis } from '@/features/project-creation/ui/components/integration-flow/useOrgConsoleApis';

const APIS = [
    { code: 'GraphQLServiceSDK', name: 'API Mesh', locked: true },
    { code: 'AnalyticsSDK', name: 'Adobe Analytics', locked: false },
];

describe('useOrgConsoleApis', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockRequest.mockResolvedValue({ success: true, data: { apis: APIS } });
    });

    it('does not fetch while componentIds is undefined (no pick yet)', () => {
        const { result } = renderHook(() => useOrgConsoleApis(undefined));
        expect(mockRequest).not.toHaveBeenCalled();
        expect(result.current.status).toBe('loading');
    });

    it('fetches once when componentIds become defined', async () => {
        const { result, rerender } = renderHook(
            ({ ids }: { ids?: string[] }) => useOrgConsoleApis(ids),
            { initialProps: { ids: undefined as string[] | undefined } }
        );
        rerender({ ids: ['commerce-mesh'] });
        await waitFor(() => {
            expect(result.current.status).toBe('ready');
        });
        expect(mockRequest).toHaveBeenCalledTimes(1);
        expect(mockRequest).toHaveBeenCalledWith(
            'list-org-console-apis',
            { componentIds: ['commerce-mesh'] },
            expect.any(Number)
        );
        expect(result.current.apis).toEqual(APIS);
    });

    it('a plain rerender with the same ids never refetches', async () => {
        const { result, rerender } = renderHook(
            ({ ids }: { ids?: string[] }) => useOrgConsoleApis(ids),
            { initialProps: { ids: ['commerce-mesh'] as string[] | undefined } }
        );
        await waitFor(() => expect(result.current.status).toBe('ready'));
        rerender({ ids: ['commerce-mesh'] });
        rerender({ ids: ['commerce-mesh'] });
        expect(mockRequest).toHaveBeenCalledTimes(1);
    });

    it('refetches once when the id key changes (a different pick after Back)', async () => {
        const { result, rerender } = renderHook(
            ({ ids }: { ids?: string[] }) => useOrgConsoleApis(ids),
            { initialProps: { ids: ['erp-sync'] as string[] | undefined } }
        );
        await waitFor(() => expect(result.current.status).toBe('ready'));
        rerender({ ids: ['crm-connect'] });
        await waitFor(() => {
            expect(mockRequest).toHaveBeenCalledWith(
                'list-org-console-apis',
                { componentIds: ['crm-connect'] },
                expect.any(Number)
            );
        });
        expect(mockRequest).toHaveBeenCalledTimes(2);
    });

    it('handler failure lands in error with the message; retry refetches', async () => {
        mockRequest.mockResolvedValueOnce({ success: false, error: 'org listing failed' });
        const { result } = renderHook(() => useOrgConsoleApis(['erp-sync']));
        await waitFor(() => expect(result.current.status).toBe('error'));
        expect(result.current.error).toBe('org listing failed');

        act(() => result.current.retry());
        await waitFor(() => expect(result.current.status).toBe('ready'));
        expect(mockRequest).toHaveBeenCalledTimes(2);
    });

    it('a transport rejection also lands in error', async () => {
        mockRequest.mockRejectedValueOnce(new Error('socket closed'));
        const { result } = renderHook(() => useOrgConsoleApis(['erp-sync']));
        await waitFor(() => expect(result.current.status).toBe('error'));
        expect(result.current.error).toBe('socket closed');
    });

    it('ignores a stale resolve after the key changed (latest ids win)', async () => {
        let resolveFirst!: (value: unknown) => void;
        mockRequest.mockImplementationOnce(
            () =>
                new Promise((res) => {
                    resolveFirst = res;
                })
        );
        const { result, rerender } = renderHook(
            ({ ids }: { ids?: string[] }) => useOrgConsoleApis(ids),
            { initialProps: { ids: ['erp-sync'] as string[] | undefined } }
        );
        rerender({ ids: ['crm-connect'] });
        await waitFor(() => expect(result.current.status).toBe('ready'));

        resolveFirst({
            success: true,
            data: { apis: [{ code: 'Stale', name: 'Stale', locked: false }] },
        });
        await waitFor(() => expect(result.current.apis).toEqual(APIS));
    });
});
