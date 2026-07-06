/**
 * integrationsStepBodies — the Integrations "Services" sub-step view (the deployable list).
 *
 * The list is a set of persistent TYPE-ROWS, each an add entry point, plus one card per added
 * integration:
 *   - API Mesh ({@link MeshIntegrationCard}) — expands inline to host its destination when added.
 *   - Integration Catalog — Add opens the browse MODAL ({@link AddIntegrationModal}); a large,
 *     growing library warrants its own surface. Muted "None available yet" when the catalog is
 *     empty for the stack.
 *   - Custom Integration ({@link CustomIntegrationRow}) — a single GitHub-URL config, so it
 *     expands INLINE rather than opening a modal.
 *   - once anything is added, an "Added" divider separates the add menu above from one
 *     {@link AppBuilderIntegrationCard} per added integration (catalog or custom) below.
 *
 * The shared Adobe I/O workspace lives in its OWN "Adobe I/O" sub-step ({@link AdobeIoStep}),
 * not inline here. A card's "Change" delegates up via {@link onChangeIntegration}.
 *
 * @module features/project-creation/ui/steps/integrationsStepBodies
 */

import React from 'react';
import { AppBuilderIntegrationCard } from '../components/AppBuilderIntegrationCard';
import type { SelectedIntegration } from '../components/appBuilderIntegrationList';
import { CustomIntegrationRow } from '../components/CustomIntegrationRow';
import { IntegrationCard } from '../components/IntegrationCard';
import { MeshIntegrationCard } from '../components/MeshIntegrationCard';
import type { WizardState } from '@/types/webview';

export interface DeployablesBodyProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
    /** Whether a mesh component applies to the current package + stack. */
    meshAvailable: boolean;
    /** Whether the mesh is currently selected. */
    meshSelected: boolean;
    /** Add (true) / Remove (false) the mesh. */
    onMeshToggle: (next: boolean) => void;
    /** Open the Integration Catalog browse modal. */
    onOpenCatalog: () => void;
    /** Whether the catalog has NO entries for the stack (mutes the Catalog row). */
    catalogEmpty: boolean;
    /** Commit a custom integration from a parsed GitHub source (inline Custom row). */
    onAddCustom: (source: { owner: string; repo: string }) => void;
    /** Ids already added — the Custom row's dup-guard. */
    selectedIntegrationIds: string[];
    /** The added App Builder integrations, rendered as their own cards. */
    integrations: SelectedIntegration[];
    /** Remove an added integration (clears its selection + source). */
    onRemoveIntegration: (id: string) => void;
    /** Change an added integration: reopen the catalog (selection kept — its tile stays ✓). */
    onChangeIntegration: (id: string) => void;
}

/**
 * The "Services" view: the API Mesh card, the Integration Catalog + Custom Integration
 * type-rows (the add entry points), and one card per added integration.
 *
 * @param props - state/updater, mesh availability+toggle, catalog + custom add wiring, and
 *   the added integration list + remove/change handlers
 * @returns the deployables list view
 */
export function DeployablesBody({
    state,
    updateState,
    meshAvailable,
    meshSelected,
    onMeshToggle,
    onOpenCatalog,
    catalogEmpty,
    onAddCustom,
    selectedIntegrationIds,
    integrations,
    onRemoveIntegration,
    onChangeIntegration,
}: DeployablesBodyProps): React.ReactElement {
    return (
        <div className="int-deployables">
            <MeshIntegrationCard
                state={state}
                updateState={updateState}
                available={meshAvailable}
                selected={meshSelected}
                onToggle={onMeshToggle}
            />
            <IntegrationCard
                name="Integration Catalog"
                description="Add pre-built App Builder integrations from Adobe's catalog."
                selected={false}
                {...(catalogEmpty
                    ? { naLabel: 'None available yet' }
                    : { action: { label: 'Add', onPress: onOpenCatalog, variant: 'accent' } })}
            />
            <CustomIntegrationRow selectedIds={selectedIntegrationIds} onAdd={onAddCustom} />
            {integrations.length > 0 && (
                <div className="int-added-divider">
                    <span className="int-added-label">Added</span>
                </div>
            )}
            {integrations.map((integ) => (
                <AppBuilderIntegrationCard
                    key={integ.id}
                    integration={integ}
                    state={state}
                    onRemove={onRemoveIntegration}
                    onChange={onChangeIntegration}
                />
            ))}
        </div>
    );
}
