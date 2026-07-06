/**
 * IntegrationsStep — the Integrations area body (two sub-steps: Services → Adobe I/O).
 *
 * Mirrors Commerce/Storefront: a left {@link VerticalStepList} rail over a dedicated view of
 * the active sub-step's body, driven by the shared {@link areaSubSteps} provider (the active
 * sub-step is `state.activeIntegrationsStep`).
 *   - Services (`deployables`) — the deployable type-rows ({@link DeployablesBody}: API Mesh,
 *     Integration Catalog, Custom Integration) plus the added-integration cards. The Catalog
 *     row's Add opens the browse modal ({@link AddIntegrationModal}, a Services action mounted
 *     only on this sub-step); the Custom row adds inline. The stack's API Mesh renders as a
 *     selection-aware card ({@link MeshIntegrationCard}); availability requires a `kind:
 *     "mesh"` App Builder component to apply to the current package + stack
 *     ({@link meshComponentForStack}). Add/Remove uses the mesh dual-flow
 *     ({@link useProjectBuilder.onAppBuilderComponentToggle}).
 *   - Adobe I/O (`adobe-io`) — the shared Adobe I/O project + workspace
 *     ({@link AdobeIoStep}). Appears in the rail only once a deployable is selected.
 *
 * The Build step owns the Continue/Finish gate via the shared driver; this body gets a NO-OP
 * `setCanProceed`.
 *
 * @module features/project-creation/ui/steps/IntegrationsStep
 */

import React, { useCallback, useMemo, useState } from 'react';
import { getAvailableAppBuilderComponents } from '../../services/appBuilderComponentCatalogLoader';
import { AddIntegrationModal } from '../components/AddIntegrationModal';
import { AdobeIoStep } from '../components/AdobeIoStep';
import { resolveSelectedIntegrations } from '../components/appBuilderIntegrationList';
import { VerticalStepList } from '../components/VerticalStepList';
import { getStackById } from '../hooks/useSelectedStack';
import { requireAreaSubSteps } from './areaSubSteps';
import { DeployablesBody } from './integrationsStepBodies';
import { isMeshSelected, meshComponentForStack } from './tileStatus';
import { useProjectBuilder } from './useProjectBuilder';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { IntegrationsSectionId } from '@/types/webview';
import type { BaseStepProps } from '@/types/wizard';

/** Stable empty defaults (avoids the infinite-re-render gotcha). */
const EMPTY_INTEGRATION_IDS: string[] = [];

/** Stable empty defaults for catalog props (avoids the infinite-re-render gotcha). */
const EMPTY_PACKAGES: DemoPackage[] = [];
const EMPTY_STACKS: Stack[] = [];

export interface IntegrationsStepProps extends BaseStepProps {
    /** Available demo packages (catalog data; drives mesh availability). */
    packages?: DemoPackage[];
    /** Available stacks/architectures (catalog data; drives mesh availability). */
    stacks?: Stack[];
}

/**
 * The Integrations area body: the [ rail | active sub-step body ] row.
 *
 * @param props - Standard step props plus the package + stack catalog
 * @returns The Integrations surface
 */
export function IntegrationsStep({
    state,
    updateState,
    packages = EMPTY_PACKAGES,
    stacks = EMPTY_STACKS,
}: IntegrationsStepProps): React.ReactElement {
    const { onAppBuilderComponentToggle, onAddCustomAppBuilderComponent, onRemoveAppBuilderComponent } =
        useProjectBuilder(state, updateState, { packages, stacks });

    // The Integration Catalog modal: opened by the Catalog row's Add or a card's "Change".
    // Decoupled from the persistent list so the growing library gets its own surface. Change
    // reopens the catalog WITHOUT removing first, so the integration's tile stays checked and
    // the user can toggle it off / pick another.
    const [modalOpen, setModalOpen] = useState(false);
    const onOpenCatalog = useCallback((): void => setModalOpen(true), []);

    const meshComponent = useMemo(
        () => meshComponentForStack(state, packages, stacks),
        [state, packages, stacks],
    );
    const available = meshComponent !== undefined;
    const selected = available ? isMeshSelected(state, meshComponent.id) : false;

    const onMeshToggle = (next: boolean): void => {
        if (available && meshComponent) {
            onAppBuilderComponentToggle(meshComponent.id, next);
        }
    };

    // The pre-built integration catalog for the selected stack (empty when no stack).
    const integrationCatalog = useMemo<AppBuilderComponentCatalogEntry[]>(() => {
        const stack = state.selectedStack ? getStackById(state.selectedStack) : undefined;
        return getAvailableAppBuilderComponents(stack?.backend ?? '', stack?.frontend ?? '').filter(
            entry => entry.kind === 'integration',
        );
    }, [state.selectedStack]);

    // The added integrations, resolved to render descriptors for their own cards.
    const integrations = useMemo(() => resolveSelectedIntegrations(state), [state]);

    // Currently-selected integration ids: catalog integrations + custom-URL adds.
    const selectedIntegrationIds = useMemo<string[]>(() => {
        const selectedIds = state.selectedAppBuilderComponents ?? EMPTY_INTEGRATION_IDS;
        const sources = state.appBuilderComponentSources ?? {};
        return selectedIds.filter(
            id => id in sources || integrationCatalog.some(entry => entry.id === id),
        );
    }, [state.selectedAppBuilderComponents, state.appBuilderComponentSources, integrationCatalog]);

    // Sub-step rail + active view (shared driver). The active one is
    // `state.activeIntegrationsStep`, pinned on area entry by WizardContainer.
    const driver = requireAreaSubSteps('integrations');
    const subSteps = driver.subSteps(state);
    const activeStep = driver.active(state) as IntegrationsSectionId;
    const onServices = activeStep === 'deployables';

    return (
        <div className="commerce-body">
            <div className="step-nav">
                <div className="step-nav-area">Integrations</div>
                <VerticalStepList
                    steps={subSteps}
                    activeId={activeStep}
                    onSelect={id => updateState(driver.setActive(id))}
                />
            </div>
            <div className="step-view">
                <div className="step-view-anim" key={activeStep}>
                    {onServices ? (
                        <DeployablesBody
                            state={state}
                            updateState={updateState}
                            meshAvailable={available}
                            meshSelected={selected}
                            onMeshToggle={onMeshToggle}
                            onOpenCatalog={onOpenCatalog}
                            catalogEmpty={integrationCatalog.length === 0}
                            onAddCustom={onAddCustomAppBuilderComponent}
                            selectedIntegrationIds={selectedIntegrationIds}
                            integrations={integrations}
                            onRemoveIntegration={onRemoveAppBuilderComponent}
                            onChangeIntegration={onOpenCatalog}
                        />
                    ) : (
                        <AdobeIoStep state={state} updateState={updateState} />
                    )}
                </div>
            </div>
            {/* The modal is a Services action; keep it mounted only on that sub-step. */}
            {onServices && (
                <AddIntegrationModal
                    isOpen={modalOpen}
                    onClose={() => setModalOpen(false)}
                    catalog={integrationCatalog}
                    selectedIds={selectedIntegrationIds}
                    onToggleCatalog={onAppBuilderComponentToggle}
                />
            )}
        </div>
    );
}
