/**
 * useIntegrationCards — the integrations screen's card list.
 *
 * Derives every card the screen shows from the live component map, the per-row
 * status pushes and the mesh status: the mesh card first (when the project has a
 * mesh status), then one card per App Builder component. The screen filters what
 * this returns; it never derives cards itself. Moved out of `IntegrationsScreen`
 * (EDS-8, 2026-10-08) with its memo unchanged.
 *
 * @module features/dashboard/ui/integrationsSurface/useIntegrationCards
 */

import { useMemo } from 'react';
import {
    buildIntegrationCards,
    deriveMeshCard,
    type IntegrationCardModel,
} from '../components/integrations/integrationCardModel';
import type { StatusDisplay } from '../hooks/dashboardStatusTypes';
import { isMeshBusy } from '../hooks/useDashboardStatus';
import { useRowStatusOverrides } from '../hooks/useRowStatusOverrides';
import {
    getIdentifiedMeshAppBuilderComponent,
    listAppBuilderComponents,
} from '@/core/state/appBuilderComponentState';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState, Project } from '@/types/base';
import type { CommerceStoreStructure } from '@/types/commerceStore';
import type { MeshStatus } from '@/types/webviewPayloads';

/** What the card list is derived from. */
export interface IntegrationCardsSource {
    /** The live App Builder component map. */
    components: Record<string, AppBuilderComponentState>;
    /** The catalog the cards resolve their kind and source from. */
    catalog: AppBuilderComponentCatalogEntry[];
    /** The mesh's display status; null while the project has no mesh status. */
    meshStatusDisplay: StatusDisplay | null;
    meshStatus: MeshStatus | undefined;
    isTransitioning: boolean;
    /** Names the deployed store codes on the mesh card. */
    commerceStoreStructure?: CommerceStoreStructure;
}

/**
 * The cards the integrations screen shows, unfiltered.
 *
 * Subscribes to the per-row status pushes itself: nothing else on the screen
 * reads them.
 */
export function useIntegrationCards({
    components,
    catalog,
    meshStatusDisplay,
    meshStatus,
    isTransitioning,
    commerceStoreStructure,
}: IntegrationCardsSource): IntegrationCardModel[] {
    const overrides = useRowStatusOverrides();

    return useMemo((): IntegrationCardModel[] => {
        const project = { appBuilderComponents: components } as Project;
        // ONE lookup for id AND state. Resolving them separately let the card
        // show one mesh while its Remove tore down another (2026-08-04, live) —
        // the map search has a priority, and a second search that omits it picks
        // a different component whenever a project holds more than one mesh.
        const mesh = getIdentifiedMeshAppBuilderComponent(project);
        // Resolved BEFORE the list so the list knows which id the mesh card
        // covers. Without that, the mesh's own row status synthesizes a second
        // card beside it — two cards for one mesh, seen live during a removal.
        // Passed only when a mesh card will actually render: with none (an ADD,
        // where the mesh does not exist yet) the synthesized card is the
        // operation's only feedback.
        const integrationCards = buildIntegrationCards(
            listAppBuilderComponents(project),
            overrides,
            catalog,
            meshStatusDisplay ? mesh?.id : undefined,
        );
        if (!meshStatusDisplay) {
            return integrationCards;
        }
        const meshCard = deriveMeshCard(
            meshStatusDisplay,
            meshStatus,
            // No `?? getMeshAppBuilderComponent(project)` fallback: that function
            // IS `getIdentifiedMeshAppBuilderComponent(project)?.state`
            // (core/state/appBuilderComponentState.ts), so it could only ever
            // return the value already in hand.
            mesh?.state,
            isMeshBusy(meshStatus) || isTransitioning,
            mesh?.id,
            // Names the deployed codes. A pure by-code lookup, so it cannot
            // name the wrong one and needs nothing captured at deploy time.
            commerceStoreStructure,
        );
        return [meshCard, ...integrationCards];
    }, [
        components,
        overrides,
        catalog,
        meshStatusDisplay,
        meshStatus,
        isTransitioning,
        commerceStoreStructure,
    ]);
}
