/**
 * useCredentialService — has the shared credential service answered yet?
 *
 * Asserted: it is loading from the very first render it is enabled on, including
 * the render where it switches ON (a stored flag said "not loading, no answer"
 * there, and the OAuth boxes drew for a moment and then closed, 2026-10-17); it
 * asks once per org; and a probe that cannot answer settles as "no status".
 */

import { mockRequest } from '../../../../helpers/webviewClientMock';
import { act, renderHook } from '@testing-library/react';
import { useCredentialService } from '@/features/components/ui/hooks/useCredentialService';

const SERVED = { served: true, verdict: 'configured, 200', httpStatus: 200 };

interface Props {
    enabled: boolean;
    orgId?: string;
}

function renderProbe(initial: Props) {
    return renderHook(({ enabled, orgId }: Props) => useCredentialService(enabled, orgId), {
        initialProps: initial,
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockRequest.mockReset();
});

describe('useCredentialService', () => {
    it('asks nothing and is not loading while disabled', () => {
        const { result } = renderProbe({ enabled: false, orgId: 'org-1' });

        expect(mockRequest).not.toHaveBeenCalled();
        expect(result.current).toEqual({ loading: false });
    });

    it('is loading on the very render it switches on, before any effect runs', () => {
        mockRequest.mockReturnValue(new Promise(() => undefined));
        const seen: boolean[] = [];
        const { rerender } = renderHook(
            ({ enabled }: Props) => {
                const state = useCredentialService(enabled, 'org-1');
                seen.push(state.loading);
                return state;
            },
            { initialProps: { enabled: false } as Props },
        );

        rerender({ enabled: true });

        expect(seen[seen.length - 1]).toBe(true);
        expect(seen.slice(1).every(Boolean)).toBe(true);
    });

    it('settles with the status, asking once for the org', async () => {
        mockRequest.mockResolvedValue({ success: true, data: SERVED });

        const { result, rerender } = renderProbe({ enabled: true, orgId: 'org-1' });
        await act(async () => {});
        rerender({ enabled: true, orgId: 'org-1' });

        expect(result.current).toEqual({ loading: false, status: SERVED });
        expect(mockRequest).toHaveBeenCalledTimes(1);
        expect(mockRequest).toHaveBeenCalledWith('check-credential-service', { orgId: 'org-1' });
    });

    it('asks again, and is loading again, when the org changes', async () => {
        mockRequest.mockResolvedValue({ success: true, data: SERVED });
        const { result, rerender } = renderProbe({ enabled: true, orgId: 'org-1' });
        await act(async () => {});

        mockRequest.mockReturnValue(new Promise(() => undefined));
        rerender({ enabled: true, orgId: 'org-2' });

        expect(result.current).toEqual({ loading: true });
        expect(mockRequest).toHaveBeenLastCalledWith('check-credential-service', { orgId: 'org-2' });
    });

    it('settles as "no status" when the probe fails — never a verdict', async () => {
        mockRequest.mockRejectedValue(new Error('offline'));

        const { result } = renderProbe({ enabled: true, orgId: 'org-1' });
        await act(async () => {});

        expect(result.current).toEqual({ loading: false, status: undefined });
    });
});
