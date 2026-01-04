/**
 * TextField Component
 *
 * An accessible text input component built with React Aria for keyboard
 * and screen reader support. Uses CSS Modules for styling with zero
 * !important declarations.
 *
 * @example
 * <TextField
 *   label="Email"
 *   value={email}
 *   onChange={setEmail}
 *   validationState="invalid"
 *   errorMessage="Please enter a valid email"
 * />
 */

import React, { forwardRef, CSSProperties } from 'react';
import {
    TextField as AriaTextField,
    Label,
    Input,
    Text,
    FieldError,
} from 'react-aria-components';
import stylesImport from './TextField.module.css';
import { cn } from '@/core/ui/utils/classNames';
import { translateSpectrumToken, DimensionValue } from '@/core/ui/utils/spectrumTokens';

// Defensive: handle case where CSS Module import fails during bundling
const styles = stylesImport || {};

export type ValidationState = 'valid' | 'invalid';

export interface TextFieldProps {
    /** Field label (can be string or ReactNode for complex labels) */
    label?: React.ReactNode;
    /** Input type (default: text) */
    type?: 'text' | 'password' | 'url' | 'email' | 'number';
    /** Current value */
    value?: string;
    /** Change handler */
    onChange?: (value: string) => void;
    /** Focus handler */
    onFocus?: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
    /** Blur handler */
    onBlur?: () => void;
    /** Placeholder text */
    placeholder?: string;
    /** Help text shown below input */
    description?: string;
    /** Error message shown when invalid */
    errorMessage?: string;
    /** Validation state */
    validationState?: ValidationState;
    /** Whether field is disabled */
    isDisabled?: boolean;
    /** Whether field is required */
    isRequired?: boolean;
    /** Auto focus on mount */
    autoFocus?: boolean;
    /** Width - Spectrum token or CSS value */
    width?: DimensionValue;
    /** Bottom margin - Spectrum token or CSS value */
    marginBottom?: DimensionValue;
    /** Additional CSS class */
    className?: string;
}

/**
 * TextField - Accessible text input with label and validation
 *
 * Replaces @adobe/react-spectrum TextField component.
 * Provides:
 * - Accessible label association
 * - Description and error message slots
 * - Validation states (valid/invalid)
 * - Required field indicator
 * - VS Code theme integration
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
    function TextField(
        {
            label,
            type = 'text',
            value,
            onChange,
            onFocus,
            onBlur,
            placeholder,
            description,
            errorMessage,
            validationState,
            isDisabled = false,
            isRequired = false,
            autoFocus = false,
            width,
            marginBottom,
            className,
        },
        ref,
    ) {
        const style: CSSProperties = {};
        if (width !== undefined) {
            style.width = translateSpectrumToken(width);
        }
        if (marginBottom !== undefined) {
            style.marginBottom = translateSpectrumToken(marginBottom);
        }

        // React Aria uses isInvalid boolean instead of validationState string
        const isInvalid = validationState === 'invalid';

        return (
            <AriaTextField
                className={cn(
                    styles.textField,
                    validationState && styles[validationState],
                    className,
                )}
                isDisabled={isDisabled}
                isRequired={isRequired}
                isInvalid={isInvalid}
                value={value}
                onChange={onChange}
                onFocus={onFocus}
                onBlur={onBlur}
                autoFocus={autoFocus}
                style={Object.keys(style).length > 0 ? style : undefined}
            >
                {label && (
                    <Label className={styles.label}>
                        {label}
                        {isRequired && <span className={styles.required}> *</span>}
                    </Label>
                )}
                <Input
                    ref={ref}
                    className={styles.input}
                    placeholder={placeholder}
                    type={type}
                />
                {description && !isInvalid && (
                    <Text slot="description" className={styles.description}>
                        {description}
                    </Text>
                )}
                {isInvalid && errorMessage && (
                    <FieldError className={styles.errorMessage}>
                        {errorMessage}
                    </FieldError>
                )}
            </AriaTextField>
        );
    },
);

TextField.displayName = 'TextField';
