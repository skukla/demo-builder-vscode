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
 * **It loads everything once and filters what it holds** (`catalogShow.ts`, owner, 2026-11-05).
 * It used to ask again for Community only when switched on, to save fetching 17 developer rows of
 * 40, and every switch then showed its wait on the Refresh button. The Show list has nothing to
 * wait for.
 *
 * The filter is `matchesSearchFields`, not the `useSearchFilter` hook that wraps
 * it: the hook has zero consumers, its `Record<string, unknown>` constraint does
 * not admit an interface like `DatapackGroup`, and the two peers that filter
 * lists (`ProjectsDashboard`, `IntegrationsScreen`) both call the predicate
 * directly.
 *
 * @module features/data-installer/ui/views/DatapackCatalogView
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import type { CatalogPage, DataItemInventory, DatapackDetail, PackDetailLayer } from '../../types';
import { CatalogCountRow } from '../components/CatalogCountRow';
import type { HeaderSaveActions } from '../components/CatalogHeaderActions';
import { DatapackCatalogGrid } from '../components/DatapackCatalogGrid';
import { DatapackDetailPanel } from '../components/DatapackDetailPanel';
import { DatapackSourceNotice } from '../components/DatapackSourceNotice';
import { renderDataInstallerFailure } from '../dataInstallerFailure';
import { headerSave, heldInCatalogOf } from '../headerSave';
import { useCatalogShow } from '../hooks/useCatalogShow';
import type { ClearArrival } from '../hooks/useClearArrival';
import { useDataInstallerRequest } from '../hooks/useDataInstallerRequest';
import { useDatapackCatalog } from '../hooks/useDatapackCatalog';
import { requestDatapackRename, useDetailFlyout } from '../hooks/useDetailFlyout';
import { useHeldPack } from '../hooks/useHeldPack';
import { ImportWindowModal, ownedOf, useImportWindow } from '../hooks/useImportWindow';
import { useProjectHolding } from '../hooks/useProjectHolding';
import { installedPackProps } from '../installedPackProps';
import { FullScreenLoading } from '@/core/ui/components/feedback/FullScreenLoading';
import { FullScreenSurface } from '@/core/ui/components/layout/FullScreenSurface';
import { SearchHeader } from '@/core/ui/components/navigation/SearchHeader';
import type { DatapackId } from '@/types/datapack';

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
 * The name the open pack's card shows, for the flyout's title while its detail loads. By version:
 * a pack's versions can carry different names, and the first one's was shown (2026-11-05).
 */
function nameOnCard(page: CatalogPage | null, id: DatapackId | undefined): string | undefined {
    if (!id) return undefined;
    const rows = page?.items ?? [];
    const same = (row: (typeof rows)[number]): boolean => row.id.name === id.name;
    return (rows.find((row) => same(row) && row.id.version === id.version) ?? rows.find(same))?.displayName;
}

/** The SC's own datapacks in My Datapacks, by id. */
function mySavesIn(page: CatalogPage | null): DatapackId[] {
    return (page?.items ?? []).filter((row) => row.store === 'library' && row.mine === true).map((row) => row.id);
}

/**
 * @param library - the Datapack Library (owner, 2026-11-07): no project is read, no card wears the
 *   project's check, and nothing that acts on a store is offered (Import, the header's save button,
 *   Install from File, the Clear menu).
 * @param clearArrival - a Clear window the Command Palette asked for, which the header opens (P6-Q5)
 */
