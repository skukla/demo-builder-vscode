import React from 'react';
import { View, Text } from '@adobe/react-spectrum';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import { WizardStep } from '../../types';

interface TimelineNavProps {
    steps: { id: WizardStep; name: string }[];
    currentStep: WizardStep;
    completedSteps: WizardStep[];
    onStepClick?: (step: WizardStep) => void;
}

export function TimelineNav({ steps, currentStep, completedSteps, onStepClick }: TimelineNavProps) {
    const currentStepIndex = steps.findIndex(s => s.id === currentStep);

    const getStepStatus = (step: WizardStep, index: number) => {
        if (completedSteps.includes(step)) return 'completed';
        if (step === currentStep) return 'current';
        if (index < currentStepIndex) return 'completed';
        return 'upcoming';
    };

    const handleStepClick = (step: WizardStep, index: number) => {
        const status = getStepStatus(step.id, index);
        if (onStepClick && (status === 'completed' || status === 'current')) {
            onStepClick(step.id);
        }
    };

    return (
        <View 
            padding="size-400" 
            height="100%"
            UNSAFE_style={{
                borderRight: '1px solid var(--spectrum-global-color-gray-300)',
                background: 'var(--spectrum-global-color-gray-75)'
            }}
        >
            <View marginBottom="size-400">
                <Text UNSAFE_style={{ 
                    fontSize: '11px', 
                    textTransform: 'uppercase', 
                    letterSpacing: '0.5px',
                    color: 'var(--spectrum-global-color-gray-600)',
                    fontWeight: 600
                }}>
                    Setup Progress
                </Text>
            </View>

            <View position="relative">
                {/* Steps */}
                {steps.map((step, index) => {
                    const status = getStepStatus(step.id, index);
                    const isClickable = status === 'completed' || status === 'current';
                    
                    return (
                        <View key={step.id} position="relative">
                            {/* Step item */}
                            <View
                                marginBottom={index < steps.length - 1 ? "size-400" : undefined}
                                UNSAFE_style={{
                                    cursor: isClickable ? 'pointer' : 'default',
                                    opacity: status === 'upcoming' ? 0.5 : 1,
                                    transition: 'opacity 0.2s ease'
                                }}
                                UNSAFE_onClick={() => handleStepClick(step, index)}
                            >
                                <View
                                    UNSAFE_style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px'
                                    }}
                                >
                                    {/* Step indicator dot */}
                                    <View
                                        width="size-300"
                                        height="size-300"
                                        UNSAFE_style={{
                                            borderRadius: '50%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            background: status === 'completed' 
                                                ? 'var(--spectrum-global-color-green-600)'
                                                : status === 'current'
                                                ? 'var(--spectrum-global-color-blue-600)'
                                                : 'var(--spectrum-global-color-gray-75)',
                                            border: status === 'current'
                                                ? '2px solid var(--spectrum-global-color-blue-400)'
                                                : status === 'upcoming'
                                                ? '2px solid var(--spectrum-global-color-gray-400)'
                                                : 'none',
                                            boxSizing: 'border-box',
                                            position: 'relative',
                                            zIndex: 2
                                        }}
                                    >
                                        {status === 'completed' ? (
                                            <CheckmarkCircle size="XS" UNSAFE_style={{ color: 'white', width: '12px', height: '12px' }} />
                                        ) : status === 'current' ? (
                                            <View
                                                width="size-100"
                                                height="size-100"
                                                UNSAFE_style={{
                                                    borderRadius: '50%',
                                                    background: 'white',
                                                    animation: 'pulse 2s infinite'
                                                }}
                                            />
                                        ) : (
                                            <View
                                                width="size-100"
                                                height="size-100"
                                                UNSAFE_style={{
                                                    borderRadius: '50%',
                                                    background: 'var(--spectrum-global-color-gray-400)'
                                                }}
                                            />
                                        )}
                                    </View>

                                    {/* Step label */}
                                    <Text
                                        UNSAFE_style={{
                                            fontSize: '13px',
                                            fontWeight: status === 'current' ? 600 : 400,
                                            color: status === 'current' 
                                                ? 'var(--spectrum-global-color-blue-700)'
                                                : status === 'completed'
                                                ? 'var(--spectrum-global-color-gray-800)'
                                                : 'var(--spectrum-global-color-gray-600)',
                                            whiteSpace: 'nowrap',
                                            userSelect: 'none'
                                        }}
                                    >
                                        {step.name}
                                    </Text>
                                </View>
                            </View>
                            
                            {/* Dotted line connector after each step except last */}
                            {index < steps.length - 1 && (
                                <View
                                    position="absolute"
                                    left="11px"
                                    UNSAFE_style={{
                                        top: '28px',
                                        width: '3px',
                                        height: '28px',
                                        background: status === 'completed' 
                                            ? 'repeating-linear-gradient(to bottom, var(--spectrum-global-color-blue-600) 0px, var(--spectrum-global-color-blue-600) 4px, transparent 4px, transparent 8px)'
                                            : 'repeating-linear-gradient(to bottom, var(--spectrum-global-color-gray-400) 0px, var(--spectrum-global-color-gray-400) 4px, transparent 4px, transparent 8px)',
                                        zIndex: 0
                                    }}
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