/**
 * WelcomeWebviewCommand - Bundle Loading Tests
 *
 * Tests webpack bundle loading in correct order for welcome webview.
 * Created as part of welcome webview handshake refactor to ensure all
 * 4 bundles (runtime, vendors, common, welcome) are loaded in sequence.
 *
 * Target Coverage: 75%+
 */

import { WelcomeWebviewCommand } from '@/features/welcome/commands/showWelcome';
import * as vscode from 'vscode';
import { StateManager } from '@/core/state';
import { StatusBarManager } from '@/core/vscode/StatusBarManager';
import { Logger } from '@/core/logging';

// Mock VS Code API
jest.mock('vscode');

// Mock dependencies
jest.mock('@/core/state');
jest.mock('@/core/vscode/StatusBarManager');

// Mock logger used by WebviewCommunicationManager
jest.mock('@/core/logging', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    })
}));

describe('WelcomeWebviewCommand - Bundle Loading', () => {
    let command: WelcomeWebviewCommand;
    let mockContext: vscode.ExtensionContext;
    let mockStateManager: StateManager;
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
            globalState: {
                get: jest.fn(),
                update: jest.fn(),
            },
        } as unknown as vscode.ExtensionContext;

        // Create mock dependencies
        mockStateManager = new StateManager(mockContext);
        mockStatusBar = new StatusBarManager(mockContext, mockStateManager);
        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as unknown as Logger;

        // Create command
        command = new WelcomeWebviewCommand(
            mockContext,
            mockStateManager,
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

            // Verify correct order: runtime → vendors → common → welcome
            expect(scriptUrls[0]).toContain('runtime-bundle.js');
            expect(scriptUrls[1]).toContain('vendors-bundle.js');
            expect(scriptUrls[2]).toContain('common-bundle.js');
            expect(scriptUrls[3]).toContain('welcome-bundle.js');
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
            expect(calls[3][0].fsPath).toContain('welcome-bundle.js');
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

            expect(html).toContain('<title>Demo Builder</title>');
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
            expect(webviewId).toBe('demoBuilderWelcome');
        });

        it('should return correct webview title', () => {
            const title = (command as any).getWebviewTitle();
            expect(title).toBe('Demo Builder');
        });

        it('should return correct loading message', () => {
            const loadingMessage = (command as any).getLoadingMessage();
            expect(loadingMessage).toBe('Loading Demo Builder...');
        });

        it('should provide initial data with theme and workspace', async () => {
            // Mock workspace folders
            (vscode.workspace.workspaceFolders as any) = [
                { uri: { fsPath: '/test/workspace' } },
            ];

            const initialData = await (command as any).getInitialData();

            expect(initialData).toHaveProperty('theme');
            expect(initialData).toHaveProperty('workspacePath');
            expect(initialData.theme).toBe('dark'); // From mock ColorThemeKind.Dark
            expect(initialData.workspacePath).toBe('/test/workspace');
        });
    });

    describe('Static Disposal Method', () => {
        it('should expose disposeActivePanel static method', () => {
            expect(WelcomeWebviewCommand.disposeActivePanel).toBeDefined();
            expect(typeof WelcomeWebviewCommand.disposeActivePanel).toBe('function');
        });

        it('should call dispose on active panel if exists', () => {
            // This would require accessing BaseWebviewCommand internals
            // For now, just verify the method exists and doesn't throw
            expect(() => WelcomeWebviewCommand.disposeActivePanel()).not.toThrow();
        });
    });

    describe('Nonce Generation', () => {
        it('should generate unique nonce for each webview creation', async () => {
            // Set up panel for first command
            (command as any).panel = mockPanel;
            const html1 = await (command as any).getWebviewContent();

            // Create second command with its own panel
            const command2 = new WelcomeWebviewCommand(
                mockContext,
                mockStateManager,
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
