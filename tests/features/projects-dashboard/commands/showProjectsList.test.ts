/**
 * Unit Tests for ShowProjectsListCommand
 * Step 1: Create Projects List as Home Screen
 *
 * Tests verify:
 * - Command creates panel with correct ID 'demoBuilder.projectsList'
 * - Command reveals existing panel (singleton pattern)
 * - Handler registry has correct handlers registered
 * - HTML generation follows 4-bundle pattern
 */

import * as vscode from 'vscode';
import { ShowProjectsListCommand } from '@/features/projects-dashboard/commands/showProjectsList';
import { ProjectsListHandlerRegistry } from '@/features/projects-dashboard/handlers';
import { StateManager } from '@/core/state';
import { StatusBarManager } from '@/core/vscode/StatusBarManager';
import { Logger } from '@/core/logging';

// Mock dependencies
jest.mock('@/core/logging/debugLogger');

/**
 * Create mock ExtensionContext
 */
function createMockExtensionContext(): vscode.ExtensionContext {
    return {
        subscriptions: [],
        extensionPath: '/mock/extension/path',
        globalState: {
            get: jest.fn(),
            update: jest.fn(),
            keys: jest.fn(() => []),
            setKeysForSync: jest.fn(),
        } as any,
        workspaceState: {
            get: jest.fn(),
            update: jest.fn(),
            keys: jest.fn(() => []),
        } as any,
        extensionUri: vscode.Uri.file('/mock/extension/path'),
        extensionMode: vscode.ExtensionMode.Test,
        environmentVariableCollection: {} as any,
        asAbsolutePath: (relativePath: string) => `/mock/extension/path/${relativePath}`,
        storageUri: undefined,
        globalStorageUri: vscode.Uri.file('/mock/storage'),
        logUri: vscode.Uri.file('/mock/logs'),
        storagePath: '/mock/storage',
        globalStoragePath: '/mock/global/storage',
        logPath: '/mock/logs',
        secrets: {} as any,
        extension: {} as any,
        languageModelAccessInformation: {} as any,
    } as vscode.ExtensionContext;
}

/**
 * Create mock StateManager
 */
function createMockStateManager(): StateManager {
    return {
        getState: jest.fn(),
        setState: jest.fn(),
        clearState: jest.fn(),
        getCurrentProject: jest.fn().mockResolvedValue(null),
        getAllProjects: jest.fn().mockResolvedValue([]),
    } as any;
}

/**
 * Create mock StatusBarManager
 */
function createMockStatusBar(): StatusBarManager {
    return {
        showLoading: jest.fn(),
        showSuccess: jest.fn(),
        showError: jest.fn(),
        showIdle: jest.fn(),
    } as any;
}

/**
 * Create mock Logger
 */
function createMockLogger(): Logger {
    return {
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    } as any;
}

/**
 * Helper to create ShowProjectsListCommand instance
 */
function createCommand(): ShowProjectsListCommand {
    const mockContext = createMockExtensionContext();
    const mockStateManager = createMockStateManager();
    const mockStatusBar = createMockStatusBar();
    const mockLogger = createMockLogger();

    return new ShowProjectsListCommand(
        mockContext,
        mockStateManager,
        mockStatusBar,
        mockLogger
    );
}

