/**
 * Mesh Feature
 *
 * Handles API Mesh deployment, configuration, status checking, and management.
 * Provides integration with Adobe I/O Runtime for mesh operations.
 */

// Commands
export { DeployMeshCommand } from './commands/deployMesh';

// Handlers
export { handleCheckApiMesh } from './handlers/checkHandler';
export { handleCreateApiMesh } from './handlers/createHandler';
export { handleDeleteApiMesh } from './handlers/deleteHandler';
export { getSetupInstructions, getEndpoint as getHandlerEndpoint } from './handlers/shared';

// Services
export { deployMeshComponent, type MeshDeploymentResult as MeshDeploymentResult_Service } from './services/meshDeployment';
export { getEndpoint as getServiceEndpoint } from './services/meshEndpoint';
export { MeshDeployer } from './services/meshDeployer';
export { verifyMeshDeployment, syncMeshStatus, type MeshVerificationResult } from './services/meshVerifier';
export { waitForMeshDeployment, type MeshDeploymentResult as MeshDeploymentVerificationResult } from './services/meshDeploymentVerifier';
export {
    getMeshEnvVars,
    fetchDeployedMeshConfig,
    calculateMeshSourceHash,
    getCurrentMeshState,
    detectMeshChanges,
    updateMeshState,
    detectFrontendChanges,
    type MeshState,
    type MeshChanges,
} from './services/stalenessDetector';
