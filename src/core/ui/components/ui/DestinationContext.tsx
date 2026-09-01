/**
 * DestinationContext — the Adobe deploy destination as a line, with a Change action.
 *
 * Extracted from `AddIntegrationFlowModal`'s local copy when the Integrations page
 * gained the same control (2026-08-07). Two real consumers now shape the
 * interface, which is what the display pass was waiting for before extracting.
 *
 * The destination is PROJECT-scoped — one Adobe project/workspace for every
 * integration — so this renders one line for the whole surface, never per card.
 *
 * @module core/ui/components/ui/DestinationContext
 */

import React from 'react';
import { cn } from '@/core/ui/utils/classNames';

export interface DestinationContextProps {
    /** Adobe project display name. */
    project?: string;
    /** Adobe workspace display name. */
    workspace?: string;
    /** Change action. Omit to render the destination read-only. */
    onChange?: () => void;
    /** Extra class on the wrapper — lets a host pick inline vs full-width. */
    className?: string;
}

/**
 * Render `{project} · {workspace}` with an optional `Change` action.
 *
 * @param props - the destination parts and the optional change action
 * @returns the line, or null when either half is missing (a half-known
 *          destination is worse than none — it reads as complete)
 */
export function DestinationContext({
    project,
    workspace,
    onChange,
    className,
}: DestinationContextProps): React.ReactElement | null {
    if (!project || !workspace) return null;
    return (
        <span className={cn('dest-context', className)}>
            <span className="dest-context-value">
                {project} · {workspace}
            </span>
            {onChange ? (
                /* `.inline-action-link` (custom-spectrum.css), NOT EDS's
                   `.service-action-link` — that class lives in connect-services.css and
                   reaches only the wizard bundle. Stays a <button>: it performs an
                   action, so the role must not become "link". */
                <button type="button" className="inline-action-link" onClick={onChange}>
                    Change
                </button>
            ) : null}
        </span>
    );
}
