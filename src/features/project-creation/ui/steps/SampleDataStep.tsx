/**
 * Sample Data — the Commerce sub-step that RECORDS a datapack choice, shown as
 * "Datapacks".
 *
 * **The step itself does not import; creation does.** Since 8ab56b934 (2026-08-15)
 * the build installs the recorded pack after Connection has proven the instance and
 * Business Structure has chosen the scope (`executeSampleDataPhase`), and a failure
 * there is reported and never fails the build. This step only records the choice,
 * and the store that holds it.
 *
 * **A recorded pack it cannot list is said out loud** (step 07). An imported or
 * copied project arrives with a pack already recorded; when the catalog does not
 * list it, the step asks `check-recorded-datapack` and shows what creation will do
 * instead (the pack it was made from, or none), with one action to choose it now.
 *
 * **It is a Commerce sub-step, not an area.** A pack seeds the Commerce backend,
 * so it belongs beside the backend it targets. As an area it held one radio list
 * in an otherwise empty full-width body — and that body could never load,
 * because `find-datapacks` was registered only by the Data Installer panel's own
 * command and the wizard's map had no data-installer entry at all.
 *
 * **It shows the panel's grid, not a list of names.** A pack is a demo: brand
 * art, a version, a count of what it carries. `DatapackCard` already presents
 * that, so this reuses it rather than growing a second, poorer catalog. What it
 * does NOT reuse is the detail flyout — that needs `get-datapack-detail`
 * registered too, and the wizard keeps its handler surface at the single read it
 * needs. Here a card press chooses.
 *
 * **It has the panel's Show list** (`useCatalogShow`, owner, 2026-11-05): the catalog loads whole,
 * and the list opens on the same view. Recommended keeps the chosen pack, so a colleague's pack a
 * project arrived with, or a demo asks for, is on view.
 *
 * Optional throughout: choosing nothing is a valid project, which is why the
 * sub-step is never locked and never blocks Continue (see `commerceSections`).
 *
 * @module features/project-creation/ui/steps/SampleDataStep
 */

import { SearchField } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RecordedPackNotice, isListed, isPack } from './RecordedPackNotice';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import { useActivateOnKey } from '@/core/ui/hooks/useActivateOnKey';
import { cn } from '@/core/ui/utils/classNames';
import { pickDefaultVersion, type DatapackGroup } from '@/features/data-installer/services/datapackCatalog';
import { EMPTY_SHOW_TITLE, type CatalogShow, type ShowElsewhere } from '@/features/data-installer/ui/catalogShow';
import { CatalogShowPicker } from '@/features/data-installer/ui/components/CatalogShowPicker';
import { DatapackCard } from '@/features/data-installer/ui/components/DatapackCard';
import { ShowElsewhereNote } from '@/features/data-installer/ui/components/ShowElsewhereNote';
import { renderDataInstallerFailure } from '@/features/data-installer/ui/dataInstallerFailure';
import { useCatalogShow } from '@/features/data-installer/ui/hooks/useCatalogShow';
import { useDatapackCatalog } from '@/features/data-installer/ui/hooks/useDatapackCatalog';
import type { ProjectDatapack } from '@/types/datapack';
import type { BaseStepProps } from '@/types/wizard';

