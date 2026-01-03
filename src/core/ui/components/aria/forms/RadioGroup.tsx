/**
 * RadioGroup Component
 *
 * An accessible radio group component built with React Aria for keyboard
 * navigation and screen reader support. Replaces @adobe/react-spectrum
 * RadioGroup and Radio components.
 *
 * @example
 * <RadioGroup label="Select option" value={selected} onChange={setSelected}>
 *     <Radio value="option1">Option 1</Radio>
 *     <Radio value="option2">Option 2</Radio>
 * </RadioGroup>
 */

import React, { forwardRef } from 'react';
import {
    RadioGroup as AriaRadioGroup,
    Radio as AriaRadio,
    Label,
    Text,
    FieldError,
} from 'react-aria-components';
import { cn } from '@/core/ui/utils/classNames';
import { translateSpectrumToken } from '@/core/ui/utils/spectrumTokens';
import styles from './RadioGroup.module.css';
import type { ValidationState } from './TextField';

export type RadioGroupOrientation = 'horizontal' | 'vertical';

export interface RadioGroupProps {
    /** Label for the radio group */
    label?: string;
    /** Description text below label */
    description?: string;
    /** Radio children */
    children?: React.ReactNode;
    /** Selected value (controlled) */
    value?: string;
    /** Default selected value (uncontrolled) */
    defaultValue?: string;
    /** Selection change handler */
    onChange?: (value: string) => void;
    /** Whether the group is disabled */
    isDisabled?: boolean;
    /** Orientation of radio options */
    orientation?: RadioGroupOrientation;
    /** Validation state */
    validationState?: ValidationState;
    /** Error message to display */
    errorMessage?: string;
    /** Additional CSS class */
    className?: string;
    /** Margin bottom (Spectrum dimension token or CSS value) */
    marginBottom?: string;
}

/**
 * RadioGroup - Accessible radio group with keyboard navigation
 *
 * Replaces @adobe/react-spectrum RadioGroup component.
 * Provides:
 * - Arrow key navigation between options
 * - Screen reader support with proper ARIA semantics
 * - Visual styling matching VS Code theme
 */
export function RadioGroup({
    label,
    description,
    children,
    value,
    defaultValue,
    onChange,
    isDisabled = false,
    orientation = 'vertical',
    validationState,
    errorMessage,
    className,
    marginBottom,
}: RadioGroupProps) {
    const marginBottomValue = marginBottom ? translateSpectrumToken(marginBottom) : undefined;

    return (
        <AriaRadioGroup
            className={cn(
                styles.radioGroup,
                orientation === 'horizontal' && styles.horizontal,
                isDisabled && styles.disabled,
                className
            )}
            value={value}
            defaultValue={defaultValue}
            onChange={onChange}
            isDisabled={isDisabled}
            orientation={orientation}
            isInvalid={validationState === 'invalid'}
            style={marginBottomValue ? { marginBottom: marginBottomValue } : undefined}
        >
            {label && <Label className={styles.label}>{label}</Label>}
            {description && (
                <Text slot="description" className={styles.description}>
                    {description}
                </Text>
            )}
            <div
                className={cn(
                    styles.options,
                    orientation === 'horizontal' && styles.horizontal
                )}
            >
                {children}
            </div>
            {validationState === 'invalid' && errorMessage && (
                <FieldError className={styles.error}>{errorMessage}</FieldError>
            )}
        </AriaRadioGroup>
    );
}

RadioGroup.displayName = 'RadioGroup';

export interface RadioProps {
    /** Value of this radio option */
    value: string;
    /** Label content */
    children?: React.ReactNode;
    /** Whether this radio is disabled */
    isDisabled?: boolean;
    /** Additional CSS class */
    className?: string;
}

/**
 * Radio - Individual radio option within a RadioGroup
 */
export const Radio = forwardRef<HTMLLabelElement, RadioProps>(
    function Radio({ value, children, isDisabled = false, className }, ref) {
        return (
            <AriaRadio
                ref={ref}
                value={value}
                className={cn(styles.radio, className)}
                isDisabled={isDisabled}
            >
                {({ isSelected, isDisabled: disabled }) => (
                    <>
                        <div
                            className={cn(
                                styles.circle,
                                isSelected && styles.selected,
                                disabled && styles.disabled
                            )}
                            data-selected={isSelected || undefined}
                            data-disabled={disabled || undefined}
                        >
                            {isSelected && <div className={styles.dot} />}
                        </div>
                        {children && (
                            <span className={styles.radioLabel}>{children}</span>
                        )}
                    </>
                )}
            </AriaRadio>
        );
    }
);

Radio.displayName = 'Radio';
