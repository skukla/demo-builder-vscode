/**
 * Setup instructions processing for API services
 */

import { ComponentRegistry, TransformedComponentDefinition, RawComponentDefinition } from '@/types/components';
import { ApiServicesConfig } from '@/types/handlers';

export interface SetupInstruction {
    step: string;
    details: string;
    important?: boolean;
}

/**
 * RawInstruction - Raw instruction before processing
 */
interface RawInstruction {
    step: string;
    details: string;
    important?: boolean;
    dynamicValues?: {
        ALLOWED_DOMAINS?: boolean;
        [key: string]: unknown;
    };
}

/**
 * Process a single instruction with dynamic value substitution (SOP §6 compliance)
 *
 * Extracts callback body for improved readability and testability.
 */
function processInstruction(
    instruction: RawInstruction,
    selectedComponents: string[],
    componentsData: ComponentRegistry | undefined,
): SetupInstruction {
    let details = instruction.details;

    // Process {{ALLOWED_DOMAINS}} substitution
    if (instruction.dynamicValues?.ALLOWED_DOMAINS) {
        // Get frontends from selected components
        const frontends = selectedComponents.filter((comp: string) => {
            // Check if it's a frontend by looking it up in components data
            const components = componentsData?.components;
            return components?.frontends?.some((f: TransformedComponentDefinition) => f.id === comp);
        });

        // Get ports from frontends
        const allowedDomains = frontends.map((compId: string) => {
            const components = componentsData?.components;
            const frontend = components?.frontends?.find((f: TransformedComponentDefinition) => f.id === compId);
            // Access port from the base configuration type
            const baseConfig = frontend?.configuration as RawComponentDefinition['configuration'];
            const port = baseConfig?.port || 3000;
            return `localhost:${port}`;
        }).join(', ');

        details = details.replace('{{ALLOWED_DOMAINS}}', allowedDomains || 'localhost:3000');
    }

    return {
        step: instruction.step,
        details,
        important: instruction.important,
    };
}

/**
 * Get setup instructions with dynamic values resolved
 *
 * @param apiServicesConfig - API services configuration from templates/api-services.json
 * @param selectedComponents - Array of selected component IDs
 * @param componentsData - Full components data structure
 * @returns Processed setup instructions with dynamic values replaced, or undefined if no instructions
 */
export function getSetupInstructions(
    apiServicesConfig: ApiServicesConfig | undefined,
    selectedComponents: string[],
    componentsData: ComponentRegistry | undefined,
): SetupInstruction[] | undefined {
    const meshConfig = apiServicesConfig?.services?.apiMesh;
    const rawInstructions = meshConfig?.setupInstructions;

    if (!rawInstructions || !Array.isArray(rawInstructions)) {
        return undefined;
    }

    // SOP §6: Using extracted transformation function
    return rawInstructions.map((instruction: RawInstruction) =>
        processInstruction(instruction, selectedComponents, componentsData),
    );
}
