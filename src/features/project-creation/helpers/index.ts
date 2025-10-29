/**
 * Helper functions extracted from createProjectWebview.ts
 * Provides reusable utilities for project creation workflow
 */

export { formatGroupName } from './formatters';
export { generateComponentEnvFile } from './envFileGenerator';
export { getSetupInstructions, SetupInstruction } from './setupInstructions';
export { getEndpoint } from '../../mesh/services/meshEndpoint';
export { deployMeshComponent, MeshDeploymentResult } from '../../mesh/services/meshDeployment';
// UI validation functions removed - only used by webview code (excluded from backend compilation)
