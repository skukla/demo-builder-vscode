/**
 * Configure Screen Helper Functions
 *
 * Helper functions extracted from ConfigureScreen.tsx to reduce file size.
 */

import React from 'react';
import type {
    ComponentsData,
    ComponentData,
    UniqueField,
    ServiceGroup,
    ComponentInstance,
    FormFieldRenderContext,
} from './configureTypes';
import { FormField } from '@/core/ui/components/forms';
import { NavigationSection } from '@/core/ui/components/navigation';

/**
 * Get all component definitions from componentsData
 *
 * SOP §8: Extracted conditional spread chain to named helper
 *
 * @param data - Components data containing all category arrays
 * @returns Flattened array of all component definitions
 */
export function getAllComponentDefinitions(data: ComponentsData): ComponentData[] {
    const categories: (ComponentData[] | undefined)[] = [
        data.frontends,
        data.backends,
        data.dependencies,
        data.mesh,
        data.integrations,
        data.appBuilder,
    ];
    return categories.flatMap(arr => arr ?? []);
}

/**
 * Transform a ServiceGroup to a NavigationSection
 *
 * SOP §6: Extracted callback body complexity to named helper
 *
 * @param group - Service group to transform
 * @param isFieldComplete - Callback to check if a field is complete
 * @returns NavigationSection for NavigationPanel
 */
export function toNavigationSection(
    group: ServiceGroup,
    isFieldComplete: (field: UniqueField) => boolean,
): NavigationSection {
    const requiredFields = group.fields.filter(f => f.required);
    const completedFields = requiredFields.filter(f => isFieldComplete(f));

    return {
        id: group.id,
        label: group.label,
        fields: group.fields.map(f => ({
            key: f.key,
            label: f.label,
            isComplete: isFieldComplete(f),
        })),
        isComplete: requiredFields.length === 0 || completedFields.length === requiredFields.length,
        completedCount: completedFields.length,
        totalCount: requiredFields.length,
    };
}

/**
 * Render a FormField component with proper value/error handling
 *
 * SOP §6: Extracted callback body complexity to named helper
 *
 * @param field - The field definition
 * @param context - Render context with callbacks and state
 * @returns FormField JSX element
 */
export function renderFormField(
    field: UniqueField,
    context: FormFieldRenderContext,
): React.ReactElement {
    const value = context.getFieldValue(field);
    const error = context.validationErrors[field.key];
    const showError = error && context.touchedFields.has(field.key);
    const hasDefault = value && field.default && value === field.default;

    return (
        <FormField
            key={field.key}
            fieldKey={field.key}
            label={field.label}
            type={field.type as 'text' | 'url' | 'password' | 'select' | 'number'}
            value={value !== undefined && value !== null ? String(value) : ''}
            onChange={(val) => context.updateField(field, val)}
            placeholder={field.placeholder}
            description={field.description}
            required={field.required}
            error={error}
            showError={!!showError}
            options={field.options}
            selectableDefaultProps={hasDefault ? context.selectableDefaultProps : undefined}
            help={field.help}
        />
    );
}

/**
 * Check if a component has environment variables configured.
 *
 * SOP Compliance: Reduces optional chaining depth from 3 levels to 1.
 * Pattern: dep.configuration?.requiredEnvVars?.length -> hasComponentEnvVars(dep)
 *
 * @param componentDef - The component definition to check (may be undefined)
 * @returns True if the component has required or optional env vars configured
 */
export function hasComponentEnvVars(componentDef: ComponentData | undefined): boolean {
    if (!componentDef?.configuration) {
        return false;
    }
    const required = componentDef.configuration.requiredEnvVars?.length || 0;
    const optional = componentDef.configuration.optionalEnvVars?.length || 0;
    return required > 0 || optional > 0;
}

/**
 * Check if a component has environment variables configured
 * @deprecated Use hasComponentEnvVars instead, which handles undefined input
 */
export function componentHasEnvVars(componentDef: ComponentData): boolean {
    return hasComponentEnvVars(componentDef);
}

/**
 * Capitalize the first letter of a string
 */
export function capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Get component type display name from instance
 */
export function getComponentTypeDisplay(instance: ComponentInstance): string {
    const instanceType = instance?.type;
    return instanceType ? capitalizeFirst(instanceType) : 'Component';
}

/**
 * Discover components from componentInstances as fallback
 *
 * SOP §6: Extracted callback body complexity from forEach
 *
 * @param componentInstances - Map of component ID to instance
 * @param allComponentDefs - All component definitions to search
 * @returns Array of discovered components with their data and types
 */
export function discoverComponentsFromInstances(
    componentInstances: Record<string, ComponentInstance>,
    allComponentDefs: ComponentData[],
): Array<{ id: string; data: ComponentData; type: string }> {
    const discovered: Array<{ id: string; data: ComponentData; type: string }> = [];

    for (const [id, instance] of Object.entries(componentInstances)) {
        const componentDef = allComponentDefs.find((c: ComponentData) => c.id === id);
        if (componentDef && componentHasEnvVars(componentDef)) {
            discovered.push({
                id: componentDef.id,
                data: componentDef,
                type: getComponentTypeDisplay(instance),
            });
        }
    }

    return discovered;
}
