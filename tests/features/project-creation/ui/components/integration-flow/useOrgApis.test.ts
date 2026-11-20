/**
 * useOrgApis — the read of the org's subscribable APIs behind the Add Integration dialog's
 * api-access stage: when it reads, what it answers, and which answers it drops.
 */

import { act, renderHook, waitFor } from '@testing-library/react';

const mockRequest = jest.fn();
jest.mock('@/core/ui/utils/vscode-api', () => ({
    webviewClient: { request: (...args: unknown[]) => mockRequest(...args) },
}));

// Below the mock on purpose (webview-test-authoring §3).
import { useOrgApis } from '@/features/project-creation/ui/components/integration-flow/useOrgApis';

const FFS = { code: 'FireflyServicesSDK', name: 'Firefly Services', locked: false };
const OTHER = { code: 'PhotoshopSDK', name: 'Photoshop API', locked: false };
const IDS_A = ['a'];
const IDS_B = ['b'];

function renderOrgApis(active = true, ids = IDS_A) {
    return renderHook(({ on, componentIds }) => useOrgApis(on, componentIds), {
        initialProps: { on: active, componentIds: ids },
    });
}

beforeEach(() => {
    mockRequest.mockReset();
    mockRequest.mockResolvedValue({ success: true, data: { apis: [FFS] } });
});

describe('useOrgApis', () => {
    it('reads nothing off the stage, and starts already loading for the frame the stage first draws', () => {
        const { result } = renderOrgApis(false);

        expect(mockRequest).not.toHaveBeenCalled();
        expect(result.current.loading).toBe(true);
    });

    it('fetches list-org-console-apis with the already-committed component ids', async () => {
        const { result } = renderOrgApis(true, ['headless-commerce-mesh']);

        expect(mockRequest).toHaveBeenCalledWith('list-org-console-apis', { componentIds: ['headless-commerce-mesh'] });
        await waitFor(() => expect(result.current.apis).toEqual([FFS]));
        expect(result.current.loading).toBe(false);
    });

    it('stays loading until the list resolves', async () => {
        mockRequest.mockReturnValue(new Promise(() => {}));
        const { result } = renderOrgApis();

        await act(async () => {});
        expect(result.current.loading).toBe(true);
    });

    it('reads again each time the stage is entered, loading from the first frame', async () => {
        const { result, rerender } = renderOrgApis();
        await waitFor(() => expect(result.current.loading).toBe(false));

        rerender({ on: false, componentIds: IDS_A });
        expect(result.current.loading).toBe(true);
        rerender({ on: true, componentIds: IDS_A });

        expect(mockRequest).toHaveBeenCalledTimes(2);
        await waitFor(() => expect(result.current.apis).toEqual([FFS]));
    });

    it('answers a failure with its reason, and an empty list', async () => {
        mockRequest.mockResolvedValue({ success: false, error: 'Adobe API catalog unavailable.' });
        const { result } = renderOrgApis();

        await waitFor(() => expect(result.current.error).toBe('Adobe API catalog unavailable.'));
        expect(result.current.needsSignIn).toBe(false);
        expect(result.current.apis).toStrictEqual([]);
    });

    it('treats a failed response that still carries data as a failure', async () => {
        // success is the authority: a payload arriving alongside an error must not
        // be rendered as though the list had loaded.
        mockRequest.mockResolvedValue({ success: false, error: 'Unavailable.', data: { apis: [FFS] } });
        const { result } = renderOrgApis();

        await waitFor(() => expect(result.current.error).toBe('Unavailable.'));
        expect(result.current.apis).toStrictEqual([]);
    });

    it('falls back to a generic message when the failure carries no reason', async () => {
        mockRequest.mockResolvedValue({ success: false });
        const { result } = renderOrgApis();

        await waitFor(() => expect(result.current.error).toBe('Could not list Adobe APIs.'));
    });

    it('surfaces a REJECTED request, not just a failed response', async () => {
        mockRequest.mockRejectedValue(new Error('socket closed'));
        const { result } = renderOrgApis();

        await waitFor(() => expect(result.current.error).toBe('socket closed'));
    });

    it('tells "signed out" apart from a failure worth retrying', async () => {
        mockRequest.mockResolvedValue({ success: false, error: 'Adobe sign-in required.', code: 'AUTH_REQUIRED' });
        const { result } = renderOrgApis();

        await waitFor(() => expect(result.current.needsSignIn).toBe(true));
    });

    it('re-fetches on every retry, loading again, and recovers', async () => {
        mockRequest.mockResolvedValueOnce({ success: false, error: 'Request timeout' });
        mockRequest.mockResolvedValueOnce({ success: false, error: 'Request timeout' });
        const { result } = renderOrgApis();
        await waitFor(() => expect(result.current.error).toBe('Request timeout'));

        await act(async () => result.current.retry());
        expect(mockRequest).toHaveBeenCalledTimes(2);
        await waitFor(() => expect(result.current.error).toBe('Request timeout'));

        await act(async () => result.current.retry());
        expect(mockRequest).toHaveBeenCalledTimes(3);
        await waitFor(() => expect(result.current.apis).toEqual([FFS]));
        expect(result.current.error).toBeUndefined();
    });

    // New component ids re-fire the list. The in-flight response for the PREVIOUS ids must be
    // dropped: it describes a question no longer asked.
    describe('a superseded request is ignored', () => {
        function staleThen(current: unknown): { settleStale: { resolve: (v: unknown) => void; reject: (e: unknown) => void } } {
            const settleStale = { resolve: (_v: unknown) => {}, reject: (_e: unknown) => {} };
            mockRequest.mockReturnValueOnce(
                new Promise((resolve, reject) => {
                    settleStale.resolve = resolve;
                    settleStale.reject = reject;
                }),
            );
            mockRequest.mockReturnValue(current);
            return { settleStale };
        }

        it('drops a stale SUCCESS in favour of the current one', async () => {
            const { settleStale } = staleThen(Promise.resolve({ success: true, data: { apis: [OTHER] } }));
            const { result, rerender } = renderOrgApis();
            rerender({ on: true, componentIds: IDS_B });
            await waitFor(() => expect(result.current.apis).toEqual([OTHER]));

            await act(async () => settleStale.resolve({ success: true, data: { apis: [FFS] } }));

            expect(result.current.apis).toEqual([OTHER]);
        });

        it('drops a stale REJECTION rather than erroring over the list it already showed', async () => {
            const { settleStale } = staleThen(Promise.resolve({ success: true, data: { apis: [OTHER] } }));
            const { result, rerender } = renderOrgApis();
            rerender({ on: true, componentIds: IDS_B });
            await waitFor(() => expect(result.current.apis).toEqual([OTHER]));

            await act(async () => settleStale.reject(new Error('stale socket closed')));

            expect(result.current.error).toBeUndefined();
            expect(result.current.apis).toEqual([OTHER]);
        });

        it('drops a stale REJECTION rather than erroring over a pending request', async () => {
            const { settleStale } = staleThen(new Promise(() => {}));
            const { result, rerender } = renderOrgApis();
            rerender({ on: true, componentIds: IDS_B });

            await act(async () => settleStale.reject(new Error('stale socket closed')));

            expect(result.current.error).toBeUndefined();
            expect(result.current.loading).toBe(true);
        });
    });
});
