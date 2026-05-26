/**
 * Unit Tests for getWebviewHTML
 *
 * Tests the webview HTML generator that produces a VS Code webview document
 * loading a single esbuild IIFE bundle (CSS is injected at runtime by the
 * bundle, so no separate <link> tag is needed).
 */

import * as vscode from 'vscode';
import {
    getWebviewHTML,
} from '@/core/utils/getWebviewHTMLWithBundles';

/**
 * Test helper: Create a mock script URI for testing
 */
function createMockScriptUri(): vscode.Uri {
    return vscode.Uri.parse('vscode-resource://wizard-bundle.js');
}

describe('getWebviewHTML', () => {
    describe('HTML Structure and Bundle Loading', () => {
        it('should generate HTML with the feature bundle', () => {
            // Arrange
            const scriptUri = createMockScriptUri();
            const options = {
                scriptUri,
                nonce: 'test-nonce-123',
                cspSource: 'vscode-resource:',
                title: 'Test Webview'
            };

            // Act
            const html = getWebviewHTML(options);

            // Assert: feature bundle present
            expect(html).toContain('wizard-bundle.js');
        });

        it('should generate well-formed HTML5 document', () => {
            // Arrange
            const options = {
                scriptUri: createMockScriptUri(),
                nonce: 'test-nonce',
                cspSource: 'vscode-resource:',
                title: 'My Test Webview'
            };

            // Act
            const html = getWebviewHTML(options);

            // Assert: HTML structure
            expect(html).toMatch(/^<!DOCTYPE html>/);
            expect(html).toContain('<html lang="en">');
            expect(html).toContain('<meta charset="UTF-8">');
            expect(html).toContain('<meta name="viewport"');
            expect(html).toContain('<title>My Test Webview</title>');
            expect(html).toContain('<body style="margin: 0;">');
            expect(html).toContain('<div id="root"></div>');
            expect(html).toContain('</body>');
            expect(html).toContain('</html>');
        });
    });

    describe('CSP Compliance', () => {
        it('should apply nonce to the script tag for CSP compliance', () => {
            // Arrange
            const nonce = 'unique-nonce-456';
            const options = {
                scriptUri: createMockScriptUri(),
                nonce,
                cspSource: 'vscode-resource:',
                title: 'Test'
            };

            // Act
            const html = getWebviewHTML(options);

            // Assert: script tag has nonce attribute
            const scriptMatches = html.match(/<script nonce="([^"]+)"/g);
            expect(scriptMatches).toHaveLength(1); // single esbuild bundle = one script tag

            // Verify nonce
            scriptMatches?.forEach((match: string) => {
                expect(match).toContain(`nonce="${nonce}"`);
            });
        });

        it('should include proper CSP headers with nonce and cspSource', () => {
            // Arrange
            const nonce = 'test-nonce';
            const cspSource = 'vscode-webview://custom-source';
            const options = {
                scriptUri: createMockScriptUri(),
                nonce,
                cspSource,
                title: 'Test'
            };

            // Act
            const html = getWebviewHTML(options);

            // Assert: CSP meta tag present
            expect(html).toContain('<meta http-equiv="Content-Security-Policy"');

            // Verify CSP directives
            expect(html).toContain(`default-src 'none'`);
            expect(html).toContain(`script-src 'nonce-${nonce}' ${cspSource}`);
            expect(html).toContain(`style-src ${cspSource} 'unsafe-inline'`);
            // img-src includes cspSource for local resources plus default sources
            expect(html).toContain(`img-src ${cspSource} https: data:`);
            expect(html).toContain(`font-src ${cspSource}`);
        });
    });

    describe('Optional Parameters', () => {
        it('should generate HTML with only required parameters', () => {
            // Arrange: Minimal options without optional parameters
            const minimalOptions = {
                scriptUri: createMockScriptUri(),
                nonce: 'test',
                cspSource: 'vscode-resource:',
                title: 'Test',
            };

            // Act
            const html = getWebviewHTML(minimalOptions);

            // Assert: Should generate valid HTML with minimal required parameters
            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('<title>Test</title>');
            expect(html).toContain('nonce="test"');
        });

        it('should support additional image sources in CSP', () => {
            // Arrange
            const options = {
                scriptUri: createMockScriptUri(),
                nonce: 'test',
                cspSource: 'vscode-resource:',
                title: 'Test',
                additionalImgSources: ['https://example.com', 'https://cdn.adobe.com']
            };

            // Act
            const html = getWebviewHTML(options);

            // Assert: CSP includes cspSource + default + additional image sources
            expect(html).toContain('img-src vscode-resource: https: data: https://example.com https://cdn.adobe.com');
        });
    });

    describe('Error Handling', () => {
        it('should throw error if nonce is missing', () => {
            // Arrange
            const options = {
                scriptUri: createMockScriptUri(),
                nonce: '', // Invalid: empty nonce
                cspSource: 'vscode-resource:',
                title: 'Test'
            };

            // Act & Assert
            expect(() => getWebviewHTML(options))
                .toThrow('Nonce is required for CSP compliance');
        });
    });
});
