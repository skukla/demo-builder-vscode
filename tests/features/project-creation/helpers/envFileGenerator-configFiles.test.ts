/**
 * Unit tests for generateComponentConfigFiles — the non-.env half of
 * envFileGenerator.
 *
 * A component declares `configuration.configFiles`; each entry names a format and
 * optionally a generator. This suite pins the three routes that declaration can
 * take (env / eds-config / json), and the json writer's own decisions: which keys
 * reach the file, what each one is worth, how a rename is applied, and whether the
 * bytes go through the template path or straight to disk.
 */

import { promises as fsPromises } from 'fs';
import * as path from 'path';
import { generateConfigFile } from '@/core/config/configFileGenerator';
import {
    generateConfigJson,
    extractConfigParamsFromConfigs,
} from '@/features/eds/services/configGenerator';
import { generateComponentConfigFiles } from '@/features/project-creation/helpers/envFileGenerator';
import { TransformedComponentDefinition, ComponentRegistry } from '@/types/components';
import {
    createMockSetupContext,
    sharedEnvVars,
    TEST_COMPONENT_PATH,
} from './envFileGenerator.testUtils';
import { createMockProject } from '../../../helpers/projectFake';

jest.mock('fs', () => ({
    promises: {
        writeFile: jest.fn(),
    },
}));

jest.mock('@/features/project-creation/helpers/formatters', () => ({
    formatGroupName: (group: string) => group,
}));

jest.mock('@/core/config/configFileGenerator', () => ({
    generateConfigFile: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/features/eds/services/configGenerator', () => ({
    generateConfigJson: jest.fn(),
    extractConfigParamsFromConfigs: jest.fn(),
}));

const mockGenerateConfigFile = generateConfigFile as jest.MockedFunction<typeof generateConfigFile>;
const mockGenerateConfigJson = generateConfigJson as jest.MockedFunction<typeof generateConfigJson>;
const mockExtractConfigParams = extractConfigParamsFromConfigs as jest.MockedFunction<
    typeof extractConfigParamsFromConfigs
>;

/** The write the json branch performs, parsed back into the object it serialised. */
function writtenJson(callIndex = 0): Record<string, unknown> {
    const call = (fsPromises.writeFile as jest.Mock).mock.calls[callIndex];
    return JSON.parse(call[1] as string) as Record<string, unknown>;
}

function componentWith(
    configFiles: TransformedComponentDefinition['configuration'] extends undefined
        ? never
        : NonNullable<TransformedComponentDefinition['configuration']>['configFiles'],
    extra: Partial<NonNullable<TransformedComponentDefinition['configuration']>> = {}
): TransformedComponentDefinition {
    return {
        id: 'test-component',
        name: 'Test Component',
        type: 'frontend',
        configuration: {
            requiredEnvVars: [],
            optionalEnvVars: [],
            configFiles,
            ...extra,
        },
    } as TransformedComponentDefinition;
}

