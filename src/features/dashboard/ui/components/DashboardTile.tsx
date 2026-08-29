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
import { StatusDot, type StatusDotVariant } from '@/core/ui/components/ui/StatusDot';

import { cn } from '@/core/ui/utils/classNames';
/** A dot and the words for it — inseparable by construction. */
export interface DashboardTileStatus {
    variant: StatusDotVariant;
    /** What the dot means. Replaces the idle tooltip while shown. */
    tooltip: string;
    testId: string;
}

export interface DashboardTileProps {
    label: string;
    icon: React.ReactNode;
    onPress: () => void;
    /** Shown when there is no status dot. Omit for a tile with no tooltip. */
    tooltip?: string;
    /** Present only when there is something to report. */
    status?: DashboardTileStatus;
    isDisabled?: boolean;
    /** Extra tile classes, e.g. the primary zone's `--hero` modifier. */
    className?: string;
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
    tooltip,
    status,
    isDisabled,
    className,
    action,
}: DashboardTileProps): React.ReactElement {
    const button = (
        <ActionButton
            onPress={onPress}
            isQuiet
            isDisabled={isDisabled}
            UNSAFE_className={cn('dashboard-action-button', className)}
            data-action={action}
        >
            {icon}
            <Text UNSAFE_className="icon-label">{label}</Text>
            {status && (
                // The SHARED dot, never a hand-rolled span: rolling its own is
                // what once cost the integrations tile its in-progress pulse.
                // `integrations-tile-dot` supplies POSITION only; `tile-status-dot`
                // exempts it from the tile's blanket "no descendant backgrounds on
                // hover" rule, which would otherwise blank it under the pointer.
                <StatusDot
                    variant={status.variant}
                    className="integrations-tile-dot tile-status-dot"
                    testId={status.testId}
                />
            )}
        </ActionButton>
    );

    const text = status?.tooltip ?? tooltip;
    if (!text) return button;

    return (
        <TooltipTrigger delay={300}>
            {button}
            <Tooltip>{text}</Tooltip>
        </TooltipTrigger>
    );
}