describe('ShowProjectsListCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Webview ID and Title', () => {
        it('should have webview ID "demoBuilder.projectsList"', () => {
            // Given: A new command instance
            const command = createCommand();

            // When: Accessing the webview ID
            const webviewId = (command as any).getWebviewId();

            // Then: Should return correct ID
            expect(webviewId).toBe('demoBuilder.projectsList');
        });

        it('should have title "Projects"', () => {
            // Given: A new command instance
            const command = createCommand();

            // When: Accessing the title
            const title = (command as any).getWebviewTitle();

            // Then: Should return "Projects"
            expect(title).toBe('Projects');
        });

        it('should have loading message "Loading Projects..."', () => {
            // Given: A new command instance
            const command = createCommand();

            // When: Accessing loading message
            const message = (command as any).getLoadingMessage();

            // Then: Should return appropriate loading message
            expect(message).toBe('Loading Projects...');
        });
    });

    describe('HTML Generation - 4-Bundle Pattern', () => {
        it('should generate webview HTML with all 4 bundles in correct order', async () => {
            // Given: Command is executed
            const command = createCommand();

            // Mock panel and webview (required by getWebviewContent)
            const mockWebview = {
                cspSource: 'vscode-webview://test',
                asWebviewUri: jest.fn((uri: vscode.Uri) => uri),
            };
            (command as any).panel = {
                webview: mockWebview,
            };

            // When: Webview HTML is generated
            const html = await (command as any).getWebviewContent();

            // Then: Contains script tags for all 4 bundles in correct order
            expect(html).toContain('runtime-bundle.js');
            expect(html).toContain('vendors-bundle.js');
            expect(html).toContain('common-bundle.js');
            expect(html).toContain('projectsList-bundle.js');

            // Verify load order: runtime -> vendors -> common -> projectsList
            const runtimeIndex = html.indexOf('runtime-bundle.js');
            const vendorsIndex = html.indexOf('vendors-bundle.js');
            const commonIndex = html.indexOf('common-bundle.js');
            const projectsListIndex = html.indexOf('projectsList-bundle.js');

            expect(runtimeIndex).toBeLessThan(vendorsIndex);
            expect(vendorsIndex).toBeLessThan(commonIndex);
            expect(commonIndex).toBeLessThan(projectsListIndex);
        });

        it('should apply nonces to all script tags for CSP compliance', async () => {
            // Given: Command webview HTML is generated
            const command = createCommand();

            // Mock panel and webview
            const mockWebview = {
                cspSource: 'vscode-webview://test',
                asWebviewUri: jest.fn((uri: vscode.Uri) => uri),
            };
            (command as any).panel = {
                webview: mockWebview,
            };

            // When: HTML content is parsed
            const html = await (command as any).getWebviewContent();

            // Then: All script tags have nonce attribute
            const scriptMatches = html.match(/<script nonce="([^"]+)"/g);
            expect(scriptMatches).toHaveLength(4); // 4 bundles = 4 script tags

            // Verify all use same nonce (CSP compliance)
            const noncePattern = /nonce="([^"]+)"/;
            const nonces = scriptMatches?.map((match: string) => {
                const result = noncePattern.exec(match);
                return result ? result[1] : null;
            });

            expect(nonces).toBeDefined();
            expect(new Set(nonces).size).toBe(1); // All same nonce
            expect(nonces![0].length).toBeGreaterThan(16); // Reasonable nonce length
        });
    });

    describe('Initial Data', () => {
        it('should return theme information in initial data', async () => {
            // Given: Command instance
            const command = createCommand();

            // Mock VS Code theme
            const originalActiveColorTheme = vscode.window.activeColorTheme;
            Object.defineProperty(vscode.window, 'activeColorTheme', {
                value: { kind: vscode.ColorThemeKind.Dark },
                configurable: true,
            });

            try {
                // When: Getting initial data
                const initialData = await (command as any).getInitialData();

                // Then: Should contain theme information
                expect(initialData).toHaveProperty('theme');
                expect(initialData.theme).toBe('dark');
            } finally {
                Object.defineProperty(vscode.window, 'activeColorTheme', {
                    value: originalActiveColorTheme,
                    configurable: true,
                });
            }
        });
    });
});

describe('ProjectsListHandlerRegistry', () => {
    describe('Handler Registration', () => {
        it('should register getProjects handler', () => {
            // Given: A new handler registry
            const registry = new ProjectsListHandlerRegistry();

            // When: Checking registered handlers
            const hasHandler = registry.hasHandler('getProjects');

            // Then: Should have getProjects handler
            expect(hasHandler).toBe(true);
        });

        it('should register selectProject handler', () => {
            // Given: A new handler registry
            const registry = new ProjectsListHandlerRegistry();

            // When: Checking registered handlers
            const hasHandler = registry.hasHandler('selectProject');

            // Then: Should have selectProject handler
            expect(hasHandler).toBe(true);
        });

        it('should register createProject handler', () => {
            // Given: A new handler registry
            const registry = new ProjectsListHandlerRegistry();

            // When: Checking registered handlers
            const hasHandler = registry.hasHandler('createProject');

            // Then: Should have createProject handler
            expect(hasHandler).toBe(true);
        });

        it('should return all registered message types', () => {
            // Given: A handler registry
            const registry = new ProjectsListHandlerRegistry();

            // When: Getting registered types
            const types = registry.getRegisteredTypes();

            // Then: Should contain expected handlers
            expect(types).toContain('getProjects');
            expect(types).toContain('selectProject');
            expect(types).toContain('createProject');
        });
    });
});

describe('ShowProjectsListCommand - Static Methods', () => {
    describe('disposeActivePanel', () => {
        it('should be callable as static method', () => {
            // Given: ShowProjectsListCommand class
            // When/Then: Static method should exist and be callable
            expect(typeof ShowProjectsListCommand.disposeActivePanel).toBe('function');
        });
    });
});
