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
 *   - product-family filter chips (Console's "Filter by product") narrow the list
 *     to one family; shown only when ≥2 families are present;
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
     * Product family (Console's "Filter by product"). When present on any
     * "All available" row, that group is sub-headed by family; absent ⇒ the group
     * stays flat (dashboard parity / lean fixtures).
     */
    group?: CloudGrouping;
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

/** A product-family filter chip. `code === null` is the "All" chip. */
interface FamilyChip {
    code: string | null;
    name: string;
}

/** Family key for the ungrouped bucket (APIs the catalog gives no `cloudGrouping`). */
const OTHER_FAMILY_KEY = '__other__';
const OTHER_FAMILY_LABEL = 'Other';

function familyKey(api: ApiAccessOption): string {
    return api.group?.code ?? OTHER_FAMILY_KEY;
}

function byDisplayName(a: ApiAccessOption, b: ApiAccessOption): number {
    return a.name.localeCompare(b.name);
}

/** A pickable free API: not locked, not profile-bound, not review-gated. */
function isPickable(api: ApiAccessOption): boolean {
    return !api.locked && !api.requiresProfile && !api.requiresReview;
}

/** The pickable rows — the set the product-family chips are built from. */
function pickableApis(apis: ApiAccessOption[]): ApiAccessOption[] {
    return apis.filter(isPickable);
}

/**
 * Product-family chips for the pickable set: "All" first, then each present family
 * alphabetically, with the ungrouped "Other" bucket last. Returns [] when there
 * is nothing to filter by (0 or 1 family) so the chip row hides.
 */
function familyChips(pickable: ApiAccessOption[]): FamilyChip[] {
    const byCode = new Map<string, string>();
    for (const api of pickable) byCode.set(familyKey(api), api.group?.name ?? OTHER_FAMILY_LABEL);
    if (byCode.size < 2) return [];
    const chips = [...byCode.entries()]
        .map(([code, name]) => ({ code, name }))
        .sort((a, b) => {
            if (a.code === OTHER_FAMILY_KEY) return 1;
            if (b.code === OTHER_FAMILY_KEY) return -1;
            return a.name.localeCompare(b.name);
        });
    return [{ code: null, name: 'All' }, ...chips];
}

/** Case-insensitive match across display name AND code. */
function matchesQuery(api: ApiAccessOption, query: string): boolean {
    return `${api.name} ${api.code}`.toLowerCase().includes(query);
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
    // Locked (required) → checked + disabled. Profile-bound or review-gated →
    // unchecked + disabled (the self-serve flow can't subscribe them). All guard onToggle.
    const pickable = isPickable(api);
    const unavailable = api.requiresProfile || api.requiresReview;
    return (
        <div className="intflow-api-row" data-unavailable={unavailable ? '' : undefined}>
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
            </Checkbox>
        </div>
    );
}

/** Render a flat list of rows (used by every group and by each product sub-section). */
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
    const isChecked = (api: ApiAccessOption): boolean =>
        api.locked || orderSeed.has(api.code);
    const list = searched
        .filter((api) => family === null || familyKey(api) === family)
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
                searchPlaceholder="Filter APIs…"
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
            {list.length === 0 ? (
                <div className="intflow-api-empty">No APIs match “{query}”.</div>
            ) : (
                <ApiRows apis={list} selected={selected} onToggle={onToggle} />
            )}
        </div>
    );
}
