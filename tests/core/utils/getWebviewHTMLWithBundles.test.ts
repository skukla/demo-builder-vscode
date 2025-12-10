/**
 * Unit Tests for getWebviewHTMLWithBundles
 * Step 1: Create 4-Bundle HTML Helper
 *
 * Tests reusable helper function for generating webview HTML with webpack's
 * 4-bundle pattern (runtime, vendors, common, feature) to eliminate single-bundle
 * timeout issues across all webviews.
 */

import * as vscode from 'vscode';
import {
    getWebviewHTMLWithBundles,
    type BundleUris,
    type WebviewHTMLWithBundlesOptions
} from '@/core/utils/getWebviewHTMLWithBundles';

/**
 * Test helper: Create mock bundle URIs for testing
 */
function createMockBundleURIs(): BundleUris {
    return {
        runtime: vscode.Uri.parse('vscode-resource://runtime-bundle.js'),
        vendors: vscode.Uri.parse('vscode-resource://vendors-bundle.js'),
        common: vscode.Uri.parse('vscode-resource://common-bundle.js'),
        feature: vscode.Uri.parse('vscode-resource://wizard-bundle.js')
    };
}

describe('getWebviewHTMLWithBundles', () => {
    describe('HTML Structure and Bundle Loading', () => {
        it('should generate HTML with all 4 bundles in correct order', () => {
            // Arrange: Create mock URIs for all 4 bundles
            const mockURIs = {
                runtime: vscode.Uri.parse('vscode-resource://runtime-bundle.js'),
                vendors: vscode.Uri.parse('vscode-resource://vendors-bundle.js'),
                common: vscode.Uri.parse('vscode-resource://common-bundle.js'),
                feature: vscode.Uri.parse('vscode-resource://wizard-bundle.js')
            };
            const options = {
                bundleUris: mockURIs,
                nonce: 'test-nonce-123',
                cspSource: 'vscode-resource:',
                title: 'Test Webview'
            };

            // Act: Generate HTML
            const html = getWebviewHTMLWithBundles(options);

            // Assert: Verify all 4 bundles present in correct order
            expect(html).toContain('runtime-bundle.js');
            expect(html).toContain('vendors-bundle.js');
            expect(html).toContain('common-bundle.js');
            expect(html).toContain('wizard-bundle.js');

            // Verify order: runtime before vendors before common before feature
            const runtimeIndex = html.indexOf('runtime-bundle.js');
            const vendorsIndex = html.indexOf('vendors-bundle.js');
            const commonIndex = html.indexOf('common-bundle.js');
            const featureIndex = html.indexOf('wizard-bundle.js');

            expect(runtimeIndex).toBeLessThan(vendorsIndex);
            expect(vendorsIndex).toBeLessThan(commonIndex);
            expect(commonIndex).toBeLessThan(featureIndex);
        });

        it('should generate well-formed HTML5 document', () => {
            // Arrange
            const options = {
                bundleUris: createMockBundleURIs(),
                nonce: 'test-nonce',
                cspSource: 'vscode-resource:',
                title: 'My Test Webview'
            };

            // Act
            const html = getWebviewHTMLWithBundles(options);

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
        it('should apply same nonce to all script tags for CSP compliance', () => {
            // Arrange
            const nonce = 'unique-nonce-456';
            const options = {
                bundleUris: createMockBundleURIs(),
                nonce,
                cspSource: 'vscode-resource:',
                title: 'Test'
            };

            // Act
            const html = getWebviewHTMLWithBundles(options);

            // Assert: All script tags have nonce attribute
            const scriptMatches = html.match(/<script nonce="([^"]+)"/g);
            expect(scriptMatches).toHaveLength(4); // 4 bundles = 4 script tags

            // Verify all use same nonce
            scriptMatches?.forEach((match: string) => {
                expect(match).toContain(`nonce="${nonce}"`);
            });
        });

        it('should include proper CSP headers with nonce and cspSource', () => {
            // Arrange
            const nonce = 'test-nonce';
            const cspSource = 'vscode-webview://custom-source';
            const options = {
                bundleUris: createMockBundleURIs(),
                nonce,
                cspSource,
                title: 'Test'
            };

            // Act
            const html = getWebviewHTMLWithBundles(options);

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
                bundleUris: createMockBundleURIs(),
                nonce: 'test',
                cspSource: 'vscode-resource:',
                title: 'Test',
            };

            // Act
            const html = getWebviewHTMLWithBundles(minimalOptions);

            // Assert: Should generate valid HTML with minimal required parameters
            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('<title>Test</title>');
            expect(html).toContain('nonce="test"');
        });

        it('should support additional image sources in CSP', () => {
            // Arrange
            const options = {
                bundleUris: createMockBundleURIs(),
                nonce: 'test',
                cspSource: 'vscode-resource:',
                title: 'Test',
                additionalImgSources: ['https://example.com', 'https://cdn.adobe.com']
            };

            // Act
            const html = getWebviewHTMLWithBundles(options);

            // Assert: CSP includes cspSource + default + additional image sources
            expect(html).toContain('img-src vscode-resource: https: data: https://example.com https://cdn.adobe.com');
        });
    });

    describe('Error Handling', () => {
        it('should throw error if nonce is missing', () => {
            // Arrange
            const options = {
                bundleUris: createMockBundleURIs(),
                nonce: '', // Invalid: empty nonce
                cspSource: 'vscode-resource:',
                title: 'Test'
            };

            // Act & Assert
            expect(() => getWebviewHTMLWithBundles(options))
                .toThrow('Nonce is required for CSP compliance');
        });
    });
});
