/**
 * The two building blocks every dashboard row shares: the labelled row itself
 * and the remedy tile that wears a dot when its fix is due.
 */
import React from 'react';
import { DashboardTile } from './DashboardTile';

/**
 * One labelled row. The heading is what makes four rows read as four jobs; the
 * `data-zone` hook is what tests and styling key on.
 */
export function DashboardZone({
    id,
    title,
    children,
}: {
    id: string;
    title: string;
    children: React.ReactNode;
}): React.ReactElement {
    return (
        <section className="dashboard-zone-section" data-zone={id} aria-label={title}>
            <h2 className="dashboard-zone-heading">{title}</h2>
            <div className="dashboard-zone-grid">{children}</div>
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
    onPress,
}: {
    label: string;
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
            action={testId}
            tooltip={idleTooltip}
            status={needed ? { variant: 'warning', tooltip, testId: `${testId}-dot` } : undefined}
        />
    );
}

