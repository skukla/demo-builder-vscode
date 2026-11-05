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
    /**
     * Show the Adobe project alone. The Integrations screen: since AB-23 each
     * integration runs in a workspace of its own that the SC never picks, so a
     * workspace on that line is plumbing — and, for any integration, the wrong one.
     */
    projectOnly?: boolean;
    /** Change action. Omit to render the destination read-only. */
    onChange?: () => void;
    /** Extra class on the wrapper — lets a host pick inline vs full-width. */
    className?: string;
    /**
     * Shown when there is no project yet, with the action reading "Choose". Omit to
     * render nothing then, as every host but the Integrations screen wants.
     */
    unsetLabel?: string;
}

/**
 * What the line is, before it: the Console's own term, so "Kukla ACO test" reads as an Adobe
 * project and not the SC's demo (owner, 2026-11-05). Every host shows it, in one style.
 */
export const DESTINATION_LABEL = 'Adobe Project';

/**
 * Render "Adobe Project  {project}" with an optional `Change` action, and "Workspace
 * {workspace}" on a row under it unless `projectOnly`. Change sits on the first row and covers
 * both: it opens the picker for the project and then its workspace. Its own small grid rather
 * than `ui/FactList`, which has no third column for Change and reaches only the bundles that
 * import `fact-list.css`, the wizard not among them.
 *
 * @param props - the destination parts and the optional change action
 * @returns the line, or null when either half is missing (a half-known
 *          destination is worse than none — it reads as complete)
 */
export function DestinationContext({
    project,
    workspace,
    projectOnly,
    onChange,
    className,
    unsetLabel,
}: DestinationContextProps): React.ReactElement | null {
    const isUnset = !project || (!projectOnly && !workspace);
    if (isUnset && !unsetLabel) return null;
    if (isUnset) {
        return (
            <span className={cn('dest-context', className)}>
                <span className="dest-context-label">{DESTINATION_LABEL}</span>
                <span className="dest-context-value">{unsetLabel}</span>
                {onChange ? (
                    <button type="button" className="inline-action-link" onClick={onChange}>
                        Choose
                    </button>
                ) : null}
            </span>
        );
    }
    return (
        <span className={cn('dest-context', !projectOnly && 'dest-context--rows', className)}>
            <span className="dest-context-label">{DESTINATION_LABEL}</span>
            <span className="dest-context-value">{project}</span>
            {onChange ? (
                /* `.inline-action-link` (utilities.css), NOT EDS's
                   `.service-action-link` — that class lives in connect-services.css and
                   reaches only the wizard bundle. Stays a <button>: it performs an
                   action, so the role must not become "link". */
                <button type="button" className="inline-action-link" onClick={onChange}>
                    Change
                </button>
            ) : null}
            {!projectOnly ? (
                <>
                    {/* A row's own: without Change above, the grid's third cell is simply empty. */}
                    <span className="dest-context-label dest-context-row-start">Workspace</span>
                    <span className="dest-context-value">{workspace}</span>
                </>
            ) : null}
        </span>
    );
}
