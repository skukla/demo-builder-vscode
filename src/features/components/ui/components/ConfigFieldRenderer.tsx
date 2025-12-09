import {
    TextField,
    Checkbox,
    Picker,
    Item,
    Flex,
    Text,
} from '@adobe/react-spectrum';
import React from 'react';
import { useSelectableDefault } from '@/core/ui/hooks/useSelectableDefault';
import { FieldHelpButton } from '@/core/ui/components/forms';
import { UniqueField } from '../hooks/useComponentConfig';

interface ConfigFieldRendererProps {
    field: UniqueField;
    value: string | boolean | undefined;
    error: string | undefined;
    isTouched: boolean;
    onUpdate: (field: UniqueField, value: string | boolean) => void;
    /** Base URI for resolving help screenshot paths */
    baseUri?: string;
}

export function ConfigFieldRenderer({ field, value, error, isTouched, onUpdate, baseUri }: ConfigFieldRendererProps) {
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

    // Special-case: defer MESH_ENDPOINT input
    if (field.key === 'MESH_ENDPOINT') {
        const hasValue = value && (value as string).length > 0;
        const description = hasValue
            ? 'Auto-filled from API Mesh setup'
            : (field.description || 'This will be set automatically after Mesh deployment.');

        return (
            <div key={field.key} id={`field-${field.key}`} className="config-field">
                <TextField
                    label={field.label}
                    value={value as string}
                    onChange={(val) => onUpdate(field, val)}
                    placeholder={field.placeholder || 'Will be auto-filled from API Mesh'}
                    description={description}
                    isReadOnly
                    width="100%"
                    marginBottom="size-200"
                />
            </div>
        );
    }

    // Determine if field should be marked as required
    const isFieldRequired = field.required;

    // Determine if field has a default value (not empty and equals the default from config)
    const hasDefault = value && field.default && value === field.default;

    switch (field.type) {
        case 'text':
        case 'url':
            return (
                <div key={field.key} id={`field-${field.key}`} className="config-field">
                    <TextField
                        label={renderLabel()}
                        value={value as string}
                        onChange={(val) => onUpdate(field, val)}
                        placeholder={field.placeholder}
                        description={field.description}
                        isRequired={isFieldRequired}
                        validationState={showError ? 'invalid' : undefined}
                        errorMessage={showError ? error : undefined}
                        width="100%"
                        marginBottom="size-200"
                        {...(hasDefault ? selectableDefaultProps : {})}
                    />
                </div>
            );

        case 'password':
            return (
                <div key={field.key} id={`field-${field.key}`} className="config-field">
                    <TextField
                        label={renderLabel()}
                        type="password"
                        value={value as string}
                        onChange={(val) => onUpdate(field, val)}
                        placeholder={field.placeholder}
                        description={field.description}
                        isRequired={isFieldRequired}
                        validationState={showError ? 'invalid' : undefined}
                        errorMessage={showError ? error : undefined}
                        width="100%"
                        marginBottom="size-200"
                        {...(hasDefault ? selectableDefaultProps : {})}
                    />
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
