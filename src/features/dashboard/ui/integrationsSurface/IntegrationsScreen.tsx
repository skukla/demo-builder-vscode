/**
 * IntegrationsScreen — the dedicated integrations surface.
 *
 * Scaffolded like {@link ProjectsDashboard}, the extension's other full-page
 * card-grid surface, so the two read as one app:
 *   1. three render states chosen BEFORE layout — loading, empty, loaded
 *   2. `PageLayout` + `PageHeader` (title + subtitle only, like the dashboard's;
 *      navigation rides the right-aligned `action` slot)
 *   3. a sticky action band — `SearchHeader` (count · filter · refresh) plus the
 *      trailing nav + primary action, the way DashboardStatusHeader trails
 *      "All Projects" after its status badges
 *   4. content in `.page-container-padded pb-6`
 *
 * This screen OWNS the data (the two live push channels and the card
 * derivation) and filters it; {@link IntegrationsGrid} only renders the cards it
 * is handed — the same split as ProjectsDashboard → ProjectsGrid. That is what
 * lets the header count and the grid never disagree.
 *
 * @module features/dashboard/ui/integrationsSurface/IntegrationsScreen
 */

import { Button, Flex, Text, View } from '@adobe/react-spectrum';
import React, { useCallback, useMemo, useState } from 'react';
import {
    buildIntegrationCards,
    deriveMeshCard,
    type IntegrationCardModel,
} from '../components/integrations/integrationCardModel';
import { IntegrationsGrid } from '../components/integrations/IntegrationsGrid';
import { isMeshBusy, useDashboardStatus } from '../hooks/useDashboardStatus';
import { useLiveAppBuilderComponents } from '../hooks/useLiveAppBuilderComponents';
import { useLiveDestination } from '../hooks/useLiveDestination';
import { useRowStatusOverrides } from '../hooks/useRowStatusOverrides';
import { AddIntegrationFlowAdapter } from './AddIntegrationFlowAdapter';
import { CtaEmptyState, LoadingDisplay } from '@/core/ui/components/feedback';
import { PageHeader, PageLayout } from '@/core/ui/components/layout';
import { FullScreenSurface } from '@/core/ui/components/layout/FullScreenSurface';
import { SearchHeader } from '@/core/ui/components/navigation/SearchHeader';
import { DestinationContext } from '@/core/ui/components/ui/DestinationContext';
import { matchesSearchFields } from '@/core/ui/hooks/useSearchFilter';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import {
    getIdentifiedMeshAppBuilderComponent,
    getMeshAppBuilderComponent,
    listAppBuilderComponents,
} from '@/features/app-builder/services/appBuilderComponentState';
import type { Project } from '@/types';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { IntegrationsInitialData } from '@/types/webviewPayloads';

/** Module-level stable empty catalog — avoids a new array ref each render. */
const EMPTY_CATALOG: AppBuilderComponentCatalogEntry[] = [];

/**
 * Init payload (`IntegrationsInitialData`), relaxed to Partial: the wire
 * always carries the required fields, but tests render the screen without them.
 */
export type IntegrationsScreenProps = Partial<IntegrationsInitialData>;

/**
 * "<project> · <workspace>", or undefined when the project has no Adobe target
 * yet. Undefined hides the destination line rather than rendering an empty one.
 */
export function formatDestination(destination?: {
    projectTitle?: string;
    workspaceTitle?: string;
}): string | undefined {
    const parts = [destination?.projectTitle, destination?.workspaceTitle].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : undefined;
}

/** Case-insensitive match over the fields a user would search by. */
/** The card fields a search query matches against. */
const CARD_SEARCH_FIELDS = ['name', 'kindLabel', 'sourceLine'] as const;

/**
 * Filter cards by a search query.
 *
 * Delegates to the shared `matchesSearchFields` predicate rather than
 * re-implementing the lowercase-contains walk a third time (this surface and
 * ProjectsDashboard had each hand-rolled it while `useSearchFilter` sat unused —
 * architecture-duplication scan, 2026-07-31). Kept as a named export because the
 * screen owns its query state and the suite tests this directly.
 */
