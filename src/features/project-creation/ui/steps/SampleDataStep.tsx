/**
 * Sample Data — the Commerce sub-step that RECORDS a datapack choice.
 *
 * **It does not import.** An import needs a Commerce instance that is reachable
 * with working credentials, and a full pack runs for minutes (measured
 * 2026-08-14: 74s for five types, 470s for a six-type reset). Neither fits
 * inside project creation, and a failure mid-wizard would leave a
 * half-populated instance the wizard has no story for. So this stores the choice
 * on the project and the dashboard installs it afterwards, through the import
 * modal that is already verified end to end.
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
 * Optional throughout: choosing nothing is a valid project, which is why the
 * sub-step is never locked and never blocks Continue (see `commerceSections`).
 *
 * @module features/project-creation/ui/steps/SampleDataStep
 */

import { SearchField } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import { useActivateOnKey } from '@/core/ui/hooks/useActivateOnKey';
import { matchesSearchFields } from '@/core/ui/hooks/useSearchFilter';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import {
    DatapackCard,
    groupDatapacks,
    pickDefaultVersion,
    renderDataInstallerFailure,
    useDataInstallerRequest,
    type DatapackGroup,
    type DatapackSummary,
    type Page,
} from '@/features/data-installer';
import type { BaseStepProps } from '@/types/wizard';

/**
 * What a query is matched against — the id and the label, nothing else.
 *
 * The same two fields the panel's catalog uses. A second matching rule here
 * would be a second answer to "does this pack match".
 */
const SEARCH_FIELDS: ReadonlyArray<keyof DatapackGroup> = ['name', 'displayName'];

export function SampleDataStep({ state, updateState }: BaseStepProps): React.JSX.Element {
    // `useDataInstallerRequest`, never the raw `useVSCodeRequest`. A handler's
    // reply arrives WHOLE — `{success, data, error}` — so `data.items` off the raw
    // hook reads a field the envelope has not got, and a guard refusal comes back
    // looking exactly like a success. This step had both bugs: an empty list
    // forever, with no reason shown.
    const { load, value, failure, settled } = useDataInstallerRequest<Page<DatapackSummary>>(
        'find-datapacks',
    );

    useEffect(() => {
        // Curated only: the community half of the catalog is developer scratch,
        // and this is a first-run choice, not a browsing surface.
        load({ includeCommunity: false });
    }, [load]);

    const groups = useMemo(() => groupDatapacks(value?.items ?? []), [value]);

    /** Opens VS Code settings at the section the refusal names. */
    const openDataInstallerSettings = useCallback((): void => {
        webviewClient.postMessage('open-data-installer-settings');
    }, []);

    /**
     * Filtered locally, because the service offers nothing else. Its
     * `datapack_name` is half of an IDENTITY — `(datapack_name, version)`, and
     * the docs are explicit that "a lookup by name alone has no answer" — so
     * there is no search endpoint to call. The catalog is 40 rows for 25 names
     * and already fetched whole, so a local filter is both possible and instant.
     */
    const [query, setQuery] = useState('');
    const visible = useMemo(
        () => groups.filter((group) => matchesSearchFields(group, SEARCH_FIELDS, query)),
        [groups, query],
    );
    const chosen = state.datapack;

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
            if (chosen?.name === group.name) {
                return chosen.version;
            }
            return browsing[group.name] ?? pickDefaultVersion(group) ?? '';
        },
        [chosen, browsing],
    );

    const chooseGroup = useCallback(
        (group: DatapackGroup): void => {
            const version = versionShown(group);
            updateState(version ? { datapack: { name: group.name, version } } : { datapack: undefined });
        },
        [updateState, versionShown],
    );

    const pickVersion = useCallback(
        (group: DatapackGroup, version: string): void => {
            setBrowsing((current) => ({ ...current, [group.name]: version }));
            // Re-record when this pack is the chosen one, so the recorded version
            // is always the one on show rather than the one chosen first.
            if (chosen?.name === group.name) {
                updateState({ datapack: { name: group.name, version } });
            }
        },
        [chosen, updateState],
    );

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
                        () => load({ includeCommunity: false }),
                        {
                            onOpenSettings: openDataInstallerSettings,
                            extraDetail: 'You can create this project without sample data.',
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
                        message="Loading sample data..."
                        helperText="This should only take a moment"
                    />
                </CenteredFeedbackContainer>
            ) : (
                <>
                    <SearchField
                        aria-label="Filter sample data"
                        placeholder="Filter sample data..."
                        value={query}
                        onChange={setQuery}
                        width="100%"
                    />
                    <div className="sample-data-grid" role="radiogroup" aria-label="Sample data">
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
                            selected={chosen?.name === group.name}
                        />
                    ))}
                    </div>
                    {query && visible.length === 0 ? (
                        <p className="sample-data-note">
                            No sample data matches “{query}”.
                        </p>
                    ) : null}
                </>
            )}
        </div>
    );
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
            className={`sample-data-none${isSelected ? ' is-selected' : ''}`}
            onClick={onSelect}
            onKeyDown={handleKeyDown}
        >
            <span className="sample-data-none-label">None</span>
            <span className="sample-data-none-description">
                Create this project without sample data.
            </span>
        </div>
    );
}
