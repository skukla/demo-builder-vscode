/**
 * SetupStatus — "Demo setup · 3 of 7 done" on an integration's card and row while its demo
 * setup has steps open (AB-26x), so the SC sees there is Commerce Admin work left without
 * opening the flyout. Nothing once every step is done or skipped.
 *
 * A quiet link in the accent colour, no status dot (owner, 2026-10-01: grey text is easy
 * to miss, and a dot read like an alarm beside the deploy status). It opens the setup
 * guide directly — the action the line is asking for. Its own line, not a badge in the
 * card's head: a badge there squeezed the card's name to "Northwind E…" (seen in the
 * harness, 2026-09-27). Shared by `IntegrationCard` and `IntegrationRow`, the two faces of
 * one model, so the grid and list views cannot disagree.
 *
 * @module core/ui/components/integrations/SetupStatus
 */

import React from 'react';
import type { CardAction, IntegrationCardModel } from './integrationCardModel.types';
import { isLeftToDo } from './setupLeftToDo';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';

/**
 * The one-line summary, shared with the flyout's Demo setup section. A dismissed step is
 * out of the count: the SC decided it does not apply to this demo. So is an optional step
 * until it is done (`isLeftToDo`).
 *
 * @param items - the checklist
 * @returns e.g. "1 of 2 done", or "All done" when nothing is left open
 */
export function setupSummary(items: SetupChecklistItem[]): string {
    const open = items.filter(isLeftToDo).length;
    const done = items.filter((item) => item.state === 'done').length;
    return open === 0 ? 'All done' : `${done} of ${open + done} done`;
}

/** "Demo setup · N of M done", or undefined when nothing is left. */
export function setupStatusText(model: IntegrationCardModel): string | undefined {
    const items = model.setupChecklist ?? [];
    if (!items.some(isLeftToDo)) return undefined;
    return `Demo setup · ${setupSummary(items)}`;
}

export interface SetupStatusProps {
    model: IntegrationCardModel;
    /** The host's action switch; the line sends `'setup-guide'`. */
    onAction: (model: IntegrationCardModel, action: CardAction) => void;
}

/**
 * Its class is fixed, not a prop: a passed-in className is one this repo's cross-bundle
 * stylesheet check cannot read (the `SteadyHeight` note says the same).
 *
 * @param props - the card model and the host's action switch
 * @returns the line, or null
 */
export function SetupStatus({ model, onAction }: SetupStatusProps): React.ReactElement | null {
    const text = setupStatusText(model);
    if (!text) return null;
    return (
        <button
            type="button"
            className="integration-card-setup"
            onClick={(event) => {
                // The card itself opens the flyout; this line opens the guide instead.
                event.stopPropagation();
                onAction(model, 'setup-guide');
            }}
            // Enter/Space on the line must not also reach the card's own key handler.
            onKeyDown={(event) => event.stopPropagation()}
        >
            {text}
        </button>
    );
}