export function SampleDataStep({ state, updateState }: BaseStepProps): React.JSX.Element {
    const { refresh, value, failure, settled } = useDatapackCatalog();

    // The pack an added demo asks for (D26).
    const asked = state.demo?.datapack;
    // The pack the step OPENED with (an imported, copied or edited project's).
    const [arrived] = useState<ProjectDatapack | undefined>(() => state.datapack);

    /**
     * Filtered locally, because the service offers nothing else. Its
     * `datapack_name` is half of an IDENTITY — `(datapack_name, version)`, and
     * the docs are explicit that "a lookup by name alone has no answer" — so
     * there is no search endpoint to call. The catalog is 40 rows for 25 names
     * and already fetched whole, so a local filter is both possible and instant.
     */
    const [query, setQuery] = useState('');
    const chosen = state.datapack;
    // A settings layer is applied with its pack, never chosen as a demo (datapack-engine step 09).
    const arrivedNames = useMemo(() => new Set(arrived ? [arrived.name] : []), [arrived]);
    const { show, setShow, installerAnswered, groups, shown, filtered: visible, elsewhere } = useCatalogShow({
        page: value,
        installedPacks: arrivedNames,
        held: chosen,
        query,
        heldFirst: false,
    });
    const arrivedListed = useMemo(() => arrived !== undefined && isListed(groups, arrived), [groups, arrived]);
    const askedGroup = useMemo(
        () => (asked ? groups.find((group) => group.name === asked.name) : undefined),
        [groups, asked],
    );

    // Pre-select the demo's pack once the catalog is here and nothing is chosen yet.
    // A vanished version falls back to the default rule; the SC can change it.
    // Not in Edit: the project already chose, and "no datapack" is a choice. A
    // pre-select there would read as a change, and Finish would import a pack
    // nobody picked (PL-75).
    const askedName = asked?.name;
    const askedVersion = asked?.version;
    const chosenName = state.datapack?.name;
    const editing = state.wizardMode === 'edit';
    useEffect(() => {
        if (editing || !settled || !askedGroup || chosenName !== undefined) return;
        const version =
            askedVersion && askedGroup.versions.some((v) => v.id.version === askedVersion)
                ? askedVersion
                : pickDefaultVersion(askedGroup);
        if (version) updateState({ datapack: { name: askedGroup.name, version, store: askedGroup.store } });
    }, [editing, settled, askedGroup, askedName, askedVersion, chosenName, updateState]);

    const isChosen = useCallback((group: DatapackGroup): boolean => isPack(group, chosen), [chosen]);
    // Only while the project still holds the pack it arrived with: once the SC
    // chooses another, the note about the old one is no longer true of anything.
    const stillArrived = arrived !== undefined && chosen?.name === arrived.name && chosen.version === arrived.version;

    /**
     * Which version each card shows, for packs the user has not chosen.
     *
     * The card is fully controlled and the panel owns this the same way. Kept
     * apart from `state.datapack` on purpose: browsing a pack's versions must
     * not record a choice, only pressing the card does.
     */
    const [browsing, setBrowsing] = useState<Record<string, string>>({});

    const versionShown = useCallback(
        (group: DatapackGroup): string => {
            if (chosen && isChosen(group)) {
                return chosen.version;
            }
            return browsing[group.key] ?? pickDefaultVersion(group) ?? '';
        },
        [chosen, isChosen, browsing],
    );

    // The store is recorded with the pack: creation installs from it, and a copy or
    // an exported file of this project names it too.
    const chooseGroup = useCallback(
        (group: DatapackGroup): void => {
            const version = versionShown(group);
            updateState(version ? { datapack: { name: group.name, version, store: group.store } } : { datapack: undefined });
        },
        [updateState, versionShown],
    );

    const pickVersion = useCallback(
        (group: DatapackGroup, version: string): void => {
            setBrowsing((current) => ({ ...current, [group.key]: version }));
            // Re-record when this pack is the chosen one, so the recorded version
            // is always the one on show rather than the one chosen first.
            if (isChosen(group)) {
                updateState({ datapack: { name: group.name, version, store: group.store } });
            }
        },
        [isChosen, updateState],
    );
    const useInstead = useCallback((pack: ProjectDatapack): void => updateState({ datapack: pack }), [updateState]);

    const clear = useCallback((): void => updateState({ datapack: undefined }), [updateState]);

    return (
        <div className="sample-data-area">
            {failure ? (
                // The ONE failure treatment every Data Installer surface uses —
                // its own module warns that this is the shape that drifts when it
                // is copied, and a second copy was written here before this call
                // replaced it. `extraDetail` carries the only thing that is
                // genuinely wizard-specific: this sub-step never blocks Continue.
                //
                // The copy this replaced ended "choose sample data later from the
                // dashboard". That tile is hidden by the SAME predicate that
                // produces this refusal, so the sentence was false precisely when
                // it was shown.
                <CenteredFeedbackContainer>
                    {renderDataInstallerFailure(
                        failure,
                        refresh,
                        {
                            unreachableTitle: "Datapacks Aren't Available",
                            extraDetail: 'You can create this project without a datapack.',
                        },
                    )}
                </CenteredFeedbackContainer>
            ) : !settled ? (
                // `!settled`, not `loading`: `loading` starts false and the fetch
                // runs from a useEffect, i.e. after the first paint -- so frame 1
                // rendered the grid below for one frame before the loader appeared.
                // Reported as a blip 2026-08-20.
                // Not an empty grid. A None card over an empty grid states "there
                // is no sample data" for as long as the fetch takes — the same
                // false-empty this step showed for its whole broken life.
                //
                // CenteredFeedbackContainer is how every other footer'd wizard
                // body centres a loader (see SelectionStepContent). LoadingDisplay
                // alone top-aligns here: it centres via height:100%, and .step-view
                // above this is a padded block with no height for that to measure.
                <CenteredFeedbackContainer>
                    <LoadingDisplay
                        size="L"
                        message="Loading datapacks"
                    />
                </CenteredFeedbackContainer>
            ) : (
                <>
                    {arrived && stillArrived && !arrivedListed ? (
                        <RecordedPackNotice recorded={arrived} onUse={useInstead} />
                    ) : null}
                    <div className="sample-data-filters">
                        <SearchField
                            aria-label="Filter datapacks"
                            placeholder="Filter datapacks"
                            value={query}
                            onChange={setQuery}
                            width="100%"
                        />
                        <CatalogShowPicker show={show} onShow={setShow} installerAnswered={installerAnswered} />
                    </div>
                    {asked ? (
                        <p className="sample-data-note" data-testid="demo-datapack-note">
                            {askedGroup
                                ? `This demo asks for ${askedGroup.displayName}.${askedVersion && !askedGroup.versions.some((v) => v.id.version === askedVersion) ? ' That version is gone, so the default is selected.' : ''}`
                                : `This demo asks for ${asked.name}, which isn't shared yet. Ask the demo's owner to share it.`}
                        </p>
                    ) : null}
                    <div className="sample-data-grid" role="radiogroup" aria-label="Datapacks">
                        {/* None is the opt-out, not a catalog entry, so no query
                            hides it — filtering it away would leave the group with
                            nothing selectable exactly when the user wants nothing. */}
                        <NoSampleData isSelected={!chosen} onSelect={clear} />
                        {visible.map((group) => (
                        <DatapackCard
                            key={group.name}
                            group={group}
                            selectedVersion={versionShown(group)}
                            onVersionChange={(version) => pickVersion(group, version)}
                            // The press CHOOSES here; the panel's flyout is not
                            // reachable from the wizard by design.
                            onOpen={() => chooseGroup(group)}
                            selected={isChosen(group)}
                        />
                    ))}
                    </div>
                    {visible.length === 0 ? <NoMatchNote query={query} show={show} elsewhere={elsewhere} onShow={setShow} /> : null}
                    {groups.length > 0 && shown.length === 0 && EMPTY_SHOW_TITLE[show] ? (
                        <p className="sample-data-note">{EMPTY_SHOW_TITLE[show]}. Try All Datapacks.</p>
                    ) : null}
                    {settled && groups.length === 0 ? (
                        <p className="sample-data-note">No datapacks yet. You can add one after the project is created.</p>
                    ) : null}
                </>
            )}
        </div>
    );
}

