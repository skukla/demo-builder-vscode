/**
 * configureHandlers Tests
 *
 * Tests for the Configure screen handler map.
 * Verifies handler registration and individual handler behavior.
 *
 * AI handlers (verify-ai-setup, inspect-mcp, regenerate-ai-files,
 * openInClaude) moved to aiHandlers.ts; their tests live
 * in aiHandlers.test.ts.
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

import './dashboardValidatorMocks';
import * as vscode from 'vscode';
import {
    configureHandlers,
    handleCancelConfigure,
    handleOpenExternal,
    handleOpenEdsSettings,
} from '@/features/dashboard/handlers/configureHandlers';
import { hasHandler, getRegisteredTypes } from '@/core/handlers/dispatchHandler';
import type { HandlerContext } from '@/types/handlers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockWebviewPanel } from '../../../helpers/webviewPanelFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import {
    createStatefulGlobalState,
    createMockExtensionContext,
} from '../../../helpers/extensionContextFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';

// ==========================================================
// Test Helpers
// ==========================================================

function createMockContext(overrides?: Partial<HandlerContext>): HandlerContext {
    return createMockHandlerContext({
        context: createMockExtensionContext({
            extensionPath: '/mock/extension/path',
            secrets: createMockSecretStorage().secrets,
            globalState: createStatefulGlobalState().globalState,
            subscriptions: [],
        }),
        logger: createMockLogger(),
        debugLogger: createMockLogger(),
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue({
                name: 'Test Project',
                path: '/projects/test',
                stack: 'paas',
            }),
        }),
        sendMessage: jest.fn().mockResolvedValue(undefined),
        panel: createMockWebviewPanel({
            dispose: jest.fn(),
        }),
        ...overrides,
    });
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
            expect(hasHandler(configureHandlers, 'openExternal')).toBe(true);
            expect(hasHandler(configureHandlers, 'open-eds-settings')).toBe(true);
            expect(hasHandler(configureHandlers, 'discover-store-structure')).toBe(true);
        });

        it('should NOT include get-components-data (the wizard owns that message)', () => {
            // Removed 2026-08-21: nothing on the Configure webview ever sent it
            // (the screen seeds componentsData from the init payload), and this
            // map's copy returned a DIFFERENT shape (raw components.json, no
            // {success,data} wrapper) than the wizard handler the shared hook
            // actually talks to.
            expect(hasHandler(configureHandlers, 'get-components-data')).toBe(false);
        });

        it('should have exactly 5 handlers', () => {
            const types = getRegisteredTypes(configureHandlers) as Array<
                keyof typeof configureHandlers
            >;
            // 6 → 5: create-workspace-credential removed 2026-08-05 (nothing sent it).
            // 5 → 6: check-credential-service — Configure renders the same ACCS OAuth
            // fields as the wizard, so it must answer the same probe or the two
            // surfaces disagree about whether those fields need filling in.
            // 6 → 5: get-components-data removed 2026-08-21 (see the test above).
            expect(types).toHaveLength(5);
        });

        it('should NOT include AI handlers (they live in aiHandlers.ts)', () => {
            expect(hasHandler(configureHandlers, 'verify-ai-setup')).toBe(false);
            expect(hasHandler(configureHandlers, 'inspect-mcp')).toBe(false);
            expect(hasHandler(configureHandlers, 'regenerate-ai-files')).toBe(false);
            expect(hasHandler(configureHandlers, 'openInClaude')).toBe(false);
        });

        it('should have all handlers as functions', () => {
            const types = getRegisteredTypes(configureHandlers) as Array<
                keyof typeof configureHandlers
            >;
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
                'demoBuilder.daLive'
            );
            expect(result.success).toBe(true);
        });
    });
});
