/**
 * Unit Tests for ProjectDashboardWebviewCommand - Bundle Loading
 * Tests for Step 3: Update dashboard command to use 4-bundle helper
 *
 * These tests verify that the dashboard command generates HTML with all 4 webpack
 * bundles in the correct order, with proper CSP compliance.
 */

import * as vscode from 'vscode';
import { ProjectDashboardWebviewCommand } from '@/features/dashboard/commands/showDashboard';
import { StateManager } from '@/core/state';
import { Logger } from '@/core/logging';

// Mock dependencies
jest.mock('@/core/logging/debugLogger');

/**
 * Create mock ExtensionContext
 */
function createMockExtensionContext(): vscode.ExtensionContext {
    return {
        subscriptions: [],
        extensionPath: '/mock/extension/path',
        globalState: {
            get: jest.fn(),
            update: jest.fn(),
            keys: jest.fn(() => []),
            setKeysForSync: jest.fn(),
        } as any,
        workspaceState: {
            get: jest.fn(),
            update: jest.fn(),
            keys: jest.fn(() => []),
        } as any,
        extensionUri: vscode.Uri.file('/mock/extension/path'),
        extensionMode: vscode.ExtensionMode.Test,
        environmentVariableCollection: {} as any,
        asAbsolutePath: (relativePath: string) => `/mock/extension/path/${relativePath}`,
        storageUri: undefined,
        globalStorageUri: vscode.Uri.file('/mock/storage'),
        logUri: vscode.Uri.file('/mock/logs'),
        storagePath: '/mock/storage',
        globalStoragePath: '/mock/global/storage',
        logPath: '/mock/logs',
        secrets: {} as any,
        extension: {} as any,
        languageModelAccessInformation: {} as any,
    } as vscode.ExtensionContext;
}

/**
 * Create mock StateManager
 */
function createMockStateManager(): StateManager {
    return {
        getState: jest.fn(),
        setState: jest.fn(),
        clearState: jest.fn(),
        getCurrentProject: jest.fn(),
    } as any;
}

/**
 * Create mock Logger
 */
function createMockLogger(): Logger {
    return {
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    } as any;
}

/**
 * Helper to create dashboard command instance
 */
function createDashboardCommand(): ProjectDashboardWebviewCommand {
    const mockContext = createMockExtensionContext();
    const mockStateManager = createMockStateManager();
    const mockLogger = createMockLogger();

    return new ProjectDashboardWebviewCommand(
        mockContext,
        mockStateManager,
        mockLogger
    );
}

describe('ProjectDashboardWebviewCommand - Bundle Loading', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should generate webview HTML with all 4 bundles in correct order', async () => {
        // Given: Dashboard command is executed
        const command = createDashboardCommand();

        // Mock panel and webview (required by getWebviewContent)
        const mockWebview = {
            cspSource: 'vscode-webview://test',
            asWebviewUri: jest.fn((uri: vscode.Uri) => uri),
        };
        (command as any).panel = {
            webview: mockWebview,
        };

        // When: Webview HTML is generated
        const html = await (command as any).getWebviewContent();

        // Then: Contains script tags for all 4 bundles in correct order
        expect(html).toContain('runtime-bundle.js');
        expect(html).toContain('vendors-bundle.js');
        expect(html).toContain('common-bundle.js');
        expect(html).toContain('dashboard-bundle.js');

        // Verify load order: runtime → vendors → common → dashboard
        const runtimeIndex = html.indexOf('runtime-bundle.js');
        const vendorsIndex = html.indexOf('vendors-bundle.js');
        const commonIndex = html.indexOf('common-bundle.js');
        const dashboardIndex = html.indexOf('dashboard-bundle.js');

        expect(runtimeIndex).toBeLessThan(vendorsIndex);
        expect(vendorsIndex).toBeLessThan(commonIndex);
        expect(commonIndex).toBeLessThan(dashboardIndex);
    });

    it('should apply nonces to all script tags for CSP compliance', async () => {
        // Given: Dashboard webview HTML is generated
        const command = createDashboardCommand();

        // Mock panel and webview
        const mockWebview = {
            cspSource: 'vscode-webview://test',
            asWebviewUri: jest.fn((uri: vscode.Uri) => uri),
        };
        (command as any).panel = {
            webview: mockWebview,
        };

        // When: HTML content is parsed
        const html = await (command as any).getWebviewContent();

        // Then: All script tags have nonce attribute
        const scriptMatches = html.match(/<script nonce="([^"]+)"/g);
        expect(scriptMatches).toHaveLength(4); // 4 bundles = 4 script tags

        // Verify all use same nonce (CSP compliance)
        const noncePattern = /nonce="([^"]+)"/;
        const nonces = scriptMatches?.map((match: string) => {
            const result = noncePattern.exec(match);
            return result ? result[1] : null;
        });

        expect(nonces).toBeDefined();
        expect(new Set(nonces).size).toBe(1); // All same nonce
        expect(nonces![0].length).toBeGreaterThan(16); // Reasonable nonce length (base64-encoded)
    });
});
