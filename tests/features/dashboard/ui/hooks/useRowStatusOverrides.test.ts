/**
 * useRowStatusOverrides Tests
 *
 * Per-id live status overrides, merged from `appBuilderComponentStatusUpdate`
 * and PRUNED against `appBuilderComponentsSnapshot`.
 *
 * The prune is the load-bearing half. Removing an integration used to leave its
 * `deploying` override behind forever: the entry left the persisted map, but
 * `buildIntegrationCards` synthesizes a pending card for any unknown-id
 * `deploying` override, so the grid kept a GHOST card stuck on "Deploying…"
 * (reported 2026-07-31, with a screenshot of exactly that).
 *
 * @jest-environment jsdom
 */

import { webviewClientHandlers } from '../../../../helpers/webviewClientMock';
import { renderHook, act } from '@testing-library/react';
import { useRowStatusOverrides } from '@/features/dashboard/ui/hooks/useRowStatusOverrides';

function pushStatus(payload: Record<string, unknown>): void {
    act(() => webviewClientHandlers.get('appBuilderComponentStatusUpdate')?.(payload));
}
/**
 * Push a snapshot in the shape the EXTENSION actually sends.
 *
 * `sendAppBuilderComponentsSnapshot` posts `payload: { components }`, and
 * `webviewClient` hands the handler that payload — so the map is nested. This
 * helper used to pass the map bare, which is why the prune shipped reading
 * `Object.keys(data)` and computing `['components']` as the live id set: EVERY
 * override was dropped on EVERY snapshot, and the test could not see it because
 * it fed a shape the wire never produces (found live 2026-08-08, when a failed
 * deploy's error status vanished and the card fell back to "Deployed").
 */
function pushSnapshot(map: Record<string, unknown>): void {
    act(() => webviewClientHandlers.get('appBuilderComponentsSnapshot')?.({ components: map }));
}

beforeEach(() => {
    webviewClientHandlers.clear();
});

describe('useRowStatusOverrides', () => {
    it('starts empty and merges a status push', () => {
        const { result } = renderHook(() => useRowStatusOverrides());
        expect(result.current).toEqual({});

        pushStatus({ id: 'erp', status: 'deploying', message: 'Adding…' });

        expect(result.current).toEqual({ erp: { status: 'deploying', message: 'Adding…' } });
    });

    it('ignores a push missing id or status', () => {
        const { result } = renderHook(() => useRowStatusOverrides());

        pushStatus({ status: 'deploying' });
        pushStatus({ id: 'erp' });

        expect(result.current).toEqual({});
    });

    // Deploy pushes omit `name`; a wholesale replace would wipe a prior rename.
    it('keeps a previously pushed name when a later push omits it', () => {
        const { result } = renderHook(() => useRowStatusOverrides());

        pushStatus({ id: 'erp', status: 'deployed', name: 'ERP Sync' });
        pushStatus({ id: 'erp', status: 'deploying' });

        expect(result.current.erp).toEqual({
            status: 'deploying',
            message: undefined,
            name: 'ERP Sync',
        });
    });

    describe('pruning against the snapshot', () => {
        // THE ghost-card regression.
        it('drops an override for an id the snapshot no longer holds', () => {
            const { result } = renderHook(() => useRowStatusOverrides());
            pushStatus({ id: 'erp', status: 'deploying', message: 'Removing…' });
            expect(result.current.erp).toBeDefined();

            pushSnapshot({});

            expect(result.current).toEqual({});
        });

        it('keeps overrides for ids the snapshot still holds', () => {
            const { result } = renderHook(() => useRowStatusOverrides());
            pushStatus({ id: 'erp', status: 'deployed' });
            pushStatus({ id: 'loyalty', status: 'deploying' });

            pushSnapshot({ erp: { kind: 'integration' } });

            expect(Object.keys(result.current)).toEqual(['erp']);
        });

        // The map feeds a useMemo dependency: a fresh identity on every snapshot
        // would rebuild every card for nothing.
        it('returns the SAME object when nothing was pruned', () => {
            const { result } = renderHook(() => useRowStatusOverrides());
            pushStatus({ id: 'erp', status: 'deployed' });
            const before = result.current;

            pushSnapshot({ erp: { kind: 'integration' } });

            expect(result.current).toBe(before);
        });

        it('IGNORES a snapshot carrying no components rather than wiping the grid', () => {
            // This used to assert the opposite — that a payload-less snapshot
            // cleared every override — which was the bug written down as a rule.
            // A malformed push must never blank live status, the same contract
            // `useLiveAppBuilderComponents` states for the map itself.
            const { result } = renderHook(() => useRowStatusOverrides());
            pushStatus({ id: 'erp', status: 'deploying', message: 'Deploying…' });

            pushSnapshot(undefined as unknown as Record<string, unknown>);

            expect(result.current.erp).toMatchObject({ status: 'deploying' });
        });

        it('keeps an ERROR override across the snapshot that follows the failure', () => {
            // The live symptom, pinned end to end: a failed deploy pushes 'error',
            // the handler then posts a snapshot whose persisted entry still reads
            // 'deployed' from the last good deploy. Prune the override and the card
            // silently reports success for a deploy that failed (2026-08-08).
            const { result } = renderHook(() => useRowStatusOverrides());
            pushStatus({ id: 'order-sync', status: 'error', message: 'invalid yaml' });

            pushSnapshot({ 'order-sync': { kind: 'integration', status: 'deployed' } });

            expect(result.current['order-sync']).toMatchObject({ status: 'error' });
        });
    });
});
