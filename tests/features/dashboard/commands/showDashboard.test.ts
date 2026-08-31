/**
 * Unit Tests for ProjectDashboardWebviewCommand - Bundle Loading
 * Tests for Step 3: Update dashboard command to use 4-bundle helper
 *
 * These tests verify that the dashboard command generates HTML with all 4 webpack
 * bundles in the correct order, with proper CSP compliance.
 */

import * as vscode from 'vscode';
import { ProjectDashboardWebviewCommand } from '@/features/dashboard/commands/showDashboard';
import { BaseWebviewCommand } from '@/core/base';
import { StateManager } from '@/core/state';
import { createMockLogger } from '../../../helpers/loggerFake';

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
        getCurrentProject: jest.fn(),
    } as any;
}

/**
 * Create mock Logger
 */

/**
 * Helper to create dashboard command instance
 */
function createDashboardCommand(): ProjectDashboardWebviewCommand {
    const mockContext = createMockExtensionContext();
    const mockStateManager = createMockStateManager();
    const mockLogger = createMockLogger();

    return new ProjectDashboardWebviewCommand(
        mockContext,
        mockStateManager,
        mockLogger
    );
}

describe('ProjectDashboardWebviewCommand - Bundle Loading', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should generate webview HTML with the feature bundle', async () => {
        // Given: Dashboard command is executed
        const command = createDashboardCommand();

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

        // Then: Contains single script tag for the feature bundle
        expect(html).toContain('dashboard-bundle.js');
        expect(html).not.toContain('runtime-bundle.js');
        expect(html).not.toContain('vendors-bundle.js');
        expect(html).not.toContain('common-bundle.js');
    });

    it('should apply nonce to the script tag for CSP compliance', async () => {
        // Given: Dashboard webview HTML is generated
        const command = createDashboardCommand();

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

        // Then: Single script tag has nonce attribute
        const scriptMatches = html.match(/<script nonce="([^"]+)"/g);
        expect(scriptMatches).toHaveLength(1); // single esbuild bundle

        // Verify nonce value is present and reasonable length
        const noncePattern = /nonce="([^"]+)"/;
        const match = noncePattern.exec(scriptMatches![0]);
        expect(match).toBeDefined();
        expect(match![1].length).toBeGreaterThan(16);
    });
});

// ADR-011 D3 Steps 07+09: getInitialData seeds hasMesh and the app card from
// the KEYED appBuilderComponents entries — a keyed-only project (post-Step-07,
// no meshState/appState) must produce the same dashboard seed.
describe('ProjectDashboardWebviewCommand - getInitialData (keyed-only project)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    function createCommandWithProject(project: unknown): ProjectDashboardWebviewCommand {
        const mockStateManager = createMockStateManager();
        (mockStateManager.getCurrentProject as jest.Mock).mockResolvedValue(project);
        return new ProjectDashboardWebviewCommand(
            createMockExtensionContext(),
            mockStateManager,
            createMockLogger(),
        );
    }

    it('reports hasMesh from a keyed mesh entry when no meshState exists', async () => {
        const command = createCommandWithProject({
            name: 'demo',
            path: '/tmp/demo',
            componentInstances: {},
            appBuilderComponents: {
                mesh: {
                    kind: 'mesh',
                    status: 'deployed',
                    source: { owner: '', repo: '' },
                    endpoint: 'https://keyed-mesh/graphql',
                },
            },
        });

        const data = await (command as any).getInitialData();

        expect(data.hasMesh).toBe(true);
    });

    it('exposes the keyed appBuilderComponents map (the integrations list seed) and no initialApp', async () => {
        const keyed = {
            'acme-widget': {
                kind: 'integration',
                status: 'deployed',
                source: { owner: 'acme', repo: 'widget' },
                url: 'https://acme.adobeio-static.net',
                deployedUrls: { ping: 'https://acme.adobeio-static.net/ping' },
            },
        };
        const command = createCommandWithProject({
            name: 'demo',
            path: '/tmp/demo',
            componentInstances: {},
            appBuilderComponents: keyed,
        });

        const data = await (command as any).getInitialData();

        expect(data.appBuilderComponents).toEqual(keyed);
        // The singular app-card seed retired with the AppBuilderCard (D3 Step 08).
        expect(data.initialApp).toBeUndefined();
    });
});

describe('ProjectDashboardWebviewCommand - sendAuthoringExperienceUpdate', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.restoreAllMocks();
    });

    it('posts an authoringExperienceUpdate message carrying just the new DA URL', async () => {
        // Given: An active dashboard panel
        const mockPostMessage = jest.fn().mockResolvedValue(true);
        jest.spyOn(BaseWebviewCommand, 'getActivePanel').mockReturnValue({
            webview: { postMessage: mockPostMessage },
        } as unknown as vscode.WebviewPanel);

        // When: An authoring-experience flip pushes its update (the tile label
        // is static — only the live DA URL rides on the message now)
        await ProjectDashboardWebviewCommand.sendAuthoringExperienceUpdate(
            'https://da.live/canvas#/my-org/my-site/index',
        );

        // Then: The exact message shape is posted to the active panel
        expect(BaseWebviewCommand.getActivePanel).toHaveBeenCalledWith('demoBuilder.projectDashboard');
        expect(mockPostMessage).toHaveBeenCalledWith({
            type: 'authoringExperienceUpdate',
            payload: {
                edsDaLiveUrl: 'https://da.live/canvas#/my-org/my-site/index',
            },
        });
    });

    it('does nothing when there is no active panel', async () => {
        // Given: No active dashboard panel
        jest.spyOn(BaseWebviewCommand, 'getActivePanel').mockReturnValue(undefined);

        // When/Then: Sending does not throw
        await expect(
            ProjectDashboardWebviewCommand.sendAuthoringExperienceUpdate('https://da.live/x'),
        ).resolves.toBeUndefined();
    });
});

/**
 * The re-arm has to be CALLED to do anything. `armOnOpenChecks` is fully unit-tested
 * in orchestrator.test.ts; what no unit test covers is that `execute()` — the "the
 * dashboard is being opened" moment — actually invokes it. Driving execute() here
 * would mean standing up a panel, a communication manager and the whole handler
 * context for one line of wiring.
 *
 * So this reads the source, matching the flowStages.test.ts precedent. It proves the
 * call exists and is reached before the panel is created; it does NOT prove runtime
 * behaviour, which is what the orchestrator tests are for.
 */
describe('execute() re-arms the on-open checks (2026-08-06 regression)', () => {
    const source = require('fs').readFileSync(
        require('path').resolve(__dirname, '../../../../src/features/dashboard/commands/showDashboard.ts'),
        'utf-8'
    ) as string;

    it('calls armOnOpenChecks for the project being opened', () => {
        expect(source).toContain('armOnOpenChecks(project.path)');
    });

    it('re-arms BEFORE creating or revealing the panel', () => {
        // Order matters: the panel triggers requestStatus, which runs the checks. Arm
        // after that and the first status request of the new mount is still guarded.
        const arm = source.indexOf('armOnOpenChecks(project.path)');
        const panel = source.indexOf('await this.createOrRevealPanel()');
        expect(arm).toBeGreaterThan(-1);
        expect(panel).toBeGreaterThan(-1);
        expect(arm).toBeLessThan(panel);
    });
});
