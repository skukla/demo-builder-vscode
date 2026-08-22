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
import type { CommerceSectionId, WizardState } from '@/types/webview';

/** The ordered Commerce section ids (sign-in is conditional — ACCS gate only). */
export type { CommerceSectionId };

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

/** Summary-row label per Commerce sub-step (the short forms used in the summary). */
export const ROW_LABELS: Record<CommerceSectionId, string> = {
    backend: 'Backend',
    signin: 'Sign-in',
    connection: 'Connection',
    'business-structure': 'Business',
    catalog: 'Catalog',
    'sample-data': 'Datapacks',
};

/** Human labels for the step/tab titles (the vertical step list nav). */
export const SECTION_TITLES: Record<CommerceSectionId, string> = {
    backend: 'Backend',
    signin: 'Sign in to Adobe',
    connection: 'Connection',
    'business-structure': 'Business Structure',
    catalog: 'Catalog',
    'sample-data': 'Datapacks',
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
            (s) =>
                allowed.has(s.id) &&
                s.backend === backend &&
                (frontend === undefined || s.frontend === frontend),
        )
        .map((s) => s.id);

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
        (s) => candidates.includes(s.id) && s.frontend === PREFERRED_FRONTEND,
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
 * Transcribed from the prototype renderCommerce(): backend done once chosen; for
 * ACCS the Sign-in sub-step PERSISTS (current until signed in, then done with the
 * org name) and, while not signed in, locks the three config sections; catalog
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

    // The Sign-in sub-step PERSISTS for ACCS (it never gets omitted on sign-in):
    // `current` until signed in, then `done` carrying the org name. Persisting it
    // keeps a step for AdobeAuthStep's "Connected" result and lets the footer's
    // sub-step walk reach Connection next (omitting it broke nextSubStep('signin')).
    if (ctx.isAccs) {
        sections.push(
            ctx.signedIn
                ? { id: 'signin', status: 'done', value: state.adobeOrg?.name ?? 'Signed in' }
                : { id: 'signin', status: 'current' },
        );
    }

    const signinReason = gated ? 'Sign in to Adobe first' : undefined;
    sections.push(configSection('connection', connectionDone, gated, signinReason, 'Connected'));

    // Config steps chain: Business Structure unlocks only once Connection is done
    // (store views are discovered THROUGH the connection), and Catalog only once a
    // store view is chosen. Without this, a package-seeded store-view code would
    // make Business Structure show `done` before Connection is even attempted.
    let businessReason: string | undefined;
    if (gated) businessReason = 'Sign in to Adobe first';
    else if (!connectionDone) businessReason = 'Connect to Commerce first';
    // A general "Selected" label (parallels Connection's "Connected" / Catalog's
    // "Configured") rather than the raw store-view code — the summary recaps THAT it's
    // done, not the specific value.
    sections.push(
        configSection(
            'business-structure',
            storeViewChosen,
            gated || !connectionDone,
            businessReason,
            'Selected',
        ),
    );
    sections.push(catalogSection(state, gated, connectionDone));

    // Never gated, unlike every sub-step above it. Those read THROUGH the live
    // Commerce connection, so each one chains on the last; this reads the pack
    // catalog from the Data Installer service and installs nothing during the
    // wizard at all. Locking it behind a reachable backend would gate a choice
    // that has no dependency on one — and picking a demo before the instance
    // exists is the ordinary case.
    sections.push({
        id: 'sample-data',
        status: 'done',
        value: state.datapack?.name ?? 'None',
    });

    return sections;
}

/**
 * The section to open first: the first `current` section, else the first
 * openable (non-done, non-locked) one, else the last section.
 *
 * @param sectionStates - Ordered section states from commerceSectionStates
 * @returns the id of the section to open
 */
export function firstOpenSection(sectionStates: CommerceSectionState[]): CommerceSectionId {
    const current = sectionStates.find((s) => s.status === 'current');
    if (current) return current.id;
    const openable = sectionStates.find((s) => s.status !== 'done' && s.status !== 'locked');
    if (openable) return openable.id;
    return sectionStates[sectionStates.length - 1].id;
}

