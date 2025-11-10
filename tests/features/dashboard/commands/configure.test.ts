/**
 * ConfigureProjectWebviewCommand - Bundle Loading Tests
 *
 * Tests webpack bundle loading in correct order for configure webview.
 * Ensures all 4 bundles (runtime, vendors, common, configure) are loaded in sequence.
 *
 * Target Coverage: 90%+
 */

import { ConfigureProjectWebviewCommand } from '@/features/dashboard/commands/configure';
import * as vscode from 'vscode';
import { StateManager } from '@/core/state';
import { StatusBarManager } from '@/core/vscode/StatusBarManager';
import { Logger } from '@/core/logging';
import type { Project } from '@/types';

// Mock VS Code API
jest.mock('vscode');

// Mock dependencies
jest.mock('@/core/state');
jest.mock('@/core/vscode/StatusBarManager');
jest.mock('@/features/components/services/ComponentRegistryManager');

// Mock logger used by WebviewCommunicationManager and other modules
jest.mock('@/core/logging', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    }),
    Logger: jest.fn().mockImplementation(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    }))
}));

describe('ConfigureProjectWebviewCommand - Bundle Loading', () => {
    let command: ConfigureProjectWebviewCommand;
    let mockContext: vscode.ExtensionContext;
    let mockStateManager: jest.Mocked<StateManager>;
    let mockStatusBar: StatusBarManager;
    let mockLogger: Logger;
    let mockPanel: vscode.WebviewPanel;
    let mockWebview: vscode.Webview;

    beforeEach(() => {
        jest.clearAllMocks();

        // Create mock webview
        mockWebview = {
            asWebviewUri: jest.fn((uri: vscode.Uri) => {
                // Return mock URI that preserves path for testing
                return {
                    toString: () => `vscode-webview://authority${uri.fsPath}`,
                    fsPath: uri.fsPath,
                } as vscode.Uri;
            }),
            cspSource: 'vscode-webview:',
            postMessage: jest.fn(),
            onDidReceiveMessage: jest.fn(),
        } as unknown as vscode.Webview;

        // Create mock panel
        mockPanel = {
            webview: mockWebview,
            dispose: jest.fn(),
            onDidDispose: jest.fn(),
            reveal: jest.fn(),
        } as unknown as vscode.WebviewPanel;

        // Create mock context
        mockContext = {
            subscriptions: [],
            extensionPath: '/test/extension/path',
            extensionUri: vscode.Uri.file('/test/extension/path'),
            globalState: {
                get: jest.fn(),
                update: jest.fn(),
            },
        } as unknown as vscode.ExtensionContext;

        // Create mock state manager
        mockStateManager = {
            getCurrentProject: jest.fn().mockResolvedValue({
                name: 'Test Project',
                path: '/test/project',
                componentInstances: {},
            } as Project),
        } as unknown as jest.Mocked<StateManager>;

        // Create mock status bar
        mockStatusBar = new StatusBarManager(mockContext, mockStateManager as unknown as StateManager);

        // Create mock logger
        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as unknown as Logger;

        // Create command
        command = new ConfigureProjectWebviewCommand(
            mockContext,
            mockStateManager as unknown as StateManager,
            mockStatusBar,
            mockLogger
        );

        // Mock panel creation
        (vscode.window.createWebviewPanel as jest.Mock) = jest.fn().mockReturnValue(mockPanel);

        // Mock color theme
        (vscode.window.activeColorTheme as any) = {
            kind: vscode.ColorThemeKind.Dark,
        };
    });

    describe('Webpack Bundle Loading', () => {
        it('should load all 4 webpack bundles in correct order', async () => {
            // Set up panel so getWebviewContent can access it
            (command as any).panel = mockPanel;

            // Get the HTML content
            const html = await (command as any).getWebviewContent();

            // Extract script tags
            const scriptRegex = /<script[^>]*src="([^"]+)"[^>]*>/g;
            const scriptMatches = [...html.matchAll(scriptRegex)];
            const scriptUrls = scriptMatches.map(match => match[1]);

            // Verify we have exactly 4 script tags
            expect(scriptUrls).toHaveLength(4);

            // Verify correct order: runtime → vendors → common → configure
            expect(scriptUrls[0]).toContain('runtime-bundle.js');
            expect(scriptUrls[1]).toContain('vendors-bundle.js');
            expect(scriptUrls[2]).toContain('common-bundle.js');
            expect(scriptUrls[3]).toContain('configure-bundle.js');
        });

        it('should include nonce attribute on all script tags', async () => {
            // Set up panel so getWebviewContent can access it
            (command as any).panel = mockPanel;
            const html = await (command as any).getWebviewContent();

            // Extract script tags
            const scriptRegex = /<script[^>]*>/g;
            const scriptTags = html.match(scriptRegex) || [];

            // Verify we have 4 script tags
            expect(scriptTags).toHaveLength(4);

            // Verify each has nonce attribute
            scriptTags.forEach((tag: string) => {
                expect(tag).toMatch(/nonce="[^"]+"/);
            });
        });

        it('should include CSP header with correct nonce', async () => {
            // Set up panel so getWebviewContent can access it
            (command as any).panel = mockPanel;
            const html = await (command as any).getWebviewContent();

            // Verify CSP meta tag exists
            expect(html).toMatch(/<meta http-equiv="Content-Security-Policy"/);

            // Verify script-src includes nonce
            expect(html).toMatch(/script-src 'nonce-[^']+'/);
        });

        it('should use asWebviewUri for all bundle paths', async () => {
            // Set up panel so getWebviewContent can access it
            (command as any).panel = mockPanel;
            await (command as any).getWebviewContent();

            // Verify asWebviewUri was called 4 times (once per bundle)
            expect(mockWebview.asWebviewUri).toHaveBeenCalledTimes(4);

            // Verify it was called with correct paths
            const calls = (mockWebview.asWebviewUri as jest.Mock).mock.calls;
            expect(calls[0][0].fsPath).toContain('runtime-bundle.js');
            expect(calls[1][0].fsPath).toContain('vendors-bundle.js');
            expect(calls[2][0].fsPath).toContain('common-bundle.js');
            expect(calls[3][0].fsPath).toContain('configure-bundle.js');
        });

        it('should include root div for React mounting', async () => {
            // Set up panel so getWebviewContent can access it
            (command as any).panel = mockPanel;
            const html = await (command as any).getWebviewContent();

            // Verify root div exists
            expect(html).toContain('<div id="root"></div>');
        });

        it('should set correct document title', async () => {
            // Set up panel so getWebviewContent can access it
            (command as any).panel = mockPanel;
            const html = await (command as any).getWebviewContent();

            expect(html).toContain('<title>Configure Project</title>');
        });

        it('should include proper CSP directives', async () => {
            // Set up panel so getWebviewContent can access it
            (command as any).panel = mockPanel;
            const html = await (command as any).getWebviewContent();

            // Verify key CSP directives
            expect(html).toMatch(/default-src 'none'/);
            expect(html).toMatch(/style-src [^\s]+ 'unsafe-inline'/);
            expect(html).toMatch(/img-src https: data:/);
            expect(html).toMatch(/font-src [^\s]+/);
        });
    });

    describe('WebviewCommand Methods', () => {
        it('should return correct webview ID', () => {
            const webviewId = (command as any).getWebviewId();
            expect(webviewId).toBe('demoBuilder.configureProject');
        });

        it('should return correct webview title', () => {
            const title = (command as any).getWebviewTitle();
            expect(title).toBe('Configure Project');
        });

        it('should return correct loading message', () => {
            const loadingMessage = (command as any).getLoadingMessage();
            expect(loadingMessage).toBe('Loading project configuration...');
        });
    });

    describe('Nonce Generation', () => {
        it('should generate unique nonce for each webview creation', async () => {
            // Set up panel for first command
            (command as any).panel = mockPanel;
            const html1 = await (command as any).getWebviewContent();

            // Create second command with its own panel
            const command2 = new ConfigureProjectWebviewCommand(
                mockContext,
                mockStateManager as unknown as StateManager,
                mockStatusBar,
                mockLogger
            );
            (command2 as any).panel = mockPanel;
            const html2 = await (command2 as any).getWebviewContent();

            // Extract nonces
            const nonceRegex = /nonce="([^"]+)"/;
            const nonce1 = html1.match(nonceRegex)?.[1];
            const nonce2 = html2.match(nonceRegex)?.[1];

            // Nonces should be different
            expect(nonce1).toBeDefined();
            expect(nonce2).toBeDefined();
            expect(nonce1).not.toBe(nonce2);
        });

        it('should use same nonce for all script tags in same webview', async () => {
            // Set up panel so getWebviewContent can access it
            (command as any).panel = mockPanel;
            const html = await (command as any).getWebviewContent();

            // Extract all nonces
            const nonceRegex = /nonce="([^"]+)"/g;
            const nonces = [...html.matchAll(nonceRegex)].map(match => match[1]);

            // All nonces should be the same
            expect(nonces.length).toBeGreaterThan(0);
            const firstNonce = nonces[0];
            nonces.forEach(nonce => {
                expect(nonce).toBe(firstNonce);
            });
        });
    });
});
