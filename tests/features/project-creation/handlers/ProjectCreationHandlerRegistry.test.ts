/**
 * ProjectCreationHandlerRegistry Tests
 *
 * Tests for naming convention compliance and handler registration
 * for the project-creation feature's handler registry.
 *
 * Step 8 of SOP Violation Remediation Plan:
 * - Verifies registry follows [Feature]HandlerRegistry naming pattern
 * - Verifies registry extends BaseHandlerRegistry
 * - Verifies handler dispatching works correctly
 */

import { BaseHandlerRegistry } from '@/core/base';
import { ProjectCreationHandlerRegistry } from '@/features/project-creation/handlers/ProjectCreationHandlerRegistry';

describe('ProjectCreationHandlerRegistry', () => {
    describe('Naming Convention Compliance', () => {
        it('should be exported as ProjectCreationHandlerRegistry', () => {
            // The class should be named following [Feature]HandlerRegistry pattern
            expect(ProjectCreationHandlerRegistry).toBeDefined();
            expect(ProjectCreationHandlerRegistry.name).toBe('ProjectCreationHandlerRegistry');
        });

        it('should extend BaseHandlerRegistry', () => {
            // Verify inheritance chain
            const registry = new ProjectCreationHandlerRegistry();
            expect(registry).toBeInstanceOf(BaseHandlerRegistry);
        });
    });

    describe('Handler Registration', () => {
        let registry: ProjectCreationHandlerRegistry;

        beforeEach(() => {
            registry = new ProjectCreationHandlerRegistry();
        });

        it('should have handlers registered after construction', () => {
            const registeredTypes = registry.getRegisteredTypes();
            expect(registeredTypes.length).toBeGreaterThan(0);
        });

        it('should register lifecycle handlers', () => {
            expect(registry.hasHandler('ready')).toBe(true);
            expect(registry.hasHandler('cancel')).toBe(true);
            expect(registry.hasHandler('openProject')).toBe(true);
        });

        it('should register prerequisite handlers', () => {
            expect(registry.hasHandler('check-prerequisites')).toBe(true);
            expect(registry.hasHandler('install-prerequisite')).toBe(true);
        });

        it('should register authentication handlers', () => {
            expect(registry.hasHandler('check-auth')).toBe(true);
            expect(registry.hasHandler('authenticate')).toBe(true);
        });

        it('should register project creation handlers', () => {
            expect(registry.hasHandler('validate')).toBe(true);
            expect(registry.hasHandler('create-project')).toBe(true);
        });

        it('should register mesh handlers', () => {
            expect(registry.hasHandler('check-api-mesh')).toBe(true);
            expect(registry.hasHandler('create-api-mesh')).toBe(true);
        });

        it('should register EDS handlers', () => {
            expect(registry.hasHandler('check-github-auth')).toBe(true);
            expect(registry.hasHandler('check-dalive-auth')).toBe(true);
        });
    });

    describe('needsProgressCallback', () => {
        let registry: ProjectCreationHandlerRegistry;

        beforeEach(() => {
            registry = new ProjectCreationHandlerRegistry();
        });

        it('should return true for create-api-mesh', () => {
            expect(registry.needsProgressCallback('create-api-mesh')).toBe(true);
        });

        it('should return false for other message types', () => {
            expect(registry.needsProgressCallback('check-auth')).toBe(false);
            expect(registry.needsProgressCallback('validate')).toBe(false);
            expect(registry.needsProgressCallback('ready')).toBe(false);
        });
    });
});
