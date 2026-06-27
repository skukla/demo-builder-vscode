/**
 * IntegrationsStep Component (Integrations area — top-rail sub-steps, like Commerce/Storefront)
 *
 * The Integrations area renders just its BODY — a horizontal sub-step strip
 * (.commerce-body / .step-nav) over a dedicated view (.step-view), driven by the
 * shared {@link areaSubSteps} provider (the footer Continue/Back walks the sub-steps).
 * Two sub-steps:
 *   1. `deployables` — the deployable list: the stack's API Mesh row (Add/Remove) +
 *      a simulated "add an integration" empty slot ({@link DeployablesBody}). Optional —
 *      never gates Continue.
 *   2. `target`      — the ONE shared Adobe I/O deployment target (project + workspace)
 *      for every deployable ({@link DeploymentTargetBody}); CONDITIONAL — present only
 *      once a deployable is selected; gate: both chosen.
 *
 * Availability: a `kind: "mesh"` App Builder component must apply to the current package
 * + stack ({@link meshComponentForStack}) — else the row shows an "N/A for this
 * architecture" pill with no toggle. The toggle uses
 * {@link useProjectBuilder.onAppBuilderComponentToggle} (the mesh dual-flow). Adobe
 * sign-in is subsumed into the `target` sub-step (the retired standalone "Adobe
 * Authentication" step): {@link DeploymentTargetBody} renders the full AdobeAuthStep.
 *
 * The Build step owns the REAL per-sub-step Continue gate via the footer/driver; this
 * body gets a NO-OP `setCanProceed` (re-render-loop guard: it's never called here).
 *
 * @module features/project-creation/ui/steps/IntegrationsStep
 */

import React, { useMemo } from 'react';
import type { IntegrationCardAction, IntegrationCardStatus } from '../components/IntegrationCard';
import { VerticalStepList } from '../components/VerticalStepList';
import { areaSubSteps } from './areaSubSteps';
import { DeployablesBody, DeploymentTargetBody } from './integrationsStepBodies';
import { isAdobeSignedIn, isMeshSelected, meshComponentForStack } from './tileStatus';
import { useProjectBuilder } from './useProjectBuilder';
import type { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { IntegrationsSectionId } from '@/types/webview';
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

/** Build the Mesh card's status pill from availability / selection state. */
function meshStatus(available: boolean, selected: boolean): IntegrationCardStatus {
    if (!available) return { label: 'N/A for this architecture', tone: 'na' };
    return selected ? { label: 'On', tone: 'on' } : { label: 'Off', tone: 'off' };
}

/**
 * The Integrations area body: a sub-step strip over the active sub-step's view.
 *
 * @param props - Standard step props plus the package + stack catalog
 * @returns The sub-stepped Integrations surface
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
    const signedIn = isAdobeSignedIn(state);

    const status = meshStatus(available, selected);

    // Card action: none when N/A; Add/Remove otherwise. Sign-in is NOT a card action —
    // it lives in the Deployment target sub-step (auth is only needed to pick a target).
    let meshAction: IntegrationCardAction | undefined;
    if (available && meshComponent) {
        meshAction = {
            label: selected ? 'Remove' : 'Add',
            onPress: () => onAppBuilderComponentToggle(meshComponent.id, !selected),
        };
    }

    // --- Sub-step nav + dedicated view (shared driver) -----------------------
    const driver = areaSubSteps('integrations')!;
    const subSteps = driver.subSteps(state);
    const activeStep = driver.active(state) as IntegrationsSectionId;

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
                    {activeStep === 'target' ? (
                        <DeploymentTargetBody
                            state={state}
                            updateState={updateState}
                            signedIn={signedIn}
                        />
                    ) : (
                        <DeployablesBody meshStatus={status} meshAction={meshAction} />
                    )}
                </div>
            </div>
        </div>
    );
}
