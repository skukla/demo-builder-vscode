import {
    TextField,
    Picker,
    Item,
    Flex,
    Text,
} from '@adobe/react-spectrum';
import React, { useCallback } from 'react';
import { FieldHelpButton, FieldHelpContent } from './FieldHelpButton';

export interface FormFieldOption {
    value: string;
    label: string;
}

export interface FormFieldProps {
    /** Field key/name */
    fieldKey: string;
    /** Field label */
    label: string;
    /** Field type */
    type: 'text' | 'url' | 'password' | 'select' | 'number';
    /** Current value */
    value: string;
    /** Change handler */
    onChange: (value: string) => void;
    /** Blur handler (e.g., for URL normalization) */
    onBlur?: () => void;
    /** Placeholder text */
    placeholder?: string;
    /** Description text */
    description?: string;
    /** Whether field is required */
    required?: boolean;
    /** Validation error message */
    error?: string;
    /** Whether to show error */
    showError?: boolean;
    /** Options for select type */
    options?: FormFieldOption[];
    /** Props for default value auto-selection */
    selectableDefaultProps?: Record<string, unknown>;
    /** Optional help content (text or screenshot) */
    help?: FieldHelpContent;
    /** Help display variant (default: modal) */
    helpVariant?: 'modal' | 'popover';
    /** Base URI for help screenshots */
    baseUri?: string;
}

/**
 * Molecular Component: FormField
 *
 * Reusable form input component supporting multiple field types (text, password,
 * url, select, number). Used in ConfigureScreen for configuration settings.
 *
 * @example
 * ```tsx
 * <FormField
 *   fieldKey="ADOBE_COMMERCE_URL"
 *   label="Commerce URL"
 *   type="url"
 *   value={url}
 *   onChange={setUrl}
 *   required
 *   error="Invalid URL"
 *   showError={touched}
 * />
 * ```
 */
export const FormField = React.memo<FormFieldProps>(({
    fieldKey,
    label,
    type,
    value,
    onChange,
    onBlur,
    placeholder,
    description,
    required = false,
    error,
    showError = false,
    options,
    selectableDefaultProps,
    help,
    helpVariant = 'modal',
    baseUri,
}) => {
    const handleChange = useCallback((val: string) => {
        onChange(val);
    }, [onChange]);

    // Common wrapper for scroll margin
    const wrapperStyle = {
        scrollMarginTop: '24px',
    };

    // Render label with optional help button
    const renderLabel = () => {
        if (!help) {
            return label;
        }
        return (
            <Flex alignItems="center" gap="size-50">
                <Text>{label}</Text>
                <FieldHelpButton
                    help={help}
                    variant={helpVariant}
                    fieldLabel={label}
                    baseUri={baseUri}
                />
            </Flex>
        );
    };

    switch (type) {
        case 'text':
        case 'url':
        case 'number':
            return (
                <div key={fieldKey} id={`field-${fieldKey}`} style={wrapperStyle}>
                    <TextField
                        label={renderLabel()}
                        value={String(value)}
                        onChange={handleChange}
                        onBlur={type === 'url' && onBlur ? onBlur : undefined}
                        description={description || placeholder}
                        isRequired={required}
                        validationState={showError ? 'invalid' : undefined}
                        errorMessage={showError ? error : undefined}
                        width="100%"
                        marginBottom="size-200"
                        {...(selectableDefaultProps || {})}
                    />
                </div>
            );

        case 'password':
            return (
                <div key={fieldKey} id={`field-${fieldKey}`} style={wrapperStyle}>
                    <TextField
                        label={renderLabel()}
                        type="password"
                        value={value as string}
                        onChange={handleChange}
                        description={description || placeholder}
                        isRequired={required}
                        validationState={showError ? 'invalid' : undefined}
                        errorMessage={showError ? error : undefined}
                        width="100%"
                        marginBottom="size-200"
                        {...(selectableDefaultProps || {})}
                    />
                </div>
            );

        case 'select':
            return (
                <div key={fieldKey} id={`field-${fieldKey}`} style={wrapperStyle}>
                    <Picker
                        label={renderLabel()}
                        selectedKey={value as string}
                        onSelectionChange={(key) => handleChange(String(key || ''))}
                        width="100%"
                        isRequired={required}
                        marginBottom="size-200"
                    >
                        {options?.map(option => (
                            <Item key={option.value}>{option.label}</Item>
                        )) || []}
                    </Picker>
                </div>
            );

        default:
            return null;
    }
});

FormField.displayName = 'FormField';
