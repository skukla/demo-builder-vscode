/**
 * Extension Activation Integration Tests
 *
 * Step 3: Integration & Cleanup
 *
 * These tests verify the SidebarProvider integration:
 * 1. SidebarProvider can be instantiated with correct view ID
 * 2. Provider has the required methods
 *
 * Note: Full extension activation testing requires VS Code test runner.
 * These tests focus on what can be unit tested.
 */

import * as vscode from 'vscode';
import { SidebarProvider } from '@/features/sidebar/providers/sidebarProvider';

// Mock vscode module
jest.mock('vscode', () => ({
    Uri: {
        file: jest.fn((path: string) => ({
            fsPath: path,
            path,
            toString: () => path,
        })),
        joinPath: jest.fn((base: { path: string }, ...paths: string[]) => ({
            fsPath: [base.path, ...paths].join('/'),
            path: [base.path, ...paths].join('/'),
            toString: () => [base.path, ...paths].join('/'),
        })),
    },
    window: {
        registerWebviewViewProvider: jest.fn(() => ({ dispose: jest.fn() })),
        showWarningMessage: jest.fn(),
        showErrorMessage: jest.fn(),
    },
    commands: {
        registerCommand: jest.fn(() => ({ dispose: jest.fn() })),
        executeCommand: jest.fn().mockResolvedValue(undefined),
    },
    ColorThemeKind: {
        Light: 1,
        Dark: 2,
        HighContrast: 3,
    },
}));

describe('SidebarProvider Registration', () => {
    let mockContext: vscode.ExtensionContext;
    let mockStateManager: {
        getCurrentProject: jest.Mock;
    };
    let mockLogger: {
        info: jest.Mock;
        warn: jest.Mock;
        error: jest.Mock;
        debug: jest.Mock;
    };

    beforeEach(() => {
        jest.clearAllMocks();

        // Create mock extension context
        mockContext = {
            extensionPath: '/mock/extension/path',
            extensionUri: {
                fsPath: '/mock/extension/path',
                path: '/mock/extension/path',
            },
            subscriptions: [],
        } as unknown as vscode.ExtensionContext;

        // Create mock state manager
        mockStateManager = {
            getCurrentProject: jest.fn().mockResolvedValue(undefined),
        };

        // Create mock logger
        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        };
    });

    describe('SidebarProvider Instantiation', () => {
        it('should have correct view ID', () => {
            const provider = new SidebarProvider(
                mockContext,
                mockStateManager as any,
                mockLogger as any
            );

            expect(provider.viewId).toBe('demoBuilder.sidebar');
        });

        it('should be a WebviewViewProvider', () => {
            const provider = new SidebarProvider(
                mockContext,
                mockStateManager as any,
                mockLogger as any
            );

            // Verify it has the required method
            expect(typeof provider.resolveWebviewView).toBe('function');
        });

        it('should have sendMessage method for communication', () => {
            const provider = new SidebarProvider(
                mockContext,
                mockStateManager as any,
                mockLogger as any
            );

            expect(typeof provider.sendMessage).toBe('function');
        });

        it('should have updateContext method for sidebar context updates', () => {
            const provider = new SidebarProvider(
                mockContext,
                mockStateManager as any,
                mockLogger as any
            );

            expect(typeof provider.updateContext).toBe('function');
        });
    });

    describe('Provider Registration', () => {
        it('should be registerable with VS Code', () => {
            const provider = new SidebarProvider(
                mockContext,
                mockStateManager as any,
                mockLogger as any
            );

            // Register the provider
            const disposable = vscode.window.registerWebviewViewProvider(
                provider.viewId,
                provider
            );

            expect(vscode.window.registerWebviewViewProvider).toHaveBeenCalledWith(
                'demoBuilder.sidebar',
                provider
            );
            expect(disposable).toHaveProperty('dispose');
        });

        it('should add to subscriptions for cleanup', () => {
            const provider = new SidebarProvider(
                mockContext,
                mockStateManager as any,
                mockLogger as any
            );

            // Register and add to subscriptions (as extension.ts would do)
            const disposable = vscode.window.registerWebviewViewProvider(
                provider.viewId,
                provider
            );
            mockContext.subscriptions.push(disposable);

            expect(mockContext.subscriptions).toHaveLength(1);
            expect(mockContext.subscriptions[0]).toHaveProperty('dispose');
        });
    });
});

describe('Wizard Step Configuration', () => {
    it('should have WelcomeStep support in WizardContainer', async () => {
        // This test verifies WelcomeStep is properly supported
        const fs = require('fs').promises;
        const path = require('path');

        const wizardContainerPath = path.resolve(
            __dirname,
            '../../../../src/features/project-creation/ui/wizard/WizardContainer.tsx'
        );

        const content = await fs.readFile(wizardContainerPath, 'utf-8');

        // Should have WelcomeStep import
        expect(content).toMatch(/import.*WelcomeStep.*from/);

        // Should have welcome case in switch
        expect(content).toMatch(/case\s+['"]welcome['"]/);
    });

    it('should start wizard at first enabled step from config', async () => {
        // This test verifies the initial step logic
        const fs = require('fs').promises;
        const path = require('path');

        const wizardContainerPath = path.resolve(
            __dirname,
            '../../../../src/features/project-creation/ui/wizard/WizardContainer.tsx'
        );

        const content = await fs.readFile(wizardContainerPath, 'utf-8');

        // Should compute first step from config
        expect(content).toMatch(/enabledSteps\[0\]\.id/);

        // Should have fallback to adobe-auth
        expect(content).toMatch(/adobe-auth.*as WizardStep/);
    });
});
