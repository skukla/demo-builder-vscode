/**
 * The datapack catalog: a searchable grid of packs, one card per name.
 *
 * A composition of the shared vocabulary, per `reuse-first`: `SearchHeader` for
 * the search/count bar, `GridLayout` for the grid, `LoadingDisplay` /
 * `EmptyState` / `StatusDisplay` for the states, `matchesSearchFields` for the
 * filter. Only `DatapackCard` is new, and only because nothing else renders an
 * image (see its module docstring).
 *
 * **One card per NAME.** The service returns one row per `(name, version)` — 40
 * rows for 25 names live — which is not a list anyone can read. `groupDatapacks`
 * folds them and `pickDefaultVersion` chooses what each card opens on; `main`
 * cannot be assumed to exist, so three of the eleven curated brands open on
 * `eds-compatible` instead.
 *
 * **The community toggle re-asks the service.** Curation is a server-side filter
 * the handler owns (`shared: true` unless `includeCommunity`), so this asks again
 * rather than fetching everything and hiding half — 17 of the 40 live rows are
 * developer scratch nobody wants shipped down the wire to be discarded.
 *
 * The filter is `matchesSearchFields`, not the `useSearchFilter` hook that wraps
 * it: the hook has zero consumers, its `Record<string, unknown>` constraint does
 * not admit an interface like `DatapackGroup`, and the two peers that filter
 * lists (`ProjectsDashboard`, `IntegrationsScreen`) both call the predicate
 * directly.
 *
 * @module features/data-installer/ui/views/DatapackCatalogView
 */

import { Switch } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    groupDatapacks,
    pickDefaultVersion,
    type DatapackGroup,
} from '../../services/datapackCatalog';
import type { DatapackSummary, Page } from '../../types';
import { DatapackCard } from '../components/DatapackCard';
import { renderDataInstallerFailure } from '../dataInstallerFailure';
import { useDataInstallerRequest } from '../hooks/useDataInstallerRequest';
import { EmptyState } from '@/core/ui/components/feedback/EmptyState';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { GridLayout } from '@/core/ui/components/layout/GridLayout';
import { SearchHeader } from '@/core/ui/components/navigation/SearchHeader';
import { matchesSearchFields } from '@/core/ui/hooks/useSearchFilter';

/** Fields a query is matched against — the id and the label, nothing else. */
const SEARCH_FIELDS: ReadonlyArray<keyof DatapackGroup> = ['name', 'displayName'];

/** Below the wizard's own default (5): a catalog of a handful still filters well. */
const SEARCH_THRESHOLD = 2;

/** Grid width. Three reads comfortably in a full editor tab. */
const COLUMNS = 3;

export function DatapackCatalogView(): React.JSX.Element {
    const [includeCommunity, setIncludeCommunity] = useState(false);
    const [query, setQuery] = useState('');
    const [versions, setVersions] = useState<Record<string, string>>({});

    const { load, loading, value, failure } = useDataInstallerRequest<Page<DatapackSummary>>(
        'find-datapacks',
    );

    useEffect(() => {
        load({ includeCommunity });
    }, [load, includeCommunity]);

    const groups = useMemo(() => groupDatapacks(value?.items ?? []), [value]);
    const filtered = useMemo(
        () => groups.filter((group) => matchesSearchFields(group, SEARCH_FIELDS, query)),
        [groups, query],
    );

    const refresh = useCallback((): void => load({ includeCommunity }), [load, includeCommunity]);
    const pickVersion = useCallback(
        (name: string, version: string): void =>
            setVersions((current) => ({ ...current, [name]: version })),
        [],
    );

    if (loading && !value) {
        return <LoadingDisplay size="L" message="Loading datapacks..." />;
    }

    if (failure) {
        return renderDataInstallerFailure(failure, refresh);
    }

    return (
        <div>
            <SearchHeader
                searchQuery={query}
                onSearchQueryChange={setQuery}
                searchPlaceholder="Filter datapacks..."
                searchThreshold={SEARCH_THRESHOLD}
                totalCount={groups.length}
                filteredCount={filtered.length}
                itemNoun="datapack"
                onRefresh={refresh}
                isRefreshing={loading}
                refreshAriaLabel="Refresh datapacks"
                hasLoadedOnce={value !== null}
                // Always: the toggle lives on this row, and an empty curated
                // catalog is exactly when the user needs to reach it.
                alwaysShowCount
                countTrailing={
                    <Switch isSelected={includeCommunity} onChange={setIncludeCommunity}>
                        Include community datapacks
                    </Switch>
                }
            />
            {renderBody({ groups, filtered, query, versions, pickVersion })}
        </div>
    );
}

/** Pick the one body state to show under the header. */
function renderBody(args: {
    groups: DatapackGroup[];
    filtered: DatapackGroup[];
    query: string;
    versions: Record<string, string>;
    pickVersion: (name: string, version: string) => void;
}): React.JSX.Element {
    const { groups, filtered, query, versions, pickVersion } = args;

    if (groups.length === 0) {
        return (
            <EmptyState
                title="No datapacks found"
                description="The service returned no datapacks. Turn on community datapacks to include entries that are not shared."
            />
        );
    }

    if (filtered.length === 0) {
        return <div className="datapack-catalog-empty">No datapacks match &quot;{query}&quot;</div>;
    }

    return (
        <GridLayout columns={COLUMNS} gap="size-300">
            {filtered.map((group) => (
                <DatapackCard
                    key={group.name}
                    group={group}
                    selectedVersion={versions[group.name] ?? pickDefaultVersion(group) ?? ''}
                    onVersionChange={(version) => pickVersion(group.name, version)}
                />
            ))}
        </GridLayout>
    );
}
