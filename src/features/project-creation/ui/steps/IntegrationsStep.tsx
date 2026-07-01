/**
 * IntegrationsStep — the Integrations area body (a single "Services" screen).
 *
 * ONE screen (no sub-step tabs): the deployable list. The stack's API Mesh renders as a
 * selection-aware card ({@link MeshIntegrationCard}) that, when added, expands INLINE to
 * host its Adobe I/O destination — the former Sign-in / Destination sub-steps are
 * dissolved into it. Availability: a `kind: "mesh"` App Builder component must apply to
 * the current package + stack ({@link meshComponentForStack}) — else the card shows an
 * "N/A for this architecture" label with no action. Add/Remove uses the mesh dual-flow
 * ({@link useProjectBuilder.onAppBuilderComponentToggle}).
 *
 * The Build step owns the Continue/Finish gate via the shared driver: once a deployable
 * is selected, {@link isIntegrationsStepComplete} on `deployables` requires a signed-in
 * Adobe session + a chosen project + workspace. This body gets a NO-OP `setCanProceed`.
 *
 * @module features/project-creation/ui/steps/IntegrationsStep
 */

import React, { useEffect, useMemo } from 'react';
import { DeployablesBody } from './integrationsStepBodies';
import {
    anyDeployableSelected,
    isAdobeSignedIn,
    isMeshSelected,
    meshComponentForStack,
} from './tileStatus';
import { useProjectBuilder } from './useProjectBuilder';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { BaseStepProps } from '@/types/wizard';

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
 * The Integrations area body: the single "Services" screen.
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
    const { onAppBuilderComponentToggle } = useProjectBuilder(state, updateState, {
        packages,
        stacks,
    });

    const meshComponent = useMemo(
        () => meshComponentForStack(state, packages, stacks),
        [state, packages, stacks],
    );
    const available = meshComponent !== undefined;
    const selected = available ? isMeshSelected(state, meshComponent.id) : false;

    // Warm the developer-permission probe (a multi-second `aio app list` CLI call,
    // backend-cached) as soon as it's relevant — signed in with a deployable selected —
    // so the Destination "New" buttons appear immediately. Fire-and-forget.
    const signedIn = isAdobeSignedIn(state);
    const deployableSelected = anyDeployableSelected(state);
    useEffect(() => {
        if (signedIn && deployableSelected) {
            webviewClient.request('can-create-adobe-project').catch(() => {});
        }
    }, [signedIn, deployableSelected]);

    const onMeshToggle = (next: boolean): void => {
        if (available && meshComponent) {
            onAppBuilderComponentToggle(meshComponent.id, next);
        }
    };

    return (
        <div className="commerce-body">
            <div className="step-nav">
                <div className="step-nav-area">Integrations</div>
            </div>
            <div className="step-view">
                <div className="step-view-anim">
                    <DeployablesBody
                        state={state}
                        updateState={updateState}
                        meshAvailable={available}
                        meshSelected={selected}
                        onMeshToggle={onMeshToggle}
                    />
                </div>
            </div>
        </div>
    );
}
