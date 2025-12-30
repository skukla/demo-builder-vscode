/**
 * Type Guards Tests - Project Accessor Helpers
 *
 * Tests for project data accessor utilities:
 * - getComponentVersion (component version extraction)
 * - getProjectFrontendPort (frontend port extraction)
 * - getComponentIds (component ID list)
 *
 * SOP §4: These helpers replace deep optional chaining patterns
 * Target Coverage: 90%+
 */

import {
    getComponentVersion,
    getProjectFrontendPort,
    getComponentIds,
    getComponentConfigPort,
} from '@/types/typeGuards';
import { Project } from '@/types/base';

describe('typeGuards - Project Accessors', () => {

    // =================================================================
    // getComponentVersion Tests (SOP §4 compliance - Step 4)
    // =================================================================

    describe('getComponentVersion', () => {
        it('should return version when component exists', () => {
            const project = {
                componentVersions: {
                    'headless': { version: '1.2.3' }
                }
            } as Project;
            expect(getComponentVersion(project, 'headless')).toBe('1.2.3');
        });

        it('should return undefined for undefined project', () => {
            expect(getComponentVersion(undefined, 'headless')).toBeUndefined();
        });

        it('should return undefined for null project', () => {
            expect(getComponentVersion(null, 'headless')).toBeUndefined();
        });

        it('should return undefined when component not found', () => {
            const project = {
                componentVersions: {
                    'other-component': { version: '1.0.0' }
                }
            } as Project;
            expect(getComponentVersion(project, 'headless')).toBeUndefined();
        });

        it('should return undefined when componentVersions is undefined', () => {
            const project = {} as Project;
            expect(getComponentVersion(project, 'headless')).toBeUndefined();
        });
    });

    // =================================================================
    // getProjectFrontendPort Tests (SOP §4 compliance - Step 1)
    // =================================================================

    describe('getProjectFrontendPort', () => {
        it('should return port when frontend component exists', () => {
            const project = {
                componentInstances: {
                    'headless': { port: 3000 }
                }
            } as Project;
            expect(getProjectFrontendPort(project)).toBe(3000);
        });

        it('should return undefined for undefined project', () => {
            expect(getProjectFrontendPort(undefined)).toBeUndefined();
        });

        it('should return undefined for null project', () => {
            expect(getProjectFrontendPort(null)).toBeUndefined();
        });

        it('should return undefined when frontend component not found', () => {
            const project = {
                componentInstances: {
                    'other-component': { port: 8080 }
                }
            } as Project;
            expect(getProjectFrontendPort(project)).toBeUndefined();
        });

        it('should return undefined when componentInstances is undefined', () => {
            const project = {} as Project;
            expect(getProjectFrontendPort(project)).toBeUndefined();
        });
    });

    // =================================================================
    // getComponentIds Tests (SOP §4 compliance)
    // =================================================================

    describe('getComponentIds', () => {
        it('should return component IDs when instances exist', () => {
            const instances = {
                'headless': { status: 'running' },
                'commerce-mesh': { status: 'deployed' }
            } as Record<string, any>;
            expect(getComponentIds(instances)).toEqual(['headless', 'commerce-mesh']);
        });

        it('should return empty array for undefined', () => {
            expect(getComponentIds(undefined)).toEqual([]);
        });

        it('should return empty array for null', () => {
            expect(getComponentIds(null)).toEqual([]);
        });

        it('should return empty array for empty object', () => {
            expect(getComponentIds({})).toEqual([]);
        });
    });

    // =================================================================
    // getComponentConfigPort Tests (SOP §4 compliance - Step 5)
    // =================================================================

    describe('getComponentConfigPort', () => {
        it('should return port when component config exists', () => {
            const configs = {
                'headless': { PORT: 3000 }
            };
            expect(getComponentConfigPort(configs, 'headless')).toBe(3000);
        });

        it('should return undefined for undefined configs', () => {
            expect(getComponentConfigPort(undefined, 'headless')).toBeUndefined();
        });

        it('should return undefined when component not found', () => {
            const configs = {
                'other-component': { PORT: 8080 }
            };
            expect(getComponentConfigPort(configs, 'headless')).toBeUndefined();
        });

        it('should return undefined when PORT not set', () => {
            const configs = {
                'headless': { OTHER_PROP: 'value' }
            };
            expect(getComponentConfigPort(configs, 'headless')).toBeUndefined();
        });

        it('should handle empty configs object', () => {
            expect(getComponentConfigPort({}, 'headless')).toBeUndefined();
        });
    });
});
