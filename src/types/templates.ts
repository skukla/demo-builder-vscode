/**
 * Demo Template Type Definitions
 *
 * Types for the demo templates system that allows users to select
 * pre-configured templates that pre-populate component selections.
 */

/**
 * TemplateDefaults - Default selections for a demo template
 */
export interface TemplateDefaults {
    /** Frontend component ID (e.g., 'citisignal-nextjs') */
    frontend?: string;
    /** Backend component ID (e.g., 'adobe-commerce-paas') */
    backend?: string;
    /** Array of dependency component IDs */
    dependencies?: string[];
    /** Array of integration component IDs */
    integrations?: string[];
    /** Array of App Builder app component IDs */
    appBuilder?: string[];
}

/**
 * DemoTemplate - A pre-configured demo template
 */
export interface DemoTemplate {
    /** Unique identifier for the template (e.g., 'citisignal') */
    id: string;
    /** Display name for the template */
    name: string;
    /** Description of what this template includes */
    description: string;
    /** Default component selections */
    defaults: TemplateDefaults;
    /** Optional icon for the template */
    icon?: string;
    /** Tags for filtering/categorization */
    tags?: string[];
    /** Whether this template is featured */
    featured?: boolean;
}

/**
 * TemplateValidationResult - Result of validating a template
 */
export interface TemplateValidationResult {
    /** Whether the template is valid */
    valid: boolean;
    /** Array of validation error messages */
    errors: string[];
}

/**
 * DemoTemplatesConfig - Root structure of demo-templates.json
 */
export interface DemoTemplatesConfig {
    /** Schema version */
    version: string;
    /** Array of available demo templates */
    templates: DemoTemplate[];
}
