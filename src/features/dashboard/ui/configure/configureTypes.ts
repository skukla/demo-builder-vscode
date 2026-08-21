/**
 * Configure Screen Types
 *
 * Type definitions for the Configure Screen component.
 */

import type { EnvVarDefinition } from '@/types/components';
import type { ConfigureComponentsData } from '@/types/webviewPayloads';

/**
 * Feature-local alias for the wire shape. The one declaration lives in
 * `@/types/webviewPayloads` (`ConfigureInitialData.componentsData`); component
 * entries are full `TransformedComponentDefinition`s — the registry passes
 * them through untransformed, so there is no narrower "ComponentData" view.
 */
export type ComponentsData = ConfigureComponentsData;

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
