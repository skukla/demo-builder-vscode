/**
 * Labelled lines that scan as one small table: a muted label column and a value column
 * ("Where / Enter / Then / Why" in the setup guide).
 *
 * Extracted 2026-10-23 (EDS-64) from the setup guide's `.setup-guide-facts` when the
 * storefront report built the same list a second time with its own spacing and label
 * colour. The report window was removed the same day; the setup guide is its one user today.
 * The rules moved unchanged, in the same layer, to `core/ui/styles/fact-list.css`, which each
 * host bundle imports.
 *
 * @module core/ui/components/ui/FactList
 */

import React from 'react';

/** The list. Its children are {@link Fact}s, so a caller can leave out a line it lacks. */
export function FactList({ children }: { children: React.ReactNode }): React.ReactElement {
    return <dl className="fact-list">{children}</dl>;
}

export interface FactProps {
    label: string;
    /** The value. A line that lays it out differently (copy pills) wraps it in its own element. */
    children: React.ReactNode;
}

/** One labelled line. */
export function Fact({ label, children }: FactProps): React.ReactElement {
    return (
        <>
            <dt>{label}</dt>
            <dd>{children}</dd>
        </>
    );
}
