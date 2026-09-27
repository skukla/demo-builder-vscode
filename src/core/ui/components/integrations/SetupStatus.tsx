/**
 * SetupStatus — "Setup: 2 to do" on an integration's card and row while its demo setup has
 * steps open (AB-26x), so the SC sees there is Commerce Admin work left without opening the
 * flyout. Nothing once every step is done or skipped.
 *
 * A quiet status line — the to-do dot (yellow, as in the setup guide) and the words — not a
 * badge in the card's head: a badge there squeezed the card's name to "Northwind E…"
 * (seen in the harness, 2026-09-27). Shared by `IntegrationCard` and `IntegrationRow`, the
 * two faces of one model, so the grid and list views cannot disagree.
 *
 * @module core/ui/components/integrations/SetupStatus
 */

import React from 'react';
import type { IntegrationCardModel } from './integrationCardModel.types';
import { StatusDot } from '@/core/ui/components/ui/StatusDot';

/** "Setup: N to do", or undefined when nothing is left. */
export function setupStatusText(model: IntegrationCardModel): string | undefined {
    const open = (model.setupChecklist ?? []).filter((item) => item.state === 'open').length;
    return open > 0 ? `Setup: ${open} to do` : undefined;
}

/**
 * Its class is fixed, not a prop: a passed-in className is one this repo's cross-bundle
 * stylesheet check cannot read (the `SteadyHeight` note says the same).
 *
 * @param props - the card model
 * @returns the line, or null
 */
export function SetupStatus({ model }: { model: IntegrationCardModel }): React.ReactElement | null {
    const text = setupStatusText(model);
    if (!text) return null;
    return (
        <span className="integration-statusline integration-card-setup">
            <StatusDot variant="warning" size={6} />
            <span>{text}</span>
        </span>
    );
}
