/**
 * Project Creation Services Index Tests
 *
 * Verifies that all project creation services are properly exported
 * from the feature-level services directory (moved from handlers/services).
 */

// Import all exports from the new feature-level services directory
import {
    // Component Installation Orchestrator
    cloneAllComponents,
    installAllComponents,
    type ComponentDefinitionEntry,
    type InstallationContext,

    // Mesh Setup Service
    deployNewMesh,
    linkExistingMesh,
    shouldConfigureExistingMesh,
    type MeshSetupContext,
    type MeshApiConfig,

    // Project Finalization Service
    generateEnvironmentFiles,
    finalizeProject,
    sendCompletionAndCleanup,
    type FinalizationContext,
} from '@/features/project-creation/services';

describe('project-creation services exports', () => {
    describe('componentInstallationOrchestrator', () => {
        it('should export cloneAllComponents function', () => {
            expect(typeof cloneAllComponents).toBe('function');
        });

        it('should export installAllComponents function', () => {
            expect(typeof installAllComponents).toBe('function');
        });
    });

    describe('meshSetupService', () => {
        it('should export deployNewMesh function', () => {
            expect(typeof deployNewMesh).toBe('function');
        });

        it('should export linkExistingMesh function', () => {
            expect(typeof linkExistingMesh).toBe('function');
        });

        it('should export shouldConfigureExistingMesh function', () => {
            expect(typeof shouldConfigureExistingMesh).toBe('function');
        });
    });

    describe('projectFinalizationService', () => {
        it('should export generateEnvironmentFiles function', () => {
            expect(typeof generateEnvironmentFiles).toBe('function');
        });

        it('should export finalizeProject function', () => {
            expect(typeof finalizeProject).toBe('function');
        });

        it('should export sendCompletionAndCleanup function', () => {
            expect(typeof sendCompletionAndCleanup).toBe('function');
        });
    });

    describe('type exports', () => {
        // Type-only tests - these validate that types are properly exported
        // by verifying they can be used in type annotations

        it('should export InstallationContext type', () => {
            // This test validates the type exists by using it
            const context: Partial<InstallationContext> = {};
            expect(context).toBeDefined();
        });

        it('should export ComponentDefinitionEntry type', () => {
            const entry: Partial<ComponentDefinitionEntry> = {};
            expect(entry).toBeDefined();
        });

        it('should export MeshSetupContext type', () => {
            const context: Partial<MeshSetupContext> = {};
            expect(context).toBeDefined();
        });

        it('should export MeshApiConfig type', () => {
            const config: Partial<MeshApiConfig> = {};
            expect(config).toBeDefined();
        });

        it('should export FinalizationContext type', () => {
            const context: Partial<FinalizationContext> = {};
            expect(context).toBeDefined();
        });
    });
});
