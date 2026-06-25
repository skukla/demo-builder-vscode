/**
 * BuildYourProjectSummary Component (v6 unified scaffold)
 *
 * The single persistent "Your project" summary column for the whole Build Your
 * Project step — the generalization of the Commerce-only `CommerceSummary`.
 * Renders a "Your project" title, a derived read-only Architecture line, then one
 * GROUP per area (Commerce / Storefront / Integrations), each with its heading and
 * rows. A row shows its value or a muted "Not set", with a ✓ when done+value.
 *
 * Presentational only — the per-area providers in `buildSummary.ts` compute the
 * architecture label + the visible groups from wizard state and pass them in.
 *
 * @module features/project-creation/ui/components/BuildYourProjectSummary
 */

import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import React from 'react';
import { cn } from '@/core/ui/utils/classNames';

/** A single summary row: a label, an optional value, and a done flag. */
export interface SummaryRow {
    /** Row label (e.g. "Backend"). */
    label: string;
    /** Display value; when absent a muted "Not set" placeholder is shown. */
    value?: string;
    /** Whether this row is complete (renders the ✓ via the `done` modifier). */
    done?: boolean;
}

/** A labeled group of summary rows (one per Build area). */
export interface SummaryGroup {
    /** Group heading (e.g. "Commerce"). */
    heading: string;
    /** The group's rows. */
    rows: SummaryRow[];
}

export interface BuildYourProjectSummaryProps {
    /**
     * Derived architecture label: the full label (e.g. "Edge Delivery + ACCS"),
     * "Frontend pending" when only the backend is chosen, or null → a pending
     * placeholder.
     */
    architectureLabel: string | null;
    /** The visible area groups, in order (Commerce, Storefront, Integrations). */
    groups: SummaryGroup[];
}

/** Placeholder shown when no architecture has been chosen yet. */
const ARCHITECTURE_PENDING = 'Architecture pending';

/** A single summary row. */
const Row: React.FC<{ row: SummaryRow }> = ({ row }) => {
    const isDone = Boolean(row.done && row.value);
    return (
        <div className={cn('sum-row', isDone && 'done')}>
            <span className="sum-rowlabel">
                {isDone && (
                    <CheckmarkCircle
                        size="XS"
                        UNSAFE_className="text-green-600 sum-check"
                        aria-hidden="true"
                    />
                )}
                <span className="sum-label">{row.label}</span>
            </span>
            {row.value ? (
                <span className="sum-value">{row.value}</span>
            ) : (
                <span className="sum-value empty">Not set</span>
            )}
        </div>
    );
};

/**
 * The persistent cross-area "Your project" summary column.
 *
 * @param props - the derived architecture label and the visible area groups
 * @returns the summary column element
 */
export const BuildYourProjectSummary: React.FC<BuildYourProjectSummaryProps> = ({
    architectureLabel,
    groups,
}) => (
    <>
        <div className="sum-title">Your project</div>
        <div className="sum-arch">
            {architectureLabel ?? <span className="empty">{ARCHITECTURE_PENDING}</span>}
        </div>
        {groups.map(group => (
            <React.Fragment key={group.heading}>
                <div className="sum-group-h">{group.heading}</div>
                {group.rows.map(row => (
                    <Row key={row.label} row={row} />
                ))}
            </React.Fragment>
        ))}
    </>
);
