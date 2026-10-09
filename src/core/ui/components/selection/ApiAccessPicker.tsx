/**
 * ApiAccessPicker — the SHARED Adobe-API checkbox list.
 *
 * Presentational (pure props, no fetching, no feature imports) so it can serve BOTH
 * the wizard's Add-Integration api-access stage and the dashboard's Manage APIs
 * modal. ONE flat list (no category headers):
 *   - checked rows (locked/already-provided OR the user's picks) sort to the TOP,
 *     the rest below, alphabetical within each partition;
 *   - locked (already-covered) rows render checked + disabled — visible in context
 *     at the top, but required and not removable here;
 *   - review- and profile-gated APIs can't be subscribed in this self-serve flow,
 *     so they are hidden entirely (never listed, never counted);
 *   - product filter pills, from TWO lenses: a curated Adobe Commerce / App
 *     Builder pair (API_FAMILIES in apiAccessFilters.ts) plus Adobe's own cloud
 *     families, minus the ones a Commerce demo never wants (EXCLUDED_CLOUD_PILLS,
 *     same file). An API can sit in both;
 *     a pill nothing matches is omitted and an empty set hides the row;
 *   - search across display name + code past the catalog threshold ({@link SearchHeader});
 *   - display names primary, sdk codes secondary (hidden when the code is a GUID
 *     or just the name again);
 *   - an optional helper copy line at the top (callers supply context-specific guidance).
 *
 * @module core/ui/components/selection/ApiAccessPicker
 */

import { Checkbox } from '@adobe/react-spectrum';
import React, { useEffect, useState } from 'react';
import { SearchHeader } from '../navigation/SearchHeader';
import {
    byDisplayName,
    familiesOf,
    familyChips,
    isPickable,
    matchesQuery,
    pickableApis,
} from './apiAccessFilters';
import type { CloudGrouping } from '@/types/adobeApis';

/** Show the filter only once the list is big enough to warrant it (catalog parity). */
const API_SEARCH_THRESHOLD = 5;

/** One org Adobe service, as the wizard/dashboard API handlers report it. */
export interface ApiAccessOption {
    /** The service's sdkCode (what subscriptions are keyed by). */
    code: string;
    /** Human-readable display name (primary text). */
    name: string;
    /** Already covered by the reconcile union — rendered checked + disabled. */
    locked: boolean;
    /**
     * Profile-bound: entitled, but subscribing needs a product profile the
     * self-serve flow can't supply. Hidden from this picker entirely (never
     * pickable, so a pick can't fail at provisioning). Optional; absent ⇒
     * pickable (dashboard parity).
     */
    requiresProfile?: boolean;
    /**
     * Access needs Adobe's review/approval first (Console's "Requires Adobe
     * review"). Hidden from this picker entirely — the self-serve flow can't
     * subscribe it. Optional; absent ⇒ not review-gated.
     */
    requiresReview?: boolean;
    /**
     * Adobe's cloud-level family from `getServicesForOrg`'s `cloudGrouping`
     * (Experience Cloud, Adobe Experience Platform, …). Drives one of the two pill
     * lenses — see API_FAMILIES (apiAccessFilters.ts) for the curated other. Absent ⇒ the API carries no
     * cloud pill and is reachable under "All".
     */
    group?: CloudGrouping;
    /**
     * Why this row is claimed, from the asking integration's point of view —
     * `resolveApiRowStates`' verdict, sent by both handler surfaces since step 04.
     *
     * Absent ⇒ nobody holds the code (freely pickable).
     */
    ownership?: 'baseline' | 'mine-required' | 'other-required' | 'mine-optional';
    /**
     * Integrations to NAME as the reason a row is locked. Empty for `baseline`
     * (nothing chose it), for the asker's own optional picks, and for legacy
     * picks whose owner is unrecoverable.
     *
     * Rendered as the row's reason line (step 05) — see {@link lockedReason} for
     * which ownership states earn one and which must stay silent.
     */
    requiredBy?: string[];
}

export interface ApiAccessPickerProps {
    /** The org's subscribable services (any order; the picker sorts checked-first). */
    apis: ApiAccessOption[];
    /** The user's free picks (locked codes are derived, never listed here). */
    selected: string[];
    /** Toggle a free pick by code (locked rows never fire this). */
    onToggle: (code: string) => void;
    /** Optional guidance line rendered above the list. */
    helperText?: string;
}

/** A UUID anywhere in a code marks it machine-generated (e.g. an EDS org id). */
const GUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Whether a code is worth showing as secondary text. Some services report a code
 * that's a GUID or just the display name again — noise, not a helpful sdk code.
 * Compact codes like `GraphQLServiceSDK` stay; those still match search.
 */
function isMeaningfulCode(code: string, name: string): boolean {
    if (!code || code === name) return false;
    if (/\s/.test(code)) return false;
    return !GUID_RE.test(code);
}

/**
 * The reason a row cannot be unchecked, or undefined when there is none to give.
 *
 * Only `other-required` earns one. `baseline` is always-on — nothing chose it, so
 * naming an owner would be false. `mine-optional` is removable, so a reason would
 * contradict its own checkbox. And a legacy unattributed pick locks the row while
 * naming nobody, which is why an empty `requiredBy` yields silence rather than a
 * placeholder.
 */
function lockedReason(api: ApiAccessOption): string | undefined {
    if (api.ownership !== 'other-required') return undefined;
    const owners = api.requiredBy ?? [];
    if (owners.length === 0) return undefined;
    const names =
        owners.length === 1
            ? owners[0]
            : `${owners.slice(0, -1).join(', ')} and ${owners[owners.length - 1]}`;
    return `Required by ${names}`;
}

