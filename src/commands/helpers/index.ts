/**
 * Helper functions extracted from createProjectWebview.ts
 * Provides reusable utilities for project creation workflow
 */

export { formatGroupName } from './formatters';
export { generateComponentEnvFile } from './envFileGenerator';
export { getSetupInstructions, SetupInstruction } from './setupInstructions';
export { getEndpoint } from './meshEndpoint';
export { deployMeshComponent, MeshDeploymentResult } from './meshDeployment';
export { validateFieldUI as validateField, validateProjectNameUI as validateProjectName, validateCommerceUrlUI as validateCommerceUrl, ValidationResult } from '@/shared/validation';
