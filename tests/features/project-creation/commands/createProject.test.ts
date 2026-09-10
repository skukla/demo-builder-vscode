/**
 * Unit Tests for CreateProjectWebviewCommand - Bundle Loading
 * Tests for Step 2: Update wizard command to use 4-bundle helper
 *
 * These tests verify that the wizard command generates HTML with all 4 webpack
 * bundles in the correct order, with proper CSP compliance.
 */

import {
    CreateProjectWebviewCommand,
} from './createProject.testUtils';
import * as vscode from 'vscode';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(() => ({
            isAuthenticated: jest.fn(),
        })),
        getCommandExecutor: jest.fn(() => ({
            execute: jest.fn(),
        })),
    },
}));

/**
 * Create mock ExtensionContext
 */
/**
 * The canonical `vscode.ExtensionContext` fake (ADR-016) replaces a local factory
 * that stood four interfaces up as `{} as any` — `environmentVariableCollection`,
 * `secrets`, `extension`, `languageModelAccessInformation`.
 */


/**
 * Create mock Logger
 */

/**
 * Helper to create wizard command instance
 */
function createWizardCommand(): CreateProjectWebviewCommand {
    const mockContext = createMockExtensionContext();
    const mockStateManager = createMockStateManager();
    const mockLogger = createMockLogger();

    return new CreateProjectWebviewCommand(mockContext, mockStateManager, mockLogger);
}

/**
 * The six members this suite reaches on the command under test — `panel` and the
 * protected template methods a webview command implements, plus `editProject`,
 * which is how the suite puts the command into edit mode.
 *
 * The reach is deliberate: these tests assert what the wizard command PUTS on screen
 * in each mode. `as any` was the wrong way to say it — it disabled checking of the
 * whole statement at nineteen sites to reach six named members, so a typo created a
 * property and the assertion passed against nothing.
 */
interface CreateProjectCommandInternals {
    panel: unknown;
    editProject: unknown;
    getWebviewContent(): Promise<string>;
    getWebviewTitle(): string;
    getLoadingMessage(): string;
    getLoadingHeader(): unknown;
}

/** Reach the protected surface of the command under test. */
function internals(command: object): CreateProjectCommandInternals {
    return command as unknown as CreateProjectCommandInternals;
}

describe('CreateProjectWebviewCommand - Edit-mode identity', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('titles the panel "Create Demo Project" in create mode', () => {
        const command = createWizardCommand();

        expect(internals(command).getWebviewTitle()).toBe('Create Demo Project');
        expect(internals(command).getLoadingMessage()).toBe('Loading Project Creation Wizard...');
        expect(internals(command).getLoadingHeader()).toEqual({
            title: 'Create Demo Project',
            subtitle: undefined,
        });
    });

    it('titles the panel "Edit Project" with the project name while editing', () => {
        const command = createWizardCommand();
        internals(command).editProject = {
            projectPath: '/p',
            projectName: 'b2b-tester',
            settings: {},
        };

        expect(internals(command).getWebviewTitle()).toBe('Edit Project');
        expect(internals(command).getLoadingMessage()).toBe('Loading Project Editor...');
        expect(internals(command).getLoadingHeader()).toEqual({
            title: 'Edit Project',
            subtitle: 'b2b-tester',
        });
    });
});

describe('CreateProjectWebviewCommand - Bundle Loading', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should generate webview HTML with the wizard bundle', async () => {
        // Arrange: Create command instance with mocked dependencies
        const command = createWizardCommand();

        // Mock panel and webview (required by getWebviewContent)
        const mockWebview = {
            cspSource: 'vscode-webview://test',
            asWebviewUri: jest.fn((uri: vscode.Uri) => uri),
        };
        internals(command).panel = {
            webview: mockWebview,
        };

        // Act: Get webview content
        const html = await internals(command).getWebviewContent();

        // Assert: esbuild produces one self-contained bundle per feature
        expect(html).toContain('wizard-bundle.js');
    });

    it('should apply nonces to all script tags for CSP compliance', async () => {
        // Arrange
        const command = createWizardCommand();

        // Mock panel and webview
        const mockWebview = {
            cspSource: 'vscode-webview://test',
            asWebviewUri: jest.fn((uri: vscode.Uri) => uri),
        };
        internals(command).panel = {
            webview: mockWebview,
        };

        // Act
        const html = await internals(command).getWebviewContent();

        // Assert: esbuild produces 1 bundle + 1 baseUri script = 2 script tags
        const scriptMatches = html.match(/<script nonce="([^"]+)"/g);
        expect(scriptMatches).toHaveLength(2);

        // Verify all use same nonce
        const noncePattern = /nonce="([^"]+)"/;
        const nonces = scriptMatches?.map((match: string) => {
            const result = noncePattern.exec(match);
            return result ? result[1] : null;
        });

        expect(nonces).toBeDefined();
        expect(new Set(nonces).size).toBe(1); // All same nonce
        // The extractor returns `string | null` per match, so assert the nonce is
        // THERE before measuring it. Under the old cast this expression was `any`,
        // and an absent nonce would have thrown a TypeError reading `.length` of
        // null — a crash where the suite should report a failed assertion.
        const [firstNonce] = nonces ?? [];
        expect(firstNonce).toBeTruthy();
        expect(firstNonce?.length ?? 0).toBeGreaterThan(16); // base64-encoded
    });

    it('should include proper CSP headers with nonce and cspSource', async () => {
        // Arrange
        const command = createWizardCommand();

        // Mock panel and webview
        const mockWebview = {
            cspSource: 'vscode-webview://test',
            asWebviewUri: jest.fn((uri: vscode.Uri) => uri),
        };
        internals(command).panel = {
            webview: mockWebview,
        };

        // Act
        const html = await internals(command).getWebviewContent();

        // Assert: CSP meta tag present with required directives
        expect(html).toContain('<meta http-equiv="Content-Security-Policy"');
        expect(html).toContain(`default-src 'none'`);

        // Extract nonce from first script tag
        const scriptMatch = html.match(/<script nonce="([^"]+)"/);
        expect(scriptMatch).toBeTruthy();
        const nonce = scriptMatch![1];

        // Verify CSP includes nonce in script-src
        expect(html).toContain(`script-src 'nonce-${nonce}'`);

        // Verify CSP includes cspSource
        expect(html).toMatch(/script-src[^;]+vscode-webview:/);
    });
});

describe('CreateProjectWebviewCommand - Static Methods', () => {
    describe('disposeActivePanel', () => {
        it('should be callable as static method', () => {
            // Given: CreateProjectWebviewCommand class
            // When/Then: Static method should exist and be callable
            expect(typeof CreateProjectWebviewCommand.disposeActivePanel).toBe('function');
        });
    });
});
