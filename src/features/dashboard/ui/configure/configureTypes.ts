/**
 * Configure Screen Types
 *
 * Type definitions for the Configure Screen component.
 */

import { ComponentEnvVar } from '@/types/webview';
import type { Project } from '@/types/base';

export interface ComponentsData {
    frontends?: ComponentData[];
    backends?: ComponentData[];
    dependencies?: ComponentData[];
    integrations?: ComponentData[];
    appBuilder?: ComponentData[];
    envVars?: Record<string, ComponentEnvVar>;
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

export interface UniqueField extends ComponentEnvVar {
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
