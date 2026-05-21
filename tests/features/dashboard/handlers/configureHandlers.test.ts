/**
 * configureHandlers Tests
 *
 * Tests for the Configure screen handler map.
 * Verifies handler registration and individual handler behavior.
 */

// Mock timeoutConfig before imports (transitive dependency)
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        NORMAL: 30000,
        PREREQUISITE_CHECK: 10000,
        QUICK: 5000,
        UI: { MIN_LOADING: 800 },
        WEBVIEW_INIT_DELAY: 500,
    },
}));

// Mock validateURL (used by handleOpenExternal and transitive imports)
jest.mock('@/core/validation', () => ({
    validateURL: jest.fn(),
}));

// Mock store discovery service
jest.mock('@/features/eds/services/commerceStoreDiscovery', () => ({
    discoverStoreStructure: jest.fn(),
    extractTenantId: jest.fn(),
}));

// Mock AI feature barrel (verify + inventory + cache controls)
jest.mock('@/features/ai', () => ({
    verifyAiSetup: jest.fn(),
    inspectAllServers: jest.fn().mockResolvedValue([]),
    clearMcpCache: jest.fn(),
}));

// Mock AI context file generator
jest.mock('@/features/project-creation/services', () => ({
    generateAIContextFiles: jest.fn(),
}));

// Mock vscode
jest.mock('vscode', () => ({
    env: {
        openExternal: jest.fn().mockResolvedValue(undefined),
    },
    Uri: {
        parse: jest.fn((url: string) => ({ toString: () => url })),
    },
    commands: {
        executeCommand: jest.fn().mockResolvedValue(undefined),
    },
}));

// Mock fs for get-components-data
jest.mock('fs/promises', () => ({
    readFile: jest.fn(),
}));

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import {
    configureHandlers,
    handleCancelConfigure,
    handleGetComponentsData,
    handleOpenExternal,
    handleOpenEdsSettings,
    handleVerifyAiSetup,
    handleRegenerateAiFiles,
} from '@/features/dashboard/handlers/configureHandlers';
import { hasHandler, getRegisteredTypes } from '@/core/handlers/dispatchHandler';
import { clearMcpCache, inspectAllServers, verifyAiSetup } from '@/features/ai';
import { handleInspectMcp } from '@/features/dashboard/handlers/configureHandlers';
import { generateAIContextFiles } from '@/features/project-creation/services';
import type { HandlerContext } from '@/types/handlers';

// ==========================================================
// Test Helpers
// ==========================================================

function createMockContext(overrides?: Partial<HandlerContext>): HandlerContext {
    return {
        context: {
            extensionPath: '/mock/extension/path',
            secrets: { get: jest.fn(), store: jest.fn(), delete: jest.fn(), onDidChange: jest.fn() },
            globalState: { get: jest.fn(), update: jest.fn(), keys: jest.fn().mockReturnValue([]) },
            subscriptions: [],
        },
        logger: {
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        },
        debugLogger: {
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        },
        stateManager: {
            getCurrentProject: jest.fn().mockResolvedValue({
                name: 'Test Project',
                path: '/projects/test',
                stack: 'paas',
            }),
        },
        sendMessage: jest.fn().mockResolvedValue(undefined),
        panel: {
            dispose: jest.fn(),
        },
        sharedState: {},
        ...overrides,
    } as unknown as HandlerContext;
}

// ==========================================================
// Tests
// ==========================================================