describe('generateComponentConfigFiles — routing by declaration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('falls back to a .env write when the component declares no configFiles', async () => {
        const context = createMockSetupContext({ registry: { envVars: sharedEnvVars } });

        await generateComponentConfigFiles(
            TEST_COMPONENT_PATH,
            'test-component',
            componentWith(undefined),
            context
        );

        expect(fsPromises.writeFile).toHaveBeenCalledTimes(1);
        expect((fsPromises.writeFile as jest.Mock).mock.calls[0][0]).toBe(
            path.join(TEST_COMPONENT_PATH, '.env')
        );
    });

    it('falls back to a .env write when configFiles is declared but empty', async () => {
        const context = createMockSetupContext({ registry: { envVars: sharedEnvVars } });

        await generateComponentConfigFiles(
            TEST_COMPONENT_PATH,
            'test-component',
            componentWith({}),
            context
        );

        expect((fsPromises.writeFile as jest.Mock).mock.calls[0][0]).toBe(
            path.join(TEST_COMPONENT_PATH, '.env')
        );
    });

    it('falls back to a .env write for a component with no configuration section at all', async () => {
        const context = createMockSetupContext({ registry: { envVars: sharedEnvVars } });

        await generateComponentConfigFiles(
            TEST_COMPONENT_PATH,
            'test-component',
            {
                id: 'test-component',
                name: 'Test Component',
                type: 'frontend',
            } as TransformedComponentDefinition,
            context
        );

        expect((fsPromises.writeFile as jest.Mock).mock.calls[0][0]).toBe(
            path.join(TEST_COMPONENT_PATH, '.env')
        );
    });

    it('writes .env — not the declared filename — for an entry whose format is env', async () => {
        const context = createMockSetupContext({ registry: { envVars: sharedEnvVars } });

        await generateComponentConfigFiles(
            TEST_COMPONENT_PATH,
            'test-component',
            componentWith({ 'settings.env': { format: 'env' } }),
            context
        );

        expect((fsPromises.writeFile as jest.Mock).mock.calls[0][0]).toBe(
            path.join(TEST_COMPONENT_PATH, '.env')
        );
    });

    it('writes every declared entry, one file per key', async () => {
        const context = createMockSetupContext({ registry: { envVars: sharedEnvVars } });

        await generateComponentConfigFiles(
            TEST_COMPONENT_PATH,
            'test-component',
            componentWith({
                'a.json': { format: 'json' },
                'b.json': { format: 'json' },
            }),
            context
        );

        const targets = (fsPromises.writeFile as jest.Mock).mock.calls.map((c) => c[0]);
        expect(targets).toEqual([
            path.join(TEST_COMPONENT_PATH, 'a.json'),
            path.join(TEST_COMPONENT_PATH, 'b.json'),
        ]);
    });

    it('refuses a format it cannot write and leaves the disk untouched', async () => {
        const context = createMockSetupContext({ registry: { envVars: sharedEnvVars } });

        await generateComponentConfigFiles(
            TEST_COMPONENT_PATH,
            'test-component',
            componentWith({ 'settings.yaml': { format: 'yaml' } }),
            context
        );

        expect(fsPromises.writeFile).not.toHaveBeenCalled();
        expect(mockGenerateConfigFile).not.toHaveBeenCalled();
    });
});

