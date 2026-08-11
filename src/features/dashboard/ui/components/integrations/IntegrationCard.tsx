/**
 * IntegrationCard — one calm grid card (integrations grid, Step 4).
 *
 * Pure presentation over an {@link IntegrationCardModel}: name, status dot
 * (+ pulse while deploying) with label, a source line WHEN THERE IS ONE (the
 * mesh has no owner/repo and carries none), and AT MOST ONE face affordance
 * from `model.menuActions` — no face button. The card is dumb:
 *   - card click / Enter / Space → `onOpen(model.id)` (the ProjectCard
 *     div-card keyboard precedent)
 *   - every face affordance → `onAction(model, kind)` — including the
 *     deployed Open↗ link (the grid's handleAction maps 'open' to
 *     `openLiveSite`), wrapped in a stop-propagation containment span
 *     (InlineRenameField precedent) so a face press never opens the drawer
 *
 * The mesh peer card is visually IDENTICAL to an integration card — it is a
 * peer, identified by its name rather than chrome. Its behavioural asymmetry
 * (routing, actions, no rename) lives in integrationCardModel.ts.
 *
 * @module features/dashboard/ui/components/integrations/IntegrationCard
 */

import React, { useCallback } from 'react';
import { IntegrationActionsMenu } from './IntegrationActions';
import type { CardAction, IntegrationCardModel } from './integrationCardModel';
import { InlineRenameField } from '@/core/ui/components/forms';
import { StatusDot } from '@/core/ui/components/ui/StatusDot';
import { useActivateOnKey } from '@/core/ui/hooks/useActivateOnKey';
import { cn } from '@/core/ui/utils/classNames';

export interface IntegrationCardProps {
    /** Rename commit (renamable cards only): null on success, else an error string. */
    onRename: (id: string, name: string) => Promise<string | null>;
    /** The derived card model (integrationCardModel.ts — never raw entries). */
    model: IntegrationCardModel;
    /** Card body press → open this card's detail drawer. */
    onOpen: (id: string) => void;
    /** Face affordance press → the grid's single handleAction switch. */
    onAction: (model: IntegrationCardModel, action: CardAction) => void;
}

/** Face labels for the attention verbs (bar labels live on the model). */

/**
 * Kebab-menu rows, keyed by the CardAction the grid dispatches.
 *
 * `icon` names a concept in the SHARED vocabulary (`menuIcons`), so "open" here
 * is the same glyph as the project menu's "Open in Browser" by construction —
 * these two menus must not give one idea two icons.
 */
/** One integration (or mesh) card in the dashboard grid. */
export function IntegrationCard({
    model,
    onOpen,
    onAction,
    onRename,
}: IntegrationCardProps): React.ReactElement {
    const handleClick = useCallback((): void => onOpen(model.id), [model.id, onOpen]);

    const handleKeyDown = useActivateOnKey(handleClick);

    // Contain face presses: click/keydown must never bubble into the

    return (
        <div
            role="button"
            tabIndex={0}
            aria-label={`${model.name}, ${model.statusLabel}`}
            className="integration-card"
            onClick={handleClick}
            onKeyDown={handleKeyDown}
        >
            <div className="integration-card-head">
                {/* Rename in place, the ProjectCard treatment. The pencil reveals on
                    card hover; the name text stays click-transparent so a click still
                    opens the flyout (InlineRenameField contains only the pencil). */}
                {model.canRename ? (
                    <InlineRenameField
                        name={model.name}
                        onRename={(newName) => onRename(model.id, newName)}
                        textClassName="integration-card-name"
                    />
                ) : (
                    <div className="integration-card-name">{model.name}</div>
                )}
                {/* CardActionsMenu contains its own clicks — no wrapper needed. */}
                <IntegrationActionsMenu
                    model={model}
                    onAction={onAction}
                    className="integration-card-menu-button"
                />
            </div>
            <div className="integration-card-statusline">
                {/* size 6 matches the project card's status dot — the 8px default
                    sat heavier beside the same 11px uppercase label. */}
                {/* No pulse class here: `deploying` maps to the `info` variant, and
                    StatusDot pulses on info by itself. Applying it per-caller is
                    what let the dashboard tile forget. */}
                <StatusDot variant={model.dotVariant} size={6} />
                <span
                    className={cn(
                        'integration-card-status',
                        model.status === 'error' && 'integration-card-status--error',
                    )}
                >
                    {model.statusLabel}
                </span>
            </div>
        </div>
    );
}
