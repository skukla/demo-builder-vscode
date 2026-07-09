/**
 * areaSubSteps — a per-area sub-step DRIVER registry.
 *
 * The Build step walks an area's sub-steps one at a time via the footer Continue/
 * Back (the linear driver), with a left VerticalStepList nav. That machinery used
 * to be Commerce-only; this registry generalizes it so any area can be sub-stepped
 * the SAME way (Commerce, Storefront, and Integrations) — WizardContainer
 * and BuildYourProjectStep drive whatever `areaSubSteps(activeAreaId)` returns.
 *
 * A driver exposes the ordered sub-steps (+ status/lock/title for the nav), the
 * active sub-step (from the area's own state key), next/prev for the walk, the
 * per-sub-step Continue gate, the entry step (first/last), and optional commit /
 * uncommit (Commerce's commit-gated summary ✓; a no-op elsewhere).
 *
 * @module features/project-creation/ui/steps/areaSubSteps
 */

import {
    commerceSectionStates,
    isCommerceStepComplete,
    SECTION_TITLES,
    type CommerceSectionContext,
} from './commerceSections';
import {
    integrationsSectionStates,
    isIntegrationsStepComplete,
    INTEGRATIONS_SECTION_TITLES,
} from './integrationsSections';
import {
    storefrontSectionStates,
    isStorefrontStepComplete,
    STOREFRONT_SECTION_TITLES,
} from './storefrontSections';
import { isAdobeSignedIn } from './tileStatus';
import { markStepCompleted, clearCompletedFrom } from '@/core/ui/utils/stepCompletion';
import type { WizardState } from '@/types/webview';

/** Backend id whose flow adds the Adobe sign-in gate (cf. CommerceStep). */
const ACCS_BACKEND = 'adobe-commerce-accs';

/** One ordered sub-step, generalized across areas (for the nav + the walk). */
export interface AreaSubStep {
    id: string;
    title: string;
    status: 'current' | 'done' | 'upcoming' | 'locked';
    lockReason?: string;
}

/** Everything WizardContainer / BuildYourProjectStep need to drive ONE area's sub-steps. */
export interface AreaSubStepDriver {
    /** Ordered sub-steps with status/lock + title (drives the nav AND the walk). */
    subSteps(state: WizardState): AreaSubStep[];
    /** The active sub-step id (the area's state key, defaulting to first-open). */
    active(state: WizardState): string;
    /** Partial state to set the active sub-step to `id`. */
    setActive(id: string): Partial<WizardState>;
    /** The next sub-step id after the active one, or null at the end. */
    next(state: WizardState): string | null;
    /** The previous sub-step id before the active one, or null at the start. */
    prev(state: WizardState): string | null;
    /** Partial state to enter the area at its first (or last) sub-step. */
    entry(state: WizardState, atEnd: boolean): Partial<WizardState>;
    /** Per-sub-step Continue gate. */
    isComplete(state: WizardState, subStepId: string): boolean;
    /** Commit the current sub-step on Continue (commit-gated ✓); no-op when unused. */
    commit(state: WizardState, subStepId: string): Partial<WizardState>;
    /** Un-commit `target` + everything after it on Back; no-op when unused. */
    uncommit(state: WizardState, order: string[], target: string): Partial<WizardState>;
    /**
     * Retreat WITHIN the active sub-step (a sub-step with its own progressive
     * disclosure, e.g. Adobe I/O's project → workspace → summary). Returns the
     * state update for one inner step back, or null when the sub-step has no
     * inner stage to retreat — Back then falls through to `prev()`. Pure over
     * `state` (called during render for the Back-enabled check).
     */
    retreatWithin?(state: WizardState): Partial<WizardState> | null;
    /**
     * Advance WITHIN the active sub-step: commit the current inner disclosure
     * stage (e.g. Adobe I/O's pending project pick) and stay on the sub-step.
     * Returns the state update, or null when there is no inner stage to commit
     * — Continue then falls through to `next()`. Pure over `state`.
     */
    advanceWithin?(state: WizardState): Partial<WizardState> | null;
}

// --- generic helpers over an ordered {id, status} list -----------------------

