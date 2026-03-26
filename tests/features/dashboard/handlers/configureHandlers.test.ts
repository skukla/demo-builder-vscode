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
} from '@/features/dashboard/handlers/configureHandlers';
import { hasHandler, getRegisteredTypes } from '@/core/handlers/dispatchHandler';
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
            expect(hasHandler(configureHandlers, 'create-workspace-credential')).toBe(true);
        });

        it('should have exactly 6 handlers', () => {
            const types = getRegisteredTypes(configureHandlers);
            expect(types).toHaveLength(6);
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
});