describe('configureHandlers', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('handler registration', () => {
        it('should be defined as an object', () => {
            expect(configureHandlers).toBeDefined();
            expect(typeof configureHandlers).toBe('object');
        });

        it('should include all expected message types', () => {
            expect(hasHandler(configureHandlers, 'cancel')).toBe(true);
            expect(hasHandler(configureHandlers, 'get-components-data')).toBe(true);
            expect(hasHandler(configureHandlers, 'openExternal')).toBe(true);
            expect(hasHandler(configureHandlers, 'open-eds-settings')).toBe(true);
            expect(hasHandler(configureHandlers, 'discover-store-structure')).toBe(true);
            expect(hasHandler(configureHandlers, 'sync-component-configs')).toBe(true);
            expect(hasHandler(configureHandlers, 'create-workspace-credential')).toBe(true);
            expect(hasHandler(configureHandlers, 'verify-ai-setup')).toBe(true);
            expect(hasHandler(configureHandlers, 'inspect-mcp')).toBe(true);
            expect(hasHandler(configureHandlers, 'regenerate-ai-files')).toBe(true);
        });

        it('should have exactly 10 handlers', () => {
            const types = getRegisteredTypes(configureHandlers);
            expect(types).toHaveLength(10);
        });

        it('should have all handlers as functions', () => {
            const types = getRegisteredTypes(configureHandlers);
            for (const type of types) {
                expect(typeof configureHandlers[type]).toBe('function');
            }
        });
    });

    describe('handleCancelConfigure', () => {
        it('should dispose the panel', async () => {
            const context = createMockContext();
            const result = await handleCancelConfigure(context);

            expect(context.panel?.dispose).toHaveBeenCalled();
            expect(result.success).toBe(true);
        });
    });

    describe('handleGetComponentsData', () => {
        it('should read and return components.json', async () => {
            const mockData = { envVars: { TEST: { key: 'TEST', label: 'Test' } } };
            (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockData));

            const context = createMockContext();
            const result = await handleGetComponentsData(context);

            expect(fs.readFile).toHaveBeenCalledWith(
                expect.stringContaining('components.json'),
                'utf-8',
            );
            expect(result).toEqual(expect.objectContaining({ envVars: mockData.envVars }));
        });
    });

    describe('handleOpenExternal', () => {
        it('should open URL in system browser', async () => {
            const context = createMockContext();
            const result = await handleOpenExternal(context, { url: 'https://example.com' });

            expect(vscode.env.openExternal).toHaveBeenCalled();
            expect(result.success).toBe(true);
        });

        it('should handle missing URL gracefully', async () => {
            const context = createMockContext();
            const result = await handleOpenExternal(context, {});

            expect(vscode.env.openExternal).not.toHaveBeenCalled();
            expect(result.success).toBe(true);
        });
    });

    describe('handleOpenEdsSettings', () => {
        it('should open VS Code settings', async () => {
            const context = createMockContext();
            const result = await handleOpenEdsSettings(context);

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'workbench.action.openSettings',
                'demoBuilder.daLive',
            );
            expect(result.success).toBe(true);
        });
    });

    describe('handleVerifyAiSetup', () => {
        it('calls verifyAiSetup with project.path from stateManager and extensionDistPath from context', async () => {
            const mockResult = { status: 'ok', checks: [] };
            (verifyAiSetup as jest.Mock).mockResolvedValue(mockResult);

            const context = createMockContext();
            const result = await handleVerifyAiSetup(context);

            expect(verifyAiSetup).toHaveBeenCalledWith(
                '/projects/test', // from stateManager.getCurrentProject().path
                expect.stringContaining('mock/extension/path'), // derived from context.extensionPath
            );
            // Handler wraps verifier output in HandlerResponse shape (adds success: true)
            expect(result).toEqual({ success: true, ...mockResult });
        });

        it('returns error when stateManager has no current project', async () => {
            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(null),
                } as unknown as HandlerContext['stateManager'],
            });
            const result = await handleVerifyAiSetup(context);

            expect(verifyAiSetup).not.toHaveBeenCalled();
            expect(result).toMatchObject({ success: false });
        });

        it('propagates errors from verifyAiSetup', async () => {
            (verifyAiSetup as jest.Mock).mockRejectedValue(new Error('fs error'));

            const context = createMockContext();
            await expect(
                handleVerifyAiSetup(context),
            ).rejects.toThrow('fs error');
        });
    });

    describe('handleInspectMcp', () => {
        beforeEach(() => {
            (clearMcpCache as jest.Mock).mockClear();
            (inspectAllServers as jest.Mock).mockClear().mockResolvedValue([]);
        });

        it('clears the full cache and re-inspects when no serverId is provided', async () => {
            (inspectAllServers as jest.Mock).mockResolvedValueOnce([
                { id: 'demo-builder', status: 'ok', tools: [{ name: 't', description: 'd' }] },
            ]);
            const mockProject = { name: 'p', path: '/projects/p', stack: 'paas' };
            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(mockProject),
                } as unknown as HandlerContext['stateManager'],
            });

            const result = await handleInspectMcp(context);

            expect(clearMcpCache).toHaveBeenCalledWith(undefined);
            expect(inspectAllServers).toHaveBeenCalledWith('/projects/p');
            expect(result).toMatchObject({
                success: true,
                mcps: [{ id: 'demo-builder', status: 'ok' }],
            });
        });

        it('clears a single serverId when provided in the payload', async () => {
            const mockProject = { name: 'p', path: '/projects/p', stack: 'paas' };
            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(mockProject),
                } as unknown as HandlerContext['stateManager'],
            });

            await handleInspectMcp(context, { serverId: 'demo-builder' });

            expect(clearMcpCache).toHaveBeenCalledWith('demo-builder');
        });

        it('uses server-side project.path (ignores any path the webview might supply)', async () => {
            const mockProject = { name: 'p', path: '/safe/path', stack: 'paas' };
            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(mockProject),
                } as unknown as HandlerContext['stateManager'],
            });

            await handleInspectMcp(context);

            expect(inspectAllServers).toHaveBeenCalledWith('/safe/path');
        });

        it('returns project-not-found error when no current project is loaded', async () => {
            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(null),
                } as unknown as HandlerContext['stateManager'],
            });

            const result = await handleInspectMcp(context);

            expect(clearMcpCache).not.toHaveBeenCalled();
            expect(inspectAllServers).not.toHaveBeenCalled();
            expect(result).toMatchObject({ success: false });
        });
    });

    describe('handleRegenerateAiFiles', () => {
        it('calls generateAIContextFiles using server-side project.path (ignores payload)', async () => {
            (generateAIContextFiles as jest.Mock).mockResolvedValue(undefined);
            const mockProject = { name: 'Test Project', path: '/projects/test', stack: 'paas' };

            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(mockProject),
                } as unknown as HandlerContext['stateManager'],
            });

            // Pass a different path in payload — it should be ignored in favour of project.path
            const result = await handleRegenerateAiFiles(context, { projectPath: '/attacker/path' });

            expect(generateAIContextFiles).toHaveBeenCalledWith(
                '/projects/test', // project.path from state, not payload
                mockProject,
                '/mock/extension/path',
            );
            expect(result).toEqual({ success: true });
        });

        it('returns error when project is not found', async () => {
            const context = createMockContext({
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(null),
                } as unknown as HandlerContext['stateManager'],
            });

            const result = await handleRegenerateAiFiles(context, { projectPath: '/projects/test' });

            expect(generateAIContextFiles).not.toHaveBeenCalled();
            expect(result).toMatchObject({ success: false });
        });
    });
});
