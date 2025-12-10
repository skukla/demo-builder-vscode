/**
 * Unit Tests for CreateProjectWebviewCommand - Bundle Loading
 * Tests for Step 2: Update wizard command to use 4-bundle helper
 *
 * These tests verify that the wizard command generates HTML with all 4 webpack
 * bundles in the correct order, with proper CSP compliance.
 */

import * as vscode from 'vscode';
import { CreateProjectWebviewCommand } from '@/features/project-creation/commands/createProject';
import { StateManager } from '@/core/state';
import { StatusBarManager } from '@/core/vscode/StatusBarManager';
import { Logger } from '@/core/logging';

// Mock dependencies
jest.mock('@/core/logging/debugLogger');
jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(() => ({
            isAuthenticated: jest.fn(),
        })),
        getCommandExecutor: jest.fn(() => ({
            execute: jest.fn(),
        })),
    },
}));

jest.mock('@/features/components/handlers/componentHandler');
jest.mock('@/features/prerequisites/services/PrerequisitesManager');

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
 * Create mock StatusBarManager
 */
function createMockStatusBar(): StatusBarManager {
    return {
        showLoading: jest.fn(),
        showSuccess: jest.fn(),
        showError: jest.fn(),
        showIdle: jest.fn(),
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
 * Helper to create wizard command instance
 */
function createWizardCommand(): CreateProjectWebviewCommand {
    const mockContext = createMockExtensionContext();
    const mockStateManager = createMockStateManager();
    const mockStatusBar = createMockStatusBar();
    const mockLogger = createMockLogger();

    return new CreateProjectWebviewCommand(
        mockContext,
        mockStateManager,
        mockStatusBar,
        mockLogger
    );
}

describe('CreateProjectWebviewCommand - Bundle Loading', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should generate webview HTML with all 4 bundles in correct order', async () => {
        // Arrange: Create command instance with mocked dependencies
        const command = createWizardCommand();

        // Mock panel and webview (required by getWebviewContent)
        const mockWebview = {
            cspSource: 'vscode-webview://test',
            asWebviewUri: jest.fn((uri: vscode.Uri) => uri),
        };
        (command as any).panel = {
            webview: mockWebview,
        };

        // Act: Get webview content
        const html = await (command as any).getWebviewContent();

        // Assert: Verify all 4 bundles present in correct order
        expect(html).toContain('runtime-bundle.js');
        expect(html).toContain('vendors-bundle.js');
        expect(html).toContain('common-bundle.js');
        expect(html).toContain('wizard-bundle.js');

        // Verify load order: runtime → vendors → common → wizard
        const runtimeIndex = html.indexOf('runtime-bundle.js');
        const vendorsIndex = html.indexOf('vendors-bundle.js');
        const commonIndex = html.indexOf('common-bundle.js');
        const wizardIndex = html.indexOf('wizard-bundle.js');

        expect(runtimeIndex).toBeLessThan(vendorsIndex);
        expect(vendorsIndex).toBeLessThan(commonIndex);
        expect(commonIndex).toBeLessThan(wizardIndex);
    });

    it('should apply nonces to all script tags for CSP compliance', async () => {
        // Arrange
        const command = createWizardCommand();

        // Mock panel and webview
        const mockWebview = {
            cspSource: 'vscode-webview://test',
            asWebviewUri: jest.fn((uri: vscode.Uri) => uri),
        };
        (command as any).panel = {
            webview: mockWebview,
        };

        // Act
        const html = await (command as any).getWebviewContent();

        // Assert: All script tags have nonce attribute (4 bundles + 1 baseUri)
        const scriptMatches = html.match(/<script nonce="([^"]+)"/g);
        expect(scriptMatches).toHaveLength(5);

        // Verify all use same nonce
        const noncePattern = /nonce="([^"]+)"/;
        const nonces = scriptMatches?.map((match: string) => {
            const result = noncePattern.exec(match);
            return result ? result[1] : null;
        });

        expect(nonces).toBeDefined();
        expect(new Set(nonces).size).toBe(1); // All same nonce
        expect(nonces![0].length).toBeGreaterThan(16); // Reasonable nonce length (base64-encoded)
    });

    it('should include proper CSP headers with nonce and cspSource', async () => {
        // Arrange
        const command = createWizardCommand();

        // Mock panel and webview
        const mockWebview = {
            cspSource: 'vscode-webview://test',
            asWebviewUri: jest.fn((uri: vscode.Uri) => uri),
        };
        (command as any).panel = {
            webview: mockWebview,
        };

        // Act
        const html = await (command as any).getWebviewContent();

        // Assert: CSP meta tag present with required directives
        expect(html).toContain('<meta http-equiv="Content-Security-Policy"');
        expect(html).toContain(`default-src 'none'`);

        // Extract nonce from first script tag
        const scriptMatch = html.match(/<script nonce="([^"]+)"/);
        expect(scriptMatch).toBeTruthy();
        const nonce = scriptMatch![1];

        // Verify CSP includes nonce in script-src
        expect(html).toContain(`script-src 'nonce-${nonce}'`);

        // Verify CSP includes cspSource
        expect(html).toMatch(/script-src[^;]+vscode-webview:/);
    });
});
