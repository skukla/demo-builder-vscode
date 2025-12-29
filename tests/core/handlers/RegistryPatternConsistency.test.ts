/**
 * Registry Pattern Consistency Tests
 *
 * Tests that all handler registries follow the standardized pattern:
 * - Extend BaseHandlerRegistry
 * - Implement registerHandlers()
 * - Have consistent constructor behavior
 */

import { BaseHandlerRegistry } from '@/core/base/BaseHandlerRegistry';

// Import all handler registries
import { DashboardHandlerRegistry } from '@/features/dashboard/handlers';
import { ProjectsListHandlerRegistry } from '@/features/projects-dashboard/handlers/ProjectsListHandlerRegistry';
import { ProjectCreationHandlerRegistry } from '@/features/project-creation/handlers/ProjectCreationHandlerRegistry';
import { MeshHandlerRegistry } from '@/features/mesh/handlers/MeshHandlerRegistry';
import { EdsHandlerRegistry } from '@/features/eds/handlers/EdsHandlerRegistry';
import { PrerequisitesHandlerRegistry } from '@/features/prerequisites/handlers/PrerequisitesHandlerRegistry';
import { LifecycleHandlerRegistry } from '@/features/lifecycle/handlers/LifecycleHandlerRegistry';

describe('Registry Pattern Consistency', () => {
    const registryClasses = [
        { name: 'DashboardHandlerRegistry', RegistryClass: DashboardHandlerRegistry },
        { name: 'ProjectsListHandlerRegistry', RegistryClass: ProjectsListHandlerRegistry },
        { name: 'ProjectCreationHandlerRegistry', RegistryClass: ProjectCreationHandlerRegistry },
        { name: 'MeshHandlerRegistry', RegistryClass: MeshHandlerRegistry },
        { name: 'EdsHandlerRegistry', RegistryClass: EdsHandlerRegistry },
        { name: 'PrerequisitesHandlerRegistry', RegistryClass: PrerequisitesHandlerRegistry },
        { name: 'LifecycleHandlerRegistry', RegistryClass: LifecycleHandlerRegistry },
    ];

    describe('Inheritance', () => {
        it.each(registryClasses)(
            '$name should extend BaseHandlerRegistry',
            ({ RegistryClass }) => {
                const registry = new RegistryClass();
                expect(registry).toBeInstanceOf(BaseHandlerRegistry);
            },
        );
    });

    describe('Handler Registration', () => {
        it.each(registryClasses)(
            '$name should register at least one handler on construction',
            ({ RegistryClass }) => {
                const registry = new RegistryClass();
                const registeredTypes = registry.getRegisteredTypes();

                expect(registeredTypes.length).toBeGreaterThan(0);
            },
        );

        it.each(registryClasses)(
            '$name should have hasHandler method working correctly',
            ({ RegistryClass }) => {
                const registry = new RegistryClass();
                const registeredTypes = registry.getRegisteredTypes();

                // First registered type should be findable
                if (registeredTypes.length > 0) {
                    expect(registry.hasHandler(registeredTypes[0])).toBe(true);
                }

                // Non-existent type should not be findable
                expect(registry.hasHandler('non-existent-handler-type')).toBe(false);
            },
        );
    });

    describe('API Consistency', () => {
        it.each(registryClasses)(
            '$name should have getRegisteredTypes method',
            ({ RegistryClass }) => {
                const registry = new RegistryClass();

                expect(typeof registry.getRegisteredTypes).toBe('function');
                expect(Array.isArray(registry.getRegisteredTypes())).toBe(true);
            },
        );

        it.each(registryClasses)(
            '$name should have hasHandler method',
            ({ RegistryClass }) => {
                const registry = new RegistryClass();

                expect(typeof registry.hasHandler).toBe('function');
            },
        );

        it.each(registryClasses)(
            '$name should have handle method',
            ({ RegistryClass }) => {
                const registry = new RegistryClass();

                expect(typeof registry.handle).toBe('function');
            },
        );
    });
});

describe('Feature-Specific Registry Tests', () => {
    describe('MeshHandlerRegistry', () => {
        it('should register mesh-specific handlers', () => {
            const registry = new MeshHandlerRegistry();
            const types = registry.getRegisteredTypes();

            expect(types).toContain('check-api-mesh');
            expect(types).toContain('create-api-mesh');
            expect(types).toContain('delete-api-mesh');
        });
    });

    describe('EdsHandlerRegistry', () => {
        it('should register EDS-specific handlers', () => {
            const registry = new EdsHandlerRegistry();
            const types = registry.getRegisteredTypes();

            // GitHub handlers
            expect(types).toContain('check-github-auth');
            expect(types).toContain('github-oauth');

            // DA.live handlers
            expect(types).toContain('check-dalive-auth');
        });
    });

    describe('PrerequisitesHandlerRegistry', () => {
        it('should register prerequisites-specific handlers', () => {
            const registry = new PrerequisitesHandlerRegistry();
            const types = registry.getRegisteredTypes();

            expect(types).toContain('check-prerequisites');
            expect(types).toContain('continue-prerequisites');
            expect(types).toContain('install-prerequisite');
        });
    });

    describe('LifecycleHandlerRegistry', () => {
        it('should register lifecycle-specific handlers', () => {
            const registry = new LifecycleHandlerRegistry();
            const types = registry.getRegisteredTypes();

            expect(types).toContain('ready');
            expect(types).toContain('cancel');
            expect(types).toContain('openProject');
        });
    });
});
