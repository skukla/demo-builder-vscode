/**
 * projectCreationHandlers Tests
 *
 * Tests for the project-creation feature's composite handler map.
 * Verifies all required handlers are registered and accessible.
 */

import {
    projectCreationHandlers,
} from '@/features/project-creation/handlers';
import { hasHandler, getRegisteredTypes } from '@/core/handlers';

describe('projectCreationHandlers', () => {
    describe('Handler Map Structure', () => {
        it('should be an object literal (not a class)', () => {
            expect(projectCreationHandlers).toBeDefined();
            expect(typeof projectCreationHandlers).toBe('object');
            // Object literal, not a class instance
            expect(projectCreationHandlers.constructor.name).toBe('Object');
        });

        it('should have handlers registered', () => {
            const registeredTypes = getRegisteredTypes(projectCreationHandlers);
            expect(registeredTypes.length).toBeGreaterThan(0);
        });
    });

    describe('Handler Registration', () => {
        it('should register lifecycle handlers', () => {
            expect(hasHandler(projectCreationHandlers, 'ready')).toBe(true);
            expect(hasHandler(projectCreationHandlers, 'cancel')).toBe(true);
            expect(hasHandler(projectCreationHandlers, 'openProject')).toBe(true);
        });

        it('should register prerequisite handlers', () => {
            expect(hasHandler(projectCreationHandlers, 'check-prerequisites')).toBe(true);
            expect(hasHandler(projectCreationHandlers, 'install-prerequisite')).toBe(true);
        });

        it('should register authentication handlers', () => {
            expect(hasHandler(projectCreationHandlers, 'check-auth')).toBe(true);
            expect(hasHandler(projectCreationHandlers, 'authenticate')).toBe(true);
        });

        it('should register Adobe project management handlers', () => {
            expect(hasHandler(projectCreationHandlers, 'create-adobe-project')).toBe(true);
            expect(hasHandler(projectCreationHandlers, 'delete-adobe-project')).toBe(true);
        });

        it('should register project creation handlers', () => {
            expect(hasHandler(projectCreationHandlers, 'validate')).toBe(true);
            expect(hasHandler(projectCreationHandlers, 'create-project')).toBe(true);
        });

        it('should register mesh handlers', () => {
            expect(hasHandler(projectCreationHandlers, 'check-api-mesh')).toBe(true);
        });

        it('should register EDS handlers', () => {
            expect(hasHandler(projectCreationHandlers, 'check-github-auth')).toBe(true);
            expect(hasHandler(projectCreationHandlers, 'check-dalive-auth')).toBe(true);
        });

        it('should register the console API handler', () => {
            expect(hasHandler(projectCreationHandlers, 'list-org-console-apis')).toBe(true);
        });

        it('should export the console API handler from the barrel', async () => {
            const barrel = await import('@/features/project-creation/handlers');
            const exported = (barrel as Record<string, unknown>).handleListOrgConsoleApis;
            expect(typeof exported).toBe('function');
            expect(
                (projectCreationHandlers as Record<string, unknown>)['list-org-console-apis']
            ).toBe(exported);
        });
    });

});
