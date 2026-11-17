/**
 * A flyout's actions, visible as a list rather than behind a menu (owner, 2026-10-01: "the three
 * dots menus are hard to see and easy to miss"; the datapack flyout followed, 2026-11-17).
 *
 * Quiet rows: an icon and a plain label, the weight of the rest of the panel, never an accent
 * button. The ones that take something away go last, behind a divider; the danger colour marks only
 * those with no way back (owner, 2026-11-17: a red Uninstall beside a red Delete said both were). Extracted from the
 * integrations flyout at its second consumer: `FlyoutActions` (integrations) and `PackActions`
 * (datapacks) both draw it. Styled by `integration-cards.css`, which both bundles' entries import.
 *
 * @module core/ui/components/ui/FlyoutActionList
 */

import React from 'react';
import { renderMenuIcon } from '@/core/ui/components/ui/menuIcons';

/** One action in the list. */
export interface FlyoutActionRow {
    key: string;
    label: string;
    /** A concept of the shared icon vocabulary (`menuIcons`); none draws no icon. */
    icon?: string;
    /** It takes something away: last, behind the divider. */
    removes?: boolean;
    /** There is no way back: the danger colour. Implies `removes`. */
    danger?: boolean;
}

export interface FlyoutActionListProps {
    rows: readonly FlyoutActionRow[];
    onAction: (key: string) => void;
}

/** The list, or nothing when there is no action to offer. */
export function FlyoutActionList({
    rows,
    onAction,
}: FlyoutActionListProps): React.ReactElement | null {
    if (rows.length === 0) return null;
    const takesAway = (row: FlyoutActionRow): boolean => row.removes === true || row.danger === true;
    const safe = rows.filter((row) => !takesAway(row));
    const danger = rows.filter(takesAway);
    return (
        <section className="integration-panel-section" aria-label="Actions">
            <div className="integration-panel-section-label">Actions</div>
            <ul className="integration-panel-actions">
                {safe.map((row) => (
                    <ActionRow key={row.key} row={row} onAction={onAction} />
                ))}
                {danger.length > 0 && safe.length > 0 && (
                    <li className="integration-panel-actions-divider" aria-hidden="true" />
                )}
                {danger.map((row) => (
                    <ActionRow key={row.key} row={row} onAction={onAction} />
                ))}
            </ul>
        </section>
    );
}

function ActionRow({
    row,
    onAction,
}: {
    row: FlyoutActionRow;
    onAction: (key: string) => void;
}): React.ReactElement {
    return (
        <li>
            <button
                type="button"
                className={
                    row.danger ? 'integration-panel-action is-danger' : 'integration-panel-action'
                }
                onClick={() => onAction(row.key)}
            >
                <span className="integration-panel-action-icon" aria-hidden="true">
                    {renderMenuIcon(row.icon)}
                </span>
                {row.label}
            </button>
        </li>
    );
}
