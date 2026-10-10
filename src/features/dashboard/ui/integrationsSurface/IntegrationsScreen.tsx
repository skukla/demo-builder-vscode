/**
 * IntegrationsScreen — the dedicated integrations surface.
 *
 * Scaffolded like {@link ProjectsDashboard}, the extension's other full-page
 * card-grid surface, so the two read as one app:
 *   1. three render states chosen BEFORE layout — loading, empty, loaded
 *   2. `PageLayout` + `PageHeader` (title + subtitle only, like the dashboard's;
 *      navigation rides the right-aligned `action` slot)
 *   3. a sticky action band — {@link IntegrationsActionBand}
 *   4. content in `.page-container-padded pb-6`
 *
 * This screen OWNS the data (the two live push channels and the card
 * derivation, `useIntegrationCards`) and filters it (`useIntegrationCardSearch`);
 * {@link IntegrationsGrid} only renders the cards it is handed — the same split
 * as ProjectsDashboard → ProjectsGrid. That is what lets the header count and
 * the grid never disagree. What its controls do lives in
 * `useIntegrationsScreenActions` (split out by EDS-8, 2026-10-08).
 *
 * @module features/dashboard/ui/integrationsSurface/IntegrationsScreen
 */

import { Flex, Text, View } from '@adobe/react-spectrum';
import React from 'react';
import { ErpAssignDialogs, useErpAssignDialogs } from '../components/integrations/ErpAssignDialogs';
import { IntegrationsGrid } from '../components/integrations/IntegrationsGrid';
import {
    SetupGuideModal,
    setupNextStep,
    useSetupGuide,
} from '../components/integrations/SetupGuideModal';
import { useComponentOperation } from '../hooks/useComponentOperation';
import { useDashboardStatus } from '../hooks/useDashboardStatus';
import { useLiveAppBuilderComponents } from '../hooks/useLiveAppBuilderComponents';
import { useLiveDestination } from '../hooks/useLiveDestination';
import { AddIntegrationFlowAdapter } from './AddIntegrationFlowAdapter';
import { IntegrationsActionBand } from './IntegrationsActionBand';
import { useIntegrationCards } from './useIntegrationCards';
import { useIntegrationCardSearch } from './useIntegrationCardSearch';
import { useIntegrationsScreenActions } from './useIntegrationsScreenActions';
import { CtaEmptyState } from '@/core/ui/components/feedback/CtaEmptyState';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { OperationProgressModal } from '@/core/ui/components/feedback/OperationProgressModal';
import { FullScreenSurface } from '@/core/ui/components/layout/FullScreenSurface';
import { PageHeader } from '@/core/ui/components/layout/PageHeader';
import { PageLayout } from '@/core/ui/components/layout/PageLayout';
import { useViewModePreference } from '@/core/ui/hooks/useViewModePreference';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { IntegrationsInitialData } from '@/types/webviewPayloads';

/** Module-level stable empty catalog — avoids a new array ref each render. */
const EMPTY_CATALOG: AppBuilderComponentCatalogEntry[] = [];

/**
 * Init payload (`IntegrationsInitialData`), relaxed to Partial: the wire
 * always carries the required fields, but tests render the screen without them.
 */
