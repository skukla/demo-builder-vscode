/**
 * useIntegrationCards — the integrations screen's unfiltered card list.
 *
 * Moved out of IntegrationsScreen (EDS-8, 2026-10-08). The screen's own suites
 * still drive it end to end through the live channels; this pins the derivation
 * directly: where the mesh card goes, when it is withheld, which inputs make it
 * busy, and that the row-status pushes reach the cards.
 */

import { webviewClientHandlers } from '../../../../helpers/webviewClientMock';
import { act, renderHook } from '@testing-library/react';
import {
    useIntegrationCards,
    type IntegrationCardsSource,
} from '@/features/dashboard/ui/integrationsSurface/useIntegrationCards';
import type { StatusDisplay } from '@/features/dashboard/ui/hooks/dashboardStatusTypes';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState } from '@/types/base';

const EMPTY_CATALOG: AppBuilderComponentCatalogEntry[] = [];

const DEPLOYED: AppBuilderComponentState = {
    kind: 'integration',
    status: 'deployed',
    source: { owner: 'acme', repo: 'erp-sync' },
};

const MESH: AppBuilderComponentState = {
    kind: 'mesh',
    status: 'deployed',
    source: { owner: 'acme', repo: 'mesh' },
};

const MESH_DISPLAY: StatusDisplay = { color: 'green', text: 'Deployed' };

function source(overrides: Partial<IntegrationCardsSource> = {}): IntegrationCardsSource {
    return {
        components: { a: DEPLOYED },
        catalog: EMPTY_CATALOG,
        meshStatusDisplay: null,
        meshStatus: undefined,
        isTransitioning: false,
        ...overrides,
    };
}

function ids(cards: Array<{ id: string }>): string[] {
    return cards.map((card) => card.id);
}

beforeEach(() => {
    webviewClientHandlers.clear();
});

describe('useIntegrationCards', () => {
    it('lists one card per integration while the project has no mesh status', () => {
        const { result } = renderHook(() => useIntegrationCards(source()));

        expect(ids(result.current)).toStrictEqual(['a']);
    });

    it('puts the mesh card first once a mesh status arrives', () => {
        const input = source({
            components: { a: DEPLOYED, mesh1: MESH },
            meshStatusDisplay: MESH_DISPLAY,
            meshStatus: 'deployed',
        });
        const { result } = renderHook(() => useIntegrationCards(input));

        expect(ids(result.current)).toStrictEqual(['mesh', 'a']);
        // ONE lookup names the mesh for both the card and its Remove.
        expect(result.current[0].componentId).toBe('mesh1');
    });

    it('offers the mesh menu on a settled, idle mesh', () => {
        const input = source({
            components: { mesh1: MESH },
            meshStatusDisplay: MESH_DISPLAY,
            meshStatus: 'deployed',
        });
        const { result } = renderHook(() => useIntegrationCards(input));

        expect(result.current[0].menuActions).toStrictEqual(['redeploy', 'remove']);
    });

    it.each([
        ['a deploy is in flight', { meshStatus: 'deploying' as const }],
        ['the mesh is being checked', { meshStatus: 'checking' as const }],
        ['the project is transitioning', { meshStatus: 'deployed' as const, isTransitioning: true }],
    ])('withholds the mesh menu while %s', (_label, busy) => {
        const input = source({
            components: { mesh1: MESH },
            meshStatusDisplay: MESH_DISPLAY,
            ...busy,
        });
        const { result } = renderHook(() => useIntegrationCards(input));

        expect(result.current[0].menuActions).toStrictEqual([]);
    });

    it("never adds a second card for the mesh's own row status", () => {
        const input = source({
            components: { mesh1: MESH },
            meshStatusDisplay: MESH_DISPLAY,
            meshStatus: 'deployed',
        });
        const { result } = renderHook(() => useIntegrationCards(input));

        act(() =>
            webviewClientHandlers.get('appBuilderComponentStatusUpdate')?.({
                id: 'mesh1',
                status: 'deploying',
            }),
        );

        expect(ids(result.current)).toStrictEqual(['mesh']);
    });

    it('lets a row-status push for an unseen add synthesize its card when there is no mesh card', () => {
        const { result } = renderHook(() => useIntegrationCards(source()));

        act(() =>
            webviewClientHandlers.get('appBuilderComponentStatusUpdate')?.({
                id: 'new-one',
                status: 'deploying',
            }),
        );

        expect(ids(result.current)).toStrictEqual(['a', 'new-one']);
    });

    it('keeps the same list across renders when nothing it reads changed', () => {
        const input = source();
        const { result, rerender } = renderHook(() => useIntegrationCards(input));
        const first = result.current;

        rerender();

        expect(result.current).toBe(first);
    });
});
