/**
 * projectCreationHandlers Tests
 *
 * Tests for the project-creation feature's composite handler map.
 * Verifies all required handlers are registered and accessible.
 */

import { projectCreationHandlers, needsProgressCallback } from '@/features/project-creation/handlers';
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

        it('should register project creation handlers', () => {
            expect(hasHandler(projectCreationHandlers, 'validate')).toBe(true);
            expect(hasHandler(projectCreationHandlers, 'create-project')).toBe(true);
        });

        it('should register mesh handlers', () => {
            expect(hasHandler(projectCreationHandlers, 'check-api-mesh')).toBe(true);
            expect(hasHandler(projectCreationHandlers, 'create-api-mesh')).toBe(true);
        });

        it('should register EDS handlers', () => {
            expect(hasHandler(projectCreationHandlers, 'check-github-auth')).toBe(true);
            expect(hasHandler(projectCreationHandlers, 'check-dalive-auth')).toBe(true);
        });
    });

    describe('needsProgressCallback', () => {
        it('should return true for create-api-mesh', () => {
            expect(needsProgressCallback('create-api-mesh')).toBe(true);
        });

        it('should return false for other message types', () => {
            expect(needsProgressCallback('check-auth')).toBe(false);
            expect(needsProgressCallback('validate')).toBe(false);
            expect(needsProgressCallback('ready')).toBe(false);
        });
    });
});
