/**
 * ProjectStateSync Tests
 *
 * Tests for project state synchronization utilities.
 * These functions manage frontend environment variable tracking.
 */

import { getFrontendEnvVars, updateFrontendState } from '@/core/state/projectStateSync';
import { Project } from '@/types';

describe('projectStateSync', () => {
    describe('getFrontendEnvVars', () => {
        // Define the expected keys that should always be present
        const EXPECTED_KEYS = [
            'MESH_ENDPOINT',
            'ADOBE_COMMERCE_URL',
            'ADOBE_COMMERCE_ENVIRONMENT_ID',
            'ADOBE_COMMERCE_STORE_VIEW_CODE',
            'ADOBE_COMMERCE_WEBSITE_CODE',
            'ADOBE_COMMERCE_STORE_CODE',
            'ADOBE_CATALOG_API_KEY',
            'ADOBE_ASSETS_URL',
            'ADOBE_COMMERCE_CUSTOMER_GROUP',
        ];

        it('should return all expected frontend env var keys', () => {
            const result = getFrontendEnvVars({});

            expect(Object.keys(result)).toEqual(EXPECTED_KEYS);
        });

        it('should extract string values from component config', () => {
            const config = {
                MESH_ENDPOINT: 'https://mesh.example.com/graphql',
                ADOBE_COMMERCE_URL: 'https://commerce.example.com',
            };

            const result = getFrontendEnvVars(config);

            expect(result.MESH_ENDPOINT).toBe('https://mesh.example.com/graphql');
            expect(result.ADOBE_COMMERCE_URL).toBe('https://commerce.example.com');
        });

        it('should return empty string for missing values', () => {
            const result = getFrontendEnvVars({});

            expect(result.MESH_ENDPOINT).toBe('');
            expect(result.ADOBE_COMMERCE_URL).toBe('');
            expect(result.ADOBE_CATALOG_API_KEY).toBe('');
        });

        it('should return empty string for undefined values', () => {
            const config = {
                MESH_ENDPOINT: undefined,
                ADOBE_COMMERCE_URL: undefined,
            };

            const result = getFrontendEnvVars(config);

            expect(result.MESH_ENDPOINT).toBe('');
            expect(result.ADOBE_COMMERCE_URL).toBe('');
        });

        it('should return empty string for null values', () => {
            const config = {
                MESH_ENDPOINT: null,
                ADOBE_COMMERCE_URL: null,
            };

            const result = getFrontendEnvVars(config);

            expect(result.MESH_ENDPOINT).toBe('');
            expect(result.ADOBE_COMMERCE_URL).toBe('');
        });

        it('should return empty string for non-string values', () => {
            const config = {
                MESH_ENDPOINT: 12345,
                ADOBE_COMMERCE_URL: true,
                ADOBE_COMMERCE_ENVIRONMENT_ID: { nested: 'object' },
                ADOBE_COMMERCE_STORE_VIEW_CODE: ['array', 'value'],
            };

            const result = getFrontendEnvVars(config);

            expect(result.MESH_ENDPOINT).toBe('');
            expect(result.ADOBE_COMMERCE_URL).toBe('');
            expect(result.ADOBE_COMMERCE_ENVIRONMENT_ID).toBe('');
            expect(result.ADOBE_COMMERCE_STORE_VIEW_CODE).toBe('');
        });

        it('should extract all valid string values', () => {
            const config = {
                MESH_ENDPOINT: 'https://mesh.example.com',
                ADOBE_COMMERCE_URL: 'https://commerce.example.com',
                ADOBE_COMMERCE_ENVIRONMENT_ID: 'env-123',
                ADOBE_COMMERCE_STORE_VIEW_CODE: 'default',
                ADOBE_COMMERCE_WEBSITE_CODE: 'base',
                ADOBE_COMMERCE_STORE_CODE: 'default_store',
                ADOBE_CATALOG_API_KEY: 'api-key-123',
                ADOBE_ASSETS_URL: 'https://assets.example.com',
                ADOBE_COMMERCE_CUSTOMER_GROUP: 'retail',
            };

            const result = getFrontendEnvVars(config);

            expect(result.MESH_ENDPOINT).toBe('https://mesh.example.com');
            expect(result.ADOBE_COMMERCE_URL).toBe('https://commerce.example.com');
            expect(result.ADOBE_COMMERCE_ENVIRONMENT_ID).toBe('env-123');
            expect(result.ADOBE_COMMERCE_STORE_VIEW_CODE).toBe('default');
            expect(result.ADOBE_COMMERCE_WEBSITE_CODE).toBe('base');
            expect(result.ADOBE_COMMERCE_STORE_CODE).toBe('default_store');
            expect(result.ADOBE_CATALOG_API_KEY).toBe('api-key-123');
            expect(result.ADOBE_ASSETS_URL).toBe('https://assets.example.com');
            expect(result.ADOBE_COMMERCE_CUSTOMER_GROUP).toBe('retail');
        });

        it('should ignore extra keys not in FRONTEND_ENV_VARS', () => {
            const config = {
                MESH_ENDPOINT: 'https://mesh.example.com',
                EXTRA_KEY: 'should-be-ignored',
                ANOTHER_KEY: 'also-ignored',
            };

            const result = getFrontendEnvVars(config);

            expect(result).not.toHaveProperty('EXTRA_KEY');
            expect(result).not.toHaveProperty('ANOTHER_KEY');
            expect(Object.keys(result)).toHaveLength(EXPECTED_KEYS.length);
        });

        it('should handle empty string values as valid', () => {
            const config = {
                MESH_ENDPOINT: '',
                ADOBE_COMMERCE_URL: '',
            };

            const result = getFrontendEnvVars(config);

            expect(result.MESH_ENDPOINT).toBe('');
            expect(result.ADOBE_COMMERCE_URL).toBe('');
        });
    });

    describe('updateFrontendState', () => {
        // Helper to create a minimal valid project
        function createProject(overrides: Partial<Project> = {}): Project {
            return {
                name: 'test-project',
                created: new Date(),
                lastModified: new Date(),
                path: '/test/path',
                status: 'ready',
                ...overrides,
            };
        }

        it('should update frontendEnvState with valid config', () => {
            const project = createProject({
                componentInstances: {
                    'headless': {
                        id: 'headless',
                        name: 'CitiSignal NextJS',
                        status: 'running',
                    },
                },
                componentConfigs: {
                    'headless': {
                        MESH_ENDPOINT: 'https://mesh.example.com',
                        ADOBE_COMMERCE_URL: 'https://commerce.example.com',
                    },
                },
            });

            updateFrontendState(project);

            expect(project.frontendEnvState).toBeDefined();
            expect(project.frontendEnvState?.envVars.MESH_ENDPOINT).toBe('https://mesh.example.com');
            expect(project.frontendEnvState?.envVars.ADOBE_COMMERCE_URL).toBe('https://commerce.example.com');
        });

        it('should set capturedAt timestamp', () => {
            const beforeTest = new Date().toISOString();

            const project = createProject({
                componentInstances: {
                    'headless': {
                        id: 'headless',
                        name: 'CitiSignal NextJS',
                        status: 'running',
                    },
                },
                componentConfigs: {
                    'headless': {},
                },
            });

            updateFrontendState(project);

            const afterTest = new Date().toISOString();

            expect(project.frontendEnvState?.capturedAt).toBeDefined();
            expect(project.frontendEnvState!.capturedAt >= beforeTest).toBe(true);
            expect(project.frontendEnvState!.capturedAt <= afterTest).toBe(true);
        });

        it('should be no-op when frontendInstance is missing', () => {
            const project = createProject({
                componentInstances: {
                    'other-component': {
                        id: 'other-component',
                        name: 'Other Component',
                        status: 'running',
                    },
                },
                componentConfigs: {
                    'headless': {
                        MESH_ENDPOINT: 'https://mesh.example.com',
                    },
                },
            });

            updateFrontendState(project);

            expect(project.frontendEnvState).toBeUndefined();
        });

        it('should be no-op when componentConfigs is missing', () => {
            const project = createProject({
                componentInstances: {
                    'headless': {
                        id: 'headless',
                        name: 'CitiSignal NextJS',
                        status: 'running',
                    },
                },
            });

            updateFrontendState(project);

            expect(project.frontendEnvState).toBeUndefined();
        });

        it('should be no-op when componentInstances is missing', () => {
            const project = createProject({
                componentConfigs: {
                    'headless': {
                        MESH_ENDPOINT: 'https://mesh.example.com',
                    },
                },
            });

            updateFrontendState(project);

            expect(project.frontendEnvState).toBeUndefined();
        });

        it('should use empty config when frontend config is missing', () => {
            const project = createProject({
                componentInstances: {
                    'headless': {
                        id: 'headless',
                        name: 'CitiSignal NextJS',
                        status: 'running',
                    },
                },
                componentConfigs: {
                    'other-component': {
                        SOME_KEY: 'some-value',
                    },
                },
            });

            updateFrontendState(project);

            expect(project.frontendEnvState).toBeDefined();
            expect(project.frontendEnvState?.envVars.MESH_ENDPOINT).toBe('');
            expect(project.frontendEnvState?.envVars.ADOBE_COMMERCE_URL).toBe('');
        });

        it('should mutate project in place', () => {
            const project = createProject({
                componentInstances: {
                    'headless': {
                        id: 'headless',
                        name: 'CitiSignal NextJS',
                        status: 'running',
                    },
                },
                componentConfigs: {
                    'headless': {
                        MESH_ENDPOINT: 'https://mesh.example.com',
                    },
                },
            });

            const originalProject = project;

            updateFrontendState(project);

            expect(project).toBe(originalProject);
            expect(project.frontendEnvState).toBeDefined();
        });

        it('should overwrite existing frontendEnvState', () => {
            const project = createProject({
                componentInstances: {
                    'headless': {
                        id: 'headless',
                        name: 'CitiSignal NextJS',
                        status: 'running',
                    },
                },
                componentConfigs: {
                    'headless': {
                        MESH_ENDPOINT: 'https://new-mesh.example.com',
                    },
                },
                frontendEnvState: {
                    envVars: {
                        MESH_ENDPOINT: 'https://old-mesh.example.com',
                        ADOBE_COMMERCE_URL: '',
                        ADOBE_COMMERCE_ENVIRONMENT_ID: '',
                        ADOBE_COMMERCE_STORE_VIEW_CODE: '',
                        ADOBE_COMMERCE_WEBSITE_CODE: '',
                        ADOBE_COMMERCE_STORE_CODE: '',
                        ADOBE_CATALOG_API_KEY: '',
                        ADOBE_ASSETS_URL: '',
                        ADOBE_COMMERCE_CUSTOMER_GROUP: '',
                    },
                    capturedAt: '2024-01-01T00:00:00.000Z',
                },
            });

            updateFrontendState(project);

            expect(project.frontendEnvState?.envVars.MESH_ENDPOINT).toBe('https://new-mesh.example.com');
            expect(project.frontendEnvState?.capturedAt).not.toBe('2024-01-01T00:00:00.000Z');
        });
    });
});
