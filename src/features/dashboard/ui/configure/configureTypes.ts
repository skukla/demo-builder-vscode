/**
 * Configure Screen Types
 *
 * Type definitions for the Configure Screen component.
 */

import type { Project } from '@/types/base';
import type { EnvVarDefinition } from '@/types/components';

export interface ComponentsData {
    frontends?: ComponentData[];
    backends?: ComponentData[];
    dependencies?: ComponentData[];
    mesh?: ComponentData[];
    integrations?: ComponentData[];
    appBuilder?: ComponentData[];
    envVars?: Record<string, EnvVarDefinition>;
}

export interface ConfigureScreenProps {
    project: Project;
    componentsData: ComponentsData;
    existingEnvValues?: Record<string, Record<string, string>>;
}

export interface ComponentData {
    id: string;
    name: string;
    description?: string;
    dependencies?: {
        required?: string[];
        optional?: string[];
    };
    configuration?: {
        requiredEnvVars?: string[];
        optionalEnvVars?: string[];
    };
}

export interface UniqueField extends EnvVarDefinition {
    componentIds: string[];
}

export interface ServiceGroup {
    id: string;
    label: string;
    fields: UniqueField[];
}

export interface ComponentInstance {
    type?: string;
}

export interface SaveConfigurationResponse {
    success: boolean;
    error?: string;
}

/**
 * Context for rendering form fields
 */
export interface FormFieldRenderContext {
    getFieldValue: (field: UniqueField) => string | boolean | undefined;
    validationErrors: Record<string, string>;
    touchedFields: Set<string>;
    updateField: (field: UniqueField, value: string | boolean) => void;
    selectableDefaultProps: Record<string, unknown>;
}