/** The sub-step to open first: the first `current`, else first openable, else last. */
function firstOpen(steps: AreaSubStep[]): string {
    const current = steps.find((s) => s.status === 'current');
    if (current) return current.id;
    const openable = steps.find((s) => s.status !== 'done' && s.status !== 'locked');
    return (openable ?? steps[steps.length - 1]).id;
}

/** The next sub-step id in display order after `current`, or null at the end. */
function nextOf(steps: AreaSubStep[], current: string): string | null {
    const idx = steps.findIndex((s) => s.id === current);
    return idx >= 0 && idx < steps.length - 1 ? steps[idx + 1].id : null;
}

/** The previous sub-step id in display order before `current`, or null at the start. */
function prevOf(steps: AreaSubStep[], current: string): string | null {
    const idx = steps.findIndex((s) => s.id === current);
    return idx > 0 ? steps[idx - 1].id : null;
}

// --- per-area drivers --------------------------------------------------------

function commerceContext(state: WizardState): CommerceSectionContext {
    return { isAccs: state.selectedBackend === ACCS_BACKEND, signedIn: isAdobeSignedIn(state) };
}

const commerceDriver: AreaSubStepDriver = {
    subSteps(state) {
        return commerceSectionStates(state, commerceContext(state)).map((s) => ({
            id: s.id,
            title: SECTION_TITLES[s.id],
            status: s.status,
            lockReason: s.lockReason,
        }));
    },
    active(state) {
        return state.activeCommerceStep ?? firstOpen(commerceDriver.subSteps(state));
    },
    setActive(id) {
        return { activeCommerceStep: id as WizardState['activeCommerceStep'] };
    },
    next(state) {
        return nextOf(commerceDriver.subSteps(state), commerceDriver.active(state));
    },
    prev(state) {
        return prevOf(commerceDriver.subSteps(state), commerceDriver.active(state));
    },
    entry(state, atEnd) {
        const steps = commerceDriver.subSteps(state);
        const id = atEnd ? steps[steps.length - 1]?.id : firstOpen(steps);
        return id ? { activeCommerceStep: id as WizardState['activeCommerceStep'] } : {};
    },
    isComplete(state, subStepId) {
        return isCommerceStepComplete(
            state,
            subStepId as Parameters<typeof isCommerceStepComplete>[1],
            commerceContext(state),
        );
    },
    commit(state, subStepId) {
        return {
            committedCommerceSteps: markStepCompleted(
                state.committedCommerceSteps,
                subStepId as WizardState['activeCommerceStep'] & string,
            ),
        };
    },
    uncommit(state, order, target) {
        return {
            committedCommerceSteps: clearCompletedFrom(
                state.committedCommerceSteps,
                order as (WizardState['activeCommerceStep'] & string)[],
                target as WizardState['activeCommerceStep'] & string,
                order.indexOf(target),
            ),
        };
    },
};

const storefrontDriver: AreaSubStepDriver = {
    subSteps(state) {
        return storefrontSectionStates(state).map((s) => ({
            id: s.id,
            title: STOREFRONT_SECTION_TITLES[s.id],
            status: s.status,
            lockReason: s.lockReason,
        }));
    },
    active(state) {
        return state.activeStorefrontStep ?? firstOpen(storefrontDriver.subSteps(state));
    },
    setActive(id) {
        return { activeStorefrontStep: id as WizardState['activeStorefrontStep'] };
    },
    next(state) {
        return nextOf(storefrontDriver.subSteps(state), storefrontDriver.active(state));
    },
    prev(state) {
        return prevOf(storefrontDriver.subSteps(state), storefrontDriver.active(state));
    },
    entry(state, atEnd) {
        const steps = storefrontDriver.subSteps(state);
        const id = atEnd ? steps[steps.length - 1]?.id : firstOpen(steps);
        return id ? { activeStorefrontStep: id as WizardState['activeStorefrontStep'] } : {};
    },
    isComplete(state, subStepId) {
        return isStorefrontStepComplete(
            state,
            subStepId as Parameters<typeof isStorefrontStepComplete>[1],
        );
    },
    // Storefront has no commit-gated summary — its rows derive directly from state.
    commit() {
        return {};
    },
    uncommit() {
        return {};
    },
};

