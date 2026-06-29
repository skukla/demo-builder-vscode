/**
 * integrationsStepBodies — the dedicated views for the Integrations area's sub-steps
 * (mirrors commerceStepBodies / the Storefront bodies).
 *
 * Two bodies, one per Integrations sub-step:
 *  - {@link DeployablesBody} — the deployable list: the stack's API Mesh row (toggle)
 *    plus a dashed, SIMULATED "add an integration" empty slot. Pre-built integrations
 *    have no catalog entries yet (the seed catalog is mesh-only) and creation-side
 *    provisioning for a custom integration isn't wired, so the slot is a forward-looking
 *    affordance with honest "coming soon" copy — NOT a live picker. When integration
 *    catalog entries land it becomes the real picker.
 *  - {@link DeploymentTargetBody} — the ONE shared Adobe I/O destination. NO auth (the
 *    user is signed in already, via the Commerce/Integrations signin sub-step): the
 *    project + workspace select-or-create fields (in-app create) + the provisioning
 *    summary. Sign-in itself is a separate sub-step (the `signin` body lives in
 *    {@link IntegrationsStep}, reusing AdobeAuthStep).
 *
 * Presentational: the parent {@link IntegrationsStep} computes the mesh card's status +
 * action; these bodies just render.
 *
 * @module features/project-creation/ui/steps/integrationsStepBodies
 */

import React from 'react';
import {
    IntegrationCard,
    type IntegrationCardAction,
    type IntegrationCardStatus,
} from '../components/IntegrationCard';
import {
    AdobeProjectField,
    AdobeWorkspaceField,
} from '@/features/authentication/ui/components/AdobeEntityFields';
import type { WizardState } from '@/types/webview';

/** The static mesh description (matches the v6 prototype). */
export const MESH_DESCRIPTION =
    'GraphQL bridge between storefront and backend. Deploys to Adobe I/O; provides MESH_ENDPOINT.';

export interface DeployablesBodyProps {
    /** The API Mesh card's status pill (na / off / on). */
    meshStatus: IntegrationCardStatus;
    /** The API Mesh card's action (Add / Remove); omitted when the mesh is N/A. */
    meshAction?: IntegrationCardAction;
}

/**
 * The "Services" sub-step (id `deployables`): the API Mesh card + a simulated
 * "add an integration" card.
 *
 * @param props - the mesh card's status + action
 * @returns the deployables list view
 */
export function DeployablesBody({
    meshStatus,
    meshAction,
}: DeployablesBodyProps): React.ReactElement {
    return (
        <div className="int-deployables">
            <IntegrationCard
                name="API Mesh"
                description={MESH_DESCRIPTION}
                status={meshStatus}
                action={meshAction}
            />
            {/* Simulated empty slot — a dashed card for a future integration. Inert
                this slice (no integration catalog entries; custom provisioning unwired). */}
            <div className="int-add-card" aria-disabled="true">
                <span className="int-add-card-label">+ Add an integration</span>
                <span className="int-add-card-note">Pre-built integrations coming soon</span>
            </div>
        </div>
    );
}

export interface DeploymentTargetBodyProps {
    state: WizardState;
    updateState: (updates: Partial<WizardState>) => void;
}

/**
 * The "Destination" sub-step (id `target`): the ONE shared Adobe I/O project + workspace
 * for every deployable. NO auth here — the user is already signed in (the Commerce signin
 * sub-step for ACCS, or the Integrations `signin` sub-step for other backends). The
 * project field ({@link AdobeProjectField}) selects an existing project OR creates a new
 * one in-app; once a project is chosen, the workspace field appears (same select-or-create,
 * under the selected project). They write `adobeProject` / `adobeWorkspace`.
 *
 * @param props - state, updateState
 * @returns the deployment-target view
 */
export function DeploymentTargetBody({
    state,
    updateState,
}: DeploymentTargetBodyProps): React.ReactElement {
    const hasProject = Boolean(state.adobeProject?.id);
    return (
        <div className="int-target">
            <div className="int-field">
                <span className="int-field-label">Adobe I/O project</span>
                <AdobeProjectField state={state} updateState={updateState} />
            </div>
            {hasProject && (
                <div className="int-field">
                    <span className="int-field-label">Workspace</span>
                    <AdobeWorkspaceField state={state} updateState={updateState} />
                </div>
            )}
            <div className="int-provision">
                <div className="int-provision-title">On create, the extension will:</div>
                <ul className="int-provision-list">
                    <li>Create an OAuth Server-to-Server credential</li>
                    <li>
                        Subscribe required APIs: <b>GraphQL Service SDK</b>
                    </li>
                </ul>
            </div>
            <div className="int-tile-note">
                Reuses your Adobe session and the Commerce connection values; provides MESH_ENDPOINT
                to the storefront.
            </div>
        </div>
    );
}
