import React, { useCallback } from 'react';
import {
    TextField,
    Checkbox,
    Picker,
    Item
} from '@adobe/react-spectrum';

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
    type: 'text' | 'url' | 'password' | 'select' | 'boolean';
    /** Current value */
    value: string | boolean;
    /** Change handler */
    onChange: (value: string | boolean) => void;
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
    selectableDefaultProps?: Record<string, any>;
}

/**
 * Molecular Component: FormField
 *
 * Reusable form input component supporting multiple field types (text, password,
 * url, select, boolean). Used in ConfigureScreen for configuration settings.
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
    placeholder,
    description,
    required = false,
    error,
    showError = false,
    options,
    selectableDefaultProps
}) => {
    const handleChange = useCallback((val: string | boolean) => {
        onChange(val);
    }, [onChange]);

    // Common wrapper for scroll margin
    const wrapperStyle = {
        scrollMarginTop: '24px'
    };

    switch (type) {
        case 'text':
        case 'url':
            return (
                <div key={fieldKey} id={`field-${fieldKey}`} style={wrapperStyle}>
                    <TextField
                        label={label}
                        value={value as string}
                        onChange={handleChange}
                        placeholder={placeholder}
                        description={description}
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
                        label={label}
                        type="password"
                        value={value as string}
                        onChange={handleChange}
                        placeholder={placeholder}
                        description={description}
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
                        label={label}
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

        case 'boolean':
            return (
                <div key={fieldKey} id={`field-${fieldKey}`} style={wrapperStyle}>
                    <Checkbox
                        isSelected={value as boolean}
                        onChange={handleChange}
                        aria-label={label}
                        marginBottom="size-200"
                    >
                        {label}
                    </Checkbox>
                </div>
            );

        default:
            return null;
    }
});

FormField.displayName = 'FormField';
