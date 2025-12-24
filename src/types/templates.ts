/**
 * Demo Template Type Definitions
 *
 * Types for the demo templates system that allows users to select
 * pre-configured templates that pre-populate component selections.
 */

/**
 * TemplateGitOptions - Git clone options for template source
 */
export interface TemplateGitOptions {
    /** Perform a shallow clone (git clone --depth 1) */
    shallow?: boolean;
    /** Initialize and update submodules recursively */
    recursive?: boolean;
}

/**
 * TemplateSource - Git source configuration for template cloning
 */
export interface TemplateSource {
    /** Source type (currently only 'git' supported) */
    type: string;
    /** Repository URL */
    url: string;
    /** Branch to clone */
    branch: string;
    /** Optional git clone options */
    gitOptions?: TemplateGitOptions;
}

/**
 * TemplateSubmodule - Definition for a submodule to be included
 */
export interface TemplateSubmodule {
    /** Path within the project where submodule should be placed */
    path: string;
    /** Repository reference (e.g., 'org/repo-name') */
    repository: string;
}

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
    /** Default configuration values (env var name → value) */
    configDefaults?: Record<string, string>;
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
    /** Default component selections (for legacy wizard flow) */
    defaults?: TemplateDefaults;
    /** Optional icon for the template */
    icon?: string;
    /** Tags for filtering/categorization */
    tags?: string[];
    /** Whether this template is featured */
    featured?: boolean;
    /** Stack reference ID (from stacks.json) */
    stack?: string;
    /** Brand reference ID (from brands.json) */
    brand?: string;
    /** Git source configuration for cloning */
    source?: TemplateSource;
    /** Submodule definitions to include */
    submodules?: Record<string, TemplateSubmodule>;
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
 * DemoTemplatesConfig - Root structure of templates.json
 */
export interface DemoTemplatesConfig {
    /** Schema version */
    version: string;
    /** Array of available demo templates */
    templates: DemoTemplate[];
}
