/**
 * Bundle URI Utility Tests
 *
 * TDD: Tests written FIRST to define behavior before implementation.
 *
 * This utility consolidates the duplicated bundle URI construction pattern
 * found in 4 webview command files:
 * - showDashboard.ts
 * - showProjectsList.ts
 * - configure.ts
 * - createProject.ts
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { createBundleUris, type BundleUriOptions, type BundleUris } from '@/core/utils/bundleUri';

// Mock VS Code API
jest.mock('vscode', () => ({
    Uri: {
        file: jest.fn((p: string) => ({
            fsPath: p,
            toString: () => `file://${p}`,
        })),
    },
}));

describe('createBundleUris', () => {
    // Mock webview that simulates VS Code panel.webview
    const mockWebview = {
        asWebviewUri: jest.fn((uri: vscode.Uri) => ({
            toString: () => `vscode-webview://${uri.fsPath}`,
            fsPath: uri.fsPath,
        })),
    };

    const extensionPath = '/test/extension';
    const webviewPath = path.join(extensionPath, 'dist', 'webview');

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('basic functionality', () => {
        it('should create bundle URIs for a feature bundle name', () => {
            const options: BundleUriOptions = {
                webview: mockWebview as unknown as vscode.Webview,
                extensionPath,
                featureBundleName: 'dashboard',
            };

            const result = createBundleUris(options);

            expect(result).toBeDefined();
            expect(result.runtime).toBeDefined();
            expect(result.vendors).toBeDefined();
            expect(result.common).toBeDefined();
            expect(result.feature).toBeDefined();
        });

        it('should call asWebviewUri for each bundle', () => {
            const options: BundleUriOptions = {
                webview: mockWebview as unknown as vscode.Webview,
                extensionPath,
                featureBundleName: 'wizard',
            };

            createBundleUris(options);

            // Should call asWebviewUri 4 times (runtime, vendors, common, feature)
            expect(mockWebview.asWebviewUri).toHaveBeenCalledTimes(4);
        });

        it('should construct correct paths for standard bundles', () => {
            const options: BundleUriOptions = {
                webview: mockWebview as unknown as vscode.Webview,
                extensionPath,
                featureBundleName: 'dashboard',
            };

            createBundleUris(options);

            // Verify runtime bundle path
            expect(mockWebview.asWebviewUri).toHaveBeenCalledWith(
                expect.objectContaining({
                    fsPath: path.join(webviewPath, 'runtime-bundle.js'),
                })
            );

            // Verify vendors bundle path
            expect(mockWebview.asWebviewUri).toHaveBeenCalledWith(
                expect.objectContaining({
                    fsPath: path.join(webviewPath, 'vendors-bundle.js'),
                })
            );

            // Verify common bundle path
            expect(mockWebview.asWebviewUri).toHaveBeenCalledWith(
                expect.objectContaining({
                    fsPath: path.join(webviewPath, 'common-bundle.js'),
                })
            );

            // Verify feature bundle path
            expect(mockWebview.asWebviewUri).toHaveBeenCalledWith(
                expect.objectContaining({
                    fsPath: path.join(webviewPath, 'dashboard-bundle.js'),
                })
            );
        });
    });

    describe('feature bundle naming', () => {
        it.each([
            ['dashboard', 'dashboard-bundle.js'],
            ['wizard', 'wizard-bundle.js'],
            ['configure', 'configure-bundle.js'],
            ['welcome', 'welcome-bundle.js'],
            ['projectsList', 'projectsList-bundle.js'],
        ])('should create correct feature bundle path for %s', (featureName, expectedFileName) => {
            const options: BundleUriOptions = {
                webview: mockWebview as unknown as vscode.Webview,
                extensionPath,
                featureBundleName: featureName,
            };

            createBundleUris(options);

            expect(mockWebview.asWebviewUri).toHaveBeenCalledWith(
                expect.objectContaining({
                    fsPath: path.join(webviewPath, expectedFileName),
                })
            );
        });
    });

    describe('return type conformance', () => {
        it('should return BundleUris compatible with getWebviewHTMLWithBundles', () => {
            const options: BundleUriOptions = {
                webview: mockWebview as unknown as vscode.Webview,
                extensionPath,
                featureBundleName: 'dashboard',
            };

            const result: BundleUris = createBundleUris(options);

            // Verify type compatibility by checking required properties
            expect(typeof result.runtime).toBe('object');
            expect(typeof result.vendors).toBe('object');
            expect(typeof result.common).toBe('object');
            expect(typeof result.feature).toBe('object');
        });
    });

    describe('edge cases', () => {
        it('should handle extensionPath with trailing separator', () => {
            const options: BundleUriOptions = {
                webview: mockWebview as unknown as vscode.Webview,
                extensionPath: '/test/extension/',
                featureBundleName: 'dashboard',
            };

            // Should not throw
            expect(() => createBundleUris(options)).not.toThrow();
        });

        it('should handle feature bundle name with special characters', () => {
            const options: BundleUriOptions = {
                webview: mockWebview as unknown as vscode.Webview,
                extensionPath,
                featureBundleName: 'my-feature',
            };

            createBundleUris(options);

            expect(mockWebview.asWebviewUri).toHaveBeenCalledWith(
                expect.objectContaining({
                    fsPath: path.join(webviewPath, 'my-feature-bundle.js'),
                })
            );
        });
    });
});
