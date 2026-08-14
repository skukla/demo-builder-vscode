/**
 * What the service records as installed, and where.
 *
 * A row list, not a card grid. An installation is a RECORD — pack · instance ·
 * when — and it carries no art worth a 16:9 band, so `ProjectRowList`'s shape
 * (a plain container plus row components) is the fit rather than the catalog's.
 *
 * `SearchableList` was the plan's named component and is the wrong one here, on
 * two counts read from its source: it is built for SELECTION (`selectionMode`,
 * `selectedKeys`, `disabledKeys`), which this list does not do, and its
 * `.searchable-list-container` is `flex: 1; min-height: 0` with a `height="100%"`
 * ListView inside — it needs a flex parent with a resolved height, which the
 * page's `.page-container-padded` block is not. Its only consumer is
 * `SelectionStepContent`, a wizard picker, which supplies exactly that context.
 *
 * The tracking is the SERVICE's, not ours: this is what the Data Installer
 * believes it installed, which is why the empty state says "recorded" rather than
 * claiming nothing is installed.
 *
 * @module features/data-installer/ui/views/InstalledDatapacksView
 */

import { Flex, View } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { InstalledDatapack, Page } from '../../types';
import { renderDataInstallerFailure } from '../dataInstallerFailure';
import { useDataInstallerRequest } from '../hooks/useDataInstallerRequest';
import { EmptyState } from '@/core/ui/components/feedback/EmptyState';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { SearchHeader } from '@/core/ui/components/navigation/SearchHeader';
import { matchesSearchFields } from '@/core/ui/hooks/useSearchFilter';

/** See DatapackCatalogView — the threshold is not a tuning knob. */
const SEARCH_THRESHOLD = 0;

/** The flat projection a query is matched against. */
interface InstalledSearchable extends Record<string, unknown> {
    name: string;
    version: string;
    displayName: string;
    instance: string;
}

const SEARCH_FIELDS: ReadonlyArray<keyof InstalledSearchable> = [
    'name',
    'version',
    'displayName',
    'instance',
];

export function InstalledDatapacksView(): React.JSX.Element {
    const [query, setQuery] = useState('');
    const { load, loading, value, failure } = useDataInstallerRequest<Page<InstalledDatapack>>(
        'list-installed-datapacks',
    );

    useEffect(() => {
        load({});
    }, [load]);

    const records = useMemo(() => value?.items ?? [], [value]);
    const filtered = useMemo(
        () => records.filter((record) => matchesInstalled(record, query)),
        [records, query],
    );

    const refresh = useCallback((): void => load({}), [load]);

    if (loading && !value) {
        // Centered in the full viewport — IntegrationsScreen's exact gate shape
        // (its comment records why not CenteredFeedbackContainer: that takes a
        // FIXED DimensionValue and cannot express "fill this screen").
        return (
            <View height="100vh">
                <Flex justifyContent="center" alignItems="center" height="100%">
                    <LoadingDisplay size="L" message="Loading installed datapacks..." />
                </Flex>
            </View>
        );
    }

    if (failure) {
        return renderDataInstallerFailure(failure, refresh);
    }

    return (
        <>
            <div className="projects-sticky-header">
                <div className="page-container-padded page-header-section">
                    <SearchHeader
                        searchQuery={query}
                        onSearchQueryChange={setQuery}
                        searchPlaceholder="Filter installations..."
                        searchThreshold={SEARCH_THRESHOLD}
                        totalCount={records.length}
                        filteredCount={filtered.length}
                        itemNoun="installation"
                        onRefresh={refresh}
                        isRefreshing={loading}
                        refreshAriaLabel="Refresh installed datapacks"
                        hasLoadedOnce={value !== null}
                        alwaysShowCount
                    />
                </div>
            </div>

            <div className="page-container-padded pb-6">
                {renderBody({ records, filtered, query })}
            </div>
        </>
    );
}

/** Pick the one body state to show under the header. */
function renderBody(args: {
    records: InstalledDatapack[];
    filtered: InstalledDatapack[];
    query: string;
}): React.JSX.Element {
    const { records, filtered, query } = args;

    if (records.length === 0) {
        return (
            <EmptyState
                title="No installations recorded"
                description="The Data Installer has no record of a datapack being installed. Installing one from the catalog will show it here."
            />
        );
    }

    if (filtered.length === 0) {
        return (
            <div className="datapack-catalog-empty">No installations match &quot;{query}&quot;</div>
        );
    }

    return (
        <div className="datapack-row-list">
            {filtered.map((record) => (
                <InstalledRow key={rowKey(record)} record={record} />
            ))}
        </div>
    );
}

/** One installation. */
function InstalledRow({ record }: { record: InstalledDatapack }): React.JSX.Element {
    return (
        <div className="datapack-row" data-testid="installed-row">
            <div className="datapack-row-main">
                <span className="datapack-row-title">{record.displayName || record.id.name}</span>
                <span className="datapack-row-version">{record.id.version}</span>
            </div>
            <div className="datapack-row-meta">
                {/* Verbatim. `commerce_instance` is an opaque caller-supplied
                    string — don't format, link or validate it. */}
                <span className="datapack-row-instance">{record.commerceInstance}</span>
                <span>{record.dataTypes.length} data types</span>
                {record.installedAt ? <span>{formatDate(record.installedAt)}</span> : null}
                {record.processingTimeMs !== undefined ? (
                    <span>{formatDuration(record.processingTimeMs)}</span>
                ) : null}
            </div>
        </div>
    );
}

/** Whether one record matches the query, across pack and instance. */
function matchesInstalled(record: InstalledDatapack, query: string): boolean {
    const projected: InstalledSearchable = {
        name: record.id.name,
        version: record.id.version,
        displayName: record.displayName ?? '',
        instance: record.commerceInstance,
    };
    return matchesSearchFields(projected, SEARCH_FIELDS, query);
}

/**
 * A stable React key.
 *
 * The same pack CAN be installed into more than one instance, so the pack id
 * alone is not unique — the instance is part of the identity of a record.
 */
function rowKey(record: InstalledDatapack): string {
    return `${record.commerceInstance}:${record.id.name}:${record.id.version}`;
}

/** ISO timestamp → a plain local date (see DatapackDetailPanel for why). */
function formatDate(iso: string): string {
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? iso : parsed.toLocaleDateString();
}

/** Real installs run 12s–366s, so seconds and minutes are the useful units. */
function formatDuration(ms: number): string {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) {
        return `${seconds}s`;
    }
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
