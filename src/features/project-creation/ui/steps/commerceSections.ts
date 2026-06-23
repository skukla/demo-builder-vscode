/**
 * commerceSections — pure Commerce-area logic for the v6 guided builder.
 *
 * Two concerns, both side-effect-free and config-driven (stacks.json +
 * demo-packages.json passed in by the caller; never hardcoded brands/stacks):
 *
 * 1. Backend → stack resolution. A brand's allowed stacks are
 *    `Object.keys(pkg.storefronts)`. Choosing a backend narrows them to the
 *    stacks with that backend; the result is `unique`, `ambiguous` (>1 frontend,
 *    e.g. citisignal + PaaS), or `none` (backend unavailable for the brand).
 *    Batch B commits the unique stack via useProjectBuilder.onStackSelect and,
 *    while ambiguous, drives config from a provisional (eds-preferred) stack and
 *    shows the architecture as "frontend pending".
 *
 * 2. The ordered Commerce section-state model transcribed from the prototype's
 *    renderCommerce(): completion / lock status only (the open/active highlight
 *    is owned by Batch B's local state, same split as the old commerceTabStatuses).
 *
 * @module features/project-creation/ui/steps/commerceSections
 */

import type { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { WizardState } from '@/types/webview';

/** The ordered Commerce section ids (sign-in is conditional — ACCS gate only). */
export type CommerceSectionId =
    | 'backend'
    | 'signin'
    | 'connection'
    | 'business-structure'
    | 'catalog';

/** Completion / lock status of a Commerce section (no open/active highlight). */
export type CommerceSectionStatus = 'current' | 'done' | 'upcoming' | 'locked';

/** One ordered Commerce section's derived state. */
export interface CommerceSectionState {
    id: CommerceSectionId;
    status: CommerceSectionStatus;
    /** One-line reason shown on a `locked` section. */
    lockReason?: string;
    /** Display value shown on a `done` section. */
    value?: string;
}

/** Result of resolving a backend choice against a brand's allowed stacks. */
export interface StackResolution {
    /** The unique stack id, or null when ambiguous / unavailable. */
    stackId: string | null;
    /** Allowed stack ids with the chosen backend (and frontend, when supplied). */
    candidates: string[];
    /** True when >1 candidate (frontend not yet chosen). */
    ambiguous: boolean;
}

/** The frontend id preferred when a backend choice is still ambiguous. */
const PREFERRED_FRONTEND = 'eds-storefront';

/** Human labels for the known backend ids (drives the backend `done` value). */
export const BACKEND_LABELS: Record<string, string> = {
    'adobe-commerce-paas': 'Adobe Commerce (PaaS)',
    'adobe-commerce-accs': 'Adobe Commerce (ACCS / SaaS)',
};

/** Context flags the section-state model needs beyond persisted wizard state. */
export interface CommerceSectionContext {
    /** Whether the chosen backend is ACCS (adds the sign-in gate). */
    isAccs: boolean;
    /** Whether the user is signed in to Adobe with an org selected. */
    signedIn: boolean;
}

/** The stack ids a brand allows (storefront keys). */
function allowedStackIds(pkg: DemoPackage): string[] {
    return Object.keys(pkg.storefronts ?? {});
}

/**
 * Resolve a backend choice against a brand's allowed stacks.
 *
 * @param stacks - All stacks (stacks.json)
 * @param pkg - The selected demo package
 * @param backend - The chosen backend id
 * @param frontend - Optional frontend id to further narrow the candidates
 * @returns unique / ambiguous / no-candidate resolution
 */
export function resolveStackForBackend(
    stacks: Stack[],
    pkg: DemoPackage,
    backend: string,
    frontend?: string,
): StackResolution {
    const allowed = new Set(allowedStackIds(pkg));
    const candidates = stacks
        .filter(
            s =>
                allowed.has(s.id) &&
                s.backend === backend &&
                (frontend === undefined || s.frontend === frontend),
        )
        .map(s => s.id);

    if (candidates.length === 1) {
        return { stackId: candidates[0], candidates, ambiguous: false };
    }
    return { stackId: null, candidates, ambiguous: candidates.length > 1 };
}

/**
 * A stack id with the chosen backend to drive config even when ambiguous
 * (prefers the eds-storefront candidate), or null when the backend is unavailable.
 *
 * @param stacks - All stacks (stacks.json)
 * @param pkg - The selected demo package
 * @param backend - The chosen backend id
 * @returns a usable stack id, or null
 */
export function provisionalStackForBackend(
    stacks: Stack[],
    pkg: DemoPackage,
    backend: string,
): string | null {
    const { candidates } = resolveStackForBackend(stacks, pkg, backend);
    if (candidates.length === 0) return null;
    const preferred = stacks.find(
        s => candidates.includes(s.id) && s.frontend === PREFERRED_FRONTEND,
    );
    return preferred?.id ?? candidates[0];
}

/**
 * The ordered, unique backend ids a brand offers (drives the Backend cards'
 * enabled set). Order follows the first appearance across the brand's stacks.
 *
 * @param stacks - All stacks (stacks.json)
 * @param pkg - The selected demo package
 * @returns ordered unique backend ids
 */
export function availableBackendsForPackage(stacks: Stack[], pkg: DemoPackage): string[] {
    const allowed = new Set(allowedStackIds(pkg));
    const backends: string[] = [];
    for (const stack of stacks) {
        if (allowed.has(stack.id) && !backends.includes(stack.backend)) {
            backends.push(stack.backend);
        }
    }
    return backends;
}

/**
 * The ordered Commerce section-state model (completion / lock status only).
 *
 * Transcribed from the prototype renderCommerce(): backend done once chosen; the
 * ACCS sign-in gate (when not signed in) locks the three config sections; catalog
 * stays locked until a store view is chosen.
 *
 * @param state - Wizard state (persisted selections + validity verdicts)
 * @param ctx - isAccs / signedIn flags
 * @returns the ordered sections with status / lockReason / value
 */
export function commerceSectionStates(
    state: WizardState,
    ctx: CommerceSectionContext,
): CommerceSectionState[] {
    const backend = state.selectedBackend;
    const gated = ctx.isAccs && !ctx.signedIn;
    const storeViewChosen = state.commerceStoreViewChosen === true;
    const connectionDone = state.commerceConnectValid === true;

    const sections: CommerceSectionState[] = [
        backend
            ? { id: 'backend', status: 'done', value: BACKEND_LABELS[backend] ?? backend }
            : { id: 'backend', status: 'current' },
    ];

    if (gated) {
        sections.push({ id: 'signin', status: 'current' });
    }

    const lockedReason = gated ? 'Sign in to Adobe first' : undefined;
    sections.push(configSection('connection', connectionDone, gated, lockedReason));
    sections.push(configSection('business-structure', storeViewChosen, gated, lockedReason));
    sections.push(catalogSection(state, gated));

    return sections;
}

/** A config section whose `done` is a single boolean (connection / business). */
function configSection(
    id: CommerceSectionId,
    done: boolean,
    gated: boolean,
    lockReason: string | undefined,
): CommerceSectionState {
    if (gated) return { id, status: 'locked', lockReason };
    return { id, status: done ? 'done' : 'upcoming' };
}

/** The catalog section: locked until a store view is chosen, then done/upcoming. */
function catalogSection(state: WizardState, gated: boolean): CommerceSectionState {
    if (gated) return { id: 'catalog', status: 'locked', lockReason: 'Sign in to Adobe first' };
    if (state.commerceStoreViewChosen !== true) {
        return { id: 'catalog', status: 'locked', lockReason: 'Choose a store view first' };
    }
    return { id: 'catalog', status: 'upcoming' };
}
