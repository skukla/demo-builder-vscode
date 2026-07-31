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

import { renderHook, act } from '@testing-library/react';
import { useRowStatusOverrides } from '@/features/dashboard/ui/hooks/useRowStatusOverrides';

/** Captured channel handlers, so tests can push like the extension does. */
const handlers: Record<string, (data: unknown) => void> = {};

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        onMessage: jest.fn((type: string, handler: (data: unknown) => void) => {
            handlers[type] = handler;
            return () => delete handlers[type];
        }),
    },
}));

function pushStatus(payload: Record<string, unknown>): void {
    act(() => handlers.appBuilderComponentStatusUpdate?.(payload));
}
function pushSnapshot(map: Record<string, unknown>): void {
    act(() => handlers.appBuilderComponentsSnapshot?.(map));
}

beforeEach(() => {
    for (const key of Object.keys(handlers)) delete handlers[key];
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

        it('tolerates a snapshot with no payload', () => {
            const { result } = renderHook(() => useRowStatusOverrides());
            pushStatus({ id: 'erp', status: 'deployed' });

            pushSnapshot(undefined as unknown as Record<string, unknown>);

            expect(result.current).toEqual({});
        });
    });
});
