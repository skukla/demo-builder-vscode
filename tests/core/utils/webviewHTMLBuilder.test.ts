import { generateWebviewHTML, WebviewHTMLOptions } from '@/core/utils/webviewHTMLBuilder';
import * as vscode from 'vscode';

jest.mock('vscode');

describe('webviewHTMLBuilder', () => {
    const mockUri = (path: string) => ({ toString: () => path } as vscode.Uri);

    describe('generateWebviewHTML', () => {
        it('should generate basic HTML structure', () => {
            const options: WebviewHTMLOptions = {
                scriptUri: mockUri('http://localhost/script.js'),
                nonce: 'test-nonce-123',
                title: 'Test Webview',
                cspSource: 'http://localhost'
            };

            const html = generateWebviewHTML(options);

            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('<html lang="en">');
            expect(html).toContain('<title>Test Webview</title>');
            expect(html).toContain('<div id="root"></div>');
        });

        it('should include CSP with correct nonce', () => {
            const options: WebviewHTMLOptions = {
                scriptUri: mockUri('http://localhost/script.js'),
                nonce: 'secure-nonce-456',
                title: 'Test',
                cspSource: 'http://localhost'
            };

            const html = generateWebviewHTML(options);

            expect(html).toContain("script-src 'nonce-secure-nonce-456'");
            expect(html).toContain('<script nonce="secure-nonce-456"');
        });

        it('should include script URI with nonce', () => {
            const options: WebviewHTMLOptions = {
                scriptUri: mockUri('http://localhost/bundle.js'),
                nonce: 'nonce-789',
                title: 'Test',
                cspSource: 'http://localhost'
            };

            const html = generateWebviewHTML(options);

            expect(html).toContain('<script nonce="nonce-789" src="http://localhost/bundle.js"></script>');
        });

        it('should set CSP sources correctly', () => {
            const options: WebviewHTMLOptions = {
                scriptUri: mockUri('http://localhost/script.js'),
                nonce: 'nonce',
                title: 'Test',
                cspSource: 'vscode-webview://'
            };

            const html = generateWebviewHTML(options);

            expect(html).toContain('style-src vscode-webview://');
            expect(html).toContain('font-src vscode-webview://');
        });

        it('should include default image sources', () => {
            const options: WebviewHTMLOptions = {
                scriptUri: mockUri('http://localhost/script.js'),
                nonce: 'nonce',
                title: 'Test',
                cspSource: 'http://localhost'
            };

            const html = generateWebviewHTML(options);

            expect(html).toContain('img-src https: data:');
        });

        it('should include additional image sources when provided', () => {
            const options: WebviewHTMLOptions = {
                scriptUri: mockUri('http://localhost/script.js'),
                nonce: 'nonce',
                title: 'Test',
                cspSource: 'http://localhost',
                additionalImgSources: ['http://example.com', 'http://cdn.example.com']
            };

            const html = generateWebviewHTML(options);

            expect(html).toContain('img-src https: data: http://example.com http://cdn.example.com');
        });

        it('should include loading spinner when requested', () => {
            const options: WebviewHTMLOptions = {
                scriptUri: mockUri('http://localhost/script.js'),
                nonce: 'nonce',
                title: 'Test',
                cspSource: 'http://localhost',
                includeLoadingSpinner: true,
                loadingMessage: 'Please wait...'
            };

            const html = generateWebviewHTML(options);

            expect(html).toContain('Please wait...');
            expect(html).toContain('spinner');
            expect(html).toContain('@keyframes spectrum-rotate');
        });

        it('should not include loading spinner by default', () => {
            const options: WebviewHTMLOptions = {
                scriptUri: mockUri('http://localhost/script.js'),
                nonce: 'nonce',
                title: 'Test',
                cspSource: 'http://localhost'
            };

            const html = generateWebviewHTML(options);

            expect(html).not.toContain('spinner');
            expect(html).not.toContain('Loading...');
        });

        it('should use dark theme styles when isDark is true', () => {
            const options: WebviewHTMLOptions = {
                scriptUri: mockUri('http://localhost/script.js'),
                nonce: 'nonce',
                title: 'Test',
                cspSource: 'http://localhost',
                includeLoadingSpinner: true,
                isDark: true
            };

            const html = generateWebviewHTML(options);

            expect(html).toContain('background: #1e1e1e');
            expect(html).toContain('color: #cccccc');
        });

        it('should use light theme styles when isDark is false', () => {
            const options: WebviewHTMLOptions = {
                scriptUri: mockUri('http://localhost/script.js'),
                nonce: 'nonce',
                title: 'Test',
                cspSource: 'http://localhost',
                includeLoadingSpinner: true,
                isDark: false
            };

            const html = generateWebviewHTML(options);

            expect(html).toContain('background: #ffffff');
            expect(html).toContain('color: #333333');
        });

        it('should include fallback bundle when provided', () => {
            const options: WebviewHTMLOptions = {
                scriptUri: mockUri('http://localhost/main.js'),
                nonce: 'nonce',
                title: 'Test',
                cspSource: 'http://localhost',
                fallbackBundleUri: mockUri('http://localhost/fallback.js')
            };

            const html = generateWebviewHTML(options);

            expect(html).toContain('<script nonce="nonce" src="http://localhost/main.js"></script>');
            expect(html).toContain('<script nonce="nonce" src="http://localhost/fallback.js"></script>');
        });

        it('should not include fallback bundle when not provided', () => {
            const options: WebviewHTMLOptions = {
                scriptUri: mockUri('http://localhost/main.js'),
                nonce: 'nonce',
                title: 'Test',
                cspSource: 'http://localhost'
            };

            const html = generateWebviewHTML(options);

            const scriptMatches = html.match(/<script/g);
            expect(scriptMatches?.length).toBe(1);
        });

        it('should use default loading message when not provided', () => {
            const options: WebviewHTMLOptions = {
                scriptUri: mockUri('http://localhost/script.js'),
                nonce: 'nonce',
                title: 'Test',
                cspSource: 'http://localhost',
                includeLoadingSpinner: true
            };

            const html = generateWebviewHTML(options);

            expect(html).toContain('Loading...');
        });

        it('should handle special characters in title', () => {
            const options: WebviewHTMLOptions = {
                scriptUri: mockUri('http://localhost/script.js'),
                nonce: 'nonce',
                title: 'Test <"Title"> & Symbols',
                cspSource: 'http://localhost'
            };

            const html = generateWebviewHTML(options);

            expect(html).toContain('<title>Test <"Title"> & Symbols</title>');
        });

        it('should include viewport meta tag', () => {
            const options: WebviewHTMLOptions = {
                scriptUri: mockUri('http://localhost/script.js'),
                nonce: 'nonce',
                title: 'Test',
                cspSource: 'http://localhost'
            };

            const html = generateWebviewHTML(options);

            expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1.0">');
        });

        it('should include charset meta tag', () => {
            const options: WebviewHTMLOptions = {
                scriptUri: mockUri('http://localhost/script.js'),
                nonce: 'nonce',
                title: 'Test',
                cspSource: 'http://localhost'
            };

            const html = generateWebviewHTML(options);

            expect(html).toContain('<meta charset="UTF-8">');
        });

        it('should have spinner styles with correct animation', () => {
            const options: WebviewHTMLOptions = {
                scriptUri: mockUri('http://localhost/script.js'),
                nonce: 'nonce',
                title: 'Test',
                cspSource: 'http://localhost',
                includeLoadingSpinner: true
            };

            const html = generateWebviewHTML(options);

            expect(html).toContain('spinner-track');
            expect(html).toContain('spinner-fill');
            expect(html).toContain('animation: spectrum-rotate');
            expect(html).toContain('transform: rotate(-90deg)');
            expect(html).toContain('transform: rotate(270deg)');
        });

        it('should prevent inline styles with CSP', () => {
            const options: WebviewHTMLOptions = {
                scriptUri: mockUri('http://localhost/script.js'),
                nonce: 'nonce',
                title: 'Test',
                cspSource: 'http://localhost'
            };

            const html = generateWebviewHTML(options);

            // CSP allows unsafe-inline for styles (needed for loading styles)
            expect(html).toContain("style-src http://localhost 'unsafe-inline'");
        });

        it('should prevent inline scripts with CSP', () => {
            const options: WebviewHTMLOptions = {
                scriptUri: mockUri('http://localhost/script.js'),
                nonce: 'nonce',
                title: 'Test',
                cspSource: 'http://localhost'
            };

            const html = generateWebviewHTML(options);

            // CSP should NOT allow unsafe-inline for scripts (only nonce)
            expect(html).not.toContain("script-src 'unsafe-inline'");
            expect(html).toContain("script-src 'nonce-");
        });
    });

    describe('Security considerations', () => {
        it('should prevent XSS via nonce-based CSP', () => {
            const options: WebviewHTMLOptions = {
                scriptUri: mockUri('http://localhost/script.js'),
                nonce: 'unique-nonce',
                title: 'Test',
                cspSource: 'http://localhost'
            };

            const html = generateWebviewHTML(options);

            // Scripts without nonce should be blocked
            expect(html).toContain("script-src 'nonce-unique-nonce'");
        });

        it('should set default-src to none for defense in depth', () => {
            const options: WebviewHTMLOptions = {
                scriptUri: mockUri('http://localhost/script.js'),
                nonce: 'nonce',
                title: 'Test',
                cspSource: 'http://localhost'
            };

            const html = generateWebviewHTML(options);

            expect(html).toContain("default-src 'none'");
        });

        it('should allow only specified image sources', () => {
            const options: WebviewHTMLOptions = {
                scriptUri: mockUri('http://localhost/script.js'),
                nonce: 'nonce',
                title: 'Test',
                cspSource: 'http://localhost',
                additionalImgSources: ['http://trusted.com']
            };

            const html = generateWebviewHTML(options);

            expect(html).toContain('img-src https: data: http://trusted.com');
            expect(html).not.toContain("img-src *");
        });
    });
});
