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

/**
 * Test helper: read ONE CSP directive's exact value.
 *
 * `toContain('img-src a b c')` still passes when the directive has grown a fourth
 * source, which is exactly the mistake a wrong default for `additionalImgSources`
 * would make. Comparing the whole directive is what notices.
 */
function cspDirective(html: string, name: string): string {
    const match = html.match(new RegExp(`\\s${name} ([^;]*);`));
    if (!match) throw new Error(`CSP directive "${name}" not found`);
    return match[1].trim();
}

/**
 * Test helper: everything the generator puts between </title> and </head>.
 */
function headTail(html: string): string {
    return html.slice(html.indexOf('</title>') + '</title>'.length, html.indexOf('</head>'));
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
            // img-src includes cspSource for local resources plus default sources —
            // and NOTHING else when no additional sources were asked for.
            expect(cspDirective(html, 'img-src')).toBe(`${cspSource} https: data:`);
            expect(cspDirective(html, 'font-src')).toBe(cspSource);
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
            expect(cspDirective(html, 'img-src'))
                .toBe('vscode-resource: https: data: https://example.com https://cdn.adobe.com');
        });
    });

    describe('Base URI script', () => {
        it('should expose the base URI to the bundle when one is given', () => {
            // Arrange
            const baseUri = vscode.Uri.parse('vscode-resource://media');
            const options = {
                scriptUri: createMockScriptUri(),
                nonce: 'base-uri-nonce',
                cspSource: 'vscode-resource:',
                title: 'Test',
                baseUri,
            };

            // Act
            const html = getWebviewHTML(options);

            // Assert: an extra nonce'd inline script sets the global the bundle reads
            expect(headTail(html)).toContain(
                `<script nonce="base-uri-nonce">window.__WEBVIEW_BASE_URI__ = "${baseUri.toString()}";</script>`,
            );
            expect(html.match(/<script nonce="[^"]+"/g)).toHaveLength(2);
        });

        it('should add nothing to the head when no base URI is given', () => {
            // Arrange
            const options = {
                scriptUri: createMockScriptUri(),
                nonce: 'no-base-uri',
                cspSource: 'vscode-resource:',
                title: 'Test',
            };

            // Act
            const html = getWebviewHTML(options);

            // Assert: the slot is EMPTY, not filled with some other string
            expect(headTail(html).trim()).toBe('');
        });
    });

    describe('Error Handling', () => {
        it('should throw error if nonce is whitespace only', () => {
            // Arrange: a nonce that is truthy but carries no value
            const options = {
                scriptUri: createMockScriptUri(),
                nonce: '   ',
                cspSource: 'vscode-resource:',
                title: 'Test',
            };

            // Act & Assert: `!nonce` is false here, so only the trim() check catches it
            expect(() => getWebviewHTML(options))
                .toThrow('Nonce is required for CSP compliance');
        });

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