const integrationsDriver: AreaSubStepDriver = {
    subSteps(state) {
        return integrationsSectionStates(state).map((s) => ({
            id: s.id,
            title: INTEGRATIONS_SECTION_TITLES[s.id],
            status: s.status,
            lockReason: s.lockReason,
        }));
    },
    active(state) {
        return state.activeIntegrationsStep ?? firstOpen(integrationsDriver.subSteps(state));
    },
    setActive(id) {
        return { activeIntegrationsStep: id as WizardState['activeIntegrationsStep'] };
    },
    next(state) {
        return nextOf(integrationsDriver.subSteps(state), integrationsDriver.active(state));
    },
    prev(state) {
        return prevOf(integrationsDriver.subSteps(state), integrationsDriver.active(state));
    },
    entry(state, atEnd) {
        const steps = integrationsDriver.subSteps(state);
        const id = atEnd ? steps[steps.length - 1]?.id : firstOpen(steps);
        return id ? { activeIntegrationsStep: id as WizardState['activeIntegrationsStep'] } : {};
    },
    isComplete(state, subStepId) {
        return isIntegrationsStepComplete(
            state,
            subStepId as Parameters<typeof isIntegrationsStepComplete>[1],
        );
    },
    // Continue off Adobe I/O COMMITS the pending workspace default as `adobeWorkspace`.
    commit(state, subStepId) {
        if (subStepId === 'adobe-io') {
            return {
                adobeWorkspace: state.pendingAdobeWorkspace,
                pendingAdobeWorkspace: undefined,
            };
        }
        return {};
    },
    // Back off Adobe I/O un-commits: the committed default returns to pending (Continue must
    // re-commit it), mirroring how Commerce's Back clears the committed-step ✓.
    uncommit(state, order, target) {
        const ioIdx = order.indexOf('adobe-io');
        if (ioIdx >= 0 && order.indexOf(target) < ioIdx && state.adobeWorkspace) {
            return { adobeWorkspace: undefined, pendingAdobeWorkspace: state.adobeWorkspace };
        }
        return {};
    },
    // Adobe I/O's body is a progressive disclosure (project → workspace → summary);
    // Back walks that inner stack BEFORE leaving the sub-step, so the workspace view
    // returns to project selection, not to Services.
    retreatWithin(state) {
        if (integrationsDriver.active(state) !== 'adobe-io') return null;
        if (state.adobeWorkspace) {
            // Summary → workspace picker; keep the choice highlighted as pending.
            return { adobeWorkspace: undefined, pendingAdobeWorkspace: state.adobeWorkspace };
        }
        if (state.adobeProject?.id) {
            // Workspace picker → project selection; the committed project stays
            // highlighted as the pending pick (Continue re-commits it).
            return {
                adobeProject: undefined,
                pendingAdobeProject: state.adobeProject,
                pendingAdobeWorkspace: undefined,
                workspacesCache: undefined,
            };
        }
        return null;
    },
    // Continue on the Adobe I/O PROJECT view commits the pending pick and stays on
    // the sub-step (revealing the workspace view) — the user clicks, then Continues.
    advanceWithin(state) {
        if (integrationsDriver.active(state) !== 'adobe-io') return null;
        if (state.pendingAdobeProject?.id && !state.adobeProject?.id) {
            return {
                adobeProject: state.pendingAdobeProject,
                pendingAdobeProject: undefined,
                adobeWorkspace: undefined,
                pendingAdobeWorkspace: undefined,
                workspacesCache: undefined,
            };
        }
        return null;
    },
};

const DRIVERS: Record<string, AreaSubStepDriver> = {
    commerce: commerceDriver,
    storefront: storefrontDriver,
    integrations: integrationsDriver,
};

/** The sub-step driver for an area, or null for an area with no sub-steps. */
export function areaSubSteps(areaId: string | undefined): AreaSubStepDriver | null {
    return areaId ? (DRIVERS[areaId] ?? null) : null;
}

/**
 * The sub-step driver for an area that is known to have one (Commerce/Storefront/Integrations).
 * Fails fast rather than asserting non-null, so a missing driver surfaces immediately.
 */
export function requireAreaSubSteps(areaId: string): AreaSubStepDriver {
    const driver = areaSubSteps(areaId);
    if (!driver) throw new Error(`No sub-step driver registered for area "${areaId}"`);
    return driver;
}
