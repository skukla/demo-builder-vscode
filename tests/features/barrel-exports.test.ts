/**
 * Barrel Export Tests
 *
 * Verifies that feature index.ts files export only public API
 * and do not expose internal implementation details.
 *
 * This ensures:
 * 1. All cross-feature imports continue working (backward compatibility)
 * 2. Internal helpers are not accidentally exposed
 * 3. Wildcards are replaced with curated explicit exports
 */

describe('Feature Barrel Exports', () => {
    describe('project-creation feature', () => {
        it('should export CreateProjectWebviewCommand', async () => {
            // Arrange: Import from barrel
            const exports = await import('@/features/project-creation');

            // Assert: Command should be exported
            expect(exports.CreateProjectWebviewCommand).toBeDefined();
            expect(typeof exports.CreateProjectWebviewCommand).toBe('function');
        });

        it('should export HandlerRegistry', async () => {
            const exports = await import('@/features/project-creation');

            expect(exports.HandlerRegistry).toBeDefined();
            expect(typeof exports.HandlerRegistry).toBe('function');
        });

        it('should export helper functions for cross-feature use', async () => {
            const exports = await import('@/features/project-creation');

            // Formatters exported from helpers
            expect(exports.formatGroupName).toBeDefined();
            expect(exports.generateComponentEnvFile).toBeDefined();
        });

        it('should NOT export internal UI components via barrel', async () => {
            const exports = await import('@/features/project-creation');

            // UI components should be imported directly, not via barrel
            // (They're part of webpack bundle, not node compilation)
            expect((exports as Record<string, unknown>).ConfigurationSummary).toBeUndefined();
            expect((exports as Record<string, unknown>).WelcomeStep).toBeUndefined();
            expect((exports as Record<string, unknown>).ReviewStep).toBeUndefined();
        });
    });

    describe('dashboard feature', () => {
        it('should export ProjectDashboardWebviewCommand', async () => {
            const exports = await import('@/features/dashboard');

            expect(exports.ProjectDashboardWebviewCommand).toBeDefined();
            expect(typeof exports.ProjectDashboardWebviewCommand).toBe('function');
        });

        it('should export ConfigureProjectWebviewCommand', async () => {
            const exports = await import('@/features/dashboard');

            expect(exports.ConfigureProjectWebviewCommand).toBeDefined();
            expect(typeof exports.ConfigureProjectWebviewCommand).toBe('function');
        });

        it('should export DashboardHandlerRegistry', async () => {
            const exports = await import('@/features/dashboard');

            expect(exports.DashboardHandlerRegistry).toBeDefined();
            expect(typeof exports.DashboardHandlerRegistry).toBe('function');
        });

        it('should NOT export internal mesh status helpers', async () => {
            const exports = await import('@/features/dashboard');

            // Internal helpers should not be exposed
            expect((exports as Record<string, unknown>).buildStatusPayload).toBeUndefined();
            expect((exports as Record<string, unknown>).hasMeshDeploymentRecord).toBeUndefined();
            expect((exports as Record<string, unknown>).checkMeshStatusAsync).toBeUndefined();
        });

        it('should NOT export individual handler functions', async () => {
            const exports = await import('@/features/dashboard');

            // Individual handlers are internal - only the registry is public
            expect((exports as Record<string, unknown>).handleReady).toBeUndefined();
            expect((exports as Record<string, unknown>).handleRequestStatus).toBeUndefined();
        });
    });

    describe('prerequisites feature', () => {
        it('should export PrerequisitesManager class', async () => {
            const exports = await import('@/features/prerequisites');

            expect(exports.PrerequisitesManager).toBeDefined();
            expect(typeof exports.PrerequisitesManager).toBe('function');
        });

        it('should export prerequisite types', async () => {
            // Type exports are verified at compile time, but we can check they exist
            const exports = await import('@/features/prerequisites');

            // These are type re-exports - they should be accessible for typing
            // The actual types are validated by TypeScript compilation
            expect(Object.keys(exports)).toContain('PrerequisitesManager');
        });

        it('should export handler functions for HandlerRegistry use', async () => {
            const exports = await import('@/features/prerequisites');

            // Handlers are needed for HandlerRegistry in project-creation
            expect(exports.handleCheckPrerequisites).toBeDefined();
            expect(exports.handleInstallPrerequisite).toBeDefined();
            expect(exports.handleContinuePrerequisites).toBeDefined();
        });

        it('should NOT export internal versioning utilities', async () => {
            const exports = await import('@/features/prerequisites');

            // Versioning utilities are internal to PrerequisitesManager
            expect((exports as Record<string, unknown>).checkVersionSatisfaction).toBeUndefined();
            expect((exports as Record<string, unknown>).getLatestInFamily).toBeUndefined();
            expect((exports as Record<string, unknown>).resolveDependencies).toBeUndefined();
        });

        it('should NOT export cache manager directly', async () => {
            const exports = await import('@/features/prerequisites');

            // Cache manager is internal, access via PrerequisitesManager.getCacheManager()
            expect((exports as Record<string, unknown>).PrerequisitesCacheManager).toBeUndefined();
        });
    });

    describe('components feature', () => {
        it('should export ComponentRegistryManager', async () => {
            const exports = await import('@/features/components');

            expect(exports.ComponentRegistryManager).toBeDefined();
            expect(typeof exports.ComponentRegistryManager).toBe('function');
        });

        it('should export DependencyResolver', async () => {
            const exports = await import('@/features/components');

            expect(exports.DependencyResolver).toBeDefined();
            expect(typeof exports.DependencyResolver).toBe('function');
        });

        it('should export ComponentManager', async () => {
            const exports = await import('@/features/components');

            expect(exports.ComponentManager).toBeDefined();
            expect(typeof exports.ComponentManager).toBe('function');
        });

        it('should export ComponentTreeProvider', async () => {
            const exports = await import('@/features/components');

            expect(exports.ComponentTreeProvider).toBeDefined();
            expect(typeof exports.ComponentTreeProvider).toBe('function');
        });

        it('should export ComponentHandler', async () => {
            const exports = await import('@/features/components');

            expect(exports.ComponentHandler).toBeDefined();
            expect(typeof exports.ComponentHandler).toBe('function');
        });

        it('should export service group transforms', async () => {
            const exports = await import('@/features/components');

            // Used by dashboard configure UI
            expect(exports.toServiceGroupWithSortedFields).toBeDefined();
            expect(typeof exports.toServiceGroupWithSortedFields).toBe('function');
        });

        it('should export handler functions for HandlerRegistry use', async () => {
            const exports = await import('@/features/components');

            // Handlers needed by project-creation HandlerRegistry
            expect(exports.handleLoadComponents).toBeDefined();
            expect(exports.handleUpdateComponentSelection).toBeDefined();
            expect(exports.handleLoadDependencies).toBeDefined();
        });

        it('should NOT export internal transform utilities', async () => {
            const exports = await import('@/features/components');

            // These are internal helpers in componentTransforms
            expect((exports as Record<string, unknown>).toComponentDataArray).toBeUndefined();
            expect((exports as Record<string, unknown>).toDependencyData).toBeUndefined();
        });
    });

    describe('updates feature', () => {
        it('should export UpdateManager', async () => {
            const exports = await import('@/features/updates');

            expect(exports.UpdateManager).toBeDefined();
            expect(typeof exports.UpdateManager).toBe('function');
        });

        it('should export ComponentUpdater', async () => {
            const exports = await import('@/features/updates');

            expect(exports.ComponentUpdater).toBeDefined();
            expect(typeof exports.ComponentUpdater).toBe('function');
        });

        it('should export ExtensionUpdater', async () => {
            const exports = await import('@/features/updates');

            expect(exports.ExtensionUpdater).toBeDefined();
            expect(typeof exports.ExtensionUpdater).toBe('function');
        });

        it('should export CheckUpdatesCommand', async () => {
            const exports = await import('@/features/updates');

            expect(exports.CheckUpdatesCommand).toBeDefined();
            expect(typeof exports.CheckUpdatesCommand).toBe('function');
        });

        it('should NOT export internal type guards', async () => {
            const exports = await import('@/features/updates');

            // Internal helpers should not be exposed
            expect((exports as Record<string, unknown>).downloadVsix).toBeUndefined();
            expect((exports as Record<string, unknown>).extractTarball).toBeUndefined();
        });
    });
});