/** One checkbox row: display name primary, code secondary; locked = checked + disabled. */
function ApiRow({
    api,
    checked,
    onToggle,
}: {
    api: ApiAccessOption;
    checked: boolean;
    onToggle: (code: string) => void;
}): React.ReactElement {
    // Locked (required) → checked + disabled; the guard on onToggle is the same
    // condition, so a locked row cannot toggle even if the checkbox were enabled.
    //
    // There is no unavailable/dimmed state here: profile-bound and review-gated
    // APIs are dropped from the list before it reaches these rows, so the
    // `data-unavailable` attribute this row used to carry could never be set.
    const pickable = isPickable(api);
    const reason = lockedReason(api);
    return (
        <div className="intflow-api-row">
            <Checkbox
                isSelected={api.locked || (checked && pickable)}
                isDisabled={!pickable}
                onChange={() => {
                    if (pickable) onToggle(api.code);
                }}
            >
                <span className="intflow-api-name">{api.name}</span>
                {isMeaningfulCode(api.code, api.name) && (
                    <span className="intflow-api-code">{api.code}</span>
                )}
                {reason !== undefined && <span className="intflow-api-reason">{reason}</span>}
            </Checkbox>
        </div>
    );
}

/** Render the flat list of rows. */
function ApiRows({
    apis,
    selected,
    onToggle,
}: {
    apis: ApiAccessOption[];
    selected: string[];
    onToggle: (code: string) => void;
}): React.ReactElement {
    return (
        <div className="intflow-api-group-list">
            {apis.map((api) => (
                <ApiRow
                    key={api.code}
                    api={api}
                    checked={selected.includes(api.code)}
                    onToggle={onToggle}
                />
            ))}
        </div>
    );
}

/**
 * The searchable Adobe-API access list — one flat list, checked rows on top.
 *
 * @param props - services, free picks, toggle, helper copy
 * @returns the flat checkbox list
 */
export function ApiAccessPicker({
    apis,
    selected,
    onToggle,
    helperText,
}: ApiAccessPickerProps): React.ReactElement {
    const [query, setQuery] = useState('');
    const [family, setFamily] = useState<string | null>(null);
    const q = query.trim().toLowerCase();
    // Re-seeded when the SOURCE list changes (a fetch landing, a different org) —
    // never on selection, which is precisely the reshuffle being prevented.
    // `selected` is deliberately absent from the deps: it is read as a SNAPSHOT,
    // and depending on it would restore the bug this exists to fix.
    const [orderSeed, setOrderSeed] = useState<Set<string>>(() => new Set(selected));
    /* eslint-disable react-hooks/exhaustive-deps */
    useEffect(() => {
        setOrderSeed(new Set(selected));
    }, [apis]);
    /* eslint-enable react-hooks/exhaustive-deps */

    // Review- and profile-gated APIs can't be subscribed in this self-serve flow, so
    // they are hidden entirely — dropped from the list, chips, search, and count.

    const selectable = apis.filter((api) => !api.requiresReview && !api.requiresProfile);
    const searched = q ? selectable.filter((api) => matchesQuery(api, q)) : selectable;
    // Chips come from the full (search-independent) pickable set so they don't jump
    // around while typing; the active chip then filters the list.
    const chips = familyChips(pickableApis(selectable));
    // One flat list (active family chip applied). Checked rows — locked/already-provided
    // OR the user's picks — sort to the TOP so what's on is visible first; alphabetical
    // within each partition. Locked rows render checked + disabled (required).
    //
    // The partition is FROZEN to the selection as it stood when the list arrived.
    // Ranking on the LIVE selection re-sorted rows mid-interaction: ticking a box
    // sent that row to the top and everything below it shifted, so the next row the
    // user was aiming at had moved. Checkboxes still reflect the live selection —
    // only the ORDER is held still.
    const isChecked = (api: ApiAccessOption): boolean => api.locked || orderSeed.has(api.code);
    const list = searched
        .filter((api) => family === null || familiesOf(api).includes(family))
        .sort((a, b) => {
            const rank = Number(isChecked(b)) - Number(isChecked(a));
            return rank !== 0 ? rank : byDisplayName(a, b);
        });
    return (
        <div className="intflow-api-picker">
            {helperText && <p className="intflow-api-helper">{helperText}</p>}
            <SearchHeader
                searchQuery={query}
                onSearchQueryChange={setQuery}
                totalCount={selectable.length}
                filteredCount={searched.length}
                itemNoun="API"
                hasLoadedOnce
                searchThreshold={API_SEARCH_THRESHOLD}
                searchPlaceholder="Filter APIs"
            />
            {chips.length > 0 && (
                <div className="intflow-api-chips" role="group" aria-label="Filter by product">
                    {chips.map((chip) => (
                        <button
                            key={chip.code ?? '__all__'}
                            type="button"
                            className="intflow-api-chip"
                            data-active={family === chip.code ? '' : undefined}
                            aria-pressed={family === chip.code}
                            onClick={() => setFamily(chip.code)}
                        >
                            {chip.name}
                        </button>
                    ))}
                </div>
            )}
            {/* The row area is always its own element so a HOST can make it the
                one scroll region (see .manage-apis-body). Unconstrained — as in
                the wizard stage — it simply stacks and the page scrolls. */}
            <div className="intflow-api-scroll">
                {list.length === 0 ? (
                    <div className="intflow-api-empty">No APIs match “{query}”.</div>
                ) : (
                    <ApiRows apis={list} selected={selected} onToggle={onToggle} />
                )}
            </div>
        </div>
    );
}
