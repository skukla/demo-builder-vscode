/**
 * WizardProgress Component
 *
 * Displays wizard step progress with completed/current/future indicators.
 */

import React from 'react';
import type { WizardStep } from '../../types';
import styles from '../styles/sidebar.module.css';
import { Text } from '@/core/ui/components/aria';

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
            className={styles.progressList}
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
            className={styles.stepItem}
            // SOP: Dynamic style - cursor depends on onClick prop
            style={{ cursor: onClick ? 'pointer' : 'default' }}
        >
            <span
                className={styles.stepIndicator}
                // SOP: Dynamic style - color computed from isCompleted/isCurrent state
                style={{ color: indicatorColor }}
            >
                {indicator}
            </span>
            {/* SOP: Dynamic style - color depends on isCurrent prop */}
            <span
                style={{
                    color: isCurrent
                        ? 'var(--spectrum-global-color-gray-800)'
                        : 'var(--spectrum-global-color-gray-600)',
                }}
            >
                <Text className={`text-sm ${isCurrent ? 'font-medium' : ''}`}>
                    {step.label}
                </Text>
            </span>
        </li>
    );
};