export type IntegrationsScreenProps = Partial<IntegrationsInitialData>;

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
    componentSettings,
    integrationsViewMode,
}: IntegrationsScreenProps): React.ReactElement {
    // No props: the four values read here depend on the status pushes alone.
    // `hasAdobeContext` reaches only the hook's org-check state, which this
    // screen does not render — the screen's own gate below reads the prop.
    const { meshStatusDisplay, meshStatus, isTransitioning, projectStatus } = useDashboardStatus();
    const components = useLiveAppBuilderComponents(appBuilderComponents);
    // Live, not the raw prop: the init payload seeds the header once, so without
    // this a destination change left the crumb naming the OLD target all session.
    const destination = useLiveDestination(seededDestination);
    const catalog = appBuilderComponentCatalog ?? EMPTY_CATALOG;
    const cards = useIntegrationCards({
        components,
        catalog,
        meshStatusDisplay,
        meshStatus,
        isTransitioning,
        commerceStoreStructure,
    });
    const search = useIntegrationCardSearch(cards);
    const { searchQuery, visibleCards, isFiltering, searchFoundNothing } = search;
    // Cards or rows, the projects list's toggle (owner, 2026-09-24): seeded from
    // the init payload, kept for the session by the extension.
    const { viewMode, choose: chooseViewMode } = useViewModePreference(
        'integrations',
        integrationsViewMode,
    );
    const operations = useComponentOperation();
    const actions = useIntegrationsScreenActions(operations.start);
    const { addOpen, destOpen, openAdd, closeAdd, closeDestination } = actions;
    // The demo setup guide (AB-26x) lives here, not in the grid: the progress modal below
    // opens it too, when an operation finishes with setup still to do.
    const { open: openGuide, modal: guideModal } = useSetupGuide(cards);
    // "Assign products" and the attribute-set fix (AB-74): opened from a card, the setup
    // guide, and the success view of "Add another ERP".
    const erpAssign = useErpAssignDialogs(operations);

    // Status has not resolved yet — the mesh card would otherwise pop in a beat
    // after the integration cards. Same LoadingDisplay as ProjectsDashboard's gate.
    // The Flex stays: CenteredFeedbackContainer takes a FIXED DimensionValue (it
    // models in-panel feedback), so it cannot express "fill this 100vh screen".
    if (hasAdobeContext && !projectStatus) {
        return (
            <View height="100vh" backgroundColor="gray-50">
                <Flex justifyContent="center" alignItems="center" height="100%">
                    <LoadingDisplay size="L" message="Loading integrations" />
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
                    <IntegrationsActionBand
                        cards={cards}
                        search={search}
                        viewMode={viewMode}
                        onViewModeChange={chooseViewMode}
                        onRefresh={actions.handleRefresh}
                        destination={destination}
                        onChangeDestination={actions.openDestination}
                        onBack={actions.handleBack}
                    />
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
                        description="Add an API Mesh, a pre-built integration, or your own."
                        actions={[
                            { label: 'Add integration', variant: 'accent', onPress: openAdd },
                        ]}
                    />
                ) : (
                    <IntegrationsGrid
                        cards={visibleCards}
                        viewMode={viewMode}
                        onDeployMesh={actions.handleDeployMesh}
                        onReAuthenticate={actions.handleReAuthenticate}
                        componentSettings={componentSettings}
                        operations={operations}
                        onOpenGuide={openGuide}
                        erpAssign={erpAssign}
                        // The add card steps aside while a filter is on: it is
                        // not a result, and alone it would read as "add one"
                        // rather than "nothing matched".
                        onAdd={isFiltering ? undefined : openAdd}
                    />
                )}

                {/* No-results message, mirroring the projects list. The grid gets
                    search-FILTERED cards while the empty-state gate above reads
                    the unfiltered list, so a no-match search renders an empty
                    grid (the add card is withheld while filtering), and the
                    header's "0 of N" is a count, not an answer. */}

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

                {/* Hosted HERE so the empty state's CTA and the grid's add card
                    open the same one instance. */}
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
                    onAddStarted={operations.started}
                    onDestinationChosen={actions.handleDestinationChosen}
                />

                {/* The operation progress modal (PL-59). Here, not in the grid: the
                    first Add happens on a screen with no grid. Keyed by component id,
                    which the mesh card carries as componentId. */}
                <OperationProgressModal
                    operation={operations.open}
                    onRetry={operations.retry}
                    onClose={operations.close}
                    next={setupNextStep(cards, operations.open?.id, openGuide)}
                    offerStep={erpAssign.offerStep}
                />
                <SetupGuideModal {...guideModal} onFix={erpAssign.changeSets} />
                <ErpAssignDialogs {...erpAssign.dialogs} />
            </FullScreenSurface>
        </PageLayout>
    );
}
