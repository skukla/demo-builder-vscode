import {
    TextField,
    Checkbox,
    Picker,
    Item,
    Flex,
    Text,
} from '@adobe/react-spectrum';
import type { SpectrumTextFieldProps } from '@react-types/textfield';
import React from 'react';
import { UniqueField } from '../hooks/useComponentConfig';
import { renderTextWithCopyable } from '@/core/ui/components/forms/descriptionRenderer';
import { FieldHelpButton } from '@/core/ui/components/forms/FieldHelpButton';
import { useSelectableDefault } from '@/core/ui/hooks/useSelectableDefault';

interface ConfigFieldRendererProps {
    field: UniqueField;
    value: string | boolean | undefined;
    error: string | undefined;
    isTouched: boolean;
    onUpdate: (field: UniqueField, value: string | boolean) => void;
    /** Normalize URL field on blur (removes trailing slashes) */
    onNormalizeUrl?: (field: UniqueField) => void;
    /** Base URI for resolving help screenshot paths */
    baseUri?: string;
}

export function ConfigFieldRenderer({ field, value, error, isTouched, onUpdate, onNormalizeUrl, baseUri }: ConfigFieldRendererProps) {
    const selectableDefaultProps = useSelectableDefault();
    const showError = error && isTouched;

    // Get help content from field definition
    const helpContent = field.help;

    // Render label with optional help button
    const renderLabel = () => {
        if (!helpContent) {
            return field.label;
        }
        return (
            <Flex alignItems="center" gap="size-50">
                <Text>{field.label}</Text>
                <FieldHelpButton
                    help={helpContent}
                    fieldLabel={field.label}
                    baseUri={baseUri}
                />
            </Flex>
        );
    };

    // Note: MESH_ENDPOINT special-case removed - field is now filtered out in useComponentConfig
    // (auto-configured during project creation, not shown in Settings Collection)

    // Determine if field should be marked as required
    const isFieldRequired = field.required;

    // Determine if field has a default value (not empty and equals the default
    // from config). The emptiness check is what the equality alone cannot say:
    // an empty value is never "the default", not even when the default is empty.
    const hasDefault = Boolean(value) && value === field.default;

    // Render description with backtick-wrapped URLs as clickable links.
    const renderedDescription = field.description
        ? renderTextWithCopyable(field.description)
        : undefined;

    // The text, url and password fields are one TextField; only `type` and the
    // url-only blur differ, so the rest is built once and spread into both.
    const textFieldProps = (): Partial<SpectrumTextFieldProps> => ({
        label: renderLabel(),
        value: value as string,
        onChange: (val: string) => onUpdate(field, val),
        placeholder: field.placeholder,
        description: renderedDescription,
        isRequired: isFieldRequired,
        validationState: showError ? 'invalid' : undefined,
        errorMessage: showError ? error : undefined,
        width: '100%',
        marginBottom: 'size-200',
        ...(hasDefault ? selectableDefaultProps : {}),
    });

    switch (field.type) {
        case 'text':
        case 'url':
            return (
                <div key={field.key} id={`field-${field.key}`} className="config-field">
                    <TextField
                        {...textFieldProps()}
                        onBlur={field.type === 'url' && onNormalizeUrl ? () => onNormalizeUrl(field) : undefined}
                    />
                </div>
            );

        case 'password':
            return (
                <div key={field.key} id={`field-${field.key}`} className="config-field">
                    <TextField {...textFieldProps()} type="password" />
                </div>
            );

        case 'select':
            return (
                <div key={field.key} id={`field-${field.key}`} className="config-field">
                    <Picker
                        label={renderLabel()}
                        selectedKey={value as string}
                        onSelectionChange={(key) => onUpdate(field, String(key || ''))}
                        width="100%"
                        isRequired={field.required}
                        marginBottom="size-200"
                    >
                        {field.options?.map(option => (
                            <Item key={option.value}>{option.label}</Item>
                        )) || []}
                    </Picker>
                </div>
            );

        case 'boolean':
            return (
                <div key={field.key} id={`field-${field.key}`} className="config-field">
                    <Checkbox
                        isSelected={value as boolean}
                        onChange={(val) => onUpdate(field, val)}
                        aria-label={field.label}
                        marginBottom="size-200"
                    >
                        {field.label}
                    </Checkbox>
                </div>
            );

        default:
            return null;
    }
}
