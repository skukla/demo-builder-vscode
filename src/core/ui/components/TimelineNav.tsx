/**
 * TimelineNav - Shared timeline navigation component
 *
 * Used by both the wizard main panel and sidebar to show step progress.
 * Supports both string-based step IDs (wizard) and index-based navigation (sidebar).
 */

import { View, Text } from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import React, { useRef, useEffect, useState } from 'react';
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

/** Animation duration in milliseconds */
const ANIMATION_DURATION = 300;

/** Exiting step with its original position */
interface ExitingStep extends TimelineStep {
    originalIndex: number;
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
    // Track previous steps for detecting changes
    const prevStepsRef = useRef<TimelineStep[]>([]);
    // Delay before enabling animations (lets initial load settle)
    const INIT_DELAY_MS = 500;
    const [animationsEnabled, setAnimationsEnabled] = useState(false);

    // Animation states
    const [enteringSteps, setEnteringSteps] = useState<Set<string>>(new Set());
    const [exitingSteps, setExitingSteps] = useState<ExitingStep[]>([]);

    // Enable animations after initial load settles
    useEffect(() => {
        if (steps.length > 0 && !animationsEnabled) {
            const timer = setTimeout(() => {
                setAnimationsEnabled(true);
            }, INIT_DELAY_MS);
            return () => clearTimeout(timer);
        }
        return undefined;
    }, [steps.length, animationsEnabled]);

    // Track step changes and animate
    useEffect(() => {
        // Always keep ref updated
        if (steps.length === 0) {
            return undefined;
        }

        // Don't animate until initialization period is over
        if (!animationsEnabled) {
            prevStepsRef.current = steps;
            return undefined;
        }

        const currentIds = new Set(steps.map(s => s.id));
        const prevSteps = prevStepsRef.current;
        const prevIds = new Set(prevSteps.map(s => s.id));

        // Find entering steps (in current but not in previous)
        const entering = steps.filter(s => !prevIds.has(s.id)).map(s => s.id);

        // Find exiting steps with their original index (in previous but not in current)
        const exiting: ExitingStep[] = prevSteps
            .map((s, i) => ({ ...s, originalIndex: i }))
            .filter(s => !currentIds.has(s.id));

        // Only animate if there are changes
        if (entering.length > 0 || exiting.length > 0) {
            // Mark entering steps
            if (entering.length > 0) {
                setEnteringSteps(new Set(entering));
            }

            // Keep exiting steps visible for exit animation (with their positions)
            if (exiting.length > 0) {
                setExitingSteps(exiting);
            }

            // Clear animation states after animation completes
            const timer = setTimeout(() => {
                setEnteringSteps(new Set());
                setExitingSteps([]);
                // Update ref AFTER animation completes
                prevStepsRef.current = steps;
            }, ANIMATION_DURATION);

            return () => clearTimeout(timer);
        }

        prevStepsRef.current = steps;
        return undefined;
    }, [steps, animationsEnabled]);

    // Combine current steps with exiting steps for rendering
    const displaySteps = React.useMemo(() => {
        if (exitingSteps.length === 0) {
            return steps.map(s => ({ ...s, isExiting: false }));
        }

        // Insert exiting steps at their original positions
        const result: Array<TimelineStep & { isExiting: boolean }> =
            steps.map(s => ({ ...s, isExiting: false }));

        // Insert exiting steps at their original indices (adjust for already inserted)
        let offset = 0;
        for (const exitingStep of exitingSteps) {
            const insertIndex = Math.min(exitingStep.originalIndex + offset, result.length);
            result.splice(insertIndex, 0, { ...exitingStep, isExiting: true });
            offset++;
        }

        return result;
    }, [steps, exitingSteps]);

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
                {displaySteps.map((step, displayIndex) => {
                    // For exiting steps, use 'upcoming' status (grayed out)
                    // For normal steps, calculate status based on position in actual steps array
                    const actualIndex = step.isExiting ? -1 : steps.findIndex(s => s.id === step.id);
                    const status = step.isExiting ? 'upcoming' : getStepStatus(actualIndex);
                    const isClickable = !step.isExiting && isStepClickable(actualIndex);
                    const isEntering = enteringSteps.has(step.id);
                    const isExiting = step.isExiting;

                    return (
                        <View key={step.id} position="relative">
                            {/* Step item */}
                            <div
                                data-testid={`timeline-step-${step.id}`}
                                aria-current={!step.isExiting && actualIndex === currentStepIndex ? 'step' : undefined}
                                style={{
                                    marginBottom: displayIndex < displaySteps.length - 1 ? stepSpacing : undefined,
                                    // Staggered animation delay for cascade effect
                                    animationDelay: isEntering ? `${displayIndex * 40}ms` : undefined,
                                }}
                                className={cn(
                                    isClickable ? 'cursor-pointer' : 'cursor-default',
                                    status === 'upcoming' ? 'opacity-50' : 'opacity-100',
                                    'transition-opacity',
                                    isEntering && 'timeline-step-enter',
                                    isExiting && 'timeline-step-exit',
                                )}
                                onClick={() => !step.isExiting && handleStepClick(actualIndex)}
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
                            {displayIndex < displaySteps.length - 1 && (
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
