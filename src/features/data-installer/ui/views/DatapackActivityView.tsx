/**
 * The service's own request log.
 *
 * Paged by a "Load 50 more" button, deliberately NOT by a pagination component:
 * the repo has none, one consumer does not justify inventing one, and this is a
 * feed — nobody asks for page 7 of an activity log. The button ACCUMULATES, so
 * the accumulator is the piece with the real complexity here.
 *
 * Two rules the accumulator has to hold at once, both pinned by tests:
 *   - "load more" APPENDS; replacing the list loses every row above the fold,
 *     which reads as the log emptying itself
 *   - changing the filter RESETS it; a new query must not inherit the old
 *     mode's rows
 *
 * `scenario` is rendered verbatim and never narrowed. The documented enum
 * (`SINGLE_DB`, `ENTIRE_DB`, …) does not match live data, which sends
 * `DATAPACK_ALL_ITEMS` / `DATAPACK_SPECIFIC_ITEMS`, so a mapping table would
 * blank exactly the values that occur.
 *
 * No table. `docs/development/ui-patterns.md` has no table component and neither
 * does `core/ui`; rows carry four short facts, which a table's chrome would cost
 * more than it organised.
 *
 * @module features/data-installer/ui/views/DatapackActivityView
 */

import { Button, Flex, Item, Picker, View } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ActivityEntry, OperationMode, Page } from '../../types';
import { renderDataInstallerFailure } from '../dataInstallerFailure';
import { useDataInstallerRequest } from '../hooks/useDataInstallerRequest';
import { EmptyState } from '@/core/ui/components/feedback/EmptyState';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { FullScreenSurface } from '@/core/ui/components/layout/FullScreenSurface';

/** One page of the log. Matches the button's label, so both move together. */
const PAGE_SIZE = 50;

/** The filter's "no filter" key. Not '' — Spectrum treats that as no selection. */
const ALL_MODES = 'all';

/** Modes the log can be filtered to, in the order the service processes them. */
const MODES: OperationMode[] = ['import', 'export', 'delete', 'validate'];

/**
 * Filter options as ONE array.
 *
 * Not a static `<Item>` followed by a mapped array. React namespaces the NESTED
 * ARRAY, so it is the MAPPED children that come out mangled while the
 * hand-written sibling is fine — measured with `React.Children.toArray`:
 *
 *   mixed:  ['.$all', '.1:$import', '.1:$export']   ← the mapped pair breaks
 *   single: ['.$all', '.$import',   '.$export']     ← all clean
 *
 * The test mock's `getOriginalKey` decodes `.$key` and `.key` only, so
 * `.1:$import` survives as the literal string `1:$import`; selecting `import`
 * then matches no option and the change event fires with `''`. Mapping once over
 * one array keeps every key intact.
 *
 * Scoped claim: this is React's key namespacing plus the MOCK's decoder, both
 * measured. Whether real Spectrum's collection builder mangles it the same way
 * is NOT verified — the bug was seen in tests, never at runtime.
 */
const MODE_OPTIONS: { key: string; label: string }[] = [
    { key: ALL_MODES, label: 'All operations' },
    ...MODES.map((mode) => ({ key: mode, label: mode })),
];

export function DatapackActivityView(): React.JSX.Element {
    const [mode, setMode] = useState<string>(ALL_MODES);
    const [entries, setEntries] = useState<ActivityEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [hasLoaded, setHasLoaded] = useState(false);

    const { load, loading, value, failure, settled } =
        useDataInstallerRequest<Page<ActivityEntry>>('get-datapack-activity');

    /**
     * The skip we ASKED for, which decides append vs replace.
     *
     * Read from here rather than from `value.skip`: `Page.skip` is optional and
     * the service does not reliably echo it, so keying on the response made every
     * page look like a first page and "load more" replaced the feed instead of
     * extending it. What we requested is something we always know.
     */
    const requestedSkipRef = useRef(0);

    /**
     * The project's Commerce instance — what this log is scoped TO.
     *
     * Unscoped, this view is the SERVICE's log: every run against every instance
     * anyone has used (121 `bodea` runs across 10 instances in one 1,000-row
     * sample). A fine diagnostic for the service, useless for "did MY import
     * work". Nothing new was needed — `logs` has always accepted
     * `commerce_instance`, and the panel already resolves this for its banner.
     */
    const target = useDataInstallerRequest<{ instance?: string }>('get-datapack-import-target');
    const loadTarget = target.load;
    useEffect(() => {
        loadTarget({});
    }, [loadTarget]);

    const commerceInstance = target.value?.instance;
    const targetSettled = target.settled;

    // Accumulate. `value` is the LAST page, so appending on each new page is what
    // turns a sequence of pages into the feed the user sees.
    useEffect(() => {
        if (!value) {
            return;
        }
        setTotal(value.total ?? value.count);
        setHasLoaded(true);
        setEntries((current) =>
            requestedSkipRef.current > 0 ? [...current, ...value.items] : value.items,
        );
    }, [value]);

    const query = useCallback(
        (skip: number, operationMode: string): void => {
            if (!commerceInstance) {
                return;
            }
            requestedSkipRef.current = skip;
            load({
                limit: PAGE_SIZE,
                skip,
                commerceInstance,
                ...(operationMode === ALL_MODES ? {} : { operationMode }),
            });
        },
        [load, commerceInstance],
    );

    // First page, and a fresh first page whenever the filter changes. The reset
    // lives here rather than in the change handler so both entry points agree.
    //
    // `hasLoaded` is NOT reset: it means "this view has rendered content once",
    // and clearing it sent the whole screen back to the full-block loading state
    // on every filter change — taking the filter control with it, so the user
    // could not pick again while it loaded. The chrome stays; only the body waits.
    useEffect(() => {
        setEntries([]);
        query(0, mode);
    }, [query, mode, commerceInstance]);

    const loadMore = useCallback((): void => query(entries.length, mode), [query, entries, mode]);

    // A target lookup that FAILED is not "no project open" — it is the same
    // refusal every other request can hit (signed out, not configured), and
    // saying "open a project" would send the user to fix the wrong thing.
    if (target.failure) {
        return renderDataInstallerFailure(target.failure, () => loadTarget({}));
    }

    // No instance, nothing to scope to. Falling back to the global log would hand
    // back exactly the surface this scoping removes, so it says so instead.
    if (targetSettled && !commerceInstance) {
        return (
            <EmptyState
                title="No project open"
                description="Open a project to see the sample-data runs on its Commerce instance."
            />
        );
    }

    // `!targetSettled` counts as loading. Without it the view renders "No
    // activity yet" for the length of the target lookup — a false empty, and the
    // exact failure mode this feature exists to remove.
    if ((loading || !targetSettled) && !hasLoaded) {
        // Centered in the full viewport — IntegrationsScreen's exact gate shape
        // (its comment records why not CenteredFeedbackContainer: that takes a
        // FIXED DimensionValue and cannot express "fill this screen").
        return (
            <View height="100vh">
                <Flex justifyContent="center" alignItems="center" height="100%">
                    <LoadingDisplay size="L" message="Loading activity..." />
                </Flex>
            </View>
        );
    }

    if (failure) {
        return renderDataInstallerFailure(failure, () => query(0, mode));
    }

    return (
        <>
            <FullScreenSurface
                header={
                    <div className="datapack-activity-filters">
                        <Picker
                            aria-label="Filter by operation"
                            selectedKey={mode}
                            onSelectionChange={(key) => setMode(String(key))}
                        >
                            {MODE_OPTIONS.map((option) => (
                                <Item key={option.key}>{option.label}</Item>
                            ))}
                        </Picker>
                        <span className="datapack-activity-count">
                            {entries.length} of {total}
                        </span>
                    </div>
                }
            >
                {renderActivityBody({ loading, settled, entries, total, loadMore })}
            </FullScreenSurface>
        </>
    );
}

