import { View, Text } from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import React from 'react';
import { WizardStep } from '@/types/webview';
import { cn } from '@/core/ui/utils/classNames';

/**
 * Timeline step status type
 */
type TimelineStatus = 'completed' | 'completed-current' | 'current' | 'upcoming';

/**
 * Lookup map for timeline step dot status classes (inlined from classNames.ts - single consumer)
 */
const TIMELINE_DOT_STATUS_CLASS: Record<TimelineStatus, string> = {
    'completed': 'timeline-step-dot-completed',
    'completed-current': 'timeline-step-dot-completed',
    'current': 'timeline-step-dot-current',
    'upcoming': 'timeline-step-dot-upcoming',
};

/**
 * Build timeline step dot classes based on status (inlined from classNames.ts - single consumer)
 */
function getTimelineStepDotClasses(status: TimelineStatus): string {
    const baseClasses = 'timeline-step-dot';
    const statusClass = TIMELINE_DOT_STATUS_CLASS[status] ?? 'timeline-step-dot-upcoming';
    return cn(baseClasses, statusClass);
}

/**
 * Lookup map for timeline step label color classes (inlined from classNames.ts - single consumer)
 */
const TIMELINE_LABEL_COLOR_CLASS: Record<TimelineStatus, string> = {
    'completed': 'text-gray-800',
    'completed-current': 'text-blue-700',
    'current': 'text-blue-700',
    'upcoming': 'text-gray-600',
};

/**
 * Build timeline step label classes based on status (inlined from classNames.ts - single consumer)
 */
function getTimelineLabelClasses(status: TimelineStatus): string {
    const isCurrent = status === 'current' || status === 'completed-current';
    const fontWeight = isCurrent ? 'font-semibold' : 'font-normal';
    const color = TIMELINE_LABEL_COLOR_CLASS[status];
    return cn('text-base', fontWeight, color, 'whitespace-nowrap', 'user-select-none');
}

/**
 * Render the appropriate indicator icon for a timeline step
 *
 * SOP §3: Extracted JSX ternary chain to named helper
 *
 * @param status - The step's current status
 * @returns JSX element for the step indicator
 */
function renderStepIndicator(status: TimelineStatus): React.ReactNode {
    if (status === 'completed' || status === 'completed-current') {
        return <CheckmarkCircle size="XS" UNSAFE_className={cn('text-white', 'icon-xs')} />;
    }
    if (status === 'current') {
        return (
            <View
                width="size-100"
                height="size-100"
                UNSAFE_className={cn('rounded-full', 'bg-white', 'animate-pulse')}
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

interface TimelineNavProps {
    steps: { id: WizardStep; name: string }[];
    currentStep: WizardStep;
    completedSteps: WizardStep[];
    highestCompletedStepIndex: number;
    onStepClick?: (step: WizardStep) => void;
}

export function TimelineNav({ steps, currentStep, completedSteps, highestCompletedStepIndex: _highestCompletedStepIndex, onStepClick }: TimelineNavProps) {
    const currentStepIndex = steps.findIndex(s => s.id === currentStep);

    const getStepStatus = (step: WizardStep): TimelineStatus => {
        const isCompleted = completedSteps.includes(step);
        const isCurrent = step === currentStep;

        if (isCurrent && isCompleted) return 'completed-current';
        if (isCurrent && !isCompleted) return 'current';
        if (isCompleted) return 'completed';
        return 'upcoming';
    };

    const isStepClickable = (step: WizardStep, index: number) => {
        // Only allow clicking on current step or backward navigation
        // Forward navigation must use Continue button
        return index <= currentStepIndex;
    };

    const handleStepClick = (step: WizardStep, index: number) => {
        if (onStepClick && isStepClickable(step, index)) {
            onStepClick(step);
        }
    };

    return (
        <View 
            padding="size-400" 
            height="100%"
            UNSAFE_className="timeline-container"
        >
            <View marginBottom="size-400">
                <Text UNSAFE_className={cn('text-xs', 'text-uppercase', 'letter-spacing-05', 'text-gray-600', 'font-semibold')}>
                    Setup Progress
                </Text>
            </View>

            <View position="relative">
                {/* Steps */}
                {steps.map((step, index) => {
                    const status = getStepStatus(step.id);
                    const isClickable = isStepClickable(step.id, index);
                    
                    return (
                        <View key={step.id} position="relative">
                            {/* Step item */}
                            <div
                                data-testid={`timeline-step-${step.id}`}
                                style={{
                                    marginBottom: index < steps.length - 1 ? 'var(--spectrum-global-dimension-size-400)' : undefined,
                                }}
                                className={cn(
                                    isClickable ? 'cursor-pointer' : 'cursor-default',
                                    status === 'upcoming' ? 'opacity-50' : 'opacity-100',
                                    'transition-opacity',
                                )}
                                onClick={() => handleStepClick(step.id, index)}
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