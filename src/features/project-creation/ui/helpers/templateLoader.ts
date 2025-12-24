/**
 * Template Loader
 *
 * Utility for loading and validating demo templates from templates.json.
 * Provides runtime validation to ensure template integrity.
 *
 * Updated for vertical stack architecture:
 * - stack: Reference to stacks.json
 * - brand: Reference to brands.json
 * - source: Git configuration for cloning
 */

import templatesConfig from '../../../../../templates/templates.json';
import type {
    DemoTemplate,
    DemoTemplatesConfig,
    TemplateValidationResult,
} from '@/types/templates';

/**
 * Options for template validation
 */
export interface TemplateValidationOptions {
    /** Known stack IDs for cross-reference validation */
    knownStacks?: string[];
    /** Known brand IDs for cross-reference validation */
    knownBrands?: string[];
}

/**
 * Load demo templates from templates.json
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
 * Validate a demo template
 *
 * Checks that the template has all required fields for the vertical stack architecture
 * and optionally validates that stack/brand references exist in known lists.
 *
 * @param template - The template to validate
 * @param options - Optional validation options for cross-reference validation
 * @returns Validation result with errors if any
 */
export function validateTemplate(
    template: DemoTemplate,
    options?: TemplateValidationOptions,
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

    // Validate new structure: stack, brand, source
    if (!template.stack) {
        errors.push('Template must have a stack');
    }

    if (!template.brand) {
        errors.push('Template must have a brand');
    }

    if (!template.source) {
        errors.push('Template must have a source');
    }

    // Cross-reference validation if options provided
    if (options) {
        // Validate stack reference
        if (
            options.knownStacks &&
            options.knownStacks.length > 0 &&
            template.stack &&
            !options.knownStacks.includes(template.stack)
        ) {
            errors.push(`Unknown stack reference: ${template.stack}`);
        }

        // Validate brand reference
        if (
            options.knownBrands &&
            options.knownBrands.length > 0 &&
            template.brand &&
            !options.knownBrands.includes(template.brand)
        ) {
            errors.push(`Unknown brand reference: ${template.brand}`);
        }
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}
