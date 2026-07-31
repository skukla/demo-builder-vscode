/**
 * IntegrationCard — one calm grid card (integrations grid, Step 4).
 *
 * Pure presentation over an {@link IntegrationCardModel}: name, status dot
 * (+ pulse while deploying) with label, a source line WHEN THERE IS ONE (the
 * mesh has no owner/repo and carries none), and AT MOST ONE face affordance
 * from `model.faceAction`. The card is dumb:
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

import { Button, Item } from '@adobe/react-spectrum';
import React, { useCallback } from 'react';
import type { CardAction, IntegrationCardModel } from './integrationCardModel';
import { InlineRenameField } from '@/core/ui/components/forms';
import { CardActionsMenu } from '@/core/ui/components/ui/CardActionsMenu';
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
const FACE_LABELS: Record<string, string> = {
    deploy: 'Deploy',
    update: 'Update',
    retry: 'Retry',
    'sign-in': 'Sign in',
};

/** Kebab-menu labels, keyed by the same CardAction the grid dispatches. */
const MENU_LABELS: Partial<Record<CardAction, string>> = {
    open: 'Open ↗',
    'manage-apis': 'Manage APIs',
    remove: 'Remove',
};

/**
 * The card's overflow menu — the house pattern from ProjectActionsMenu, which
 * the project card uses for exactly this job.
 *
 * It exists because editing an integration had no trigger on the grid at all —
 * API access was reachable only by opening the detail flyout first. Rename is
 * deliberately NOT in here: it is the name's own inline pencil, exactly as on
 * ProjectCard.
 */
function CardMenu({
    model,
    onAction,
}: Pick<IntegrationCardProps, 'model' | 'onAction'>): React.ReactElement | null {
    if (model.menuActions.length === 0) return null;
    return (
        <CardActionsMenu
            ariaLabel={`More actions for ${model.name}`}
            className="integration-card-menu-button"
            onAction={(key) => onAction(model, key as CardAction)}
        >
            {model.menuActions.map((action) => (
                <Item key={action} textValue={MENU_LABELS[action] ?? action}>
                    {MENU_LABELS[action] ?? action}
                </Item>
            ))}
        </CardActionsMenu>
    );
}

/**
 * The card face's at-most-one affordance — an ATTENTION verb only.
 *
 * A healthy card renders nothing here: Open moved to the kebab (matching
 * ProjectCard, which has no face affordance at all), so a visible button now
 * means the card needs you.
 */
function FaceAffordance({
    model,
    onAction,
}: Pick<IntegrationCardProps, 'model' | 'onAction'>): React.ReactElement | null {
    const face = model.faceAction;
    if (!face) return null;
    return (
        <Button
            variant="accent"
            isDisabled={face.disabled}
            onPress={() => onAction(model, face.kind)}
        >
            {FACE_LABELS[face.kind]}
        </Button>
    );
}

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
    // card's open-the-drawer handlers (InlineRenameField.tsx precedent).
    const stopPropagation = useCallback(
        (event: React.SyntheticEvent): void => event.stopPropagation(),
        [],
    );

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
                <CardMenu model={model} onAction={onAction} />
            </div>
            <div className="integration-card-statusline">
                {/* size 6 matches the project card's status dot — the 8px default
                    sat heavier beside the same 11px uppercase label. */}
                <StatusDot
                    variant={model.dotVariant}
                    size={6}
                    className={
                        model.status === 'deploying' ? 'integration-dot--deploying' : undefined
                    }
                />
                <span
                    className={cn(
                        'integration-card-status',
                        model.status === 'error' && 'integration-card-status--error',
                    )}
                >
                    {model.statusLabel}
                </span>
            </div>
            {/* No source line, no element — an empty div still claims a flex gap.
                The mesh has no owner/repo and carries none. */}
            {model.sourceLine && (
                <div
                    className={cn(
                        'integration-card-src',
                        model.sourceIsAi && 'integration-card-src--ai',
                    )}
                >
                    {model.sourceLine}
                </div>
            )}
            <div className="integration-card-foot">
                {model.faceAction && (
                    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- containment only; interaction lives on the child Button/Link
                    <span onClick={stopPropagation} onKeyDown={stopPropagation}>
                        <FaceAffordance model={model} onAction={onAction} />
                    </span>
                )}
            </div>
        </div>
    );
}
