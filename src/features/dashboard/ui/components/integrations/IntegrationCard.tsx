/**
 * IntegrationCard — one calm grid card (integrations grid, Step 4).
 *
 * Pure presentation over an {@link IntegrationCardModel}: name, status dot
 * (+ pulse while deploying) with label, one source line, and AT MOST ONE
 * face affordance from `model.faceAction`. The card is dumb:
 *   - card click / Enter / Space → `onOpen(model.id)` (the ProjectCard
 *     div-card keyboard precedent)
 *   - every face affordance → `onAction(model, kind)` — including the
 *     deployed Open↗ link (the grid's handleAction maps 'open' to
 *     `openLiveSite`), wrapped in a stop-propagation containment span
 *     (InlineRenameField precedent) so a face press never opens the drawer
 *
 * The mesh peer card differs ONLY by the `.integration-card--mesh` accent
 * class — the model asymmetry lives in integrationCardModel.ts.
 *
 * @module features/dashboard/ui/components/integrations/IntegrationCard
 */

import { Button, Link } from '@adobe/react-spectrum';
import React, { useCallback } from 'react';
import type { CardAction, IntegrationCardModel } from './integrationCardModel';
import { StatusDot } from '@/core/ui/components/ui/StatusDot';
import { cn } from '@/core/ui/utils/classNames';

export interface IntegrationCardProps {
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

/** The card face's at-most-one affordance (attention Button or Open↗ Link). */
function FaceAffordance({ model, onAction }: Pick<IntegrationCardProps, 'model' | 'onAction'>):
    React.ReactElement | null {
    const face = model.faceAction;
    if (!face) return null;
    if (face.kind === 'open') {
        return (
            <Link isQuiet onPress={() => onAction(model, 'open')}>
                Open ↗
            </Link>
        );
    }
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
export function IntegrationCard({ model, onOpen, onAction }: IntegrationCardProps): React.ReactElement {
    const handleClick = useCallback((): void => onOpen(model.id), [model.id, onOpen]);

    const handleKeyDown = useCallback(
        (event: React.KeyboardEvent): void => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpen(model.id);
            }
        },
        [model.id, onOpen],
    );

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
            className={cn('integration-card', model.isMesh && 'integration-card--mesh')}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
        >
            <div className="integration-card-name">{model.name}</div>
            <div className="integration-card-statusline">
                <StatusDot
                    variant={model.dotVariant}
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
            <div className={cn('integration-card-src', model.sourceIsAi && 'integration-card-src--ai')}>
                {model.sourceLine}
            </div>
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
