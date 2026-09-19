/**
 * IntegrationCard — one calm card for an integration, shared by every surface
 * that lists them (the dashboard's live grid; the wizard's pre-build column).
 *
 * Pure presentation over an {@link IntegrationCardModel}: a name (rename-in-place
 * when the model allows it), the kebab carrying `model.menuActions`, and exactly
 * ONE quiet line beneath — no face button. The card is dumb:
 *   - card click / Enter / Space → `onOpen(model.id)` (the ProjectCard
 *     div-card keyboard precedent)
 *   - every menu pick → `onAction(model, kind)`; `CardActionsMenu` contains its
 *     own presses, so a pick never also opens the host's detail view
 *
 * That one quiet line is a SLOT. By default it is the deploy status — dot
 * (pulsing on `info`) plus `model.statusLabel` — which is what a live surface has
 * to say. A host with no deploy status passes
 * {@link IntegrationCardProps.subline} instead: the wizard runs before anything
 * is built, so it shows origin and API count there rather than a status that
 * would read the same on every card.
 *
 * The card renders no source line of its own. `model.sourceLine` is the
 * identifier a DETAIL view shows; on the face it made non-mesh cards a row taller
 * than the mesh, so no two cards in a grid shared a baseline. A host that wants
 * it on the face puts it in `subline`.
 *
 * A linked card (an integration and the system it uses) adds two things: a
 * neutral type badge beside a system's name ("ERP" — the SC's own name does not
 * say what the thing is), and the other card's name after the status, behind a
 * link icon. On the SAME line as the status, so a linked card is no taller than
 * any other and the grid keeps one baseline.
 *
 * The mesh peer card is visually IDENTICAL to an integration card — it is a
 * peer, identified by its name rather than chrome. Its behavioural asymmetry
 * (routing, actions, no rename) lives in the producer's derivation, never here.
 *
 * @module core/ui/components/integrations/IntegrationCard
 */

import { Badge } from '@adobe/react-spectrum';
import LinkIcon from '@spectrum-icons/workflow/Link';
import React, { useCallback } from 'react';
import { IntegrationActionsMenu } from './IntegrationActionsMenu';
import type { CardAction, IntegrationCardModel } from './integrationCardModel.types';
import { IntegrationStatusLabel } from './IntegrationStatusLabel';
import { InlineRenameField } from '@/core/ui/components/forms/InlineRenameField';
import { useActivateOnKey } from '@/core/ui/hooks/useActivateOnKey';

export interface IntegrationCardProps {
    /** Rename commit (renamable cards only): null on success, else an error string. */
    onRename: (id: string, name: string) => Promise<string | null>;
    /** The derived card model — never raw entries. */
    model: IntegrationCardModel;
    /**
     * Card body press → open this card's detail view.
     *
     * Omit it on a host that has no detail view, and the card renders inert: no
     * `role="button"`, no tab stop, no press handlers. A focusable control that
     * responds to nothing is worse than a plain card, and it lands on keyboard
     * and screen-reader users first. The wizard omits it for mesh and catalog
     * rows, which have nothing editable before the build.
     */
    onOpen?: (id: string) => void;
    /** Menu pick → the host's single handleAction switch. */
    onAction: (model: IntegrationCardModel, action: CardAction) => void;
    /**
     * Replaces the status line for hosts with no deploy status to show.
     *
     * Omit it and the card renders `StatusDot` + `model.statusLabel`, which is
     * every live surface. An explicit slot rather than "render status only when
     * statusLabel is non-empty" — that rule would make the dashboard's rendering
     * hinge on a string never being empty, which nothing guarantees.
     */
    subline?: React.ReactNode;
}

/** The other card's name behind a link icon, or nothing for a card alone. */
function LinkedLine({ model }: { model: IntegrationCardModel }): React.ReactElement | null {
    const cards = model.linked?.cards ?? [];
    if (cards.length === 0) return null;
    const names = cards.map((card) => card.name).join(', ');
    return (
        <span className="integration-card-link" title={`${model.linked?.label} ${names}`}>
            <LinkIcon size="XS" aria-label={model.linked?.label} />
            <span className="integration-card-link-name">{names}</span>
        </span>
    );
}

/**
 * One integration (or mesh) card.
 *
 * @param props - the card model, its action sinks, and an optional subline
 * @returns the card
 */
export function IntegrationCard({
    model,
    onOpen,
    onAction,
    onRename,
    subline,
}: IntegrationCardProps): React.ReactElement {
    const handleClick = useCallback((): void => onOpen?.(model.id), [model.id, onOpen]);

    const handleKeyDown = useActivateOnKey(handleClick);

    // `aria-label` REPLACES the element's text for a screen reader, so it is the
    // whole announcement — the subline is not read as a fallback. A host with no
    // status leaves `statusLabel` empty, and joining it anyway announced
    // "ERP Sync, ": a dangling comma naming half a thing.
    const label = model.statusLabel ? `${model.name}, ${model.statusLabel}` : model.name;

    // Only a card that can OPEN something claims to be a control. Without
    // `onOpen` the div carries no role, no tab stop and no handlers, so nothing
    // advertises a press that would do nothing. The kebab inside stays reachable
    // either way — it is its own button.
    const pressProps = onOpen
        ? {
              role: 'button',
              tabIndex: 0,
              'aria-label': label,
              onClick: handleClick,
              onKeyDown: handleKeyDown,
          }
        : {};

    return (
        <div className="integration-card" {...pressProps}>
            <div className="integration-card-head">
                {/* Rename in place, the ProjectCard treatment. The pencil reveals on
                    card hover; the name text stays click-transparent so a click still
                    opens the flyout (InlineRenameField contains only the pencil). */}
                {model.canRename ? (
                    <InlineRenameField
                        name={model.name}
                        label="New integration name"
                        onRename={(newName) => onRename(model.id, newName)}
                        textClassName="integration-card-name"
                    />
                ) : (
                    <div className="integration-card-name">{model.name}</div>
                )}
                {model.typeBadge && (
                    <Badge variant="neutral" UNSAFE_className="integration-card-badge">
                        {model.typeBadge}
                    </Badge>
                )}
                {/* CardActionsMenu contains its own clicks — no wrapper needed. */}
                <IntegrationActionsMenu
                    model={model}
                    onAction={onAction}
                    className="integration-card-menu-button"
                />
            </div>
            {/* The one quiet line: the host's own content when it gave us any,
                otherwise the deploy status. Not a fallback on empty strings — an
                explicit choice by the host, so a live surface cannot lose its
                status line to a derivation that happened to produce ''. */}
            {subline !== undefined ? (
                <div className="integration-card-statusline">{subline}</div>
            ) : (
                <div className="integration-card-statusline">
                    <IntegrationStatusLabel model={model} />
                    <LinkedLine model={model} />
                </div>
            )}
        </div>
    );
}
