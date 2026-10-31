/**
 * DashboardTile — one dashboard action tile: icon, label, optional status dot,
 * optional tooltip.
 *
 * THE RULE THIS COMPONENT EXISTS TO KEEP: a status dot always arrives with the
 * words explaining it. `status` carries the variant AND its tooltip in one
 * object, so a dot cannot be added without saying what it means.
 *
 * Structural rather than conventional because convention already failed. Three
 * tiles grew a dot independently — the lifecycle tile, the remedy tiles, and the
 * integrations summary — and the third shipped without a tooltip, so an amber or
 * red dot on it was a coloured pixel with nothing to read. Reported by the user.
 *
 * A tile with no dot may still carry an idle `tooltip`; a plain action tile may
 * have neither. The only unrepresentable combination is the one that was the bug.
 *
 * NOT `StatusCard` (`@/core/ui/components/feedback`), the nearest shared thing:
 * that renders a horizontal status ROW — dot · label · value · action link — for
 * the masthead band. Placed among these tiles it dangled off the end of the row
 * and broke the grid, which is what prompted this component. A tile stacks its
 * icon above its label and wears the dot as a corner overlay.
 *
 * Local to `features/dashboard` rather than `core/ui`: `dashboard-action-button`
 * appears nowhere else in `src/`, so there is no second feature to share with.
 *
 * @module features/dashboard/ui/components/DashboardTile
 */

import { ActionButton, Text, Tooltip, TooltipTrigger } from '@adobe/react-spectrum';
import React from 'react';
import { Spinner } from '@/core/ui/components/ui/Spinner';
import { StatusDot, type StatusDotVariant } from '@/core/ui/components/ui/StatusDot';
import { cn } from '@/core/ui/utils/classNames';
/** A dot and the words for it — inseparable by construction. */
export interface DashboardTileStatus {
    variant: StatusDotVariant;
    /** What the dot means. Replaces the idle tooltip while shown. */
    tooltip: string;
    /** The short word shown beside the dot where a row has room: after the label
     *  in a compact list, in place of the description on a card. A square tile,
     *  or a card given no word, keeps only the corner dot. */
    label?: string;
    testId: string;
}

export interface DashboardTileProps {
    label: string;
    icon: React.ReactNode;
    onPress: () => void;
    /**
     * One short line under the label: where an Open-row card goes, or, on the Datapacks row,
     * which pack is this demo's own (step 07).
     */
    description?: string;
    /** Shown when there is no status dot. Omit for a tile with no tooltip. */
    tooltip?: string;
    /** Present only when there is something to report. */
    status?: DashboardTileStatus;
    isDisabled?: boolean;
    /** Extra tile classes, e.g. the primary zone's `--hero` modifier. */
    className?: string;
    /**
     * The tile's action is under way (a private Chrome window opening): a spinner takes the icon's
     * place, at the icon's size, and presses are ignored (owner, 2026-10-31).
     */
    isBusy?: boolean;
    /** `data-action` hook used by tests and styling. */
    action?: string;
}

/**
 * @param props.status - the dot plus its explanation; omit when nothing to report
 * @returns the tile, wrapped in a TooltipTrigger when it has anything to say
 */
export function DashboardTile({
    label,
    icon,
    onPress,
    description,
    tooltip,
    status,
    isDisabled,
    className,
    action,
    isBusy = false,
}: DashboardTileProps): React.ReactElement {
    // A card with something to report says it on its second line — dot and word
    // where "where this goes" usually sits — instead of a corner dot a card's
    // width away from the title it qualifies. A corner dot is what made the
    // integrations status read as detached once it became a card.
    const inlineStatus = description && status?.label ? status : undefined;
    const button = (
        <ActionButton
            onPress={isBusy ? undefined : onPress}
            isQuiet
            isDisabled={isDisabled}
            UNSAFE_className={cn('dashboard-action-button', className)}
            data-action={action}
            // A card's name is its title; the description line is a hint, not
            // part of what the button is called.
            aria-label={description ? label : undefined}
            aria-busy={isBusy || undefined}
        >
            {isBusy ? (
                <span className="dashboard-tile-busy">
                    <Spinner size="S" aria-label="Opening" />
                </span>
            ) : (
                icon
            )}
            {description ? (
                <span className="dashboard-tile-text">
                    <Text UNSAFE_className="icon-label">{label}</Text>
                    {inlineStatus ? (
                        <span className="dashboard-tile-status dashboard-tile-status--inline">
                            <StatusDot
                                variant={inlineStatus.variant}
                                className="tile-status-dot"
                                testId={inlineStatus.testId}
                            />
                            <span className="dashboard-tile-status-text" data-variant={inlineStatus.variant}>
                                {inlineStatus.label}
                            </span>
                        </span>
                    ) : (
                        <Text UNSAFE_className="dashboard-tile-description">{description}</Text>
                    )}
                </span>
            ) : (
                <Text UNSAFE_className="icon-label">{label}</Text>
            )}
            {status && !inlineStatus && (
                // The SHARED dot, never a hand-rolled span: rolling its own is
                // what once cost the integrations tile its in-progress pulse.
                // `dashboard-tile-status` supplies POSITION — a corner overlay on
                // tiles and cards, inline after the label in a compact list;
                // `tile-status-dot` exempts the dot from the tile's blanket "no
                // descendant backgrounds on hover" rule, which would otherwise
                // blank it under the pointer.
                <span className="dashboard-tile-status">
                    <StatusDot variant={status.variant} className="tile-status-dot" testId={status.testId} />
                    {status.label ? (
                        <span className="dashboard-tile-status-text" data-variant={status.variant}>
                            {status.label}
                        </span>
                    ) : null}
                </span>
            )}
        </ActionButton>
    );

    const text = status?.tooltip ?? tooltip;
    if (!text) return button;

    // A list tile's tooltip opens BESIDE it: above, it covered the tile you move to
    // next. A card sits in a row with nothing above it, so its tooltip stays on top
    // rather than over the card beside it (owner, 2026-10-17).
    const placement = description ? 'top' : 'end';

    return (
        <TooltipTrigger delay={300} placement={placement}>
            {button}
            <Tooltip UNSAFE_className="dashboard-tile-tooltip">{text}</Tooltip>
        </TooltipTrigger>
    );
}
