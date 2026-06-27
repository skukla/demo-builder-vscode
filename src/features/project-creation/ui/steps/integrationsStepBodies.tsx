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
 *  - {@link DeploymentTargetBody} — the ONE shared Adobe I/O deployment target. Adobe
 *    sign-in is subsumed here (the retired standalone "Adobe Authentication" step): the
 *    full AdobeAuthStep renders the sign-in / connected status, then — once signed in —
 *    the REAL project + workspace pickers (progressive) + the provisioning summary.
 *
 * Presentational: the parent {@link IntegrationsStep} computes the mesh row's status +
 * action and the sign-in trigger; these bodies just render.
 *
 * @module features/project-creation/ui/steps/integrationsStepBodies
 */

import React from 'react';
import {
    IntegrationCard,
    type IntegrationCardAction,
    type IntegrationCardStatus,
} from '../components/IntegrationCard';
import { AdobeProjectPicker } from '@/features/authentication/ui/components/AdobeProjectPicker';
import { AdobeWorkspacePicker } from '@/features/authentication/ui/components/AdobeWorkspacePicker';
import { AdobeAuthStep } from '@/features/authentication/ui/steps/AdobeAuthStep';
import type { WizardState } from '@/types/webview';

/** No-op setter handed to the subsumed AdobeAuthStep (the Build step owns the gate). */
const NOOP = (): void => {};

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
 * The "Deployables" sub-step: the API Mesh card + a simulated "add an integration" card.
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
    /** Whether the user is signed in to Adobe with an org selected. */
    signedIn: boolean;
}

/**
 * The "Deployment target" sub-step: Adobe sign-in (the standalone "Adobe
 * Authentication" wizard step is fully subsumed here) over the ONE shared Adobe I/O
 * project + workspace for every deployable. The full {@link AdobeAuthStep} renders the
 * sign-in / connected status; once signed in, the project picker — then, progressively,
 * the workspace picker — and the provisioning summary appear below. The pickers write
 * `adobeProject` / `adobeWorkspace`.
 *
 * @param props - state, updateState, sign-in status
 * @returns the deployment-target view
 */
export function DeploymentTargetBody({
    state,
    updateState,
    signedIn,
}: DeploymentTargetBodyProps): React.ReactElement {
    const hasProject = Boolean(state.adobeProject?.id);
    return (
        <div className="int-target">
            <AdobeAuthStep state={state} updateState={updateState} setCanProceed={NOOP} />
            {signedIn && (
                <>
                    <div className="int-field">
                        <span className="int-field-label">
                            Adobe I/O project (deployment target)
                        </span>
                        <AdobeProjectPicker state={state} updateState={updateState} />
                    </div>
                    {hasProject && (
                        <div className="int-field">
                            <span className="int-field-label">Workspace</span>
                            <AdobeWorkspacePicker state={state} updateState={updateState} />
                        </div>
                    )}
                    <div className="int-provision">
                        <div className="int-provision-title">On create, the extension will:</div>
                        <ul className="int-provision-list">
                            <li>Create the Adobe I/O project</li>
                            <li>Create the workspace</li>
                            <li>Create an OAuth Server-to-Server credential</li>
                            <li>
                                Subscribe required APIs: <b>GraphQL Service SDK</b>
                            </li>
                        </ul>
                    </div>
                    <div className="int-tile-note">
                        Reuses your Adobe session and the Commerce connection values; provides
                        MESH_ENDPOINT to the storefront.
                    </div>
                </>
            )}
        </div>
    );
}
