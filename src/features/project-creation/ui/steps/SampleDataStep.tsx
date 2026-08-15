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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useActivateOnKey } from '@/core/ui/hooks/useActivateOnKey';
import { useVSCodeRequest } from '@/core/ui/hooks/useVSCodeRequest';
import {
    DatapackCard,
    groupDatapacks,
    pickDefaultVersion,
    type DatapackGroup,
    type DatapackSummary,
    type Page,
} from '@/features/data-installer';
import type { BaseStepProps } from '@/types/wizard';

export function SampleDataStep({ state, updateState }: BaseStepProps): React.JSX.Element {
    const { execute, error, data } = useVSCodeRequest<Page<DatapackSummary>>('find-datapacks');

    useEffect(() => {
        // Curated only: the community half of the catalog is developer scratch,
        // and this is a first-run choice, not a browsing surface.
        void execute({ includeCommunity: false });
    }, [execute]);

    const groups = useMemo(() => groupDatapacks(data?.items ?? []), [data]);
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
            <p className="sample-data-intro">
                Choose sample data to seed this project’s Commerce backend. Nothing is installed
                now — the dashboard offers it once the backend is reachable, because a full pack
                takes several minutes to import.
            </p>

            {error ? (
                <p className="sample-data-note">
                    The sample data catalog could not be loaded. You can still create this project
                    and choose sample data later from the dashboard.
                </p>
            ) : (
                <div className="sample-data-grid" role="radiogroup" aria-label="Sample data">
                    <NoSampleData isSelected={!chosen} onSelect={clear} />
                    {groups.map((group) => (
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
