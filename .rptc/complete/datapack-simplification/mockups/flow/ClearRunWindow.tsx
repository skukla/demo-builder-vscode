/**
 * J1-3d: what pressing Clear shows. The house progress window (`ProgressDialog`): one row per data
 * type as the clear runs, then how it ended. A run with a problem ends where it ran (dialog design
 * rules): the rows stay, the problem sits on the row it is about as one short line saying what is
 * wrong and what to do, and the one action beside Close leads to where it is fixed.
 *
 * The problem shown is the list setting (owner, 2026-11-11): order cancellation reasons a SC changed
 * on the website, which Commerce's settings API cannot put back (`wipeSettings.ts`: a list "stays,
 * counted … Only 'Use Default Value' in the Admin restores it"). Open Commerce Admin goes through
 * the shared `commerceAdmin.ts` helper in the real build; here it does nothing.
 */

import React, { useEffect, useState } from 'react';
import type { WorkRowProps } from '@/core/ui/components/feedback/WorkRow';
import { ProgressDialog } from '@/core/ui/components/ui/ProgressDialog';

/** The types the clear works through, in the summary's order, with how many of each. */
const TYPES: Array<[string, number]> = [
    ['Products', 2_052], ['Categories', 42], ['Customers', 10], ['Companies', 9], ['Shared Catalogs', 3],
    ['Cart Rules', 1], ['Customer Groups', 3], ['Attribute Sets', 1], ['Website Settings', 7], ['Orders', 12],
];

/**
 * The one row that ends with a problem, and its line (owner, 2026-11-11). It takes the room the
 * working row's progress line held during the run, so the window keeps one height from first frame
 * to last; no closing sentence under the list. It must fit ONE line: a line that wraps takes room
 * nothing held (measured: "… Use Default Value in the Admin." wrapped and grew the window 19px).
 */
const PROBLEM = { type: 'Website Settings', note: "Order cancellation reasons couldn't be reset." };

/** "Removing 1,026 of 2,052": the working row's second line, halfway, as a real run would show it. */
const progress = (type: string, total: number): string => {
    const verb = type === 'Orders' ? 'Closing' : type === 'Website Settings' ? 'Resetting' : 'Removing';
    return `${verb} ${Math.ceil(total / 2).toLocaleString('en-US')} of ${total.toLocaleString('en-US')}`;
};

/** How long each type takes in the prototype: long enough to watch, short enough not to wait. */

/** The rows after `done` types. The problem's line waits for the end, when the progress line has gone. */
function rowsAt(done: number): WorkRowProps[] {
    const ended = done >= TYPES.length;
    return TYPES.map(([type, total], i) => {
        if (i > done) return { status: 'pending', label: type };
        if (i === done) return { status: 'checking', label: type, detail: progress(type, total) };
        if (type === PROBLEM.type) return { status: 'warning', label: type, ...(ended ? { note: PROBLEM.note } : {}) };
        return { status: 'success', label: type };
    });
}

export function ClearRunWindow({ project, onClose }: { project: string; onClose: () => void }): React.ReactElement {
    const [done, setDone] = useState(0);
    const ended = done >= TYPES.length;
    useEffect(() => {
        if (ended) return undefined;
        const t = setTimeout(() => setDone((n) => n + 1), window.__J1__.paceMs());
        return () => clearTimeout(t);
    }, [done, ended]);

    return (
        <ProgressDialog
            isOpen
            title={ended ? `${project} Demo Data Cleared` : `Clearing ${project} Demo Data`}
            rows={rowsAt(done)}
            status={ended ? 'warning' : undefined}
            action={{ label: 'Open Commerce Admin', onPress: () => undefined }}
            onClose={onClose}
        />
    );
}
