/**
 * Template Loader
 *
 * Utility for loading and validating demo templates from demo-templates.json.
 * Provides runtime validation to ensure template integrity.
 */

import templatesConfig from '../../../../../templates/demo-templates.json';
import type {
    DemoTemplate,
    DemoTemplatesConfig,
    TemplateValidationResult,
} from '@/types/templates';

/**
 * Load demo templates from demo-templates.json
 *
 * @returns Promise resolving to array of demo templates
 */
export async function loadDemoTemplates(): Promise<DemoTemplate[]> {
    // The import is synchronous, but we return a Promise for consistency
    // and to support future async loading scenarios (e.g., remote templates)
    const config = templatesConfig as DemoTemplatesConfig;
    return config.templates;
}

/**
 * Validate component references against known components
 *
 * @param componentIds - Single component ID or array of component IDs to validate
 * @param knownComponents - Array of valid component IDs
 * @param category - Category name for error messages (e.g., 'frontend', 'dependency')
 * @returns Array of error messages for unknown components
 */
function validateComponentReferences(
    componentIds: string | string[] | undefined,
    knownComponents: string[],
    category: string,
): string[] {
    if (!componentIds) {
        return [];
    }

    const ids = Array.isArray(componentIds) ? componentIds : [componentIds];
    return ids
        .filter(id => !knownComponents.includes(id))
        .map(id => `Unknown ${category} component: ${id}`);
}

/**
 * Validate a demo template
 *
 * Checks that the template has all required fields and optionally validates
 * that component references exist in the known components list.
 *
 * @param template - The template to validate
 * @param knownComponents - Optional array of valid component IDs for reference validation
 * @returns Validation result with errors if any
 */
export function validateTemplate(
    template: DemoTemplate,
    knownComponents?: string[],
): TemplateValidationResult {
    const errors: string[] = [];

    // Validate required fields
    if (!template.id || template.id.length === 0) {
        errors.push('Template must have an id');
    }

    if (!template.name || template.name.length === 0) {
        errors.push('Template must have a name');
    }

    if (!template.description) {
        errors.push('Template must have a description');
    }

    if (!template.defaults) {
        errors.push('Template must have defaults');
    }

    // If knownComponents provided, validate component references
    if (knownComponents && knownComponents.length > 0 && template.defaults) {
        const { frontend, backend, dependencies, integrations, appBuilder } = template.defaults;

        errors.push(
            ...validateComponentReferences(frontend, knownComponents, 'frontend'),
            ...validateComponentReferences(backend, knownComponents, 'backend'),
            ...validateComponentReferences(dependencies, knownComponents, 'dependency'),
            ...validateComponentReferences(integrations, knownComponents, 'integration'),
            ...validateComponentReferences(appBuilder, knownComponents, 'appBuilder'),
        );
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}
