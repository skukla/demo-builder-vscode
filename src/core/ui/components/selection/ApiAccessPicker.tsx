/**
 * ApiAccessPicker — the SHARED grouped Adobe-API checkbox list.
 *
 * Presentational (pure props, no fetching, no feature imports) so it can serve BOTH
 * the wizard's Add-Integration api-access stage and the dashboard's Manage APIs
 * modal. It guides the user to the RIGHT APIs rather than dumping the entitlement
 * list:
 *   - groups, in order: "Required by this integration" (locked — checked + disabled)
 *     → "Suggested" (curated catalog suggestions, hidden when none) → "All available"
 *     (the rest, alphabetical by display name);
 *   - search across display name + code past the catalog threshold ({@link SearchHeader});
 *   - display names primary, codes secondary;
 *   - an optional helper copy line at the top (callers supply context-specific guidance).
 *
 * @module core/ui/components/selection/ApiAccessPicker
 */

import { Checkbox } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import { SearchHeader } from '../navigation/SearchHeader';

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
    id: 'required' | 'suggested' | 'all';
    title: string;
    apis: ApiAccessOption[];
}

function byDisplayName(a: ApiAccessOption, b: ApiAccessOption): number {
    return a.name.localeCompare(b.name);
}

/** Required (locked) → Suggested (curated, non-locked) → All available; empty groups drop. */
function groupApis(apis: ApiAccessOption[], suggested: string[]): ApiGroup[] {
    const suggestedSet = new Set(suggested);
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
                .filter((api) => !api.locked && suggestedSet.has(api.code))
                .sort(byDisplayName),
        },
        {
            id: 'all',
            title: 'All available',
            apis: apis
                .filter((api) => !api.locked && !suggestedSet.has(api.code))
                .sort(byDisplayName),
        },
    ];
    return groups.filter((group) => group.apis.length > 0);
}

/** Case-insensitive match across display name AND code. */
function matchesQuery(api: ApiAccessOption, query: string): boolean {
    return `${api.name} ${api.code}`.toLowerCase().includes(query);
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
    return (
        <div className="intflow-api-row">
            <Checkbox
                isSelected={api.locked || checked}
                isDisabled={api.locked}
                // Locked rows are disabled, but guard anyway: a locked code must
                // never reach the free-picks list whatever the rendering layer does.
                onChange={() => {
                    if (!api.locked) onToggle(api.code);
                }}
            >
                <span className="intflow-api-name">{api.name}</span>
                <span className="intflow-api-code">{api.code}</span>
            </Checkbox>
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
    const q = query.trim().toLowerCase();
    const filtered = q ? apis.filter((api) => matchesQuery(api, q)) : apis;
    const groups = groupApis(filtered, suggested);
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
            {filtered.length === 0 ? (
                <div className="intflow-api-empty">No APIs match “{query}”.</div>
            ) : (
                groups.map((group) => (
                    <div key={group.id} className="intflow-api-group" data-group={group.id}>
                        <div className="intflow-api-group-title">{group.title}</div>
                        <div className="intflow-api-group-list">
                            {group.apis.map((api) => (
                                <ApiRow
                                    key={api.code}
                                    api={api}
                                    checked={selected.includes(api.code)}
                                    onToggle={onToggle}
                                />
                            ))}
                        </div>
                    </div>
                ))
            )}
        </div>
    );
}
