/**
 * HandlerContext Tests
 *
 * Tests for handler context type exports and usage
 */

import {
    HandlerContext,
    SharedState,
    MessageHandler,
    HandlerResponse,
    PrerequisiteCheckState,
    ApiServicesConfig
} from '@/commands/handlers/HandlerContext';

describe('HandlerContext', () => {
    describe('Type Exports', () => {
        it('should export HandlerContext type', () => {
            // Type check - this will fail at compile time if type doesn't exist
            const _typeCheck: HandlerContext | undefined = undefined;
            expect(_typeCheck).toBeUndefined();
        });

        it('should export SharedState type', () => {
            const state: SharedState = {
                isAuthenticating: false
            };
            expect(state).toBeDefined();
            expect(state.isAuthenticating).toBe(false);
        });

        it('should export MessageHandler type', () => {
            const handler: MessageHandler = async (context, payload) => {
                return { success: true };
            };
            expect(handler).toBeDefined();
        });

        it('should export HandlerResponse type', () => {
            const response: HandlerResponse = {
                success: true,
                data: { test: 'data' },
                message: 'Success'
            };
            expect(response).toBeDefined();
            expect(response.success).toBe(true);
        });

        it('should export PrerequisiteCheckState type', () => {
            const checkState: PrerequisiteCheckState = {
                prereq: {
                    id: 'test',
                    name: 'Test Prerequisite',
                    description: 'Test',
                    check: {
                        command: 'test --version',
                        parseVersion: 'v(\\d+\\.\\d+\\.\\d+)'
                    }
                },
                result: {
                    id: 'test',
                    name: 'Test Prerequisite',
                    description: 'Test',
                    installed: true,
                    version: '1.0.0',
                    optional: false,
                    canInstall: true
                }
            };
            expect(checkState).toBeDefined();
            expect(checkState.result.installed).toBe(true);
        });

        it('should export ApiServicesConfig type', () => {
            const config: ApiServicesConfig = {
                services: {
                    apiMesh: {
                        enabled: true,
                        endpoint: 'https://test.com'
                    }
                }
            };
            expect(config).toBeDefined();
            expect(config.services?.apiMesh?.enabled).toBe(true);
        });
    });

    describe('SharedState Structure', () => {
        it('should allow component selection state', () => {
            const state: SharedState = {
                isAuthenticating: false,
                currentComponentSelection: {
                    frontend: 'react',
                    backend: 'adobe-app-builder',
                    dependencies: ['adobe-commerce']
                }
            };
            expect(state.currentComponentSelection?.frontend).toBe('react');
        });

        it('should allow prerequisites tracking', () => {
            const state: SharedState = {
                isAuthenticating: false,
                currentPrerequisites: [
                    {
                        id: 'node',
                        name: 'Node.js',
                        description: 'Test',
                        check: {
                            command: 'node --version',
                            parseVersion: 'v(\\d+\\.\\d+\\.\\d+)'
                        }
                    }
                ],
                currentPrerequisiteStates: new Map()
            };
            expect(state.currentPrerequisites).toHaveLength(1);
            expect(state.currentPrerequisiteStates).toBeInstanceOf(Map);
        });

        it('should allow authentication state', () => {
            const state: SharedState = {
                isAuthenticating: true
            };
            expect(state.isAuthenticating).toBe(true);
        });

        it('should allow project creation control', () => {
            const abortController = new AbortController();
            const state: SharedState = {
                isAuthenticating: false,
                projectCreationAbortController: abortController
            };
            expect(state.projectCreationAbortController).toBe(abortController);
        });

        it('should allow mesh lifecycle tracking', () => {
            const state: SharedState = {
                isAuthenticating: false,
                meshCreatedForWorkspace: 'workspace-123',
                meshExistedBeforeSession: 'workspace-456'
            };
            expect(state.meshCreatedForWorkspace).toBe('workspace-123');
            expect(state.meshExistedBeforeSession).toBe('workspace-456');
        });

        it('should allow API services configuration', () => {
            const state: SharedState = {
                isAuthenticating: false,
                apiServicesConfig: {
                    services: {
                        apiMesh: {
                            enabled: true,
                            endpoint: 'https://api.adobe.io'
                        }
                    }
                }
            };
            expect(state.apiServicesConfig?.services?.apiMesh?.enabled).toBe(true);
        });
    });

    describe('HandlerResponse Structure', () => {
        it('should allow success response', () => {
            const response: HandlerResponse = {
                success: true
            };
            expect(response.success).toBe(true);
        });

        it('should allow success response with data', () => {
            const response: HandlerResponse = {
                success: true,
                data: { projects: ['project1', 'project2'] }
            };
            expect(response.success).toBe(true);
            expect(response.data).toEqual({ projects: ['project1', 'project2'] });
        });

        it('should allow error response', () => {
            const response: HandlerResponse = {
                success: false,
                error: 'Something went wrong'
            };
            expect(response.success).toBe(false);
            expect(response.error).toBe('Something went wrong');
        });

        it('should allow custom properties', () => {
            const response: HandlerResponse = {
                success: true,
                customField: 'custom value',
                anotherField: 123
            };
            expect(response.success).toBe(true);
            expect(response.customField).toBe('custom value');
            expect(response.anotherField).toBe(123);
        });
    });

    describe('MessageHandler Function Type', () => {
        it('should accept context and return promise', async () => {
            const handler: MessageHandler = async (context) => {
                return { success: true };
            };

            const mockContext = {} as HandlerContext;
            const result = await handler(mockContext);

            expect(result.success).toBe(true);
        });

        it('should accept context and payload', async () => {
            const handler: MessageHandler<{ value: string }> = async (context, payload) => {
                return { success: true, data: payload?.value };
            };

            const mockContext = {} as HandlerContext;
            const result = await handler(mockContext, { value: 'test' });

            expect(result.success).toBe(true);
            expect(result.data).toBe('test');
        });

        it('should accept typed payload', async () => {
            interface TestPayload {
                projectId: string;
                workspaceId: string;
            }

            const handler: MessageHandler<TestPayload> = async (context, payload) => {
                return {
                    success: true,
                    data: `${payload?.projectId}/${payload?.workspaceId}`
                };
            };

            const mockContext = {} as HandlerContext;
            const result = await handler(mockContext, {
                projectId: 'proj-123',
                workspaceId: 'ws-456'
            });

            expect(result.success).toBe(true);
            expect(result.data).toBe('proj-123/ws-456');
        });
    });
});