export function DatapackCatalogView({ library = false, clearArrival }: { library?: boolean; clearArrival?: ClearArrival } = {}): React.JSX.Element {
    const [query, setQuery] = useState('');
    const [versions, setVersions] = useState<Record<string, string>>({});

    // The one list: Demo Builder's datapack store, then the Data Installer's if it answers.
    // Set below, once the callbacks it needs exist: what a pack change also reads again (F66).
    const onPacksChanged = useRef<(() => void) | undefined>(undefined);
    const { refresh, loading, value, failure, settled, noticePage, dismissNoAccess } = useDatapackCatalog(onPacksChanged);
    const detail = useDataInstallerRequest<DatapackDetailResponse>('get-datapack-detail');
    const { held, installedAt, failed, installedPacks, projectAnswered, reloadProject, reloadHolding } = useProjectHolding(library);
    const { show, setShow, installerAnswered, shown, filtered, elsewhere, hideRemoved } = useCatalogShow({
        page: value,
        installedPacks,
        held,
        query,
        heldFirst: true,
    });

    // The file load asks about replacing only a version the SC's own datapacks hold (Clarity 1.15).
    const mySaves = useMemo(() => mySavesIn(value), [value]);

    const pickVersion = useCallback(
        (name: string, version: string): void =>
            setVersions((current) => ({ ...current, [name]: version })),
        [],
    );

    const loadDetail = detail.load;
    // The flyout's pack: the version its card showed, or the demo's own once known (F77).
    const flyout = useDetailFlyout({ load: loadDetail, held, versions, groups: shown });
    const { selected, selectedStore, open: openDetail, close: closeDetail } = flyout;
    // Removing your own library pack closes its flyout, takes its card off at once, and re-reads the
    // catalog, which confirms it.
    const removedFromLibrary = useCallback((): void => {
        if (selected) hideRemoved(selected);
        closeDetail();
        refresh();
    }, [selected, hideRemoved, closeDetail, refresh]);

    // The import modal is mounted HERE, not inside the flyout. As a child of the
    // Drawer it was a dialog nested in a drawer; `IntegrationsScreen` mounts its
    // flow modal beside the list and keeps its flyout view-only, and this follows
    // that. Closing the modal therefore leaves the flyout open behind it.
    // Fixed when it opens: nothing the flyout does afterwards closes it (walk F113).
    const owned = useMemo(() => ownedOf(value, held, installedAt), [value, held, installedAt]);
    const importWindow = useImportWindow(detail.value, selectedStore, owned);
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
    const closeWindow = importWindow.close;
    const closeImport = useCallback((): void => {
        closeWindow();
        reloadHolding();
    }, [closeWindow, reloadHolding]);

    /**
     * The held pack's actions (`useHeldPack`): the header's save button and its one Admin step
     * (step 12). A finished save reads the catalog and the project
     * again, since the library now holds a new version and the demo uses it.
     */
    const afterSave = useCallback((): void => {
        reloadProject();
        refresh();
    }, [reloadProject, refresh]);
    // The flyout waits for the project's first answer too: its main button and Uninstall hang on it,
    // and the flyout's save appeared on its own a moment after the other buttons (owner, 2026-11-09,
    // walk F92). The detail is held
    // back too: the panel shows a detail already on show whatever `loading` says.
    const flyoutLoading = detail.loading || !projectAnswered;
    const flyoutDetail = projectAnswered ? (detail.value?.detail ?? null) : null;
    const heldInCatalog = useMemo(() => heldInCatalogOf(value, held), [value, held]);
    const heldPack = useHeldPack({
        selected,
        held,
        detail: detail.value?.detail,
        heldInCatalog,
        detailLoading: flyoutLoading,
        ownNames: owned.ownNames,
        onSaved: afterSave,
    });

    // The header's save button, one state (step-04 S1): Create, Save ▾ or Save As New, each opening
    // its window (S2). None in the Datapack Library.
    const { create: createDatapack, saveDemo, saveDemoAsNew } = heldPack;
    const saveState = headerSave({ projectAnswered, catalogAnswered: settled, held, installedAt, heldInCatalog });
    const save = useMemo(
        (): HeaderSaveActions | undefined =>
            library ? undefined : { state: saveState, onCreate: createDatapack, onSave: saveDemo, onSaveAsNew: saveDemoAsNew },
        [library, saveState, createDatapack, saveDemo, saveDemoAsNew],
    );

    const retryDetail = useCallback((): void => {
        if (selected) {
            loadDetail({ datapackName: selected.name, version: selected.version, store: selectedStore });
        }
    }, [loadDetail, selected, selectedStore]);

    // Another Datapacks screen, or an agent, changed the packs (F66): the list reads itself again
    // (`useDatapackCatalog`), then this reads which pack the project holds, and the open pack's details.
    const packsChanged = useCallback((): void => {
        if (!library) reloadHolding();
        retryDetail();
    }, [library, reloadHolding, retryDetail]);
    onPacksChanged.current = packsChanged;

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

    // Sharing shows on the card (its Community tag) and in the flyout: both are read again.
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
                        totalCount={shown.length}
                        filteredCount={filtered.length}
                        itemNoun="datapack"
                        onRefresh={refresh}
                        isRefreshing={loading}
                        refreshAriaLabel="Refresh datapacks"
                        hasLoadedOnce={value !== null}
                        // Always: the Show list lives on this row, and an empty view is
                        // exactly when it must be reachable. Choosing one must not move the row.
                        alwaysShowCount
                        alwaysShowSearch
                        countTrailing={
                            <CatalogCountRow
                                show={show}
                                onShow={setShow}
                                installerAnswered={installerAnswered}
                                onCatalogChanged={refresh}
                                save={save}
                                mySaves={mySaves}
                                ownNames={owned.ownNames}
                                clearRequest={clearArrival?.request}
                                onClearRequestTaken={clearArrival?.taken}
                            />
                        }
                    />
                }
            >
                <DatapackSourceNotice page={noticePage} onDismiss={dismissNoAccess} />
                <DatapackCatalogGrid
                    groups={shown}
                    filtered={filtered}
                    show={show}
                    elsewhere={elsewhere}
                    onShow={setShow}
                    query={query}
                    versions={versions}
                    pickVersion={pickVersion}
                    openDetail={openDetail}
                    installedPacks={installedPacks}
                    held={held}
                    installedAt={installedAt}
                    heldFailed={failed !== undefined}
                />
            </FullScreenSurface>

            <DatapackDetailPanel
                selected={selected}
                selectedName={nameOnCard(value, selected)}
                detail={flyoutDetail}
                inventory={detail.value?.inventory ?? null}
                loading={flyoutLoading}
                failure={detail.failure}
                onClose={closeDetail}
                onRetry={retryDetail}
                onImport={library ? undefined : importWindow.open}
                onRemoved={removedFromLibrary}
                installerOn={value?.installerOn === true}
                setupStep={heldPack.setupStepLine}
                onRename={renamePack}
                sharedInFile={detail.value?.sharedInFile}
                onSharingChanged={sharingChanged}
                settingsLayer={detail.value?.settingsLayer}
                {...(flyout.undoTo ? { undoTo: flyout.undoTo } : {})}
                {...installedPackProps({ library, held, installedAt, selected, failed }, importWindow.openRemoval)}
            />
            {heldPack.windows}

            {/* Only what the service HOLDS is importable — the inventory, never
                the pack's declared types. Mounted while `importing` is set, so
                closing it leaves the flyout behind it open. */}
            {importWindow.window ? <ImportWindowModal opened={importWindow.window} onClose={closeImport} /> : null}
        </>
    );
}
