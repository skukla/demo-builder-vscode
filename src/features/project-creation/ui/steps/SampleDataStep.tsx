/**
 * Sample Data — the Build-Your-Project area that RECORDS a datapack choice.
 *
 * **It does not import.** An import needs a Commerce instance that is reachable
 * with working credentials, and a full pack runs for minutes (measured
 * 2026-08-14: 74s for five types, 470s for a six-type reset). Neither fits
 * inside project creation, and a failure mid-wizard would leave a
 * half-populated instance the wizard has no story for. So this area stores the
 * choice on the project and the dashboard installs it afterwards, through the
 * import modal that is already verified end to end.
 *
 * Optional throughout: choosing nothing is a valid project, which is why the
 * area's status is unconditionally `completed` (see `buildYourProjectAreas`).
 *
 * The catalog comes from the Data Installer's own `find-datapacks` handler and
 * is folded with the SAME `groupDatapacks` / `pickDefaultVersion` the panel's
 * catalog uses — 40 rows for 25 names is not a list anyone can read, and a
 * second grouping rule here would be a second source of truth.
 *
 * @module features/project-creation/ui/steps/SampleDataStep
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import { useVSCodeRequest } from '@/core/ui/hooks/useVSCodeRequest';
import {
    groupDatapacks,
    pickDefaultVersion,
    type DatapackSummary,
    type Page,
} from '@/features/data-installer';
import type { BaseStepProps } from '@/types/wizard';

export function SampleDataStep({ state, updateState }: BaseStepProps): React.JSX.Element {
    const { execute, loading, error, data } = useVSCodeRequest<Page<DatapackSummary>>(
        'find-datapacks',
    );

    useEffect(() => {
        // Curated only: the community half of the catalog is developer scratch,
        // and this is a first-run choice, not a browsing surface.
        void execute({ includeCommunity: false });
    }, [execute]);

    const groups = useMemo(() => groupDatapacks(data?.items ?? []), [data]);
    const chosen = state.datapack;

    const choose = useCallback(
        (name?: string, version?: string): void => {
            updateState({ datapack: name && version ? { name, version } : undefined });
        },
        [updateState],
    );

    return (
        <div className="sample-data-area">
            <p className="sample-data-intro">
                Choose sample data to install into this project’s Commerce backend. Nothing is
                installed now — the dashboard offers it once the backend is reachable, because a
                full pack takes several minutes to import.
            </p>

            {loading ? <p className="sample-data-note">Loading available sample data…</p> : null}
            {error ? (
                <p className="sample-data-note">
                    The sample data catalog could not be loaded. You can still create this project
                    and choose sample data later from the dashboard.
                </p>
            ) : null}

            {groups.length > 0 ? (
                <div className="sample-data-options" role="radiogroup" aria-label="Sample data">
                    <SampleDataChoice
                        label="None"
                        description="Create this project without sample data."
                        isSelected={!chosen}
                        onSelect={() => choose()}
                    />
                    {groups.map((group) => {
                        const version = pickDefaultVersion(group);
                        return (
                            <SampleDataChoice
                                key={group.name}
                                label={group.displayName}
                                description={`Version ${version}`}
                                isSelected={chosen?.name === group.name}
                                onSelect={() => choose(group.name, version)}
                            />
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}

/**
 * One choice row.
 *
 * A `div` with `role="radio"` rather than a Spectrum control: the wizard uses
 * card-style selection throughout, and Spectrum's `Flex` caps width at 450px
 * which this band exceeds (root CLAUDE.md gotcha).
 */
function SampleDataChoice({
    label,
    description,
    isSelected,
    onSelect,
}: {
    label: string;
    description: string;
    isSelected: boolean;
    onSelect: () => void;
}): React.JSX.Element {
    return (
        <div
            role="radio"
            aria-checked={isSelected}
            aria-label={label}
            tabIndex={0}
            className={`sample-data-choice${isSelected ? ' is-selected' : ''}`}
            onClick={onSelect}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect();
                }
            }}
        >
            <span className="sample-data-choice-label">{label}</span>
            <span className="sample-data-choice-description">{description}</span>
        </div>
    );
}
