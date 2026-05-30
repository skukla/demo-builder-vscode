/**
 * Project Creation Services
 *
 * Extracted services for complex project creation operations.
 * Moved from handlers/services/ to feature-level services/.
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
    generateAIContextFiles,
    openProjectAsWorkspace,
    type FinalizationContext,
} from './projectFinalizationService';

export { ensureEdsContent } from './edsContentSetup';

export {
    registerGlobalMcp,
    GLOBAL_MCP_REG_STATE_KEY,
    type GlobalMcpRegistrationState,
} from './mcpConfigWriter';
