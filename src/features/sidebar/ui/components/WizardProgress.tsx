/**
 * WizardProgress Component
 *
 * Displays wizard step progress with completed/current/future indicators.
 */

import React from 'react';
import { Text } from '@adobe/react-spectrum';
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
            className="wizard-progress-list"
        >
            {steps.map((step, index) => (
                <WizardStepItem
                    key={step.id}
                    step={step}
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
    isCompleted: boolean;
    isCurrent: boolean;
    onClick?: () => void;
}

const WizardStepItem: React.FC<WizardStepItemProps> = ({
    step,
    isCompleted,
    isCurrent,
    onClick,
}) => {
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if ((e.key === 'Enter' || e.key === ' ') && onClick) {
            e.preventDefault();
            onClick();
        }
    };

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
            onClick={onClick}
            onKeyDown={onClick ? handleKeyDown : undefined}
            className="wizard-step-item"
            style={{ cursor: onClick ? 'pointer' : 'default' }}
        >
            <span
                className="wizard-step-indicator"
                style={{ color: indicatorColor }}
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
