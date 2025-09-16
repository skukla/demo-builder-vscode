import React from 'react';
import { View, Text } from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import { WizardStep } from '../../types';
import { cn, getTimelineStepDotClasses, getTimelineStepLabelClasses } from '../../utils/classNames';

interface TimelineNavProps {
    steps: { id: WizardStep; name: string }[];
    currentStep: WizardStep;
    completedSteps: WizardStep[];
    highestCompletedStepIndex: number;
    onStepClick?: (step: WizardStep) => void;
}

export function TimelineNav({ steps, currentStep, completedSteps, highestCompletedStepIndex, onStepClick }: TimelineNavProps) {
    const currentStepIndex = steps.findIndex(s => s.id === currentStep);

    const getStepStatus = (step: WizardStep, index: number) => {
        const isCompleted = completedSteps.includes(step);
        const isCurrent = step === currentStep;


        if (isCurrent && isCompleted) return 'completed-current';
        if (isCurrent && !isCompleted) return 'current';
        if (isCompleted) return 'completed';
        return 'upcoming';
    };

    const isStepClickable = (step: WizardStep, index: number) => {
        // Can click on current step, completed steps, or any step up to the highest completed
        return completedSteps.includes(step) ||
               step === currentStep ||
               index <= highestCompletedStepIndex;
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
                    const status = getStepStatus(step.id, index);
                    const isClickable = isStepClickable(step.id, index);
                    
                    return (
                        <View key={step.id} position="relative">
                            {/* Step item */}
                            <div
                                style={{
                                    marginBottom: index < steps.length - 1 ? 'var(--spectrum-global-dimension-size-400)' : undefined
                                }}
                                className={cn(
                                    isClickable ? 'cursor-pointer' : 'cursor-default',
                                    status === 'upcoming' ? 'opacity-50' : 'opacity-100',
                                    'transition-opacity'
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
                                        UNSAFE_className={getTimelineStepDotClasses(status)}
                                    >
                                        {status === 'completed' || status === 'completed-current' ? (
                                            <CheckmarkCircle size="XS" UNSAFE_className={cn('text-white', 'icon-xs')} />
                                        ) : status === 'current' ? (
                                            <View
                                                width="size-100"
                                                height="size-100"
                                                UNSAFE_className={cn('rounded-full', 'bg-white', 'animate-pulse')}
                                            />
                                        ) : (
                                            <View
                                                width="size-100"
                                                height="size-100"
                                                UNSAFE_className={cn('rounded-full', 'bg-gray-400')}
                                            />
                                        )}
                                    </View>

                                    {/* Step label */}
                                    <Text
                                        UNSAFE_className={getTimelineStepLabelClasses(status)}
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
                                        status === 'completed' ? 'timeline-connector-completed' : 'timeline-connector-pending'
                                    )}
                                />
                            )}
                        </View>
                    );
                })}
            </View>

            <style jsx>{`
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