/**
 * What the filter says when no card is left: where its matches are, under another Show choice
 * (Clarity 1.13), or that nothing matches at all. Nothing with no query.
 */
function NoMatchNote({ query, show, elsewhere, onShow }: {
    query: string;
    show: CatalogShow;
    elsewhere: ShowElsewhere | undefined;
    onShow: (show: CatalogShow) => void;
}): React.JSX.Element | null {
    if (elsewhere) {
        return (
            <div className="sample-data-note">
                <ShowElsewhereNote show={show} elsewhere={elsewhere} onShow={onShow} />
            </div>
        );
    }
    if (!query) return null;
    return <p className="sample-data-note">No datapacks match “{query}”.</p>;
}

/**
 * The "no sample data" choice, sized to sit in the grid beside the cards.
 *
 * A card of its own rather than a checkbox elsewhere: it is one option among
 * the packs, and a radio group whose only unselected-by-default state lives
 * outside the group reads as "nothing chosen yet" rather than as a decision.
 */
function NoSampleData({
    isSelected,
    onSelect,
}: {
    isSelected: boolean;
    onSelect: () => void;
}): React.JSX.Element {
    const handleKeyDown = useActivateOnKey(onSelect);

    return (
        <div
            role="radio"
            aria-checked={isSelected}
            aria-label="None"
            tabIndex={0}
            className={cn('sample-data-none', isSelected && 'is-selected')}
            onClick={onSelect}
            onKeyDown={handleKeyDown}
        >
            <span className="sample-data-none-label">None</span>
            <span className="sample-data-none-description">
                Create this project without a datapack.
            </span>
        </div>
    );
}
