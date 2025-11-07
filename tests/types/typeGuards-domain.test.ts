/**
 * Type Guards Tests - Domain Models
 *
 * Tests for domain-specific type guards:
 * - isProject (project model validation)
 * - isComponentInstance (component instance validation)
 * - isProcessInfo (process information validation)
 * - isComponentStatus (component status validation)
 * - isProjectStatus (project status validation)
 * - isValidationResult (validation result validation)
 * - isMessageResponse (message response validation)
 * - isLogger (logger interface validation)
 *
 * Target Coverage: 90%+
 */

import {
    isProject,
    isComponentInstance,
    isProcessInfo,
    isComponentStatus,
    isProjectStatus,
    isValidationResult,
    isMessageResponse,
    isLogger,
    ValidationResult
} from '@/types/typeGuards';
import {
    Project,
    ComponentInstance,
    ProcessInfo,
    ComponentStatus,
    ProjectStatus
} from '@/types/base';
import { MessageResponse } from '@/types/messages';
import { Logger } from '@/types/logger';

describe('typeGuards - Domain Models', () => {

    // =================================================================
    // isProject Tests
    // =================================================================

    describe('isProject', () => {
        describe('valid projects', () => {
            it('should accept valid project objects', () => {
                const project: Project = {
                    name: 'test-project',
                    path: '/path/to/project',
                    status: 'ready',
                    created: new Date(),
                    lastModified: new Date()
                };
                expect(isProject(project)).toBe(true);
            });

            it('should accept projects with all optional fields', () => {
                const project: Project = {
                    name: 'test',
                    path: '/path',
                    status: 'running',
                    created: new Date(),
                    lastModified: new Date(),
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
                };
                expect(isProject(project)).toBe(true);
            });
        });

        describe('invalid projects', () => {
            it('should reject non-objects', () => {
                expect(isProject(null)).toBe(false);
                expect(isProject(undefined)).toBe(false);
                expect(isProject('string')).toBe(false);
                expect(isProject(123)).toBe(false);
                expect(isProject([])).toBe(false);
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
                const instance: ComponentInstance = {
                    id: 'comp-123',
                    name: 'Component Name',
                    status: 'ready'
                };
                expect(isComponentInstance(instance)).toBe(true);
            });

            it('should accept instances with optional fields', () => {
                const instance: ComponentInstance = {
                    id: 'comp-123',
                    name: 'Component',
                    status: 'running',
                    type: 'frontend',
                    port: 3000,
                    pid: 12345,
                    path: '/path/to/component',
                    version: '1.0.0'
                };
                expect(isComponentInstance(instance)).toBe(true);
            });
        });

        describe('invalid instances', () => {
            it('should reject non-objects', () => {
                expect(isComponentInstance(null)).toBe(false);
                expect(isComponentInstance(undefined)).toBe(false);
                expect(isComponentInstance('string')).toBe(false);
                expect(isComponentInstance(123)).toBe(false);
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
                const info: ProcessInfo = {
                    pid: 12345,
                    port: 3000,
                    startTime: new Date(),
                    command: 'npm start',
                    status: 'running'
                };
                expect(isProcessInfo(info)).toBe(true);
            });

            it('should accept different statuses', () => {
                const statuses: Array<'running' | 'stopped' | 'error'> = ['running', 'stopped', 'error'];
                statuses.forEach(status => {
                    const info: ProcessInfo = {
                        pid: 12345,
                        port: 3000,
                        startTime: new Date(),
                        command: 'test',
                        status
                    };
                    expect(isProcessInfo(info)).toBe(true);
                });
            });
        });

        describe('invalid process info', () => {
            it('should reject non-objects', () => {
                expect(isProcessInfo(null)).toBe(false);
                expect(isProcessInfo(undefined)).toBe(false);
                expect(isProcessInfo('string')).toBe(false);
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

    // =================================================================
    // isComponentStatus Tests
    // =================================================================

    describe('isComponentStatus', () => {
        describe('valid statuses', () => {
            it('should accept all valid component statuses', () => {
                const validStatuses: ComponentStatus[] = [
                    'not-installed',
                    'cloning',
                    'installing',
                    'ready',
                    'starting',
                    'running',
                    'stopping',
                    'stopped',
                    'deploying',
                    'deployed',
                    'updating',
                    'error'
                ];

                validStatuses.forEach(status => {
                    expect(isComponentStatus(status)).toBe(true);
                });
            });
        });

        describe('invalid statuses', () => {
            it('should reject invalid status strings', () => {
                expect(isComponentStatus('invalid')).toBe(false);
                expect(isComponentStatus('unknown')).toBe(false);
                expect(isComponentStatus('RUNNING')).toBe(false); // Case sensitive
                expect(isComponentStatus('')).toBe(false);
            });

            it('should reject non-strings', () => {
                expect(isComponentStatus(null)).toBe(false);
                expect(isComponentStatus(undefined)).toBe(false);
                expect(isComponentStatus(123)).toBe(false);
                expect(isComponentStatus({})).toBe(false);
                expect(isComponentStatus([])).toBe(false);
            });
        });
    });

    // =================================================================
    // isProjectStatus Tests
    // =================================================================

    describe('isProjectStatus', () => {
        describe('valid statuses', () => {
            it('should accept all valid project statuses', () => {
                const validStatuses: ProjectStatus[] = [
                    'created',
                    'configuring',
                    'ready',
                    'starting',
                    'running',
                    'stopping',
                    'stopped',
                    'error'
                ];

                validStatuses.forEach(status => {
                    expect(isProjectStatus(status)).toBe(true);
                });
            });
        });

        describe('invalid statuses', () => {
            it('should reject invalid status strings', () => {
                expect(isProjectStatus('invalid')).toBe(false);
                expect(isProjectStatus('deploying')).toBe(false); // Component status, not project
                expect(isProjectStatus('READY')).toBe(false); // Case sensitive
            });

            it('should reject non-strings', () => {
                expect(isProjectStatus(null)).toBe(false);
                expect(isProjectStatus(undefined)).toBe(false);
                expect(isProjectStatus(123)).toBe(false);
            });
        });
    });

    // =================================================================
    // isValidationResult Tests
    // =================================================================

    describe('isValidationResult', () => {
        describe('valid results', () => {
            it('should accept valid validation results', () => {
                const result: ValidationResult = {
                    valid: true,
                    errors: [],
                    warnings: []
                };
                expect(isValidationResult(result)).toBe(true);
            });

            it('should accept results with errors and warnings', () => {
                const result: ValidationResult = {
                    valid: false,
                    errors: ['Error 1', 'Error 2'],
                    warnings: ['Warning 1']
                };
                expect(isValidationResult(result)).toBe(true);
            });
        });

        describe('invalid results', () => {
            it('should reject non-objects', () => {
                expect(isValidationResult(null)).toBe(false);
                expect(isValidationResult(undefined)).toBe(false);
                expect(isValidationResult('string')).toBe(false);
            });

            it('should reject objects with wrong types', () => {
                expect(isValidationResult({
                    valid: 'true', // Should be boolean
                    errors: [],
                    warnings: []
                })).toBe(false);

                expect(isValidationResult({
                    valid: true,
                    errors: 'not-array', // Should be array
                    warnings: []
                })).toBe(false);

                expect(isValidationResult({
                    valid: true,
                    errors: [],
                    warnings: 'not-array' // Should be array
                })).toBe(false);
            });

            it('should reject objects missing required fields', () => {
                expect(isValidationResult({ valid: true })).toBe(false);
                expect(isValidationResult({ errors: [], warnings: [] })).toBe(false);
            });
        });
    });

    // =================================================================
    // isMessageResponse Tests
    // =================================================================

    describe('isMessageResponse', () => {
        describe('valid responses', () => {
            it('should accept valid message responses', () => {
                const response: MessageResponse = {
                    success: true
                };
                expect(isMessageResponse(response)).toBe(true);
            });

            it('should accept responses with optional fields', () => {
                const response: MessageResponse = {
                    success: false,
                    error: 'Error message',
                    data: { key: 'value' }
                };
                expect(isMessageResponse(response)).toBe(true);
            });

            it('should accept responses with any data type', () => {
                expect(isMessageResponse({ success: true, data: 'string' })).toBe(true);
                expect(isMessageResponse({ success: true, data: 123 })).toBe(true);
                expect(isMessageResponse({ success: true, data: [] })).toBe(true);
                expect(isMessageResponse({ success: true, data: null })).toBe(true);
            });
        });

        describe('invalid responses', () => {
            it('should reject non-objects', () => {
                expect(isMessageResponse(null)).toBe(false);
                expect(isMessageResponse(undefined)).toBe(false);
                expect(isMessageResponse('string')).toBe(false);
            });

            it('should reject objects without success field', () => {
                expect(isMessageResponse({})).toBe(false);
                expect(isMessageResponse({ error: 'test' })).toBe(false);
            });

            it('should reject objects with wrong success type', () => {
                expect(isMessageResponse({ success: 'true' })).toBe(false);
                expect(isMessageResponse({ success: 1 })).toBe(false);
                expect(isMessageResponse({ success: null })).toBe(false);
            });
        });
    });

    // =================================================================
    // isLogger Tests
    // =================================================================

    describe('isLogger', () => {
        describe('valid loggers', () => {
            it('should accept objects with all required logger methods', () => {
                const logger: Logger = {
                    debug: () => {},
                    info: () => {},
                    warn: () => {},
                    error: () => {}
                };
                expect(isLogger(logger)).toBe(true);
            });

            it('should accept objects with additional properties', () => {
                const logger = {
                    debug: () => {},
                    info: () => {},
                    warn: () => {},
                    error: () => {},
                    extra: 'property'
                };
                expect(isLogger(logger)).toBe(true);
            });
        });

        describe('invalid loggers', () => {
            it('should reject non-objects', () => {
                expect(isLogger(null)).toBe(false);
                expect(isLogger(undefined)).toBe(false);
                expect(isLogger('string')).toBe(false);
            });

            it('should reject objects missing required methods', () => {
                expect(isLogger({})).toBe(false);
                expect(isLogger({
                    debug: () => {},
                    info: () => {},
                    warn: () => {}
                    // Missing error
                })).toBe(false);
            });

            it('should reject objects with non-function properties', () => {
                expect(isLogger({
                    debug: 'not-a-function',
                    info: () => {},
                    warn: () => {},
                    error: () => {}
                })).toBe(false);
            });
        });
    });
});
