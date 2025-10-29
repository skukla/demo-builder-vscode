import React from 'react';
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
export declare const FormField: React.NamedExoticComponent<FormFieldProps>;
//# sourceMappingURL=FormField.d.ts.map