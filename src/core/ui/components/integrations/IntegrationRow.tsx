/**
 * IntegrationRow — one integration as a full-width row: the List view's twin of
 * {@link IntegrationCard} (owner, 2026-09-24).
 *
 * Same model, same three affordances — open the drawer, rename in place, the
 * actions kebab — laid out as name · kind on the left and menu · status · chevron
 * on the right, so switching views changes the shape of each item and nothing
 * else. Built from the shared pieces the card uses (`InlineRenameField`,
 * `IntegrationActionsMenu`, `IntegrationStatusLabel`, `useActivateOnKey`).
 *
 * Reuse considered: `ProjectRow` (projects-dashboard) is the same shape for a
 * different model — a Project with a pin and a component summary — and is the
 * only other row, so a shared row waits for a third (Rule of Three). Styled by
 * `.integration-row-*` in `integration-cards.css`, which reaches every bundle
 * that renders the card.
 */

import ChevronRight from '@spectrum-icons/workflow/ChevronRight';
import React, { useCallback } from 'react';
import { IntegrationActionsMenu } from './IntegrationActionsMenu';
import type { IntegrationCardProps } from './IntegrationCard';
import { IntegrationStatusLabel } from './IntegrationStatusLabel';
import { InlineRenameField } from '@/core/ui/components/forms/InlineRenameField';
import { useActivateOnKey } from '@/core/ui/hooks/useActivateOnKey';

/** The card's props without its `subline`: a row has one line and it is the status. */
export type IntegrationRowProps = Omit<IntegrationCardProps, 'subline'>;

export function IntegrationRow({
    model,
    onOpen,
    onAction,
    onRename,
}: IntegrationRowProps): React.ReactElement {
    const handleClick = useCallback((): void => onOpen?.(model.id), [model.id, onOpen]);
    const handleKeyDown = useActivateOnKey(handleClick);

    // The whole announcement, as on the card: no dangling comma when there is no status.
    const label = model.statusLabel ? `${model.name}, ${model.statusLabel}` : model.name;

    // Only a row that can OPEN something claims to be a control (the card's rule).
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
        <div className="integration-row" {...pressProps}>
            <div className="integration-row-main">
                {model.canRename ? (
                    <InlineRenameField
                        name={model.name}
                        label="New integration name"
                        onRename={(newName) => onRename(model.id, newName)}
                        textClassName="integration-row-name"
                    />
                ) : (
                    <div className="integration-row-name">{model.name}</div>
                )}
                <span className="integration-row-kind">{model.kindLabel}</span>
            </div>
            <div className="integration-row-trailing">
                {/* The kebab contains its own clicks; always visible in a row,
                    where there is no hover surface to reveal it from. */}
                <IntegrationActionsMenu model={model} onAction={onAction} />
                <IntegrationStatusLabel model={model} />
                <ChevronRight size="S" UNSAFE_className="integration-row-chevron" />
            </div>
        </div>
    );
}