describe('generateComponentConfigFiles — the json writer', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('writes every declared env var key, empty when nothing supplies a value', async () => {
        const context = createMockSetupContext({ registry: { envVars: sharedEnvVars } });

        await generateComponentConfigFiles(
            TEST_COMPONENT_PATH,
            'test-component',
            componentWith({ 'c.json': { format: 'json' } }, { requiredEnvVars: ['API_URL'] }),
            context
        );

        expect(writtenJson()).toEqual({ API_URL: '' });
    });

    it('takes a value from any component config, not only the component being written', async () => {
        const context = createMockSetupContext({
            registry: { envVars: sharedEnvVars },
            config: {
                projectName: 'test-project',
                componentConfigs: { 'other-component': { API_URL: 'https://from-other' } },
            },
        });

        await generateComponentConfigFiles(
            TEST_COMPONENT_PATH,
            'test-component',
            componentWith({ 'c.json': { format: 'json' } }, { requiredEnvVars: ['API_URL'] }),
            context
        );

        expect(writtenJson()).toEqual({ API_URL: 'https://from-other' });
    });

    it('reads past a component config that does not define the key', async () => {
        const context = createMockSetupContext({
            registry: { envVars: sharedEnvVars },
            config: {
                projectName: 'test-project',
                componentConfigs: {
                    first: { OTHER: 'x' },
                    second: { API_URL: 'https://found-later' },
                },
            },
        });

        await generateComponentConfigFiles(
            TEST_COMPONENT_PATH,
            'test-component',
            componentWith({ 'c.json': { format: 'json' } }, { requiredEnvVars: ['API_URL'] }),
            context
        );

        expect(writtenJson()).toEqual({ API_URL: 'https://found-later' });
    });

    it('takes MESH_ENDPOINT from the project mesh endpoint, not from componentConfigs', async () => {
        const context = createMockSetupContext({
            registry: { envVars: sharedEnvVars },
            project: createMockProject({
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                        endpoint: 'https://live-mesh',
                    },
                },
            }),
            config: {
                projectName: 'test-project',
                componentConfigs: { mesh: { MESH_ENDPOINT: 'https://stale-config' } },
            },
        });

        await generateComponentConfigFiles(
            TEST_COMPONENT_PATH,
            'test-component',
            componentWith({ 'c.json': { format: 'json' } }, { requiredEnvVars: ['MESH_ENDPOINT'] }),
            context
        );

        expect(writtenJson()).toEqual({ MESH_ENDPOINT: 'https://live-mesh' });
    });

    it('leaves MESH_ENDPOINT empty when the project has no deployed mesh', async () => {
        const context = createMockSetupContext({ registry: { envVars: sharedEnvVars } });

        await generateComponentConfigFiles(
            TEST_COMPONENT_PATH,
            'test-component',
            componentWith({ 'c.json': { format: 'json' } }, { requiredEnvVars: ['MESH_ENDPOINT'] }),
            context
        );

        expect(writtenJson()).toEqual({ MESH_ENDPOINT: '' });
    });

    it('derives the catalog endpoint from the PaaS source and adds it as its own key', async () => {
        const context = createMockSetupContext({
            registry: { envVars: sharedEnvVars },
            config: {
                projectName: 'test-project',
                componentConfigs: {
                    backend: { PAAS_CATALOG_SERVICE_ENDPOINT: 'https://paas-catalog' },
                },
            },
        });

        await generateComponentConfigFiles(
            TEST_COMPONENT_PATH,
            'test-component',
            componentWith({ 'c.json': { format: 'json' } }),
            context
        );

        expect(writtenJson()).toEqual({ ADOBE_CATALOG_SERVICE_ENDPOINT: 'https://paas-catalog' });
    });

    it('derives the catalog endpoint from the ACCS source when there is no PaaS one', async () => {
        const context = createMockSetupContext({
            registry: { envVars: sharedEnvVars },
            config: {
                projectName: 'test-project',
                componentConfigs: {
                    backend: { ACCS_CATALOG_SERVICE_ENDPOINT: 'https://accs-catalog' },
                },
            },
        });

        await generateComponentConfigFiles(
            TEST_COMPONENT_PATH,
            'test-component',
            componentWith({ 'c.json': { format: 'json' } }),
            context
        );

        expect(writtenJson()).toEqual({ ADOBE_CATALOG_SERVICE_ENDPOINT: 'https://accs-catalog' });
    });

    it('prefers the PaaS catalog source when both are present', async () => {
        const context = createMockSetupContext({
            registry: { envVars: sharedEnvVars },
            config: {
                projectName: 'test-project',
                componentConfigs: {
                    backend: {
                        PAAS_CATALOG_SERVICE_ENDPOINT: 'https://paas-catalog',
                        ACCS_CATALOG_SERVICE_ENDPOINT: 'https://accs-catalog',
                    },
                },
            },
        });

        await generateComponentConfigFiles(
            TEST_COMPONENT_PATH,
            'test-component',
            componentWith({ 'c.json': { format: 'json' } }),
            context
        );

        expect(writtenJson()).toEqual({ ADOBE_CATALOG_SERVICE_ENDPOINT: 'https://paas-catalog' });
    });

    it('adds no derived catalog key when neither source is configured', async () => {
        const context = createMockSetupContext({ registry: { envVars: sharedEnvVars } });

        await generateComponentConfigFiles(
            TEST_COMPONENT_PATH,
            'test-component',
            componentWith({ 'c.json': { format: 'json' } }),
            context
        );

        expect(writtenJson()).toEqual({});
    });

    it('renames a key on the way out when fieldRenames names it', async () => {
        const context = createMockSetupContext({
            registry: { envVars: sharedEnvVars },
            config: {
                projectName: 'test-project',
                componentConfigs: { backend: { API_URL: 'https://api' } },
            },
        });

        await generateComponentConfigFiles(
            TEST_COMPONENT_PATH,
            'test-component',
            componentWith(
                { 'c.json': { format: 'json', fieldRenames: { API_URL: 'api-url' } } },
                { requiredEnvVars: ['API_URL'] }
            ),
            context
        );

        expect(writtenJson()).toEqual({ 'api-url': 'https://api' });
    });

    it('keeps the original key for a var fieldRenames does not name', async () => {
        const context = createMockSetupContext({
            registry: { envVars: sharedEnvVars },
            config: {
                projectName: 'test-project',
                componentConfigs: { backend: { API_URL: 'https://api' } },
            },
        });

        await generateComponentConfigFiles(
            TEST_COMPONENT_PATH,
            'test-component',
            componentWith(
                { 'c.json': { format: 'json', fieldRenames: { DB_HOST: 'db-host' } } },
                { requiredEnvVars: ['API_URL'] }
            ),
            context
        );

        expect(writtenJson()).toEqual({ API_URL: 'https://api' });
    });

    it('merges additionalFields into the written object', async () => {
        const context = createMockSetupContext({ registry: { envVars: sharedEnvVars } });

        await generateComponentConfigFiles(
            TEST_COMPONENT_PATH,
            'test-component',
            componentWith({
                'c.json': { format: 'json', additionalFields: { schema: 'v2', enabled: true } },
            }),
            context
        );

        expect(writtenJson()).toEqual({ schema: 'v2', enabled: true });
    });

    it('routes through the template generator, with upper-snake placeholders, when a template is declared', async () => {
        const context = createMockSetupContext({
            registry: { envVars: sharedEnvVars },
            config: {
                projectName: 'test-project',
                componentConfigs: { backend: { API_URL: 'https://api' } },
            },
        });

        await generateComponentConfigFiles(
            TEST_COMPONENT_PATH,
            'test-component',
            componentWith(
                {
                    'c.json': {
                        format: 'json',
                        template: 'tpl/default.json',
                        fieldRenames: { API_URL: 'api-url' },
                    },
                },
                { requiredEnvVars: ['API_URL'] }
            ),
            context
        );

        expect(fsPromises.writeFile).not.toHaveBeenCalled();
        expect(mockGenerateConfigFile).toHaveBeenCalledWith(
            expect.objectContaining({
                filePath: path.join(TEST_COMPONENT_PATH, 'c.json'),
                templatePath: path.join(TEST_COMPONENT_PATH, 'tpl/default.json'),
                defaultConfig: { 'api-url': 'https://api' },
                placeholders: { '{API_URL}': 'https://api' },
                description: 'c.json for Test Component',
            })
        );
    });

    it('renders an empty value as an empty placeholder rather than "undefined"', async () => {
        const context = createMockSetupContext({ registry: { envVars: sharedEnvVars } });

        await generateComponentConfigFiles(
            TEST_COMPONENT_PATH,
            'test-component',
            componentWith(
                { 'c.json': { format: 'json', template: 'tpl/default.json' } },
                { requiredEnvVars: ['API_URL'] }
            ),
            context
        );

        expect(mockGenerateConfigFile.mock.calls[0][0].placeholders).toEqual({ '{API_URL}': '' });
    });
});

