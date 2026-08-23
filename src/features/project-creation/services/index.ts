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
    type FinalizationContext,
} from './projectFinalizationService';

// Tiered AI-bundle refresh (ADR-013). `generateAIContextFiles` moved here from
// projectFinalizationService — the barrel preserves the name for all callers.
export {
    generateAIContextFiles,
    // Tier functions: plan-mandated public API for future per-tier callers —
    // the activation sweep currently imports them directly, not via the barrel.
    refreshMcpConfigs,
    refreshContextAndSkills,
    type AiBundleRefreshResult,
} from './aiBundleService';

export { ensureEdsContent } from './edsContentSetup';

export {
    resolveMcpToolsDir,
    installAiDefaultsMcpTools,
    readInstalledMcpPackages,
    applicableMcpPackages,
    type InstallAiDefaultsResult,
} from './aiDefaultsInstaller';

export { projectNeedsAppBuilderTooling, aiDefaultsEntryApplies } from './aiToolingGate';
