/**
 * Shared test utilities for useConfigNavigation hook tests
 */

import '@testing-library/jest-dom';
import { ServiceGroup, UniqueField } from '@/features/components/ui/hooks/useComponentConfig';

// Create mock elements with scrollIntoView
export function createMockElement(id: string): HTMLElement {
    const element = document.createElement('div');
    element.id = id;
    element.scrollIntoView = jest.fn();
    return element;
}

// Create mock input element
export function createMockInput(): HTMLInputElement {
    const input = document.createElement('input');
    input.focus = jest.fn();
    return input;
}

// Test data
export const testFields: UniqueField[] = [
    { key: 'FIELD_1', label: 'Field 1', type: 'text', required: true },
    { key: 'FIELD_2', label: 'Field 2', type: 'text', required: true },
    { key: 'FIELD_3', label: 'Field 3', type: 'text', required: false },
    { key: 'MESH_ENDPOINT', label: 'Mesh Endpoint', type: 'text', required: true },
];

export const testFieldsSecondGroup: UniqueField[] = [
    { key: 'FIELD_A', label: 'Field A', type: 'text', required: true },
    { key: 'FIELD_B', label: 'Field B', type: 'text', required: false },
];

export const testServiceGroups: ServiceGroup[] = [
    {
        id: 'section-1',
        name: 'Section 1',
        fields: testFields,
    },
    {
        id: 'section-2',
        name: 'Section 2',
        fields: testFieldsSecondGroup,
    },
];

export const emptyServiceGroups: ServiceGroup[] = [];

// Mock field values
export const fieldValues: Record<string, string | boolean | undefined> = {
    FIELD_1: 'value1',
    FIELD_2: '', // Empty - incomplete
    FIELD_3: 'value3',
    MESH_ENDPOINT: '', // Auto-populated, should be considered complete
    FIELD_A: 'valueA',
    FIELD_B: undefined, // Not required, undefined is ok
};

export const completeFieldValues: Record<string, string | boolean | undefined> = {
    FIELD_1: 'value1',
    FIELD_2: 'value2',
    FIELD_3: 'value3',
    MESH_ENDPOINT: 'https://mesh.example.com',
    FIELD_A: 'valueA',
    FIELD_B: 'valueB',
};

export function createGetFieldValue(values: Record<string, string | boolean | undefined>) {
    return (field: UniqueField): string | boolean | undefined => values[field.key];
}

export function setupDOMElements(groups: ServiceGroup[]): void {
    // Create section and field elements
    groups.forEach(group => {
        // Nav section
        const navSection = createMockElement(`nav-${group.id}`);
        document.body.appendChild(navSection);

        // Content section
        const section = createMockElement(`section-${group.id}`);
        document.body.appendChild(section);

        // Field elements
        group.fields.forEach(field => {
            const fieldWrapper = createMockElement(`field-${field.key}`);
            const input = createMockInput();
            fieldWrapper.appendChild(input);
            document.body.appendChild(fieldWrapper);

            const navField = createMockElement(`nav-field-${field.key}`);
            document.body.appendChild(navField);
        });
    });
}

export function cleanupDOMElements(): void {
    document.body.innerHTML = '';
}
