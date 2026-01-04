/**
 * Tooltip Component
 *
 * An accessible tooltip component built with React Aria for proper
 * keyboard and screen reader support. Replaces @adobe/react-spectrum
 * Tooltip and TooltipTrigger components.
 *
 * @example
 * <TooltipTrigger>
 *     <Button>Hover me</Button>
 *     <Tooltip>Tooltip content</Tooltip>
 * </TooltipTrigger>
 */

import React from 'react';
import {
    Tooltip as AriaTooltip,
    TooltipTrigger as AriaTooltipTrigger,
    OverlayArrow,
} from 'react-aria-components';
import stylesImport from './Tooltip.module.css';
import { cn } from '@/core/ui/utils/classNames';

// Defensive: handle case where CSS Module import fails during bundling
const styles = stylesImport || {};

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right' | 'start' | 'end';

export interface TooltipProps {
    /** Tooltip content */
    children: React.ReactNode;
    /** Placement relative to trigger */
    placement?: TooltipPlacement;
    /** Additional CSS class */
    className?: string;
}

/**
 * Tooltip - Accessible tooltip with proper ARIA semantics
 *
 * Replaces @adobe/react-spectrum Tooltip component.
 * Provides:
 * - Shows on hover and focus
 * - Hides on mouse leave and blur
 * - Proper role="tooltip" semantics
 * - aria-describedby association with trigger
 */
export function Tooltip({
    children,
    placement = 'top',
    className,
}: TooltipProps) {
    return (
        <AriaTooltip
            className={cn(styles.tooltip, className)}
            placement={placement}
        >
            <OverlayArrow className={styles.arrow}>
                <svg width="8" height="8" viewBox="0 0 8 8" className={styles.arrowSvg}>
                    <path d="M0 0 L4 4 L8 0" fill="currentColor" />
                </svg>
            </OverlayArrow>
            {children}
        </AriaTooltip>
    );
}

Tooltip.displayName = 'Tooltip';

export interface TooltipTriggerProps {
    /** Trigger element and Tooltip */
    children: [React.ReactElement, React.ReactElement];
    /** Delay before showing tooltip (ms) */
    delay?: number;
    /** Close delay after mouse leaves (ms) */
    closeDelay?: number;
    /** Controlled open state */
    isOpen?: boolean;
    /** Default open state */
    defaultOpen?: boolean;
    /** Open state change handler */
    onOpenChange?: (isOpen: boolean) => void;
    /** Whether tooltip is disabled */
    isDisabled?: boolean;
}

/**
 * TooltipTrigger - Manages tooltip open/close state
 *
 * Wraps a trigger element and Tooltip component.
 * Shows tooltip on hover/focus with configurable delay.
 */
export function TooltipTrigger({
    children,
    delay = 400,
    closeDelay = 200,
    isOpen,
    defaultOpen = false,
    onOpenChange,
    isDisabled = false,
}: TooltipTriggerProps) {
    return (
        <AriaTooltipTrigger
            delay={delay}
            closeDelay={closeDelay}
            isOpen={isOpen}
            defaultOpen={defaultOpen}
            onOpenChange={onOpenChange}
            isDisabled={isDisabled}
        >
            {children}
        </AriaTooltipTrigger>
    );
}

TooltipTrigger.displayName = 'TooltipTrigger';
