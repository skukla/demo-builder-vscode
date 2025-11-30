/**
 * WizardProgress Component
 *
 * Displays wizard step progress with completed/current/future indicators.
 */

import React, { useCallback } from 'react';
import { Flex, Text } from '@adobe/react-spectrum';
import type { WizardStep } from '../../types';

export interface WizardProgressProps {
    /** Wizard steps */
    steps: WizardStep[];
    /** Current step index (0-based) */
    currentStep: number;
    /** Array of completed step indices */
    completedSteps: number[];
    /** Optional callback when a step is clicked */
    onStepClick?: (stepIndex: number) => void;
}

/**
 * WizardProgress - Shows wizard step progress in the sidebar
 */
export const WizardProgress: React.FC<WizardProgressProps> = ({
    steps,
    currentStep,
    completedSteps,
    onStepClick,
}) => {
    return (
        <ul
            role="list"
            aria-label="Wizard progress"
            style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
            }}
        >
            {steps.map((step, index) => (
                <WizardStepItem
                    key={step.id}
                    step={step}
                    index={index}
                    isCompleted={completedSteps.includes(index)}
                    isCurrent={index === currentStep}
                    onClick={onStepClick ? () => onStepClick(index) : undefined}
                />
            ))}
        </ul>
    );
};

interface WizardStepItemProps {
    step: WizardStep;
    index: number;
    isCompleted: boolean;
    isCurrent: boolean;
    onClick?: () => void;
}

const WizardStepItem: React.FC<WizardStepItemProps> = ({
    step,
    index,
    isCompleted,
    isCurrent,
    onClick,
}) => {
    const handleClick = useCallback(() => {
        onClick?.();
    }, [onClick]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if ((e.key === 'Enter' || e.key === ' ') && onClick) {
                e.preventDefault();
                onClick();
            }
        },
        [onClick]
    );

    // Determine indicator
    let indicator: string;
    let indicatorColor: string;

    if (isCompleted) {
        indicator = '✓';
        indicatorColor = 'var(--spectrum-global-color-gray-500)';
    } else if (isCurrent) {
        indicator = '●';
        indicatorColor = 'var(--spectrum-global-color-blue-500)';
    } else {
        indicator = '○';
        indicatorColor = 'var(--spectrum-global-color-gray-400)';
    }

    return (
        <li
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            onClick={handleClick}
            onKeyDown={onClick ? handleKeyDown : undefined}
            style={{
                padding: '6px 12px',
                cursor: onClick ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
            }}
        >
            <span
                style={{
                    color: indicatorColor,
                    fontSize: '12px',
                    width: '16px',
                    textAlign: 'center',
                }}
            >
                {indicator}
            </span>
            <Text
                UNSAFE_className={`text-sm ${isCurrent ? 'font-medium' : ''}`}
                UNSAFE_style={{
                    color: isCurrent
                        ? 'var(--vscode-foreground)'
                        : 'var(--spectrum-global-color-gray-600)',
                }}
            >
                {step.label}
            </Text>
        </li>
    );
};
