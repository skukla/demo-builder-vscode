/**
 * The datapack catalog: a searchable grid of packs, one card per name.
 *
 * A composition of the shared vocabulary, per `reuse-first`: `SearchHeader` for
 * the search/count bar, `LoadingDisplay` / `EmptyState` / `StatusDisplay` for the
 * states, `matchesSearchFields` for the filter. Only `DatapackCard` is new, and
 * only because nothing else renders an image (see its module docstring).
 *
 * **The page shell is the house one**, copied from `IntegrationsScreen` (the
 * newest full-screen surface) and `ProjectsDashboard`: a sticky
 * `.projects-sticky-header` band holding the controls, then content in
 * `.page-container-padded`. Both constrain to `--content-width` (960px). Without
 * them this view spanned the whole panel and its three columns rendered at ~517px
 * each — the cards were not too big, the band was missing.
 *
 * `GridLayout` was rejected here despite being the shared component: it takes a
 * fixed column COUNT, and both shipped card grids reflow by width instead
 * (`auto-fill` + `minmax`). Its one consumer, `PromptGrid`, is tiles inside a
 * panel rather than a page-level grid.
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

import { Flex, Link, Switch, View } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    groupDatapacks,
    pickDefaultVersion,
    type DatapackGroup,
} from '../../services/datapackCatalog';
import type {
    DataItemInventory,
    DatapackDetail,
    DatapackId,
    DatapackSummary,
    Page,
} from '../../types';
import { DatapackCard } from '../components/DatapackCard';
import { DatapackDetailPanel } from '../components/DatapackDetailPanel';
import { ExportDatapackModal } from '../components/ExportDatapackModal';
import { ImportDatapackModal } from '../components/ImportDatapackModal';
import { renderDataInstallerFailure } from '../dataInstallerFailure';
import { useDataInstallerRequest } from '../hooks/useDataInstallerRequest';
import { EmptyState } from '@/core/ui/components/feedback/EmptyState';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { SearchHeader } from '@/core/ui/components/navigation/SearchHeader';
import { matchesSearchFields } from '@/core/ui/hooks/useSearchFilter';

/** Fields a query is matched against — the id and the label, nothing else. */
const SEARCH_FIELDS: ReadonlyArray<keyof DatapackGroup> = ['name', 'displayName'];

/**
 * Show the search field from the first item, as both page-level peers do.
 *
 * NOT a tuning knob. `SearchHeader` puts the count BESIDE the refresh button when
 * there is no field and BENEATH the field when there is, so a non-zero threshold
 * makes the band change shape as the catalog crosses it.
 */
const SEARCH_THRESHOLD = 0;

/** What `get-datapack-detail` hands back — metadata plus what is actually stored. */
interface DatapackDetailResponse {
    detail: DatapackDetail;
    inventory: DataItemInventory;
}

