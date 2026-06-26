/**
 * BuildYourProjectStep — the "Build Your Project" step shell (Nested Builder — Slice 1)
 *
 * Collapses the former separate Commerce / Storefront / Integrations wizard steps
 * into a single step with a nested timeline (rendered by {@link TimelineNav} via
 * the parent {@link WizardContainer}). This shell derives the ordered, VISIBLE
 * areas from {@link buildYourProjectAreas}, resolves which one is active from
 * `state.activeBuildArea` (defaulting to the first visible area), and routes ONLY
 * that area's EXISTING body component — {@link CommerceStep} / {@link StorefrontStep}
 * / {@link IntegrationsStep} — reused as-is.
 *
 * Areas — and, within the Commerce area, SUB-STEPS — are walked ONE AT A TIME via
 * the wizard's Continue/Back buttons (owned by {@link WizardContainer}); there is
 * no timeline sub-nav. The STEP gates Continue on the CURRENT thing's completion:
 * for Commerce that is the ACTIVE SUB-STEP's done-condition (Backend chosen / signed
 * in / connect valid / store view chosen / catalog always — via
 * {@link isCommerceStepComplete}); other areas gate on area completion (storefront
 * required when visible; integrations optional always passes). Because navigation is
 * linear, per-step gating enforces the all-required rule overall. Each body still persists its own validity
 * verdict to wizard state (`commerceConnectValid` / `storefrontRepoValid` /
 * edsConfig auth), which feeds {@link buildYourProjectAreas}'s status — so the gate
 * stays correct across area switches and back/forward nav. The rendered body
 * receives a NO-OP `setCanProceed` so it cannot override the step's gate with its
 * own verdict.
 *
 * @module features/project-creation/ui/steps/BuildYourProjectStep
 */

