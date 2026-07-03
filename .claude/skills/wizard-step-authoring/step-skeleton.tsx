/**
 * <MyArea>Step — TEMPLATE for a Build-Your-Project area body.
 *
 * Derived from the real reference: src/features/project-creation/ui/steps/IntegrationsStep.tsx.
 *
 * Contract (v6 nested builder):
 *  - Rendered by BuildYourProjectStep when its area is active; receives BaseStepProps.
 *  - Selection handlers are UI-only updateState writes, sourced from useProjectBuilder
 *    (Backend Call on Continue — docs/patterns/selection-pattern.md).
 *  - The Build step owns the footer Continue gate via the area's driver
 *    (areaSubSteps.ts → *Sections.ts is<Area>StepComplete); this body's
 *    setCanProceed is typically a NO-OP — do not add local can-proceed state.
 *
 * After creating from this template:
 *  1. Add the area descriptor to BUILD_AREA_DESCRIPTORS in buildYourProjectAreas.ts
 *     (order = display order; optional StepCondition for stack-conditional areas).
 *  2. Add a completion predicate in tileStatus.ts and map it in statusForArea.
 *  3. If the area has sub-steps: create <myArea>Sections.ts (ids, SECTION_TITLES,
 *     section-state model) and register a driver in areaSubSteps.ts DRIVERS.
 */

import React from 'react';
import { useProjectBuilder } from './useProjectBuilder';
import type { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { BaseStepProps } from '@/types/wizard';

/**
 * Stable empty defaults for catalog props. Inline `[]` defaults create a new
 * reference each render and infinite-loop hooks with effect deps — keep these
 * at module level (the IntegrationsStep gotcha).
 */
const EMPTY_PACKAGES: DemoPackage[] = [];
const EMPTY_STACKS: Stack[] = [];

export interface MyAreaStepProps extends BaseStepProps {
    /** Available demo packages (catalog data). */
    packages?: DemoPackage[];
    /** Available stacks/architectures (catalog data). */
    stacks?: Stack[];
}

/**
 * The <MyArea> area body.
 *
 * @param props - Standard step props plus the package + stack catalog
 */
export function MyAreaStep({
    state,
    updateState,
    packages = EMPTY_PACKAGES,
    stacks = EMPTY_STACKS,
}: MyAreaStepProps): React.ReactElement {
    // Selection hub — consume its handlers; never write a parallel state path.
    const { onStackSelect } = useProjectBuilder(state, updateState, { packages, stacks });
    void onStackSelect; // replace with the handlers this area actually uses

    // UI-only selection handler: immediate updateState, NO backend request here.
    // Backend calls belong to the Continue commitment point (selection-pattern.md).
    const onSelect = (value: string): void => {
        updateState({ /* my-area selection: value */ } as Partial<typeof state>);
        void value;
    };
    void onSelect;

    return (
        // Plain divs, not Spectrum Flex (Spectrum Flex constrains width to 450px).
        <div className="commerce-body">
            <div className="step-nav">
                <div className="step-nav-area">My Area</div>
                {/* Sub-stepped areas render their VerticalStepList nav here */}
            </div>
            <div className="step-view">
                <div className="step-view-anim">
                    {/* Active sub-step body (extract bodies to <myArea>StepBodies.tsx
                        when they grow, mirroring integrationsStepBodies.tsx). */}
                </div>
            </div>
        </div>
    );
}
