/**
 * The two building blocks every dashboard row shares: the labelled row itself
 * and the remedy tile that wears a dot when its fix is due.
 */
import React from 'react';
import { DashboardTile } from './DashboardTile';

/**
 * One labelled group. The heading is what makes the groups read as separate
 * jobs; the `data-zone` hook is what tests and styling key on.
 *
 * `compact` renders the tiles as a short list of icon-beside-label rows: the
 * secondary tier under the Open cards, so eighteen actions stop reading as
 * eighteen equals. `aside` is a compact list placed beside the tiles, inside the
 * same group.
 */
export function DashboardZone({
    id,
    title,
    compact = false,
    aside,
    children,
}: {
    id: string;
    title: string;
    compact?: boolean;
    aside?: React.ReactNode;
    children: React.ReactNode;
}): React.ReactElement {
    return (
        <section
            className={compact ? 'dashboard-zone-section dashboard-zone-section--compact' : 'dashboard-zone-section'}
            data-zone={id}
            aria-label={title}
        >
            <h2 className="dashboard-zone-heading">{title}</h2>
            {compact ? (
                <div className="dashboard-zone-grid dashboard-compact-list">{children}</div>
            ) : (
                <div className="dashboard-zone-grid dashboard-card-row">
                    {children}
                    {aside ? <div className="dashboard-compact-list">{aside}</div> : null}
                </div>
            )}
        </section>
    );
}

/**
 * A remedy tile: the action that fixes a state, wearing a dot when it is needed.
 *
 * Replaces a StatusCard row placed inside the zone, which dangled off the end of
 * the tile row and broke the grid. What was missing was a tile to put the dot
 * on, because both remedies lived elsewhere — Republish Content in the More
 * overflow, Restart nowhere at all.
 *
 * The tile is PERMANENT and only the dot varies. A tile that appeared only when
 * something was wrong would make its own presence the status signal — the flaw
 * that got `Redeploy Mesh` removed from the project kebab — and would reshuffle
 * the grid as the user watched.
 */
export function RemedyTile({
    label,
    tooltip,
    idleTooltip,
    needed,
    icon,
    testId,
    description,
    onPress,
}: {
    label: string;
    /** The Open-row card's one-line "where this goes". */
    description?: string;
    /** Shown when the fix is due. */
    tooltip: string;
    /** Shown otherwise — never the bare label, which would say nothing. */
    idleTooltip: string;
    needed: boolean;
    icon: React.ReactNode;
    testId: string;
    onPress: () => void;
}): React.ReactElement {
    return (
        <DashboardTile
            label={label}
            icon={icon}
            onPress={onPress}
            description={description}
            action={testId}
            tooltip={idleTooltip}
            status={needed ? { variant: 'warning', tooltip, testId: `${testId}-dot` } : undefined}
        />
    );
}

