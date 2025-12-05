/**
 * TimelineNav - Shared timeline navigation component
 *
 * Used by both the wizard main panel and sidebar to show step progress.
 * Supports both string-based step IDs (wizard) and index-based navigation (sidebar).
 */

import { View, Text } from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import React from 'react';
import { cn } from '@/core/ui/utils/classNames';

/**
 * Timeline step status type
 */
type TimelineStatus = 'completed' | 'completed-current' | 'current' | 'upcoming';

/**
 * Lookup map for timeline step dot status classes
 */
const TIMELINE_DOT_STATUS_CLASS: Record<TimelineStatus, string> = {
    'completed': 'timeline-step-dot-completed',
    'completed-current': 'timeline-step-dot-completed',
    'current': 'timeline-step-dot-current',
    'upcoming': 'timeline-step-dot-upcoming',
};

/**
 * Build timeline step dot classes based on status
 */
function getTimelineStepDotClasses(status: TimelineStatus): string {
    const baseClasses = 'timeline-step-dot';
    const statusClass = TIMELINE_DOT_STATUS_CLASS[status] ?? 'timeline-step-dot-upcoming';
    return cn(baseClasses, statusClass);
}

/**
 * Lookup map for timeline step label color classes
 */
const TIMELINE_LABEL_COLOR_CLASS: Record<TimelineStatus, string> = {
    'completed': 'text-gray-800',
    'completed-current': 'text-blue-700',
    'current': 'text-blue-700',
    'upcoming': 'text-gray-600',
};

/**
 * Build timeline step label classes based on status
 */
function getTimelineLabelClasses(status: TimelineStatus): string {
    const isCurrent = status === 'current' || status === 'completed-current';
    const fontWeight = isCurrent ? 'font-semibold' : 'font-normal';
    const color = TIMELINE_LABEL_COLOR_CLASS[status];
    return cn('text-base', fontWeight, color, 'whitespace-nowrap', 'user-select-none');
}

/**
 * Render the appropriate indicator icon for a timeline step
 */
function renderStepIndicator(status: TimelineStatus): React.ReactNode {
    if (status === 'completed' || status === 'completed-current') {
        return <CheckmarkCircle size="XS" UNSAFE_className={cn('text-white', 'icon-xs')} />;
    }
    if (status === 'current') {
        // White inner dot creates contrast against the blue outer ring
        // Use inline style for true white since bg-white maps to gray-100 in dark theme
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

/**
 * Step definition for TimelineNav
 */
export interface TimelineStep {
    id: string;
    name: string;
}

export interface TimelineNavProps {
    /** Array of steps to display */
    steps: TimelineStep[];
    /** Current step index (0-based) */
    currentStepIndex: number;
    /** Array of completed step indices */
    completedStepIndices: number[];
    /** Callback when step is clicked (receives step index) */
    onStepClick?: (stepIndex: number) => void;
    /** Whether to show the header (default: true) */
    showHeader?: boolean;
    /** Custom header text (default: "Setup Progress") */
    headerText?: string;
    /** Whether to use compact mode (smaller padding, for sidebar) */
    compact?: boolean;
}

export function TimelineNav({
    steps,
    currentStepIndex,
    completedStepIndices,
    onStepClick,
    showHeader = true,
    headerText = 'Setup Progress',
    compact = false,
}: TimelineNavProps) {
    const getStepStatus = (index: number): TimelineStatus => {
        const isCompleted = completedStepIndices.includes(index);
        const isCurrent = index === currentStepIndex;

        if (isCurrent && isCompleted) return 'completed-current';
        if (isCurrent && !isCompleted) return 'current';
        if (isCompleted) return 'completed';
        return 'upcoming';
    };

    const isStepClickable = (index: number) => {
        // Only allow clicking on current step or backward navigation
        // Forward navigation must use Continue button
        return index <= currentStepIndex;
    };

    const handleStepClick = (index: number) => {
        if (onStepClick && isStepClickable(index)) {
            onStepClick(index);
        }
    };

    const padding = compact ? 'size-200' : 'size-400';
    const stepSpacing = compact ? 'var(--spectrum-global-dimension-size-300)' : 'var(--spectrum-global-dimension-size-400)';

    // Add timeline-sidebar class when in compact/sidebar mode
    const containerClass = compact ? 'timeline-container timeline-sidebar' : 'timeline-container';

    return (
        <View
            padding={padding}
            height="100%"
            UNSAFE_className={containerClass}
        >
            {showHeader && (
                <View marginBottom={compact ? 'size-200' : 'size-400'}>
                    <Text UNSAFE_className={cn('text-xs', 'text-uppercase', 'letter-spacing-05', 'text-gray-600', 'font-semibold')}>
                        {headerText}
                    </Text>
                </View>
            )}

            <View position="relative">
                {/* Steps */}
                {steps.map((step, index) => {
                    const status = getStepStatus(index);
                    const isClickable = isStepClickable(index);

                    return (
                        <View key={step.id} position="relative">
                            {/* Step item */}
                            <div
                                data-testid={`timeline-step-${step.id}`}
                                aria-current={index === currentStepIndex ? 'step' : undefined}
                                style={{
                                    marginBottom: index < steps.length - 1 ? stepSpacing : undefined,
                                }}
                                className={cn(
                                    isClickable ? 'cursor-pointer' : 'cursor-default',
                                    status === 'upcoming' ? 'opacity-50' : 'opacity-100',
                                    'transition-opacity',
                                )}
                                onClick={() => handleStepClick(index)}
                            >
                                <View
                                    UNSAFE_className={cn('flex', 'items-center', 'gap-3')}
                                >
                                    {/* Step indicator dot */}
                                    <View
                                        width="size-300"
                                        height="size-300"
                                        UNSAFE_className={cn(getTimelineStepDotClasses(status), 'shrink-0')}
                                    >
                                        {renderStepIndicator(status)}
                                    </View>

                                    {/* Step label */}
                                    <Text
                                        UNSAFE_className={getTimelineLabelClasses(status)}
                                    >
                                        {step.name}
                                    </Text>
                                </View>
                            </div>

                            {/* Dotted line connector after each step except last */}
                            {index < steps.length - 1 && (
                                <View
                                    position="absolute"
                                    left="11px"
                                    UNSAFE_className={cn(
                                        'timeline-connector',
                                        status === 'completed' ? 'timeline-connector-completed' : 'timeline-connector-pending',
                                    )}
                                />
                            )}
                        </View>
                    );
                })}
            </View>

            <style>{`
                @keyframes pulse {
                    0% {
                        transform: scale(1);
                        opacity: 1;
                    }
                    50% {
                        transform: scale(1.5);
                        opacity: 0.5;
                    }
                    100% {
                        transform: scale(1);
                        opacity: 1;
                    }
                }
            `}</style>
        </View>
    );
}
