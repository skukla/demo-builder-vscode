/**
 * CommerceSummary Component (v6 Commerce slice)
 *
 * The right-hand persistent summary column, mirroring the prototype
 * renderSummary() but scoped to what this slice fills (Commerce). Renders a
 * "Your project" title, a derived read-only Architecture line (the full stack
 * label, "Frontend pending" when only the backend is chosen, or an
 * "Architecture pending" placeholder when nothing is chosen), then a "Commerce"
 * group of rows — each showing its value or a muted "Not set", with a ✓ when done.
 *
 * Presentational only — Batch B computes the architecture label and the row list
 * from wizard state and passes them in. The row list is designed so the later
 * Storefront / Integrations groups can be appended without changing this contract.
 *
 * @module features/project-creation/ui/components/CommerceSummary
 */

import React from 'react';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
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

export interface CommerceSummaryProps {
    /**
     * Derived architecture label: the full label (e.g. "Edge Delivery + ACCS"),
     * "Frontend pending" when only the backend is chosen, or null → a pending
     * placeholder.
     */
    architectureLabel: string | null;
    /** The Commerce group rows (Backend, Sign-in?, Connection, Business, Catalog). */
    rows: SummaryRow[];
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
 * The persistent Commerce summary column.
 *
 * @param props - the derived architecture label and the Commerce rows
 * @returns the summary column element
 */
export const CommerceSummary: React.FC<CommerceSummaryProps> = ({ architectureLabel, rows }) => (
    <>
        <div className="sum-title">Your project</div>
        <div className="sum-arch">
            {architectureLabel ?? <span className="empty">{ARCHITECTURE_PENDING}</span>}
        </div>
        <div className="sum-group-h">Commerce</div>
        {rows.map(row => (
            <Row key={row.label} row={row} />
        ))}
    </>
);