import React, { useMemo } from 'react';
import { BuildYourProjectSummary } from '../components/BuildYourProjectSummary';
import { areaSubSteps } from './areaSubSteps';
import { architectureLabel, buildSummaryGroups } from './buildSummary';
import { buildYourProjectAreas } from './buildYourProjectAreas';
import { CommerceStep } from './CommerceStep';
import { IntegrationsStep } from './IntegrationsStep';
import { StorefrontStep } from './StorefrontStep';
import { TwoColumnLayout } from '@/core/ui/components/layout/TwoColumnLayout';
import { useCanProceedAll } from '@/core/ui/hooks/useCanProceed';
import type { CustomBlockLibrary } from '@/types/blockLibraries';
import type { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { BaseStepProps } from '@/types/wizard';

/**
 * No-op setter handed to the active body so it can't override the STEP's gate.
 * Module-level so its reference is stable (no re-render churn).
 */
const NOOP = (): void => {};

/** Stable empty defaults for catalog/list props (avoids re-render loops). */
const EMPTY_PACKAGES: DemoPackage[] = [];
const EMPTY_STACKS: Stack[] = [];

export interface BuildYourProjectStepProps extends BaseStepProps {
    /** Available demo packages (catalog data, forwarded to area bodies). */
    packages?: DemoPackage[];
    /** Available stacks/architectures (drives area visibility + body data). */
    stacks?: Stack[];
    /** Block-library default IDs from VS Code settings (Storefront area). */
    blockLibraryDefaults?: string[];
    /** Custom block-library defaults from VS Code settings (Storefront area). */
    customBlockLibraryDefaults?: CustomBlockLibrary[];
    /**
     * Notifies the wizard when the stack CHANGES so it can reset the
     * org-dependent downstream steps (forwarded to the Commerce area body).
     */
    onArchitectureChange?: (oldStackId: string, newStackId: string) => void;
}

/**
 * The "Build Your Project" step: routes the active area to its existing body and
 * owns the Continue gate over all required areas.
 *
 * @param props - Standard step props plus catalog data + block-library defaults
 * @returns The active area's body wrapped in a single-column layout
 */
export function BuildYourProjectStep({
    state,
    updateState,
    setCanProceed,
    packages = EMPTY_PACKAGES,
    stacks = EMPTY_STACKS,
    blockLibraryDefaults,
    customBlockLibraryDefaults,
    onArchitectureChange,
}: BuildYourProjectStepProps): React.ReactElement {
    const areas = useMemo(() => buildYourProjectAreas(state, stacks), [state, stacks]);

    // Active area: the persisted one if it's still visible, else the first visible.
    const activeArea = areas.find(a => a.id === state.activeBuildArea) ?? areas[0];

    // Continue gate over the CURRENT step. Areas — and, within a sub-stepped area,
    // SUB-STEPS — are walked one at a time via the wizard's Continue/Back, so gating
    // the active step enforces the all-required rule linearly. A sub-stepped area
    // (Commerce/Storefront) gates on its ACTIVE SUB-STEP's done-condition via the
    // shared driver; a single-view area keeps its area-complete (or optional) gate.
    // Primitive boolean only (re-render-loop guard).
    const activeAreaId = activeArea?.id;
    const activeOptional = activeAreaId === 'integrations';
    const driver = areaSubSteps(activeAreaId);
    const canLeaveArea = driver
        ? driver.isComplete(state, driver.active(state))
        : activeOptional || activeArea?.status === 'completed';
    useCanProceedAll([canLeaveArea], setCanProceed);

    // Body props shared by every area. The active body gets a NO-OP setCanProceed
    // so it cannot override the step's gate (it still persists validity to state).
    const bodyProps = { state, updateState, setCanProceed: NOOP };

    // The Build step owns ONE two-column [ active area body | unified "Your project"
    // summary ]. The summary aggregates every VISIBLE area's group (commerce/
    // storefront/integrations) so it persists across area switches — the v6 model.
    const visibleAreaIds = areas.map(a => a.id);
    const summaryGroups = buildSummaryGroups(state, stacks, visibleAreaIds);
    const archLabel = architectureLabel(state, stacks);

    return (
        <TwoColumnLayout
            // Edge-reaching summary + left-zone cap + ≤1180 stack/hide are scoped to
            // .build-two-col; leftPadding 0 lets Commerce's nav bleed to the edge —
            // Storefront/Integrations bodies supply their own padding (.build-area-pad).
            maxWidth="none"
            leftPadding="0px"
            className="build-two-col"
            leftContent={renderActiveArea(activeArea?.id, {
                bodyProps,
                packages,
                stacks,
                blockLibraryDefaults,
                customBlockLibraryDefaults,
                onArchitectureChange,
            })}
            rightContent={
                <div className="commerce-summary-content">
                    <BuildYourProjectSummary architectureLabel={archLabel} groups={summaryGroups} />
                </div>
            }
        />
    );
}

/** Routing inputs for the active area body. */
interface ActiveAreaContext {
    bodyProps: BaseStepProps;
    packages: DemoPackage[];
    stacks: Stack[];
    blockLibraryDefaults?: string[];
    customBlockLibraryDefaults?: CustomBlockLibrary[];
    onArchitectureChange?: (oldStackId: string, newStackId: string) => void;
}

/** Render the body component for the active area id (existing components, reused). */
function renderActiveArea(
    areaId: string | undefined,
    ctx: ActiveAreaContext,
): React.ReactNode {
    switch (areaId) {
        case 'storefront':
            return (
                <StorefrontStep
                    {...ctx.bodyProps}
                    packages={ctx.packages}
                    stacks={ctx.stacks}
                    blockLibraryDefaults={ctx.blockLibraryDefaults}
                    customBlockLibraryDefaults={ctx.customBlockLibraryDefaults}
                />
            );
        case 'integrations':
            return <IntegrationsStep {...ctx.bodyProps} />;
        case 'commerce':
        default:
            return (
                <CommerceStep
                    {...ctx.bodyProps}
                    packages={ctx.packages}
                    stacks={ctx.stacks}
                    onArchitectureChange={ctx.onArchitectureChange}
                />
            );
    }
}
