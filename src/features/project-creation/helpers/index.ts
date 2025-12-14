/**
 * Helper functions extracted from createProjectWebview.ts
 * Provides reusable utilities for project creation workflow
 */

export { formatGroupName } from './formatters';
export { generateComponentEnvFile, EnvGenerationConfig } from './envFileGenerator';
export { getSetupInstructions, SetupInstruction } from './setupInstructions';
export { getEndpoint } from '@/features/mesh/services/meshEndpoint';
export { deployMeshComponent, MeshDeploymentResult } from '@/features/mesh/services/meshDeployment';

// UI validation function - simple validator for form fields
export function validateField(field: string, value: string): { isValid: boolean; message?: string } {
    // Basic validation - can be expanded as needed
    if (!value || value.trim().length === 0) {
        return { isValid: false, message: `${field} is required` };
    }
    return { isValid: true };
}