export function filterCards(cards: IntegrationCardModel[], query: string): IntegrationCardModel[] {
    if (!query.trim()) {
        return cards;
    }
    return cards.filter((card) => matchesSearchFields(card, CARD_SEARCH_FIELDS, query));
}

export function IntegrationsScreen({
    projectName,
    hasAdobeContext,
    appBuilderComponents,
    appBuilderComponentCatalog,
    destination: seededDestination,
    adobeProjectId,
    adobeWorkspaceId,
    adobeOrgId,
    commerceStoreStructure,
}: IntegrationsScreenProps): React.ReactElement {
    const { meshStatusDisplay, meshStatus, isTransitioning, projectStatus } = useDashboardStatus({
        hasAdobeContext,
    });
    const components = useLiveAppBuilderComponents(appBuilderComponents);
    // Live, not the raw prop: the init payload seeds the header once, so without
    // this a destination change left the crumb naming the OLD target all session.
    const destination = useLiveDestination(seededDestination);
    const overrides = useRowStatusOverrides();
    const [searchQuery, setSearchQuery] = useState('');
    const [addOpen, setAddOpen] = useState(false);
    // One modal instance, two journeys — `mode` selects the stage set, so a
    // second <AddIntegrationFlowAdapter> would just duplicate its state.
    const [destOpen, setDestOpen] = useState(false);

    const destinationLabel = formatDestination(destination);
    const catalog = appBuilderComponentCatalog ?? EMPTY_CATALOG;

    const cards = useMemo((): IntegrationCardModel[] => {
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
            mesh?.state ?? getMeshAppBuilderComponent(project),
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

    const visibleCards = useMemo(() => filterCards(cards, searchQuery), [cards, searchQuery]);
    // Named rather than inlined: a 4-operand && chain in JSX trips the
    // complex-expression SOP scan (tests/sop/complex-expressions.test.ts).
    const searchFoundNothing =
        Boolean(searchQuery) && visibleCards.length === 0 && cards.length > 0;

    const handleBack = useCallback((): void => {
        webviewClient.postMessage('showProjectDashboard');
    }, []);

    const handleDeployMesh = useCallback((): void => {
        webviewClient.postMessage('deployMesh');
    }, []);

    const handleReAuthenticate = useCallback((): void => {
        webviewClient.postMessage('reAuthenticate');
    }, []);

    const handleRefresh = useCallback((): void => {
        webviewClient.postMessage('requestStatus');
    }, []);

    const openAdd = useCallback((): void => setAddOpen(true), []);
    const closeAdd = useCallback((): void => setAddOpen(false), []);
    const openDestination = useCallback((): void => setDestOpen(true), []);
    const closeDestination = useCallback((): void => setDestOpen(false), []);

    // Status has not resolved yet — the mesh card would otherwise pop in a beat
    // after the integration cards. Same LoadingDisplay as ProjectsDashboard's gate.
    // The Flex stays: CenteredFeedbackContainer takes a FIXED DimensionValue (it
    // models in-panel feedback), so it cannot express "fill this 100vh screen".
    if (hasAdobeContext && !projectStatus) {
        return (
            <View height="100vh" backgroundColor="gray-50">
                <Flex justifyContent="center" alignItems="center" height="100%">
                    <LoadingDisplay size="L" message="Loading integrations…" />
                </Flex>
            </View>
        );
    }

    return (
        <PageLayout
            header={
                <PageHeader
                    // Title + subtitle ONLY — exactly ProjectDashboardScreen's
                    // header. Navigation is NOT here: the dashboard's "All Projects"
                    // is a trailing secondary Button in the band BELOW the title
                    // (DashboardStatusHeader), so this surface's back button lives
                    // in the equivalent band too.
                    title="Integrations"
                    // The LOCAL project name only. The remote deploy destination
                    // lives in the band below — see the destination row there.
                    subtitle={projectName}
                    constrainWidth
                />
            }
            backgroundColor="var(--spectrum-global-color-gray-50)"
        >
            <FullScreenSurface
                header={
                    <Flex alignItems="start" gap="size-300">
                        <View flex>
                            <SearchHeader
                                searchQuery={searchQuery}
                                onSearchQueryChange={setSearchQuery}
                                searchPlaceholder="Filter integrations..."
                                // 0, matching the projects list: show the field
                                // from the first item. Not a tuning knob — the
                                // COUNT's position depends on it. SearchHeader
                                // puts the count beside the refresh button when
                                // there is no field, and on its own line beneath
                                // the field when there is; a high threshold left
                                // this screen rendering the no-search fallback.
                                searchThreshold={0}
                                totalCount={cards.length}
                                filteredCount={visibleCards.length}
                                itemNoun="integration"
                                onRefresh={handleRefresh}
                                refreshAriaLabel="Refresh integrations"
                                hasLoadedOnce
                                alwaysShowCount
                                // The count row is space-between and its right
                                // half is empty once a field shows. The deploy
                                // destination goes there rather than costing the
                                // band a row: it is the least-used fact on the
                                // screen. NOT the page header — that is where the
                                // LOCAL project name and the REMOTE Adobe
                                // destination were indistinguishable.
                                countTrailing={
                                    destinationLabel ? (
                                        <div
                                            className="page-destination-row"
                                            data-testid="page-destination"
                                        >
                                            <span className="page-destination-label">
                                                Deploys to
                                            </span>
                                            <DestinationContext
                                                project={destination?.projectTitle}
                                                workspace={destination?.workspaceTitle}
                                                onChange={openDestination}
                                            />
                                        </div>
                                    ) : undefined
                                }
                            />
                        </View>
                        {/* Trailing buttons mirror DashboardStatusHeader: a
                            secondary nav button after the flexed content, with the
                            primary action last (as "New" is on the projects list). */}
                        <Button variant="secondary" onPress={handleBack}>
                            Project Dashboard
                        </Button>
                        {/* Withheld while empty: the empty state carries the CTA,
                            and it is the thing the eye lands on. Two Add buttons
                            for one action is the duplication this surface spent
                            2026-08-04 removing everywhere else. */}
                        {cards.length > 0 && (
                            <Button variant="cta" onPress={openAdd}>
                                Add integration
                            </Button>
                        )}
                    </Flex>
                }
            >
                {/* The empty state renders INSIDE the page chrome, not instead of
                    it. As a full-screen takeover it dropped the title, the
                    project · destination subtitle, and the Project Dashboard
                    button — so removing your last integration stranded you on a
                    screen with no project context and no way back. */}
                {cards.length === 0 ? (
                    <CtaEmptyState
                        title="No integrations yet"
                        description="Add an API Mesh, a pre-built integration, or your own custom integration — each deploys to this project's shared Adobe I/O workspace."
                        actions={[
                            { label: 'Add integration', variant: 'accent', onPress: openAdd },
                        ]}
                    />
                ) : (
                    <IntegrationsGrid
                        cards={visibleCards}
                        onDeployMesh={handleDeployMesh}
                        onReAuthenticate={handleReAuthenticate}
                        destinationLabel={destinationLabel}
                    />
                )}

                {/* No-results message, mirroring the projects list. The grid gets
                    search-FILTERED cards while the empty-state gate above reads
                    the unfiltered list, so a no-match search renders an empty
                    grid. The dashed add tile used to sit there alone, reading as
                    "add one" rather than "nothing matched"; with the tile gone
                    the area would otherwise be blank, and the header's "0 of N"
                    is a count, not an answer. */}
                {searchFoundNothing && (
                    <Flex
                        justifyContent="center"
                        alignItems="center"
                        UNSAFE_className="centered-padding-lg"
                    >
                        <Text UNSAFE_className="text-gray-500">
                            No integrations match &quot;{searchQuery}&quot;
                        </Text>
                    </Flex>
                )}

                {/* Hosted HERE so the header button and the grid's add tile open
                    the same one instance. */}
                <AddIntegrationFlowAdapter
                    isOpen={addOpen || destOpen}
                    mode={destOpen ? 'destination' : 'add'}
                    onClose={destOpen ? closeDestination : closeAdd}
                    catalog={catalog}
                    appBuilderComponents={components}
                    adobeProjectId={adobeProjectId}
                    adobeWorkspaceId={adobeWorkspaceId}
                    adobeProjectTitle={destination?.projectTitle}
                    adobeWorkspaceTitle={destination?.workspaceTitle}
                    adobeOrgId={adobeOrgId}
                />
            </FullScreenSurface>
        </PageLayout>
    );
}
