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

import { Button, Flex, ProgressCircle, View } from '@adobe/react-spectrum';
import React, { useCallback, useMemo, useState } from 'react';
import { AddIntegrationModal } from '../components/integrations/AddIntegrationModal';
import {
    buildIntegrationCards,
    deriveMeshCard,
    type IntegrationCardModel,
} from '../components/integrations/integrationCardModel';
import { IntegrationsGrid } from '../components/integrations/IntegrationsGrid';
import { isMeshBusy, useDashboardStatus } from '../hooks/useDashboardStatus';
import { useLiveAppBuilderComponents } from '../hooks/useLiveAppBuilderComponents';
import { useRowStatusOverrides } from '../hooks/useRowStatusOverrides';
import { StatusDisplay } from '@/core/ui/components/feedback';
import { PageHeader, PageLayout } from '@/core/ui/components/layout';
import { SearchHeader } from '@/core/ui/components/navigation/SearchHeader';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import {
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

/** Case-insensitive match over the fields a user would search by. */
export function filterCards(cards: IntegrationCardModel[], query: string): IntegrationCardModel[] {
    const needle = query.trim().toLowerCase();
    if (!needle) {
        return cards;
    }
    return cards.filter((card) =>
        [card.name, card.kindLabel, card.sourceLine].some((field) =>
            field?.toLowerCase().includes(needle),
        ),
    );
}

export function IntegrationsScreen({
    projectName,
    hasAdobeContext,
    appBuilderComponents,
    appBuilderComponentCatalog,
    destination,
}: IntegrationsScreenProps): React.ReactElement {
    const { meshStatusDisplay, meshStatus, isTransitioning, projectStatus } = useDashboardStatus({
        hasAdobeContext,
    });
    const components = useLiveAppBuilderComponents(appBuilderComponents);
    const overrides = useRowStatusOverrides();
    const [searchQuery, setSearchQuery] = useState('');
    const [addOpen, setAddOpen] = useState(false);

    const destinationLabel = formatDestination(destination);
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
        const meshCard = deriveMeshCard(
            meshStatusDisplay,
            meshStatus,
            getMeshAppBuilderComponent(project),
            isMeshBusy(meshStatus) || isTransitioning,
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
    // after the integration cards. Mirrors ProjectsDashboard's loading gate.
    if (hasAdobeContext && !projectStatus) {
        return (
            <View height="100vh" backgroundColor="gray-50">
                <Flex justifyContent="center" alignItems="center" height="100%">
                    <ProgressCircle aria-label="Loading integrations" isIndeterminate size="L" />
                </Flex>
            </View>
        );
    }

    // Nothing to show at all — a full-screen CTA rather than a lone add tile in
    // an empty grid (ProjectsDashboard's empty-state treatment). Uses the CORE
    // StatusDisplay: DashboardEmptyState belongs to the projects-dashboard
    // feature and features must not import across feature boundaries.
    if (cards.length === 0) {
        return (
            <View height="100vh" backgroundColor="gray-50">
                <StatusDisplay
                    variant="info"
                    title="No integrations yet"
                    message="Add an API Mesh, a pre-built integration, or your own custom integration — each deploys to this project's shared Adobe I/O workspace."
                    actions={[{ label: 'Add integration', variant: 'accent', onPress: openAdd }]}
                />
                <AddIntegrationModal isOpen={addOpen} catalog={catalog} onClose={closeAdd} />
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
                    subtitle={projectName}
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
                        <Button variant="cta" onPress={openAdd}>
                            Add integration
                        </Button>
                    </Flex>
                </div>
            </div>

            <div className="page-container-padded pb-6">
                <IntegrationsGrid
                    cards={visibleCards}
                    onAddRequest={openAdd}
                    onDeployMesh={handleDeployMesh}
                    onReAuthenticate={handleReAuthenticate}
                    destinationLabel={destinationLabel}
                />

                {/* Hosted HERE so the header button and the grid's add tile open
                    the same one instance. */}
                <AddIntegrationModal isOpen={addOpen} catalog={catalog} onClose={closeAdd} />
            </div>
        </PageLayout>
    );
}
