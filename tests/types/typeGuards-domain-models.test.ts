/**
 * Type Guards Tests - Project & Component Models
 *
 * Tests for project and component domain type guards:
 * - isProject (project model validation)
 * - isComponentInstance (component instance validation)
 * - isProcessInfo (process information validation)
 *
 * Target Coverage: 90%+
 */

import {
    isProject,
    isComponentInstance,
    isProcessInfo
} from '@/types/typeGuards';
import {
    Project,
    ComponentInstance,
    ProcessInfo
} from '@/types/base';
import {
    createValidProject,
    createValidComponentInstance,
    createValidProcessInfo,
    NON_OBJECT_VALUES
} from './typeGuards-domain.testUtils';

describe('typeGuards - Domain Models', () => {

    // =================================================================
    // isProject Tests
    // =================================================================

    describe('isProject', () => {
        describe('valid projects', () => {
            it('should accept valid project objects', () => {
                const project = createValidProject();
                expect(isProject(project)).toBe(true);
            });

            it('should accept projects with all optional fields', () => {
                const project: Project = createValidProject({
                    status: 'running',
                    organization: 'org123',
                    template: 'commerce-paas',
                    adobe: {
                        projectId: 'proj123',
                        projectName: 'Project',
                        organization: 'org123',
                        workspace: 'ws123',
                        authenticated: true
                    },
                    componentInstances: {},
                    componentSelections: {}
                });
                expect(isProject(project)).toBe(true);
            });
        });

        describe('invalid projects', () => {
            it('should reject non-objects', () => {
                NON_OBJECT_VALUES.forEach(value => {
                    expect(isProject(value)).toBe(false);
                });
            });

            it('should reject objects missing required fields', () => {
                expect(isProject({})).toBe(false);
                expect(isProject({ name: 'test' })).toBe(false);
                expect(isProject({ name: 'test', path: '/path' })).toBe(false);
                expect(isProject({
                    name: 'test',
                    path: '/path',
                    status: 'ready'
                })).toBe(false); // Missing dates
            });

            it('should reject objects with wrong field types', () => {
                expect(isProject({
                    name: 123, // Should be string
                    path: '/path',
                    status: 'ready',
                    created: new Date(),
                    lastModified: new Date()
                })).toBe(false);

                expect(isProject({
                    name: 'test',
                    path: 123, // Should be string
                    status: 'ready',
                    created: new Date(),
                    lastModified: new Date()
                })).toBe(false);

                expect(isProject({
                    name: 'test',
                    path: '/path',
                    status: 123, // Should be string
                    created: new Date(),
                    lastModified: new Date()
                })).toBe(false);

                expect(isProject({
                    name: 'test',
                    path: '/path',
                    status: 'ready',
                    created: 'not-a-date', // Should be Date
                    lastModified: new Date()
                })).toBe(false);
            });
        });
    });

    // =================================================================
    // isComponentInstance Tests
    // =================================================================

    describe('isComponentInstance', () => {
        describe('valid instances', () => {
            it('should accept valid component instances', () => {
                const instance = createValidComponentInstance();
                expect(isComponentInstance(instance)).toBe(true);
            });

            it('should accept instances with optional fields', () => {
                const instance: ComponentInstance = createValidComponentInstance({
                    status: 'running',
                    type: 'frontend',
                    port: 3000,
                    pid: 12345,
                    path: '/path/to/component',
                    version: '1.0.0'
                });
                expect(isComponentInstance(instance)).toBe(true);
            });
        });

        describe('invalid instances', () => {
            it('should reject non-objects', () => {
                NON_OBJECT_VALUES.forEach(value => {
                    expect(isComponentInstance(value)).toBe(false);
                });
            });

            it('should reject objects missing required fields', () => {
                expect(isComponentInstance({})).toBe(false);
                expect(isComponentInstance({ id: 'comp-123' })).toBe(false);
                expect(isComponentInstance({ id: 'comp-123', name: 'Component' })).toBe(false);
            });

            it('should reject objects with wrong types', () => {
                expect(isComponentInstance({
                    id: 123, // Should be string
                    name: 'Component',
                    status: 'ready'
                })).toBe(false);

                expect(isComponentInstance({
                    id: 'comp-123',
                    name: 123, // Should be string
                    status: 'ready'
                })).toBe(false);

                expect(isComponentInstance({
                    id: 'comp-123',
                    name: 'Component',
                    status: 123 // Should be string
                })).toBe(false);
            });
        });
    });

    // =================================================================
    // isProcessInfo Tests
    // =================================================================

    describe('isProcessInfo', () => {
        describe('valid process info', () => {
            it('should accept valid process info', () => {
                const info = createValidProcessInfo();
                expect(isProcessInfo(info)).toBe(true);
            });

            it('should accept different statuses', () => {
                const statuses: Array<'running' | 'stopped' | 'error'> = ['running', 'stopped', 'error'];
                statuses.forEach(status => {
                    const info: ProcessInfo = createValidProcessInfo({ status });
                    expect(isProcessInfo(info)).toBe(true);
                });
            });
        });

        describe('invalid process info', () => {
            it('should reject non-objects', () => {
                NON_OBJECT_VALUES.forEach(value => {
                    expect(isProcessInfo(value)).toBe(false);
                });
            });

            it('should reject objects with wrong types', () => {
                expect(isProcessInfo({
                    pid: 'not-a-number',
                    port: 3000,
                    startTime: new Date(),
                    command: 'test',
                    status: 'running'
                })).toBe(false);

                expect(isProcessInfo({
                    pid: 12345,
                    port: 'not-a-number',
                    startTime: new Date(),
                    command: 'test',
                    status: 'running'
                })).toBe(false);

                expect(isProcessInfo({
                    pid: 12345,
                    port: 3000,
                    startTime: 'not-a-date',
                    command: 'test',
                    status: 'running'
                })).toBe(false);
            });
        });
    });
});