describe('generateComponentConfigFiles — the eds-config route', () => {
    const edsRegistry: Partial<ComponentRegistry> = { envVars: sharedEnvVars };

    beforeEach(() => {
        jest.clearAllMocks();
        mockExtractConfigParams.mockReturnValue({ environmentType: 'accs' });
        mockGenerateConfigJson.mockReturnValue({ success: true, content: '{"ok":true}' });
    });

    function edsProject(metadata: Record<string, unknown>) {
        return createMockProject({
            componentInstances: {
                'eds-storefront': {
                    id: 'eds-storefront',
                    name: 'eds-storefront',
                    status: 'ready',
                    path: '/p/eds',
                    metadata,
                },
            },
        });
    }

    /** The wizard config the EDS route reads addons and package from. */
    const edsConfig = {
        projectName: 'test-project',
        selectedPackage: 'citisignal',
        selectedAddons: ['b2b'],
    };

    const edsComponent = componentWith({
        'config.json': { format: 'json', generator: 'eds-config' },
    });

    it('splits githubRepo into owner and repo and passes both to the canonical generator', async () => {
        const context = createMockSetupContext({
            registry: edsRegistry,
            config: edsConfig,
            project: edsProject({
                githubRepo: 'acme-org/acme-site',
                daLiveOrg: 'acme-org',
                daLiveSite: 'acme-site',
            }),
        });

        await generateComponentConfigFiles('/p/eds', 'eds-storefront', edsComponent, context);

        expect(mockGenerateConfigJson.mock.calls[0][0]).toEqual(
            expect.objectContaining({
                githubOwner: 'acme-org',
                repoName: 'acme-site',
                daLiveOrg: 'acme-org',
                daLiveSite: 'acme-site',
                environmentType: 'accs',
                selectedAddons: ['b2b'],
                selectedPackage: 'citisignal',
            })
        );
    });

    it('leaves owner and repo empty when githubRepo carries no slash', async () => {
        const context = createMockSetupContext({
            registry: edsRegistry,
            config: edsConfig,
            project: edsProject({ githubRepo: 'acme-site', daLiveOrg: 'o', daLiveSite: 's' }),
        });

        await generateComponentConfigFiles('/p/eds', 'eds-storefront', edsComponent, context);

        expect(mockGenerateConfigJson.mock.calls[0][0]).toEqual(
            expect.objectContaining({ githubOwner: '', repoName: '' })
        );
    });

    it('passes empty strings, not undefined, when the instance carries no metadata at all', async () => {
        const context = createMockSetupContext({
            registry: edsRegistry,
            config: edsConfig,
            project: createMockProject({ componentInstances: {} }),
        });

        await generateComponentConfigFiles('/p/eds', 'eds-storefront', edsComponent, context);

        expect(mockGenerateConfigJson.mock.calls[0][0]).toEqual(
            expect.objectContaining({
                githubOwner: '',
                repoName: '',
                daLiveOrg: '',
                daLiveSite: '',
            })
        );
    });

    it('passes empty strings when the project records no componentInstances at all', async () => {
        const context = createMockSetupContext({
            registry: edsRegistry,
            config: edsConfig,
            project: createMockProject({ componentInstances: undefined }),
        });

        await generateComponentConfigFiles('/p/eds', 'eds-storefront', edsComponent, context);

        expect(mockGenerateConfigJson.mock.calls[0][0]).toEqual(
            expect.objectContaining({ githubOwner: '', repoName: '', daLiveOrg: '', daLiveSite: '' })
        );
    });

    it('reads the Commerce params from the project component configs and mesh endpoint', async () => {
        const context = createMockSetupContext({
            registry: edsRegistry,
            config: {
                projectName: 'test-project',
                components: { backend: 'adobe-commerce-paas' },
                componentConfigs: { backend: { API_URL: 'https://api' } },
            },
            project: createMockProject({
                componentInstances: {
                    'eds-storefront': {
                        id: 'eds-storefront',
                        name: 'eds-storefront',
                        status: 'ready',
                        path: '/p/eds',
                        metadata: { githubRepo: 'o/r', daLiveOrg: 'o', daLiveSite: 's' },
                    },
                },
                appBuilderComponents: {
                    mesh: {
                        kind: 'mesh',
                        status: 'deployed',
                        source: { owner: '', repo: '' },
                        endpoint: 'https://live-mesh',
                    },
                },
            }),
        });

        await generateComponentConfigFiles('/p/eds', 'eds-storefront', edsComponent, context);

        expect(mockExtractConfigParams).toHaveBeenCalledWith(
            { backend: { API_URL: 'https://api' } },
            'https://live-mesh',
            'adobe-commerce-paas'
        );
    });

    it('writes the generated content verbatim to config.json in the component directory', async () => {
        mockGenerateConfigJson.mockReturnValue({ success: true, content: '{"commerce":1}' });
        const context = createMockSetupContext({
            registry: edsRegistry,
            config: edsConfig,
            project: edsProject({ githubRepo: 'o/r', daLiveOrg: 'o', daLiveSite: 's' }),
        });

        await generateComponentConfigFiles('/p/eds', 'eds-storefront', edsComponent, context);

        expect(fsPromises.writeFile).toHaveBeenCalledWith(
            path.join('/p/eds', 'config.json'),
            '{"commerce":1}',
            'utf-8'
        );
    });

    it('throws, naming the generator error, when generation reports failure', async () => {
        mockGenerateConfigJson.mockReturnValue({ success: false, error: 'template missing' });
        const context = createMockSetupContext({
            registry: edsRegistry,
            config: edsConfig,
            project: edsProject({ githubRepo: 'o/r', daLiveOrg: 'o', daLiveSite: 's' }),
        });

        await expect(
            generateComponentConfigFiles('/p/eds', 'eds-storefront', edsComponent, context)
        ).rejects.toThrow('Config.json generation failed: template missing');
        expect(fsPromises.writeFile).not.toHaveBeenCalled();
    });

    it('throws rather than writing an empty file when generation succeeds with no content', async () => {
        mockGenerateConfigJson.mockReturnValue({ success: true, content: '' });
        const context = createMockSetupContext({
            registry: edsRegistry,
            config: edsConfig,
            project: edsProject({ githubRepo: 'o/r', daLiveOrg: 'o', daLiveSite: 's' }),
        });

        await expect(
            generateComponentConfigFiles('/p/eds', 'eds-storefront', edsComponent, context)
        ).rejects.toThrow('Config.json generation failed: Unknown error');
        expect(fsPromises.writeFile).not.toHaveBeenCalled();
    });
});
