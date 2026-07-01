/**
 * integrationsStepBodies — the Integrations area's single "Services" view.
 *
 * The former Sign-in / Destination sub-steps are dissolved into the mesh card: adding
 * the API Mesh expands {@link MeshIntegrationCard} inline to host its Adobe I/O
 * destination (sign-in gate → project/workspace). This body just lays out the deployable
 * list — the mesh card plus a dashed, SIMULATED "add an integration" empty slot (inert
 * this slice; a forward-looking affordance until integration catalog entries land).
 *
 * @module features/project-creation/ui/steps/integrationsStepBodies
 */

import React from 'react';
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
}

/**
 * The "Services" view: the API Mesh card (selection + inline destination) + a simulated
 * "add an integration" card.
 *
 * @param props - state, updater, and the mesh availability/selection/toggle
 * @returns the deployables list view
 */
export function DeployablesBody({
    state,
    updateState,
    meshAvailable,
    meshSelected,
    onMeshToggle,
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
            {/* Simulated empty slot — a dashed card for a future integration. Inert this
                slice (no integration catalog entries; custom provisioning unwired). */}
            <div className="int-add-card" aria-disabled="true">
                <span className="int-add-card-label">+ Add an integration</span>
                <span className="int-add-card-note">Pre-built integrations coming soon</span>
            </div>
        </div>
    );
}
