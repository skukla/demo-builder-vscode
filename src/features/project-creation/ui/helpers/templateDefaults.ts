/**
 * Template Defaults
 *
 * Utility functions for finding templates and applying their defaults
 * to wizard state. Used when a user selects a demo template.
 */

import type { DemoTemplate } from '@/types/templates';
import type { WizardState, ComponentSelection } from '@/types/webview';

/**
 * Find a template by its ID
 *
 * @param templateId - The template ID to search for
 * @param templates - Array of available templates
 * @returns The matching template or undefined if not found
 */
export function getTemplateById(
    templateId: string,
    templates: DemoTemplate[],
): DemoTemplate | undefined {
    return templates.find(template => template.id === templateId);
}

/**
 * Apply template defaults to wizard state
 *
 * Takes the current wizard state and applies the selected template's
 * default component selections and configuration values. Returns unchanged
 * state if no template is selected or template is not found.
 *
 * @param state - Current wizard state
 * @param templates - Array of available templates
 * @returns New state with template defaults applied to components and configs
 */
export function applyTemplateDefaults(
    state: WizardState,
    templates: DemoTemplate[],
): WizardState {
    // If no template selected, return state unchanged
    if (!state.selectedTemplate) {
        return state;
    }

    // Find the selected template
    const template = getTemplateById(state.selectedTemplate, templates);

    // If template not found, return state unchanged
    if (!template) {
        return state;
    }

    // Build component selection from template defaults
    const { defaults } = template;
    const components: ComponentSelection = {
        frontend: defaults.frontend,
        backend: defaults.backend,
        dependencies: defaults.dependencies ?? [],
        integrations: defaults.integrations ?? [],
        appBuilderApps: defaults.appBuilder ?? [],
    };

    // Build component configs from template config defaults
    // Store under frontend component ID (envFileGenerator searches all components)
    let componentConfigs = state.componentConfigs;
    if (defaults.configDefaults && defaults.frontend) {
        const configCount = Object.keys(defaults.configDefaults).length;
        console.debug(`[Template] Applied ${configCount} config defaults from "${template.id}" template`);
        componentConfigs = {
            ...state.componentConfigs,
            [defaults.frontend]: {
                ...state.componentConfigs?.[defaults.frontend],
                ...defaults.configDefaults,
            },
        };
    }

    // Return new state with components and configs applied
    return {
        ...state,
        components,
        componentConfigs,
    };
}
