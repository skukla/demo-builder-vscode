/**
 * ConfigureProjectWebviewCommand.getInitialData — envVars payload
 *
 * Regression coverage: the registry stores env vars keyed by name with no
 * `key` field inside the record (`Record<string, Omit<EnvVarDefinition,
 * 'key'>>`, and components.json carries none), while the webview types
 * (ComponentEnvVar) declare `key` required. The producer sent the registry
 * records straight through, so anything reading `envVars[x].key` off the
 * payload read undefined.
 */

import { ConfigureProjectWebviewCommand } from './configure.testUtils';
import * as vscode from 'vscode';
import { StateManager } from '@/core/state';
import { ComponentRegistryManager } from '@/features/components/services/ComponentRegistryManager';
import type { Logger } from '@/types/logger';
import type { Project } from '@/types';



jest.mock('@/features/components/services/appBuilderComponentCatalogLoader', () => ({
    getAvailableAppBuilderComponents: jest.fn(() => []),
}));
jest.mock('@/core/state/appBuilderComponentState', () => ({
    getProvidedEnvVars: jest.fn(() => ({})),
}));
jest.mock('@/features/dashboard/handlers/appBuilderComponentSecrets', () => ({
    loadAppBuilderComponentSecretFlags: jest.fn(async () => ({})),
    persistAppBuilderComponentSecrets: jest.fn(),
    splitAppBuilderComponentSecrets: jest.fn(),
}));
jest.mock('@/features/components/services/commerceSecretMigration', () => ({
    loadDeclaredSecretFlags: jest.fn(async () => ({})),
    migrateDeclaredSecrets: jest.fn(),
    reKeyProjectSecrets: jest.fn(),
}));
// The '@/features/eds' barrel was retired under ADR-022, so these names are mocked
// at the modules that declare them. isEdsProject is a type guard and lives in
// @/types/typeGuards, whose other guards stay real.
jest.mock('@/types/typeGuards', () => ({
    ...jest.requireActual('@/types/typeGuards'),
    isEdsProject: jest.fn(() => false),
}));
jest.mock('@/features/eds/services/storefront/storefrontStalenessDetector', () => ({
    detectStorefrontChanges: jest.fn(),
}));
jest.mock('@/features/eds/services/storefront/storefrontRepublishService', () => ({
    republishStorefrontConfig: jest.fn(),
}));
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getEwCanvasBranch: jest.fn(),
    resolveProjectAuthoringExperience: jest.fn(() => 'da-live-classic'),
}));

describe('ConfigureProjectWebviewCommand - getInitialData envVars', () => {
    let command: ConfigureProjectWebviewCommand;
    let mockStateManager: jest.Mocked<StateManager>;

    beforeEach(() => {
        jest.clearAllMocks();

        const mockContext = {
            subscriptions: [],
            extensionPath: '/test/extension/path',
            extensionUri: vscode.Uri.file('/test/extension/path'),
            globalState: { get: jest.fn(), update: jest.fn() },
            secrets: { get: jest.fn(), store: jest.fn() },
        } as unknown as vscode.ExtensionContext;

        mockStateManager = {
            getCurrentProject: jest.fn().mockResolvedValue({
                name: 'test-project',
                path: '/nonexistent/test/project',
                componentInstances: {},
                componentConfigs: {},
                componentSelections: {},
            } as unknown as Project),
            getAllProjects: jest.fn().mockResolvedValue([]),
        } as unknown as jest.Mocked<StateManager>;

        const mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as unknown as Logger;

        (
            ComponentRegistryManager as jest.MockedClass<typeof ComponentRegistryManager>
        ).mockImplementation(
            () =>
                ({
                    loadRegistry: jest.fn().mockResolvedValue({
                        version: '1.0.0',
                        components: {
                            frontends: [],
                            backends: [],
                            dependencies: [],
                            mesh: [],
                            integrations: [],
                        },
                        envVars: {
                            ACCS_WEBSITE_CODE: { label: 'Website code', type: 'text' },
                            ACCS_GRAPHQL_ENDPOINT: { label: 'GraphQL Endpoint', type: 'url' },
                        },
                    }),
                }) as unknown as ComponentRegistryManager
        );

        (vscode.window.activeColorTheme as any) = { kind: vscode.ColorThemeKind.Dark };

        command = new ConfigureProjectWebviewCommand(mockContext, mockStateManager, mockLogger);
    });

    it('injects each record key into the envVars records it sends', async () => {
        const data = await (command as any).getInitialData();

        const envVars = data.componentsData.envVars;
        expect(envVars.ACCS_WEBSITE_CODE.key).toBe('ACCS_WEBSITE_CODE');
        expect(envVars.ACCS_GRAPHQL_ENDPOINT.key).toBe('ACCS_GRAPHQL_ENDPOINT');
        // The rest of the record survives the injection untouched.
        expect(envVars.ACCS_WEBSITE_CODE.label).toBe('Website code');
        expect(envVars.ACCS_GRAPHQL_ENDPOINT.type).toBe('url');
    });
});
