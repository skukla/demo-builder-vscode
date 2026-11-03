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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { groupDatapacks, withoutLayerCards, type DatapackGroup } from '../../services/datapackCatalog';
import type { CatalogPage, DataItemInventory, DatapackDetail, InstalledDatapack, PackDetailLayer, Page } from '../../types';
import { CatalogCountRow } from '../components/CatalogCountRow';
import { DatapackCatalogGrid } from '../components/DatapackCatalogGrid';
import { DatapackDetailPanel } from '../components/DatapackDetailPanel';
import { DatapackSourceNotice } from '../components/DatapackSourceNotice';
import { ImportDatapackModal } from '../components/ImportDatapackModal';
import { renderDataInstallerFailure } from '../dataInstallerFailure';
import { useDataInstallerRequest } from '../hooks/useDataInstallerRequest';
import { useHeldPack } from '../hooks/useHeldPack';
import { FullScreenLoading } from '@/core/ui/components/feedback/FullScreenLoading';
import { FullScreenSurface } from '@/core/ui/components/layout/FullScreenSurface';
import { SearchHeader } from '@/core/ui/components/navigation/SearchHeader';
import { matchesSearchFields } from '@/core/ui/hooks/useSearchFilter';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { DatapackId, DatapackStoreName, ProjectDatapack } from '@/types/datapack';

/** Fields a query is matched against — the id and the label, nothing else. */
const SEARCH_FIELDS: ReadonlyArray<keyof DatapackGroup> = ['name', 'displayName'];

/** What `get-datapack-detail` hands back — metadata plus what is actually stored. */
interface DatapackDetailResponse {
    detail: DatapackDetail;
    inventory: DataItemInventory;
    /** The warning a delete carries when this SC shared the pack in a project file (step 07). */
    sharedInFile?: string;
    /** The settings layer Import will apply after the pack's data (step 09). */
    settingsLayer?: PackDetailLayer;
}

const DATAPACKS_UNAVAILABLE = "Datapacks Aren't Available";

/**
 * Rename the SC's own library pack (step 07), the inline field's contract: null on success,
 * the reason otherwise. The field is the confirmation, so it is sent confirmed.
 */
async function requestDatapackRename(id: DatapackId, displayName: string): Promise<string | null> {
    try {
        const response = await webviewClient.request<{ success: boolean; error?: string }>('rename-library-datapack', {
            datapackName: id.name,
            displayName,
            confirm: true,
        });
        return response?.success ? null : (response?.error ?? 'Rename failed');
    } catch (error) {
        return error instanceof Error ? error.message : 'Rename failed';
    }
}

