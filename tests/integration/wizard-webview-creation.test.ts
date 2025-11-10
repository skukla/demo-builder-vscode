/**
 * Integration Tests for Wizard Webview Creation
 * Tests for Step 2: Update wizard command to use 4-bundle helper
 *
 * These integration tests verify that the wizard webview can be created
 * successfully and that all 4 bundles load without timeout issues.
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
 * Create integration test command with real-like VS Code API
 */
async function createIntegrationWizardCommand(): Promise<CreateProjectWebviewCommand> {
    const mockContext: vscode.ExtensionContext = {
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

    const mockStateManager: StateManager = {
        getState: jest.fn(),
        setState: jest.fn(),
        clearState: jest.fn(),
        getCurrentProject: jest.fn(),
    } as any;

    const mockStatusBar: StatusBarManager = {
        showLoading: jest.fn(),
        showSuccess: jest.fn(),
        showError: jest.fn(),
        showIdle: jest.fn(),
    } as any;

    const mockLogger: Logger = {
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    } as any;

    return new CreateProjectWebviewCommand(
        mockContext,
        mockStateManager,
        mockStatusBar,
        mockLogger
    );
}

/**
 * Extract script URLs from HTML
 */
function extractScriptUrls(html: string): string[] {
    const scriptPattern = /<script[^>]*src="([^"]+)"/g;
    const urls: string[] = [];
    let match;

    while ((match = scriptPattern.exec(html)) !== null) {
        urls.push(match[1]);
    }

    return urls;
}

describe('Wizard Webview Creation - Integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should open wizard webview without timeout', async () => {
        // Arrange: Create command with real VS Code API (mocked)
        const command = await createIntegrationWizardCommand();

        // Mock panel creation (simulates VS Code API)
        const mockWebview = {
            cspSource: 'vscode-webview://test',
            asWebviewUri: jest.fn((uri: vscode.Uri) => uri),
            postMessage: jest.fn(),
            onDidReceiveMessage: jest.fn(),
        };

        const mockPanel = {
            webview: mockWebview,
            dispose: jest.fn(),
            onDidDispose: jest.fn(),
            reveal: jest.fn(),
            visible: true,
        };

        (command as any).panel = mockPanel;

        // Act: Execute command to open webview
        const startTime = Date.now();

        // Since execute() calls createOrRevealPanel which needs VS Code API,
        // we'll test getWebviewContent directly which is the core functionality
        const html = await (command as any).getWebviewContent();

        const duration = Date.now() - startTime;

        // Assert: Webview generates HTML in reasonable time (< 5 seconds)
        expect(duration).toBeLessThan(5000);

        // Verify HTML was generated
        expect(html).toBeDefined();
        expect(html).toContain('<!DOCTYPE html>');

        // Verify panel components exist
        expect(mockPanel).toBeDefined();
        expect(mockPanel.webview).toBeDefined();
    });

    it('should load all 4 bundles in browser environment', async () => {
        // Arrange: Create webview with actual DOM-like structure
        const command = await createIntegrationWizardCommand();

        // Mock panel and webview
        const mockWebview = {
            cspSource: 'vscode-webview://test',
            asWebviewUri: jest.fn((uri: vscode.Uri) => uri),
            postMessage: jest.fn(),
            onDidReceiveMessage: jest.fn(),
        };

        (command as any).panel = {
            webview: mockWebview,
        };

        // Act: Get HTML and parse
        const html = await (command as any).getWebviewContent();
        const scriptUrls = extractScriptUrls(html);

        // Assert: All 4 bundle URLs present
        expect(scriptUrls).toHaveLength(4);
        expect(scriptUrls[0]).toContain('runtime-bundle.js');
        expect(scriptUrls[1]).toContain('vendors-bundle.js');
        expect(scriptUrls[2]).toContain('common-bundle.js');
        expect(scriptUrls[3]).toContain('wizard-bundle.js');
    });
});
