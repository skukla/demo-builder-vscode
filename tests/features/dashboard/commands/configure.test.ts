/**
 * ConfigureProjectWebviewCommand - Bundle Loading Tests
 *
 * Tests webpack bundle loading in correct order for configure webview.
 * Ensures all 4 bundles (runtime, vendors, common, configure) are loaded in sequence.
 *
 * Target Coverage: 90%+
 */

import { ConfigureProjectWebviewCommand } from './configure.testUtils';
import * as vscode from 'vscode';
import { StateManager } from '@/core/state/stateManager';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockProject } from '../../../helpers/projectFake';

// Mock VS Code API

// Mock dependencies

// Mock logger used by WebviewCommunicationManager and other modules

describe('ConfigureProjectWebviewCommand - Bundle Loading', () => {
    let command: ConfigureProjectWebviewCommand;
    let mockContext: vscode.ExtensionContext;
    let mockStateManager: jest.Mocked<StateManager>;
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
        mockContext = createMockExtensionContext();

        // Create mock state manager
        mockStateManager = {
            getCurrentProject: jest.fn().mockResolvedValue(createMockProject({
                name: 'Test Project',
                path: '/test/project',
                componentInstances: {},
            })),
        } as unknown as jest.Mocked<StateManager>;

        // Create mock logger
        mockLogger = createMockLogger() as unknown as Logger;

        // Create command
        command = new ConfigureProjectWebviewCommand(
            mockContext,
            mockStateManager as unknown as StateManager,
            mockLogger
        );

        // Mock panel creation
        (vscode.window.createWebviewPanel as jest.Mock) = jest.fn().mockReturnValue(mockPanel);

        // Mock color theme
        // `activeColorTheme` is readonly on the real API; the vscode module is
        // mocked here, so overwriting it is how the theme is set. Naming the target
        // keeps the assigned VALUE checked — under `as any` a misspelt `kind` would
        // have been accepted silently.
        (vscode.window as { activeColorTheme: vscode.ColorTheme }).activeColorTheme = {
            kind: vscode.ColorThemeKind.Dark,
        };
    });

    /**
 * The five members this suite reaches on the command under test.
 *
 * `panel` is protected on `BaseWebviewCommand`; `getWebviewContent`,
 * `getWebviewId`, `getWebviewTitle` and `getLoadingMessage` are the protected
 * template methods a subclass implements. Exercising them directly is the point of
 * this suite — it tests what the Configure command PUTS in the webview — so the
 * reach is deliberate and TypeScript is right to object.
 *
 * Named once here instead of `as any` twenty-four times. `as any` disabled checking
 * of the whole statement at every site; this names exactly what is being reached
 * for, so a typo in one of the five still fails the build rather than silently
 * creating a property and passing.
 */
interface WebviewCommandInternals {
    panel: unknown;
    getWebviewContent(): Promise<string>;
    getWebviewId(): string;
    getWebviewTitle(): string;
    getLoadingMessage(): string;
}

/** Reach the protected surface of a webview command under test. */
function internals(command: object): WebviewCommandInternals {
    return command as unknown as WebviewCommandInternals;
}

describe('esbuild Bundle Loading', () => {
        it('should load the single feature bundle', async () => {
            // Set up panel so getWebviewContent can access it
            internals(command).panel = mockPanel;

            // Get the HTML content
            const html = await internals(command).getWebviewContent();

            // Extract script src attributes
            const scriptRegex = /<script[^>]*src="([^"]+)"[^>]*>/g;
            const scriptMatches = [...html.matchAll(scriptRegex)];
            const scriptUrls = scriptMatches.map(match => match[1]);

            // Single feature bundle — no runtime/vendors/common split
            expect(scriptUrls).toHaveLength(1);
            expect(scriptUrls[0]).toContain('configure-bundle.js');
        });

        it('should include nonce attribute on all script tags', async () => {
            // Set up panel so getWebviewContent can access it
            internals(command).panel = mockPanel;
            const html = await internals(command).getWebviewContent();

            // Extract script tags
            const scriptRegex = /<script[^>]*>/g;
            const scriptTags = html.match(scriptRegex) || [];

            // 2 script tags: 1 bundle + 1 baseUri inline script
            expect(scriptTags).toHaveLength(2);

            // Verify each has nonce attribute
            scriptTags.forEach((tag: string) => {
                expect(tag).toMatch(/nonce="[^"]+"/);
            });
        });

        it('should include CSP header with correct nonce', async () => {
            // Set up panel so getWebviewContent can access it
            internals(command).panel = mockPanel;
            const html = await internals(command).getWebviewContent();

            // Verify CSP meta tag exists
            expect(html).toMatch(/<meta http-equiv="Content-Security-Policy"/);

            // Verify script-src includes nonce
            expect(html).toMatch(/script-src 'nonce-[^']+'/);
        });

        it('should use asWebviewUri for the bundle and baseUri paths', async () => {
            // Set up panel so getWebviewContent can access it
            internals(command).panel = mockPanel;
            await internals(command).getWebviewContent();

            // asWebviewUri called twice: feature bundle + baseUri
            expect(mockWebview.asWebviewUri).toHaveBeenCalledTimes(2);

            // Verify correct paths
            const calls = (mockWebview.asWebviewUri as jest.Mock).mock.calls;
            expect(calls[0][0].fsPath).toContain('configure-bundle.js');
        });

        it('should include root div for React mounting', async () => {
            // Set up panel so getWebviewContent can access it
            internals(command).panel = mockPanel;
            const html = await internals(command).getWebviewContent();

            // Verify root div exists
            expect(html).toContain('<div id="root"></div>');
        });

        it('should set correct document title', async () => {
            // Set up panel so getWebviewContent can access it
            internals(command).panel = mockPanel;
            const html = await internals(command).getWebviewContent();

            expect(html).toContain('<title>Configure Project</title>');
        });

        it('should include proper CSP directives', async () => {
            // Set up panel so getWebviewContent can access it
            internals(command).panel = mockPanel;
            const html = await internals(command).getWebviewContent();

            // Verify key CSP directives
            expect(html).toMatch(/default-src 'none'/);
            expect(html).toMatch(/style-src [^\s]+ 'unsafe-inline'/);
            // img-src includes cspSource for local resources plus default sources
            expect(html).toMatch(/img-src [^\s]+ https: data:/);
            expect(html).toMatch(/font-src [^\s]+/);
        });
    });

    describe('WebviewCommand Methods', () => {
        it('should return correct webview ID', () => {
            const webviewId = internals(command).getWebviewId();
            expect(webviewId).toBe('demoBuilder.configureProject');
        });

        it('should return correct webview title', () => {
            const title = internals(command).getWebviewTitle();
            expect(title).toBe('Configure Project');
        });

        it('should return correct loading message', () => {
            const loadingMessage = internals(command).getLoadingMessage();
            expect(loadingMessage).toBe('Loading project configuration...');
        });
    });

    describe('Nonce Generation', () => {
        it('should generate unique nonce for each webview creation', async () => {
            // Set up panel for first command
            internals(command).panel = mockPanel;
            const html1 = await internals(command).getWebviewContent();

            // Create second command with its own panel
            const command2 = new ConfigureProjectWebviewCommand(
                mockContext,
                mockStateManager as unknown as StateManager,
                mockLogger
            );
            internals(command2).panel = mockPanel;
            const html2 = await internals(command2).getWebviewContent();

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
            internals(command).panel = mockPanel;
            const html = await internals(command).getWebviewContent();

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
