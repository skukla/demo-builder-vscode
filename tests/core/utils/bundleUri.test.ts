/**
 * Bundle URI Utility Tests
 *
 * Verifies that getBundleUri constructs the webview URI for a feature's
 * esbuild IIFE bundle (dist/webview/<feature>-bundle.js).
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { getBundleUri, type BundleUriOptions } from '@/core/utils/bundleUri';

// Mock VS Code API
jest.mock('vscode', () => ({
    Uri: {
        file: jest.fn((p: string) => ({
            fsPath: p,
            toString: () => `file://${p}`,
        })),
    },
}));

describe('getBundleUri', () => {
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
        it('should return a webview URI for a feature bundle name', () => {
            const options: BundleUriOptions = {
                webview: mockWebview as unknown as vscode.Webview,
                extensionPath,
                featureBundleName: 'dashboard',
            };

            const result = getBundleUri(options);

            expect(result).toBeDefined();
            expect(result.fsPath).toBe(path.join(webviewPath, 'dashboard-bundle.js'));
        });

        it('should call asWebviewUri once for the feature bundle', () => {
            const options: BundleUriOptions = {
                webview: mockWebview as unknown as vscode.Webview,
                extensionPath,
                featureBundleName: 'wizard',
            };

            getBundleUri(options);

            // esbuild produces a single self-contained bundle — one asWebviewUri call
            expect(mockWebview.asWebviewUri).toHaveBeenCalledTimes(1);
        });

        it('should construct correct path for the feature bundle', () => {
            const options: BundleUriOptions = {
                webview: mockWebview as unknown as vscode.Webview,
                extensionPath,
                featureBundleName: 'dashboard',
            };

            getBundleUri(options);

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

            getBundleUri(options);

            expect(mockWebview.asWebviewUri).toHaveBeenCalledWith(
                expect.objectContaining({
                    fsPath: path.join(webviewPath, expectedFileName),
                })
            );
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
            expect(() => getBundleUri(options)).not.toThrow();
        });

        it('should handle feature bundle name with special characters', () => {
            const options: BundleUriOptions = {
                webview: mockWebview as unknown as vscode.Webview,
                extensionPath,
                featureBundleName: 'my-feature',
            };

            getBundleUri(options);

            expect(mockWebview.asWebviewUri).toHaveBeenCalledWith(
                expect.objectContaining({
                    fsPath: path.join(webviewPath, 'my-feature-bundle.js'),
                })
            );
        });
    });
});