/**
 * Pick the one body state to show under the filter.
 *
 * An extracted helper rather than chained ternaries in JSX: nested ternaries are
 * on the project's HIGH-priority avoid list, and the sibling view
 * (`DatapackCatalogView`) already solves the identical problem this way. An
 * `InstalledDatapacksView` was a third sibling until it was retired — it listed
 * the service's global self-report across every instance, which can call a pack
 * absent while its data sits on the box.
 */
function renderActivityBody({
    loading,
    settled,
    entries,
    total,
    loadMore,
}: {
    loading: boolean;
    settled: boolean;
    entries: ActivityEntry[];
    total: number;
    loadMore: () => void;
}): React.JSX.Element {
    // `!settled` covers the FIRST frame, which `loading` cannot: `loading` starts
    // false and the fetch runs from a useEffect, i.e. after the first paint. This
    // branch used to read `loading && entries.length === 0`, so frame 1 fell
    // through to the EmptyState below and stated "No activity yet" before anything
    // had been asked. `loading` is kept for the append case, where entries already
    // exist and more are on the way.
    if (!settled || (loading && entries.length === 0)) {
        // Inline, under the filter that is still on screen — not the full-block
        // takeover, which would remove it.
        return <LoadingDisplay size="M" message="Loading activity..." />;
    }
    if (entries.length === 0) {
        return (
            <EmptyState
                title="No activity yet"
                description="The Data Installer has logged no requests matching this filter."
            />
        );
    }
    return (
        <>
            <div className="datapack-row-list">
                {entries.map((entry, index) => (
                    <ActivityRow key={rowKey(entry, index)} entry={entry} />
                ))}
            </div>
            {entries.length < total ? (
                <div className="datapack-activity-more">
                    <Button variant="secondary" onPress={loadMore} isDisabled={loading}>
                        Load {PAGE_SIZE} more
                    </Button>
                </div>
            ) : null}
        </>
    );
}

/** One logged request. */
function ActivityRow({ entry }: { entry: ActivityEntry }): React.JSX.Element {
    return (
        <div className="datapack-row" data-testid="activity-row">
            <div className="datapack-row-main">
                <span className="datapack-row-title">{entry.id.name}</span>
                <span className="datapack-row-version">{entry.id.version}</span>
                {entry.mode ? <span className="datapack-row-mode">{entry.mode}</span> : null}
            </div>
            <div className="datapack-row-meta">
                {entry.commerceInstance ? (
                    <span className="datapack-row-instance">{entry.commerceInstance}</span>
                ) : null}
                <span>{entry.dataTypes.length} data types</span>
                {/* Verbatim: the documented enum does not match live values. */}
                {entry.scenario ? <span>{entry.scenario}</span> : null}
                {entry.at ? <span>{formatDateTime(entry.at)}</span> : null}
            </div>
        </div>
    );
}

/**
 * A stable React key.
 *
 * The index rides along because the log legitimately holds repeats: the same
 * pack, mode and instance re-run at different times, and `at` is optional — so
 * the fields alone cannot be assumed unique. Safe here because the list only ever
 * grows at the end (append), never reorders.
 */
function rowKey(entry: ActivityEntry, index: number): string {
    return `${index}:${entry.id.name}:${entry.id.version}:${entry.at ?? ''}`;
}

/** ISO timestamp → a local date and time (see DatapackDetailPanel for why). */
function formatDateTime(iso: string): string {
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? iso : parsed.toLocaleString();
}