/**
 * The next sub-step id in DISPLAY order after `current`, or null at the end (or
 * when `current` is not among the displayed sections).
 *
 * @param sectionStates - Ordered section states from commerceSectionStates
 * @param current - The active sub-step id
 * @returns the next displayed id, or null
 */
export function nextSubStep(
    sectionStates: CommerceSectionState[],
    current: CommerceSectionId,
): CommerceSectionId | null {
    const idx = sectionStates.findIndex((s) => s.id === current);
    if (idx < 0 || idx >= sectionStates.length - 1) return null;
    return sectionStates[idx + 1].id;
}

/**
 * The previous sub-step id in DISPLAY order before `current`, or null at the
 * start (or when `current` is not among the displayed sections).
 *
 * @param sectionStates - Ordered section states from commerceSectionStates
 * @param current - The active sub-step id
 * @returns the previous displayed id, or null
 */
export function prevSubStep(
    sectionStates: CommerceSectionState[],
    current: CommerceSectionId,
): CommerceSectionId | null {
    const idx = sectionStates.findIndex((s) => s.id === current);
    if (idx <= 0) return null;
    return sectionStates[idx - 1].id;
}

/**
 * Whether a single Commerce sub-step's done-condition is satisfied (the per-step
 * gate used by the footer Continue): Backend → a backend is chosen; Sign in →
 * signed in; Connection → the connect form reported valid; Business Structure →
 * a store view was chosen; Catalog → always (terminal).
 *
 * @param state - Wizard state (persisted selections + validity verdicts)
 * @param stepId - The sub-step to evaluate
 * @param ctx - isAccs / signedIn flags
 * @returns true when the sub-step is complete
 */
export function isCommerceStepComplete(
    state: WizardState,
    stepId: CommerceSectionId,
    ctx: CommerceSectionContext,
): boolean {
    switch (stepId) {
        case 'backend':
            return Boolean(state.selectedBackend);
        case 'signin':
            return ctx.signedIn;
        case 'connection':
            return state.commerceConnectValid === true;
        case 'business-structure':
            // Not done while store discovery is still fetching the structure — a
            // persisted/auto-detected store-view choice must not unblock Continue
            // before the structure the user is confirming has loaded.
            return state.commerceStoreViewChosen === true && state.commerceStoreLoading !== true;
        case 'catalog':
            // Was unconditionally true. With Connection no longer answering for
            // Catalog's fields, something has to — otherwise unblocking the
            // deadlock would let a user walk past required catalog fields and
            // ship a .env with blanks. `!== false` so an unknown verdict (the
            // body has not mounted yet) stays as permissive as before.
            return state.commerceCatalogValid !== false;
        case 'sample-data':
            // Choosing nothing is a real answer, not an unfinished one. The pack
            // is installed from the dashboard after creation, so nothing chosen
            // here can be required to move on.
            return true;
    }
}

/** A config section whose `done` is a single boolean (connection / business). */
function configSection(
    id: CommerceSectionId,
    done: boolean,
    gated: boolean,
    lockReason: string | undefined,
    value?: string,
): CommerceSectionState {
    if (gated) return { id, status: 'locked', lockReason };
    // The done value populates the summary row; without it the row reads "Not set".
    const summaryValue = done ? value : undefined;
    return { id, status: done ? 'done' : 'upcoming', value: summaryValue };
}

/**
 * The catalog section: locked until Connection is done and a store view is
 * chosen (the config-step chain), then done/upcoming.
 */
function catalogSection(
    state: WizardState,
    gated: boolean,
    connectionDone: boolean,
): CommerceSectionState {
    if (gated) return { id: 'catalog', status: 'locked', lockReason: 'Sign in to Adobe first' };
    if (!connectionDone) {
        return { id: 'catalog', status: 'locked', lockReason: 'Connect to Commerce first' };
    }
    if (state.commerceStoreViewChosen !== true) {
        return { id: 'catalog', status: 'locked', lockReason: 'Choose a store view first' };
    }
    // Catalog is terminal — it has no required input of its own (the catalog service
    // is configured off the chosen store), so once unlocked it reads as done. This is
    // why the summary can show it ✓ as soon as a store view is chosen.
    return { id: 'catalog', status: 'done', value: 'Configured' };
}