export function DatapackCatalogView(): React.JSX.Element {
    const [includeCommunity, setIncludeCommunity] = useState(false);
    const [query, setQuery] = useState('');
    const [versions, setVersions] = useState<Record<string, string>>({});
    const [selected, setSelected] = useState<DatapackId | undefined>(undefined);
    const [importing, setImporting] = useState<DatapackId | undefined>(undefined);
    /** Stage 3: capture a NEW pack from the connected instance. */
    const [exporting, setExporting] = useState(false);

    const { load, loading, value, failure } = useDataInstallerRequest<Page<DatapackSummary>>(
        'find-datapacks',
    );
    const detail = useDataInstallerRequest<DatapackDetailResponse>('get-datapack-detail');
    // What the open project was CREATED to hold, recorded by the wizard's Sample
    // Data area. Optional in every direction: no project, or a project that
    // chose nothing, simply shows no banner.
    const projectContext = useDataInstallerRequest<ProjectSampleData>(
        'get-datapack-import-target',
    );

    useEffect(() => {
        load({ includeCommunity });
    }, [load, includeCommunity]);

    const loadProjectContext = projectContext.load;
    useEffect(() => {
        loadProjectContext({});
    }, [loadProjectContext]);

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

    const loadDetail = detail.load;
    const openDetail = useCallback(
        (id: DatapackId): void => {
            setSelected(id);
            loadDetail({ datapackName: id.name, version: id.version });
        },
        [loadDetail],
    );
    const closeDetail = useCallback((): void => setSelected(undefined), []);

    // The import modal is mounted HERE, not inside the flyout. As a child of the
    // Drawer it was a dialog nested in a drawer; `IntegrationsScreen` mounts its
    // flow modal beside the list and keeps its flyout view-only, and this follows
    // that. Closing the modal therefore leaves the flyout open behind it.
    const openImport = useCallback((id: DatapackId): void => setImporting(id), []);
    /**
     * Closing the import modal RE-READS which pack this project holds.
     *
     * The handler records `project.datapack` when the service accepts an import
     * and clears it when it accepts a removal — so the modal the user just closed
     * is exactly what decides which card wears the check. Without this the
     * catalog kept the copy it read on mount: import a pack and no card changed,
     * remove one and the check stayed, until the whole panel was reopened.
     *
     * Unconditional rather than only-when-something-ran: the modal owns that
     * knowledge and the read is a cheap local lookup, so asking it to report back
     * would be a second thing to keep in step for no gain.
     */
    const closeImport = useCallback((): void => {
        setImporting(undefined);
        loadProjectContext({});
    }, [loadProjectContext]);

    const retryDetail = useCallback((): void => {
        if (selected) {
            loadDetail({ datapackName: selected.name, version: selected.version });
        }
    }, [loadDetail, selected]);

    if (loading && !value) {
        // Centered in the full viewport — IntegrationsScreen's exact gate shape
        // (its comment records why not CenteredFeedbackContainer: that takes a
        // FIXED DimensionValue and cannot express "fill this screen").
        return (
            <View height="100vh">
                <Flex justifyContent="center" alignItems="center" height="100%">
                    <LoadingDisplay size="L" message="Loading datapacks..." />
                </Flex>
            </View>
        );
    }

    if (failure) {
        return renderDataInstallerFailure(failure, refresh);
    }

    return (
        <>
            {/* Sticky controls band — the shape ProjectsDashboard and
                IntegrationsScreen both use. No `Flex` wrapper around the header:
                those two need one for their trailing buttons, and this surface
                has none to place. */}
            <div className="projects-sticky-header">
                <div className="page-container-padded page-header-section">
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
                        // Always: the toggle lives on this row, and an empty
                        // curated catalog is exactly when it must be reachable.
                        alwaysShowCount
                        countTrailing={
                            <Flex gap="size-200" alignItems="center">
                                <Switch
                                    isSelected={includeCommunity}
                                    onChange={setIncludeCommunity}
                                >
                                    Include community datapacks
                                </Switch>
                                <Link isQuiet onPress={() => setExporting(true)}>
                                    Export from this instance
                                </Link>
                            </Flex>
                        }
                    />
                </div>
            </div>

            <div className="page-container-padded pb-6">
                {renderBody({
                    groups,
                    filtered,
                    query,
                    versions,
                    pickVersion,
                    openDetail,
                    ...(projectContext.value?.datapack
                        ? { projectPack: projectContext.value.datapack.name }
                        : {}),
                })}
            </div>

            <DatapackDetailPanel
                selected={selected}
                detail={detail.value?.detail ?? null}
                inventory={detail.value?.inventory ?? null}
                loading={detail.loading}
                failure={detail.failure}
                onClose={closeDetail}
                onRetry={retryDetail}
                onImport={openImport}
            />

            {exporting ? <ExportDatapackModal onClose={() => setExporting(false)} /> : null}

            {/* Only what the service HOLDS is importable — the inventory, never
                the pack's declared types. Mounted while `importing` is set, so
                closing it leaves the flyout behind it open. */}
            {importing && detail.value ? (
                <ImportDatapackModal
                    id={importing}
                    displayName={detail.value.detail.displayName}
                    availableTypes={detail.value.inventory.present}
                    onClose={closeImport}
                />
            ) : null}
        </>
    );
}


/** What `get-datapack-import-target` reports about the open project. */
interface ProjectSampleData {
    projectName?: string;
    datapack?: { name: string; version: string };
}

/*
 * `RecordedChoiceNotice` stood here: a full-width bar reading "<project> is set
 * up for <pack> (main)" with a "Review and install" link.
 *
 * It existed to close the wizard's loop — the Sample Data step records a pack and
 * deliberately does not import it, so the user needed the name carried forward
 * rather than re-found among 25 cards. That need is real and has not gone away;
 * it is now met by the card itself, which wears the shared `SelectionCheck` and
 * the accent border. The banner announced a card's state somewhere the card was
 * not, and then needed a link to point back at it.
 *
 * The wording had also stopped being true. `project.datapack` was written only by
 * the wizard, so "is set up for" meant "chosen, not yet installed" — until an
 * import from the modal began writing the same field, at which point the bar
 * invited the user to install what they had just installed.
 */

/** Pick the one body state to show under the header. */
function renderBody(args: {
    groups: DatapackGroup[];
    filtered: DatapackGroup[];
    query: string;
    versions: Record<string, string>;
    pickVersion: (name: string, version: string) => void;
    openDetail: (id: DatapackId) => void;
    /** The pack this project records, so its card can say so itself. */
    projectPack?: string;
}): React.JSX.Element {
    const { groups, filtered, query, versions, pickVersion, openDetail, projectPack } = args;

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
        <div className="datapack-grid">
            {filtered.map((group) => (
                <DatapackCard
                    key={group.name}
                    group={group}
                    selectedVersion={versions[group.name] ?? pickDefaultVersion(group) ?? ''}
                    onVersionChange={(version) => pickVersion(group.name, version)}
                    onOpen={openDetail}
                    isProjectPack={group.name === projectPack}
                />
            ))}
        </div>
    );
}
