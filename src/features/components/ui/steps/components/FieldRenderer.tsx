import React from 'react';
import { TextField, Checkbox, Picker, Item } from '@adobe/react-spectrum';
import { useSelectableDefault } from '@/core/ui/hooks/useSelectableDefault';
import { UniqueField } from '../ComponentConfigStep';

interface FieldRendererProps {
    field: UniqueField;
    value: string | boolean | undefined;
    onChange: (field: UniqueField, value: string | boolean) => void;
    touchedFields: Set<string>;
    validationErrors: Record<string, string>;
}

export function FieldRenderer({
    field,
    value,
    onChange,
    touchedFields,
    validationErrors,
}: FieldRendererProps) {
    const selectableDefaultProps = useSelectableDefault();

    const error = validationErrors[field.key];
    const showError = error && touchedFields.has(field.key);
    const isFieldRequired = field.required;
    const hasDefault = value && field.default && value === field.default;

    const wrapField = (content: React.ReactNode) => (
        <div key={field.key} id={`field-${field.key}`} style={{ scrollMarginTop: '24px' }}>
            {content}
        </div>
    );

    // Special case: MESH_ENDPOINT is read-only
    if (field.key === 'MESH_ENDPOINT') {
        const hasValue = value && (value as string).length > 0;
        const description = hasValue
            ? 'Auto-filled from API Mesh setup'
            : (field.description || 'This will be set automatically after Mesh deployment.');

        return wrapField(
            <TextField
                label={field.label}
                value={value as string}
                onChange={(val) => onChange(field, val)}
                placeholder={field.placeholder || 'Will be auto-filled from API Mesh'}
                description={description}
                isReadOnly
                width="100%"
                marginBottom="size-200"
            />
        );
    }

    switch (field.type) {
        case 'text':
        case 'url':
            return wrapField(
                <TextField
                    label={field.label}
                    value={value as string}
                    onChange={(val) => onChange(field, val)}
                    placeholder={field.placeholder}
                    description={field.description}
                    isRequired={isFieldRequired}
                    validationState={showError ? 'invalid' : undefined}
                    errorMessage={showError ? error : undefined}
                    width="100%"
                    marginBottom="size-200"
                    {...(hasDefault ? selectableDefaultProps : {})}
                />
            );

        case 'password':
            return wrapField(
                <TextField
                    label={field.label}
                    type="password"
                    value={value as string}
                    onChange={(val) => onChange(field, val)}
                    placeholder={field.placeholder}
                    description={field.description}
                    isRequired={isFieldRequired}
                    validationState={showError ? 'invalid' : undefined}
                    errorMessage={showError ? error : undefined}
                    width="100%"
                    marginBottom="size-200"
                    {...(hasDefault ? selectableDefaultProps : {})}
                />
            );

        case 'select':
            return wrapField(
                <Picker
                    label={field.label}
                    selectedKey={value as string}
                    onSelectionChange={(key) => onChange(field, String(key || ''))}
                    width="100%"
                    isRequired={field.required}
                    marginBottom="size-200"
                >
                    {field.options?.map(option => (
                        <Item key={option.value}>{option.label}</Item>
                    )) || []}
                </Picker>
            );

        case 'boolean':
            return wrapField(
                <Checkbox
                    isSelected={value as boolean}
                    onChange={(val) => onChange(field, val)}
                    aria-label={field.label}
                    marginBottom="size-200"
                >
                    {field.label}
                </Checkbox>
            );

        default:
            return null;
    }
}
