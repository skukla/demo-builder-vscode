/**
 * StepAreaShell Component
 *
 * The [rail strip / dedicated view] shell: an all-caps area label and (optionally) a
 * {@link StepRail} across the top, then the active view below, wrapped in a keyed
 * element so it crossfades when the active step changes.
 *
 * Extracted because four surfaces render it — the wizard's Commerce, Storefront and
 * Integrations areas, and the Configure screen. It was hand-inlined at the first three;
 * Configure was the fourth, which is well past the Rule of Three.
 *
 * The class names (`.commerce-body`, `.step-nav`, `.step-view`) are historical — they
 * date from when this was Commerce-only and a left rail. They are kept because the CSS
 * and several test harnesses query them, and renaming them would churn the wizard's
 * visual surface for no gain.
 *
 * @module core/ui/components/layout/StepAreaShell
 */

import React from 'react';
import { cn } from '@/core/ui/utils/classNames';

export interface StepAreaShellProps {
    /** Small all-caps label naming the area being configured (e.g. "Commerce"). */
    areaLabel: string;
    /** The step rail. Omit for an area with a single view (Integrations). */
    rail?: React.ReactNode;
    /**
     * Remount key for the view. Changing it throws the view away and builds a new one,
     * which is what replays the crossfade. Omit for a view that never swaps.
     */
    viewKey?: string;
    /** Extra classes on the animated view wrapper, appended after `step-view-anim`. */
    viewClassName?: string;
    /** The active view's body. */
    children: React.ReactNode;
}

/**
 * Render the area shell.
 *
 * @param props - the area label, optional rail, optional remount key and the body
 * @returns the shell element
 */
export function StepAreaShell({
    areaLabel,
    rail,
    viewKey,
    viewClassName,
    children,
}: StepAreaShellProps): React.ReactElement {
    return (
        <div className="commerce-body">
            <div className="step-nav">
                <div className="step-nav-area">{areaLabel}</div>
                {rail}
            </div>
            <div className="step-view">
                <div className={cn('step-view-anim', viewClassName)} key={viewKey}>
                    {children}
                </div>
            </div>
        </div>
    );
}
