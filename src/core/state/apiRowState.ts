/**
 * apiRowState — what one integration may do to one Adobe API code.
 *
 * N integrations share ONE App Builder workspace, so their API needs are
 * subscribed as a union. That makes "remove this API" ambiguous: removing my
 * intent is fine, but the code itself must survive if anything else holds it.
 *
 * The rule (PM, 2026-07-30): a user MAY remove an API they added, and may NEVER
 * remove one another integration depends on to operate. That protection is not
 * a check bolted onto the UI — it is this derivation. The picker renders these
 * states; it does not decide them.
 *
 * @module core/state/apiRowState
 */

import { UNATTRIBUTED_PICKS_KEY } from './componentApiPicks';

/**
 * How binding a row is, most binding first. Only `mine-optional` is removable.
 *
 * `other-required` deliberately outranks `mine-optional`: if I also picked a
 * code another integration requires, unchecking it could not actually
 * unsubscribe, so offering removal would be a lie.
 */
export type ApiRowOwnership = 'baseline' | 'mine-required' | 'other-required' | 'mine-optional';

/** One integration's claim on the workspace: what it requires and what it is called. */
export interface ApiOwner {
    id: string;
    /** Display name — this is what a locked row names as the reason. */
    name: string;
    /** Declared in the catalog entry; not user-editable. */
    requiredApis?: string[];
}

export interface ApiRowState {
    code: string;
    ownership: ApiRowOwnership;
    /**
     * Integrations to name as the reason. Populated for `other-required` (who is
     * holding it) and `mine-required` (this integration). Empty for `baseline`,
     * for `mine-optional`, and for codes held only by unattributed legacy picks,
     * whose owner is unrecoverable.
     */
    requiredBy: string[];
}

export interface ResolveApiRowsInput {
    /** The integration whose rows these are. */
    componentId: string;
    /** Every integration in the project, including this one. */
    owners: ApiOwner[];
    /** Attributed ad-hoc picks (`project.componentApiPicks`). */
    picks: Record<string, string[]>;
    /** Always-on codes (the subscriber's baseline). */
    baseline: string[];
}

/** Higher wins. Mirrors the precedence documented on {@link ApiRowOwnership}. */
const RANK: Record<ApiRowOwnership, number> = {
    baseline: 3,
    'mine-required': 2,
    'other-required': 1,
    'mine-optional': 0,
};

/** Apply a claim, keeping the most binding one and accumulating its reasons. */
function claim(
    map: Map<string, ApiRowState>,
    code: string,
    ownership: ApiRowOwnership,
    owner?: string,
): void {
    const existing = map.get(code);
    if (!existing) {
        map.set(code, { code, ownership, requiredBy: owner ? [owner] : [] });
        return;
    }
    if (RANK[ownership] > RANK[existing.ownership]) {
        map.set(code, { code, ownership, requiredBy: owner ? [owner] : [] });
        return;
    }
    // Same tier — accumulate the reason (several integrations can hold one code).
    if (
        RANK[ownership] === RANK[existing.ownership] &&
        owner &&
        !existing.requiredBy.includes(owner)
    ) {
        existing.requiredBy.push(owner);
    }
}

/**
 * Resolve every claimed API code to its state for one integration.
 *
 * Codes nobody holds are absent from the map — the picker renders those as
 * freely selectable, so callers should treat a miss as "unclaimed", not an error.
 *
 * @param input - the integration, every owner in the project, picks, baseline
 * @returns code → state, for claimed codes only
 */
export function resolveApiRowStates(input: ResolveApiRowsInput): Map<string, ApiRowState> {
    const { componentId, owners, picks, baseline } = input;
    const map = new Map<string, ApiRowState>();

    for (const code of baseline) {
        claim(map, code, 'baseline');
    }

    for (const owner of owners) {
        const mine = owner.id === componentId;
        for (const code of owner.requiredApis ?? []) {
            claim(map, code, mine ? 'mine-required' : 'other-required', owner.name);
        }
    }

    const nameOf = new Map(owners.map((owner) => [owner.id, owner.name]));
    for (const [ownerId, codes] of Object.entries(picks)) {
        // A pick is intent exactly as a catalog requirement is: dropping the code
        // breaks the integration holding it either way.
        const mine = ownerId === componentId;
        // Legacy picks lock the code (something wanted it) but can name nobody.
        const owner = ownerId === UNATTRIBUTED_PICKS_KEY ? undefined : nameOf.get(ownerId);
        for (const code of codes) {
            if (mine) {
                claim(map, code, 'mine-optional');
            } else {
                claim(map, code, 'other-required', owner);
            }
        }
    }

    return map;
}

/** True when this row's code may be unchecked by this integration. */
export function isRemovable(state: ApiRowState | undefined): boolean {
    return state?.ownership === 'mine-optional';
}
