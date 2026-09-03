/**
 * useOrgSwitchFlow Hook Tests
 *
 * The forced org-switch flow state extracted from ProjectDashboardScreen
 * (decompose pass after ADR-011 D3): attempt flag for the no-loop hint,
 * in-flight "Switching…" state, a synchronous re-entry guard, and the
 * reset-on-clean effect (only a RESOLVED clean check clears the attempt —
 * the transient 'checking' a re-check passes through must not).
 *
 */

import { renderHook, act } from '@testing-library/react';
import { useOrgSwitchFlow } from '@/features/dashboard/ui/hooks/useOrgSwitchFlow';
import type { OrgCheckState } from '@/features/dashboard/ui/hooks/useDashboardStatus';

/** A switch handler we can resolve/reject on demand. */
function deferredHandler() {
    let resolve!: () => void;
    let reject!: (e: Error) => void;
    const promise = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    const handler = jest.fn(() => promise);
    return { handler, resolve, reject };
}

function render(orgCheckState: OrgCheckState, handler: () => Promise<void>) {
    return renderHook(
        ({ state }: { state: OrgCheckState }) => useOrgSwitchFlow(state, handler),
        { initialProps: { state: orgCheckState } },
    );
}

describe('useOrgSwitchFlow', () => {
    it('starts with no attempt and not switching', () => {
        const { result } = render('mismatch', jest.fn().mockResolvedValue(undefined));

        expect(result.current.switchAttempted).toBe(false);
        expect(result.current.isSwitchingOrg).toBe(false);
    });

    it('marks the attempt and the in-flight state while the switch runs, then clears in-flight (attempt persists)', async () => {
        const { handler, resolve } = deferredHandler();
        const { result } = render('mismatch', handler);

        let pending!: Promise<void>;
        act(() => {
            pending = result.current.onSwitchOrg();
        });
        expect(result.current.switchAttempted).toBe(true);
        expect(result.current.isSwitchingOrg).toBe(true);

        await act(async () => {
            resolve();
            await pending;
        });
        expect(result.current.isSwitchingOrg).toBe(false);
        // The attempt flag persists — a still-mismatched state shows the no-loop hint.
        expect(result.current.switchAttempted).toBe(true);
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('guards re-entry synchronously: a second press while in flight does not fire the handler again', async () => {
        const { handler, resolve } = deferredHandler();
        const { result } = render('mismatch', handler);

        let first!: Promise<void>;
        act(() => {
            first = result.current.onSwitchOrg();
            // Second press in the SAME tick (state lags a render — the ref must guard).
            void result.current.onSwitchOrg();
        });
        expect(handler).toHaveBeenCalledTimes(1);

        await act(async () => {
            resolve();
            await first;
        });
    });

    it('clears the in-flight state even when the switch rejects', async () => {
        const { handler, reject } = deferredHandler();
        const { result } = render('mismatch', handler);

        let pending!: Promise<void>;
        act(() => {
            pending = result.current.onSwitchOrg().catch(() => undefined);
        });
        expect(result.current.isSwitchingOrg).toBe(true);

        await act(async () => {
            reject(new Error('switch failed'));
            await pending;
        });
        expect(result.current.isSwitchingOrg).toBe(false);
    });

    it("resets the attempt flag when the org check resolves clean ('none')", async () => {
        const { handler, resolve } = deferredHandler();
        const { result, rerender } = render('mismatch', handler);

        let pending!: Promise<void>;
        act(() => {
            pending = result.current.onSwitchOrg();
        });
        await act(async () => {
            resolve();
            await pending;
        });
        expect(result.current.switchAttempted).toBe(true);

        rerender({ state: 'none' });
        expect(result.current.switchAttempted).toBe(false);
    });

    it("does NOT reset the attempt flag on the transient 'checking' state", async () => {
        const { handler, resolve } = deferredHandler();
        const { result, rerender } = render('mismatch', handler);

        let pending!: Promise<void>;
        act(() => {
            pending = result.current.onSwitchOrg();
        });
        await act(async () => {
            resolve();
            await pending;
        });

        rerender({ state: 'checking' });
        // A re-check passing through 'checking' must keep the no-loop hint.
        expect(result.current.switchAttempted).toBe(true);
    });
});
