/**
 * TimelineNav helpers — shared pure status/label/indicator helpers + types.
 *
 * Extracted from TimelineNav so both the main timeline and the nested
 * sub-step rail (TimelineChildren) reuse them without duplicating the
 * status→class mapping. Pure: no component state.
 */

import { View } from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import React from 'react';
import { cn } from '@/core/ui/utils/classNames';

/** Timeline step status type. */
export type TimelineStatus = 'completed' | 'completed-current' | 'current' | 'upcoming' | 'review';

/** Step definition for TimelineNav. */
export interface TimelineStep {
    id: string;
    name: string;
}

/** Lookup map for timeline step dot status classes. */
const TIMELINE_DOT_STATUS_CLASS: Record<TimelineStatus, string> = {
    'completed': 'timeline-step-dot-completed',
    'completed-current': 'timeline-step-dot-completed',
    'current': 'timeline-step-dot-current',
    'upcoming': 'timeline-step-dot-upcoming',
    'review': 'timeline-step-dot-review',
};

/** Build timeline step dot classes based on status. */
export function getTimelineStepDotClasses(status: TimelineStatus): string {
    const baseClasses = 'timeline-step-dot';
    const statusClass = TIMELINE_DOT_STATUS_CLASS[status] ?? 'timeline-step-dot-upcoming';
    return cn(baseClasses, statusClass);
}

/** Lookup map for timeline step label color classes. */
const TIMELINE_LABEL_COLOR_CLASS: Record<TimelineStatus, string> = {
    'completed': 'text-gray-800',
    'completed-current': 'text-blue-700',
    'current': 'text-blue-700',
    'upcoming': 'text-gray-600',
    'review': 'text-gray-800',
};

/** Build timeline step label classes based on status. */
export function getTimelineLabelClasses(status: TimelineStatus): string {
    const isCurrent = status === 'current' || status === 'completed-current';
    const fontWeight = isCurrent ? 'font-semibold' : 'font-normal';
    const color = TIMELINE_LABEL_COLOR_CLASS[status];
    return cn('text-base', fontWeight, color, 'whitespace-nowrap', 'user-select-none');
}

/** Render the appropriate indicator icon for a timeline step. */
export function renderStepIndicator(status: TimelineStatus): React.ReactNode {
    if (status === 'completed' || status === 'completed-current') {
        return <CheckmarkCircle size="XS" UNSAFE_className={cn('text-white', 'icon-xs')} />;
    }
    if (status === 'review') {
        // Solid white inner dot for edit mode (no checkmark - indicates "can review/edit")
        return (
            <View
                width="size-100"
                height="size-100"
                UNSAFE_className="rounded-full"
                UNSAFE_style={{ backgroundColor: '#ffffff' }}
            />
        );
    }
    if (status === 'current') {
        // White inner dot creates contrast against the blue outer ring.
        // Inline style for true white since bg-white maps to gray-100 in dark theme.
        return (
            <View
                width="size-100"
                height="size-100"
                UNSAFE_className={cn('rounded-full', 'animate-pulse')}
                UNSAFE_style={{ backgroundColor: '#ffffff' }}
            />
        );
    }
    return (
        <View
            width="size-100"
            height="size-100"
            UNSAFE_className={cn('rounded-full', 'bg-gray-400')}
        />
    );
}