export function DatapackCatalogView(): React.JSX.Element {
    const [includeCommunity, setIncludeCommunity] = useState(false);
    // The Data Installer switch, beside Community (owner, 2026-11-03: not buried in a setting).
    // Unset, the handler asks it when it is set up. Shown only once it has answered this SC:
    // an SC with no address, or one it turns away, has nothing to switch (owner, same day).
    const [includeInstaller, setIncludeInstaller] = useState<boolean | undefined>(undefined);
    const [installerAnswered, setInstallerAnswered] = useState(false);
    const [query, setQuery] = useState('');
    const [versions, setVersions] = useState<Record<string, string>>({});
    const [selected, setSelected] = useState<DatapackId | undefined>(undefined);
    /** Which store the open flyout's pack lives in. */
    const [selectedStore, setSelectedStore] = useState<DatapackStoreName>('installer');
    const [importing, setImporting] = useState<DatapackId | undefined>(undefined);

    // The one list: Demo Builder's datapack store, then the Data Installer's if it answers.
    const { load, loading, value, failure, settled } =
        useDataInstallerRequest<CatalogPage>('find-datapacks');
    const detail = useDataInstallerRequest<DatapackDetailResponse>('get-datapack-detail');
    // What the open project was CREATED to hold, recorded by the wizard's Sample
    // Data area. Optional in every direction: no project, or a project that
    // chose nothing, simply shows no banner.
    const projectContext = useDataInstallerRequest<ProjectSampleData>('get-datapack-import-target');

    useEffect(() => {
        load({ includeCommunity, includeInstaller });
    }, [load, includeCommunity, includeInstaller]);

    const loadProjectContext = projectContext.load;
    useEffect(() => {
        loadProjectContext({});
    }, [loadProjectContext]);

    /**
     * What is recorded as installed on this project's instance: Demo Builder's
     * engine's install records, then the service's tracking (step 14,
     * `engineHistoryReads`). Before step 14 this was the service's alone, so a
     * pack our engine installed wore no check.
     *
     * Scoped to the instance, so it answers "what is on the box this project
     * writes to" rather than the global cross-instance list an earlier Installed
     * view showed (removed for exactly that reason — see `DataInstallerScreen`).
     *
     * Self-reported, like every source available here: a `DELETE
     * get-installed-datapacks` clears the record without uninstalling anything,
     * so it can say ABSENT while data sits on the instance. That is the safe
     * direction for a checkmark, and it is why this is unioned with the
     * project's own record rather than replacing it.
     */
    const installed = useDataInstallerRequest<Page<InstalledDatapack>>('list-installed-datapacks');
    const commerceInstance = projectContext.value?.instance;
    const loadInstalled = installed.load;
    useEffect(() => {
        if (!commerceInstance) {
            return;
        }
        loadInstalled({ commerceInstance });
    }, [loadInstalled, commerceInstance]);

    /**
     * Every pack believed to be on this instance, from both self-reports.
     *
     * UNION, not either alone. The service's list can be wrong in the absent
     * direction; the project's record covers only one pack and can outlive a
     * failed import. Neither is ground truth — nothing here has that, since only
     * Commerce itself knows what it holds — so the check means "believed
     * installed", and both sources clear when a removal runs through the
     * extension, which is the case that matters.
     */
    const installedPacks = useMemo(() => {
        const names = new Set<string>();
        for (const row of installed.value?.items ?? []) {
            names.add(row.id.name);
        }
        const recorded = projectContext.value?.datapack?.name;
        if (recorded) {
            names.add(recorded);
        }
        return names;
    }, [installed.value, projectContext.value]);

    // A settings layer is reached from its pack's flyout, not as a demo of its own (step 09).
    const groups = useMemo(() => groupDatapacks(withoutLayerCards(value?.items ?? [], installedPacks)), [value, installedPacks]);
    const filtered = useMemo(
        () => groups.filter((group) => matchesSearchFields(group, SEARCH_FIELDS, query)),
        [groups, query],
    );

    const refresh = useCallback(
        (): void => load({ includeCommunity, includeInstaller }),
        [load, includeCommunity, includeInstaller],
    );
    // Whether it answered, from each list that asked it; a list with it switched off says nothing.
    useEffect(() => {
        if (value && value.installerOff !== true) setInstallerAnswered(value.installerMissing === undefined);
    }, [value]);
    const pickVersion = useCallback(
        (name: string, version: string): void =>
            setVersions((current) => ({ ...current, [name]: version })),
        [],
    );

    const loadDetail = detail.load;
    const openDetail = useCallback(
        (id: DatapackId, store: DatapackStoreName): void => {
            setSelected(id);
            setSelectedStore(store);
            loadDetail({ datapackName: id.name, version: id.version, store });
        },
        [loadDetail],
    );
    const closeDetail = useCallback((): void => setSelected(undefined), []);
    // Removing your own library pack closes its flyout and re-reads the catalog.
    const removedFromLibrary = useCallback((): void => {
        setSelected(undefined);
        refresh();
    }, [refresh]);

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
        if (commerceInstance) {
            loadInstalled({ commerceInstance });
        }
    }, [loadProjectContext, loadInstalled, commerceInstance]);

    /**
     * The held pack's actions (`useHeldPack`): "Save store changes to this pack" and "Save from
     * this store" (steps 05 and 14), and its one Admin step (step 12). Closing a save's progress
     * window reads the catalog and the project again, since the library now holds a new version.
     */
    const afterSave = useCallback((): void => {
        loadProjectContext({});
        refresh();
    }, [loadProjectContext, refresh]);
    const heldPack = useHeldPack({
        selected,
        selectedStore,
        held: projectContext.value?.datapack,
        engine: value?.engine,
        detail: detail.value?.detail,
        detailLoading: detail.loading,
        onSaved: afterSave,
    });

    const retryDetail = useCallback((): void => {
        if (selected) {
            loadDetail({ datapackName: selected.name, version: selected.version, store: selectedStore });
        }
    }, [loadDetail, selected, selectedStore]);

    // A rename shows on the card and in the flyout: both are read again once it lands.
    const renamePack = useCallback(
        async (id: DatapackId, name: string): Promise<string | null> => {
            const refused = await requestDatapackRename(id, name);
            if (refused === null) {
                refresh();
                retryDetail();
            }
            return refused;
        },
        [refresh, retryDetail],
    );

    // Sharing shows on the card (its Shared label) and in the flyout: both are read again.
    const sharingChanged = useCallback((): void => {
        refresh();
        retryDetail();
    }, [refresh, retryDetail]);

    // `!settled`, not `loading`. `loading` starts FALSE and the fetch is kicked
    // off from a useEffect, which React runs AFTER the first paint -- so frame 1
    // renders with nothing loading and nothing loaded, falls straight past this
    // guard, and shows the loaded view for one frame before the spinner arrives.
    // That is the blip reported 2026-08-20.
    //
    // `settled` (data !== null || error !== null) is false until something has
    // actually come back, which is the question this branch is asking. It also
    // behaves on every other path: a retry after failure clears `error` and
    // leaves `data` null, so it shows the loader again; a refresh after success
    // keeps `data`, so content stays put and `isRefreshing` carries the hint.
    if (!settled) {
        // Centred in the content column, under the header and tabs already drawn
        // there; centred across the whole window it sat far to their right
        // (2026-10-29).
        return (
            <FullScreenLoading message="Loading datapacks" withinContentColumn />
        );
    }

    if (failure) {
        return renderDataInstallerFailure(failure, refresh, {
            unreachableTitle: DATAPACKS_UNAVAILABLE,
        });
    }

    return (
        <>
            {/* No `Flex` wrapper around the header: the two surfaces that have
                one need it for trailing buttons, and this one has none to place. */}
            <FullScreenSurface
                header={
                    <SearchHeader
                        searchQuery={query}
                        onSearchQueryChange={setQuery}
                        searchPlaceholder="Filter datapacks"
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
                            <CatalogCountRow
                                includeCommunity={includeCommunity}
                                onIncludeCommunity={setIncludeCommunity}
                                {...(installerAnswered
                                    ? { installer: { on: includeInstaller !== false, onChange: setIncludeInstaller } }
                                    : {})}
                                onCatalogChanged={refresh}
                                engine={value?.engine}
                                onSaveFromStore={heldPack.saveFromStore}
                            />
                        }
                    />
                }
            >
                <DatapackSourceNotice page={value} />
                <DatapackCatalogGrid
                    groups={groups}
                    filtered={filtered}
                    query={query}
                    versions={versions}
                    pickVersion={pickVersion}
                    openDetail={openDetail}
                    installedPacks={installedPacks}
                />
            </FullScreenSurface>

            <DatapackDetailPanel
                selected={selected}
                detail={detail.value?.detail ?? null}
                inventory={detail.value?.inventory ?? null}
                loading={detail.loading}
                failure={detail.failure}
                onClose={closeDetail}
                onRetry={retryDetail}
                onImport={openImport}
                onRemoved={removedFromLibrary}
                installsFromLibrary={value?.engine === 'demo-builder'}
                onSaveStoreChanges={heldPack.offerSave}
                setupStep={heldPack.setupStepLine}
                onRename={renamePack}
                sharedInFile={detail.value?.sharedInFile}
                onSharingChanged={sharingChanged}
                settingsLayer={detail.value?.settingsLayer}
            />
            {heldPack.windows}

            {/* Only what the service HOLDS is importable — the inventory, never
                the pack's declared types. Mounted while `importing` is set, so
                closing it leaves the flyout behind it open. */}
            {importing && detail.value ? (
                <ImportDatapackModal
                    id={importing}
                    displayName={detail.value.detail.displayName}
                    availableTypes={detail.value.inventory.present}
                    source={selectedStore}
                    onClose={closeImport}
                />
            ) : null}
        </>
    );
}

/** What `get-datapack-import-target` reports about the open project. */
interface ProjectSampleData {
    projectName?: string;
    /** The Commerce instance this project writes to — scopes the installed list. */
    instance?: string;
    datapack?: ProjectDatapack;
}

/*
 * A `RecordedChoiceNotice` banner was previously rendered here and has been
 * replaced by the card's own check: a full-width bar reading "<project> is set up
 * for <pack> (main)" with a "Review and install" link.
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
