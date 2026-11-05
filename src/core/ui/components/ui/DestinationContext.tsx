/**
 * DestinationContext — the Adobe deploy destination as a line, with a Change action.
 *
 * Extracted from `AddIntegrationFlowModal`'s local copy when the Integrations page
 * gained the same control (2026-08-07). Two real consumers now shape the
 * interface, which is what the display pass was waiting for before extracting.
 *
 * The destination is PROJECT-scoped — one Adobe project for every integration — so this
 * renders one line for the whole surface, never per card.
 *
 * @module core/ui/components/ui/DestinationContext
 */

import React from 'react';
import { cn } from '@/core/ui/utils/classNames';

export interface DestinationContextProps {
    /** Adobe project display name. */
    project?: string;
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
 * Render "Adobe Project  {project}" with an optional `Change` action, which opens the picker for
 * the project and then its workspace.
 *
 * No workspace, on any host (owner, 2026-11-05). Every integration, the wizard's included, gets a
 * workspace of its own when it is added (`appBuilderAddRun.ts`, `ensureComponentWorkspace`), so
 * the project's workspace is not where it goes; only a mesh uses that one, and the Review step
 * lists it.
 *
 * @param props - the project and the optional change action
 * @returns the line, or null when there is no project and no `unsetLabel`
 */
export function DestinationContext({
    project,
    onChange,
    className,
    unsetLabel,
}: DestinationContextProps): React.ReactElement | null {
    if (!project && !unsetLabel) return null;
    if (!project) {
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
        <span className={cn('dest-context', className)}>
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
        </span>
    );
}
