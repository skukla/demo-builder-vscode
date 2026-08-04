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

import { Button, Flex, View } from '@adobe/react-spectrum';
import React, { useCallback, useMemo, useState } from 'react';
import {
    buildIntegrationCards,
    deriveMeshCard,
    type IntegrationCardModel,
} from '../components/integrations/integrationCardModel';
import { IntegrationsGrid } from '../components/integrations/IntegrationsGrid';
import { isMeshBusy, useDashboardStatus } from '../hooks/useDashboardStatus';
import { useLiveAppBuilderComponents } from '../hooks/useLiveAppBuilderComponents';
import { useRowStatusOverrides } from '../hooks/useRowStatusOverrides';
import { AddIntegrationFlowAdapter } from './AddIntegrationFlowAdapter';
import { LoadingDisplay, StatusDisplay } from '@/core/ui/components/feedback';
import { PageHeader, PageLayout } from '@/core/ui/components/layout';
import { SearchHeader } from '@/core/ui/components/navigation/SearchHeader';
import { matchesSearchFields } from '@/core/ui/hooks/useSearchFilter';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import {
    getIdentifiedMeshAppBuilderComponent,
    getMeshAppBuilderComponent,
    listAppBuilderComponents,
} from '@/features/app-builder/services/appBuilderComponentState';
import type { Project } from '@/types';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState } from '@/types/base';

/** Module-level stable empty catalog — avoids a new array ref each render. */
const EMPTY_CATALOG: AppBuilderComponentCatalogEntry[] = [];

/**
 * Filtering only earns its keep past a handful of integrations; below this the
 * search field would be chrome over three cards.
 */
const FILTER_THRESHOLD = 6;

export interface IntegrationsScreenProps {
    projectName?: string;
    hasAdobeContext?: boolean;
    appBuilderComponents?: Record<string, AppBuilderComponentState>;
    appBuilderComponentCatalog?: AppBuilderComponentCatalogEntry[];
    /** Adobe project/workspace TITLES — the shared deploy destination. */
    destination?: { projectTitle?: string; workspaceTitle?: string };
    /** The committed destination IDs, which the add flow reads as booleans. */
    adobeProjectId?: string;
    adobeWorkspaceId?: string;
    /** The IMS org — the add flow's signed-in test reads this, not the project id. */
    adobeOrgId?: string;
}

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

/**
 * The header crumb: "<project>", "<project> · <destination>", or undefined.
 *
 * The deploy destination rides here rather than in the action band because it is
 * a property of the PROJECT, and the band is otherwise about acting on the list.
 *
 * Known trade-off, chosen deliberately: the local project name and the remote
 * Adobe project/workspace become peers in one dot-separated run, so nothing
 * distinguishes "demo-builder-test" (local) from "Kukla Mesh · Stage" (Adobe).
 * The alternative — a labelled second line in PageHeader's `description` slot —
 * keeps that distinction but costs a line of header height.
 *
 * @param projectName - the local demo project's name
 * @param destination - the Adobe project/workspace titles
 * @returns the crumb, or undefined when neither part is known
 */
export function formatHeaderSubtitle(
    projectName: string | undefined,
    destination: { projectTitle?: string; workspaceTitle?: string } | undefined,
): string | undefined {
    const parts = [projectName, formatDestination(destination)].filter(Boolean);
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
    destination,
    adobeProjectId,
    adobeWorkspaceId,
    adobeOrgId,
}: IntegrationsScreenProps): React.ReactElement {
    const { meshStatusDisplay, meshStatus, isTransitioning, projectStatus } = useDashboardStatus({
        hasAdobeContext,
    });
    const components = useLiveAppBuilderComponents(appBuilderComponents);
    const overrides = useRowStatusOverrides();
    const [searchQuery, setSearchQuery] = useState('');
    const [addOpen, setAddOpen] = useState(false);

    const destinationLabel = formatDestination(destination);
    const headerSubtitle = formatHeaderSubtitle(projectName, destination);
    const catalog = appBuilderComponentCatalog ?? EMPTY_CATALOG;

    const cards = useMemo((): IntegrationCardModel[] => {
        const project = { appBuilderComponents: components } as Project;
        const integrationCards = buildIntegrationCards(
            listAppBuilderComponents(project),
            overrides,
            catalog,
        );
        if (!meshStatusDisplay) {
            return integrationCards;
        }
        // ONE lookup for id AND state. Resolving them separately let the card
        // show one mesh while its Remove tore down another (2026-08-04, live) —
        // the map search has a priority, and a second search that omits it picks
        // a different component whenever a project holds more than one mesh.
        const mesh = getIdentifiedMeshAppBuilderComponent(project);
        const meshCard = deriveMeshCard(
            meshStatusDisplay,
            meshStatus,
            mesh?.state ?? getMeshAppBuilderComponent(project),
            isMeshBusy(meshStatus) || isTransitioning,
            mesh?.id,
        );
        return [meshCard, ...integrationCards];
    }, [components, overrides, catalog, meshStatusDisplay, meshStatus, isTransitioning]);

    const visibleCards = useMemo(() => filterCards(cards, searchQuery), [cards, searchQuery]);

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
                    // Project name AND the shared deploy destination — see
                    // formatHeaderSubtitle for why the destination lives here.
                    subtitle={headerSubtitle}
                    constrainWidth
                />
            }
            backgroundColor="var(--spectrum-global-color-gray-50)"
        >
            <div className="projects-sticky-header">
                <div className="page-container-padded page-header-section">
                    <Flex alignItems="start" gap="size-300">
                        <View flex>
                            <SearchHeader
                                searchQuery={searchQuery}
                                onSearchQueryChange={setSearchQuery}
                                searchPlaceholder="Filter integrations..."
                                searchThreshold={FILTER_THRESHOLD}
                                totalCount={cards.length}
                                filteredCount={visibleCards.length}
                                itemNoun="integration"
                                onRefresh={handleRefresh}
                                refreshAriaLabel="Refresh integrations"
                                hasLoadedOnce
                                alwaysShowCount
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
                </div>
            </div>

            <div className="page-container-padded pb-6">
                {/* The empty state renders INSIDE the page chrome, not instead of
                    it. As a full-screen takeover it dropped the title, the
                    project · destination subtitle, and the Project Dashboard
                    button — so removing your last integration stranded you on a
                    screen with no project context and no way back. */}
                {cards.length === 0 ? (
                    <StatusDisplay
                        variant="info"
                        title="No integrations yet"
                        message="Add an API Mesh, a pre-built integration, or your own custom integration — each deploys to this project's shared Adobe I/O workspace."
                        actions={[{ label: 'Add integration', variant: 'accent', onPress: openAdd }]}
                    />
                ) : (
                    <IntegrationsGrid
                        cards={visibleCards}
                        onAddRequest={openAdd}
                        onDeployMesh={handleDeployMesh}
                        onReAuthenticate={handleReAuthenticate}
                        destinationLabel={destinationLabel}
                    />
                )}

                {/* Hosted HERE so the header button and the grid's add tile open
                    the same one instance. */}
                <AddIntegrationFlowAdapter
                    isOpen={addOpen}
                    onClose={closeAdd}
                    catalog={catalog}
                    appBuilderComponents={components}
                    adobeProjectId={adobeProjectId}
                    adobeWorkspaceId={adobeWorkspaceId}
                    adobeProjectTitle={destination?.projectTitle}
                    adobeWorkspaceTitle={destination?.workspaceTitle}
                    adobeOrgId={adobeOrgId}
                />
            </div>
        </PageLayout>
    );
}
