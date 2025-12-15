/**
 * Project Creation Handler Services
 *
 * Extracted services for complex project creation operations.
 */

export {
    cloneAllComponents,
    installAllComponents,
    type ComponentDefinitionEntry,
    type InstallationContext,
} from './componentInstallationOrchestrator';

export {
    deployNewMesh,
    linkExistingMesh,
    shouldConfigureExistingMesh,
    type MeshSetupContext,
    type MeshApiConfig,
} from './meshSetupService';

export {
    generateEnvironmentFiles,
    finalizeProject,
    sendCompletionAndCleanup,
    type FinalizationContext,
} from './projectFinalizationService';
