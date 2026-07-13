/**
 * ApiAccessPicker — the SHARED grouped Adobe-API checkbox list.
 *
 * Presentational (pure props, no fetching, no feature imports) so it can serve BOTH
 * the wizard's Add-Integration api-access stage and the dashboard's Manage APIs
 * modal. It guides the user to the RIGHT APIs rather than dumping the entitlement
 * list:
 *   - groups, in order: "Required by this integration" (locked — checked + disabled)
 *     → "Suggested" (curated catalog suggestions, hidden when none) → "All available"
 *     (the rest, alphabetical) → "Requires Adobe review" / "Requires a product
 *     profile" (disabled, self-serve can't subscribe them);
 *   - product-family filter chips (Console's "Filter by product") narrow "All
 *     available" to one family; shown only when ≥2 families are present;
 *   - search across display name + code past the catalog threshold ({@link SearchHeader});
 *   - display names primary, sdk codes secondary (hidden when the code is a GUID
 *     or just the name again);
 *   - an optional helper copy line at the top (callers supply context-specific guidance).
 *
 * @module core/ui/components/selection/ApiAccessPicker
 */

import { Checkbox } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import { SearchHeader } from '../navigation/SearchHeader';
import type { CloudGrouping } from '@/types/adobeApis';

/** Show the filter only once the list is big enough to warrant it (catalog parity). */
const API_SEARCH_THRESHOLD = 5;

/** Stable default so an omitted `suggested` never churns identity. */
const NO_SUGGESTIONS: string[] = [];

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
     * self-serve flow can't supply. Grouped separately under "Requires a product
     * profile" and rendered disabled — never pickable, so a pick can't fail at
     * provisioning. Optional; absent ⇒ pickable (dashboard parity).
     */
    requiresProfile?: boolean;
    /**
     * Access needs Adobe's review/approval first (Console's "Requires Adobe
     * review"). Grouped under "Requires Adobe review" and rendered disabled — the
     * self-serve flow can't subscribe it. Optional; absent ⇒ not review-gated.
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
    /** The org's subscribable services (any order; the picker groups + sorts). */
    apis: ApiAccessOption[];
    /** Curated suggestion codes (catalog `suggestedApis`); omitted = no Suggested group. */
    suggested?: string[];
    /** The user's free picks (locked codes are derived, never listed here). */
    selected: string[];
    /** Toggle a free pick by code (locked rows never fire this). */
    onToggle: (code: string) => void;
    /** Optional guidance line rendered above the list. */
    helperText?: string;
}

interface ApiGroup {
    id: 'required' | 'suggested' | 'all' | 'review' | 'unavailable';
    title: string;
    /** Explanatory line under the title (e.g. why a group is unavailable). */
    note?: string;
    apis: ApiAccessOption[];
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

/** The pickable, non-suggested rows — the "All available" browse set that chips filter. */
function browseApis(apis: ApiAccessOption[], suggestedSet: Set<string>): ApiAccessOption[] {
    return apis.filter((api) => isPickable(api) && !suggestedSet.has(api.code));
}

/**
 * Product-family chips for the browse set: "All" first, then each present family
 * alphabetically, with the ungrouped "Other" bucket last. Returns [] when there
 * is nothing to filter by (0 or 1 family) so the chip row hides.
 */
function familyChips(browse: ApiAccessOption[]): FamilyChip[] {
    const byCode = new Map<string, string>();
    for (const api of browse) byCode.set(familyKey(api), api.group?.name ?? OTHER_FAMILY_LABEL);
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

/**
 * Required (locked) → Suggested → All available (flat; filtered by the active
 * product-family chip) → Requires Adobe review (disabled) → Requires a product
 * profile (disabled). Review- and profile-gated APIs are pulled out of the
 * pickable groups so a pick can never fail at provisioning. Empty groups drop.
 */
function groupApis(
    apis: ApiAccessOption[],
    suggestedSet: Set<string>,
    family: string | null,
): ApiGroup[] {
    const allAvailable = browseApis(apis, suggestedSet)
        .filter((api) => family === null || familyKey(api) === family)
        .sort(byDisplayName);
    const groups: ApiGroup[] = [
        {
            id: 'required',
            title: 'Required by this integration',
            apis: apis.filter((api) => api.locked).sort(byDisplayName),
        },
        {
            id: 'suggested',
            title: 'Suggested',
            apis: apis
                .filter((api) => isPickable(api) && suggestedSet.has(api.code))
                .sort(byDisplayName),
        },
        { id: 'all', title: 'All available', apis: allAvailable },
        {
            id: 'review',
            title: 'Requires Adobe review',
            note: 'Adobe must approve access to these first — request it in Adobe Console, then reload.',
            apis: apis.filter((api) => !api.locked && api.requiresReview).sort(byDisplayName),
        },
        {
            id: 'unavailable',
            title: 'Requires a product profile',
            note: 'Assign a product profile in Adobe Console, then reload.',
            apis: apis
                .filter((api) => !api.locked && api.requiresProfile && !api.requiresReview)
                .sort(byDisplayName),
        },
    ];
    return groups.filter((group) => group.apis.length > 0);
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
 * The grouped, searchable Adobe-API access list.
 *
 * @param props - services, curated suggestions, free picks, toggle, helper copy
 * @returns the grouped checkbox list
 */
export function ApiAccessPicker({
    apis,
    suggested = NO_SUGGESTIONS,
    selected,
    onToggle,
    helperText,
}: ApiAccessPickerProps): React.ReactElement {
    const [query, setQuery] = useState('');
    const [family, setFamily] = useState<string | null>(null);
    const q = query.trim().toLowerCase();
    const suggestedSet = new Set(suggested);
    const filtered = q ? apis.filter((api) => matchesQuery(api, q)) : apis;
    // Chips come from the full (search-independent) browse set so they don't jump
    // around while typing; the active chip then filters the "All available" group.
    const chips = familyChips(browseApis(apis, suggestedSet));
    const groups = groupApis(filtered, suggestedSet, family);
    return (
        <div className="intflow-api-picker">
            {helperText && <p className="intflow-api-helper">{helperText}</p>}
            <SearchHeader
                searchQuery={query}
                onSearchQueryChange={setQuery}
                totalCount={apis.length}
                filteredCount={filtered.length}
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
            {filtered.length === 0 ? (
                <div className="intflow-api-empty">No APIs match “{query}”.</div>
            ) : (
                groups.map((group) => (
                    <div key={group.id} className="intflow-api-group" data-group={group.id}>
                        <div className="intflow-api-group-title">{group.title}</div>
                        {group.note && <div className="intflow-api-group-note">{group.note}</div>}
                        <ApiRows apis={group.apis} selected={selected} onToggle={onToggle} />
                    </div>
                ))
            )}
        </div>
    );
}
