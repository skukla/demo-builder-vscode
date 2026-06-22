/**
 * "Build Your Project" sub-step areas (Nested Builder — Slice 1, step 3)
 *
 * Pure, side-effect-free derivation of the ordered, VISIBLE areas inside the
 * `build-your-project` wizard step, plus each area's completion status.
 *
 * Visibility REUSES the existing wizard condition machinery: each area descriptor
 * carries an optional `StepCondition`, and `filterStepsForStack` decides which
 * areas survive for the selected stack. The storefront area uses the SAME
 * `stackRequiresAny: ['requiresGitHub','requiresDaLive']` vocabulary the
 * `storefront-setup` wizard step uses, so it shows for EDS stacks only and is
 * hidden when no stack (or a non-EDS stack) is selected — exactly
 * `filterStepsForStack`'s no-stack / non-matching behavior.
 *
 * Status (completion, not active highlight) reuses the per-area predicates in
 * `tileStatus`. The ACTIVE area is highlighted separately by the timeline's
 * `activeChildId`, not by this status field.
 *
 * @module features/project-creation/ui/steps/buildYourProjectAreas
 */

import {
    filterStepsForStack,
    type StepCondition,
    type WizardStepWithCondition,
} from '../wizard/stepFiltering';
import { isCommerceConfigured, isStorefrontConfigured } from './tileStatus';
import type { TimelineStatus } from '@/core/ui/components/TimelineNav';
import type { Stack } from '@/types/stacks';
import type { BuildAreaId, WizardState } from '@/types/webview';

/** A single visible area within the "Build Your Project" step. */
export interface BuildArea {
    id: BuildAreaId;
    label: string;
    /** Completion status mapped to the timeline child status vocabulary. */
    status: TimelineStatus;
}

/** Static descriptor for an area: identity, label, optional visibility condition. */
interface BuildAreaDescriptor {
    id: BuildAreaId;
    label: string;
    condition?: StepCondition;
}

/**
 * Ordered area descriptors. Order here is the canonical display order:
 * commerce < storefront < integrations.
 */
const BUILD_AREA_DESCRIPTORS: readonly BuildAreaDescriptor[] = [
    { id: 'commerce', label: 'Commerce' },
    {
        id: 'storefront',
        label: 'Storefront',
        // EDS-only — same vocabulary the `storefront-setup` wizard step uses.
        condition: { stackRequiresAny: ['requiresGitHub', 'requiresDaLive'] },
    },
    { id: 'integrations', label: 'Integrations' },
] as const;

/**
 * Compute the completion status for a visible area from persisted wizard state.
 * Integrations has no real status yet (slice 4) — defaults to 'upcoming'.
 */
function statusForArea(id: BuildAreaId, state: WizardState): TimelineStatus {
    switch (id) {
        case 'commerce':
            return isCommerceConfigured(state) ? 'completed' : 'upcoming';
        case 'storefront':
            return isStorefrontConfigured(state) ? 'completed' : 'upcoming';
        case 'integrations':
            return 'upcoming';
    }
}

/**
 * Derive the ordered, visible "Build Your Project" areas with their statuses.
 *
 * @param state - Wizard state (provides the selected stack id + config validity)
 * @param stacks - Available stacks, used to resolve the selected Stack object
 * @returns Visible areas in canonical order, each with its completion status
 */
export function buildYourProjectAreas(state: WizardState, stacks: Stack[]): BuildArea[] {
    // Resolve the selected Stack object, mirroring useWizardState's resolution.
    const selectedStack = state.selectedStack
        ? stacks.find(s => s.id === state.selectedStack)
        : undefined;

    // Shape descriptors as filter input and reuse the wizard step filter for
    // visibility. No area uses requiresAdobe* / createModeOnly, so minimal options.
    const asSteps: WizardStepWithCondition[] = BUILD_AREA_DESCRIPTORS.map(d => ({
        id: d.id,
        name: d.label,
        condition: d.condition,
    }));

    const visibleIds = new Set(
        filterStepsForStack(asSteps, selectedStack).map(step => step.id),
    );

    return BUILD_AREA_DESCRIPTORS.filter(d => visibleIds.has(d.id)).map(d => ({
        id: d.id,
        label: d.label,
        status: statusForArea(d.id, state),
    }));
}
