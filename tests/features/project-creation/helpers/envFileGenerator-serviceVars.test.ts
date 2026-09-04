/**
 * Unit tests for the env-var RESOLUTION half of envFileGenerator: which keys a
 * component's .env ends up holding once backend-specific service definitions are
 * folded in, and which registry categories a component id is looked up across.
 *
 * A component names `requiredServices`; each service can declare env vars either
 * flatly or per backend. The rules that decide the final key list — a service var
 * the component already declares is not added twice, a backend-specific service
 * contributes nothing without a backend, and the two declaration styles are
 * exclusive — are what these tests pin.
 */

import { promises as fsPromises } from 'fs';
import {
    generateComponentEnvFile,
    regenerateComponentEnvFile,
    regenerateProjectEnvFiles,
} from '@/features/project-creation/helpers/envFileGenerator';
import {
    ComponentRegistry,
    EnvVarDefinition,
    TransformedComponentDefinition,
} from '@/types/components';
import {
    createMockSetupContext,
    createMockLogger,
    TEST_COMPONENT_PATH,
} from './envFileGenerator.testUtils';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';

jest.mock('fs', () => ({ promises: { writeFile: jest.fn() } }));
jest.mock('@/features/project-creation/helpers/formatters', () => ({
    formatGroupName: (g: string) => g,
}));

const ENV_VARS: Record<string, Omit<EnvVarDefinition, 'key'>> = {
    OWN_VAR: { label: 'Own', type: 'text', description: 'Declared by the component' },
    OPTIONAL_VAR: { label: 'Optional', type: 'text', description: 'Optional on the component' },
    SERVICE_VAR: { label: 'Service', type: 'text', description: 'Declared by a service' },
    PAAS_ONLY_VAR: { label: 'PaaS', type: 'text', description: 'Only on PaaS' },
    ACCS_ONLY_VAR: { label: 'ACCS', type: 'text', description: 'Only on ACCS' },
};

/** The keys the generated .env assigns, in the order they were written. */
function writtenKeys(): string[] {
    const body = (fsPromises.writeFile as jest.Mock).mock.calls[0][1] as string;
    return body
        .split('\n')
        .filter((line) => /^[A-Z0-9_]+=/.test(line))
        .map((line) => line.split('=')[0]);
}

function componentRequiring(
    services: string[] | undefined,
    required: string[] = [],
    optional: string[] = []
): TransformedComponentDefinition {
    return {
        id: 'test-component',
        name: 'Test Component',
        type: 'frontend',
        configuration: {
            requiredEnvVars: required,
            optionalEnvVars: optional,
            ...(services ? { requiredServices: services } : {}),
        },
    } as unknown as TransformedComponentDefinition;
}

async function generateWith(
    componentDef: TransformedComponentDefinition,
    services: ComponentRegistry['services'],
    backendId?: string
): Promise<void> {
    const context = createMockSetupContext({
        registry: { envVars: ENV_VARS, services },
        config: {
            projectName: 'test-project',
            ...(backendId ? { components: { backend: backendId } } : {}),
        },
    });
    await generateComponentEnvFile(TEST_COMPONENT_PATH, 'test-component', componentDef, context);
}

describe('service env vars fold into a component .env', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('writes nothing for a component whose definition declares no configuration at all', async () => {
        const context = createMockSetupContext({ registry: { envVars: ENV_VARS } });

        await generateComponentEnvFile(
            TEST_COMPONENT_PATH,
            'test-component',
            {
                id: 'test-component',
                name: 'Test Component',
                type: 'frontend',
            } as TransformedComponentDefinition,
            context
        );

        expect(writtenKeys()).toEqual([]);
    });

    it('writes required and optional vars, required first', async () => {
        await generateWith(componentRequiring(undefined, ['OWN_VAR'], ['OPTIONAL_VAR']), {});

        expect(writtenKeys()).toEqual(['OWN_VAR', 'OPTIONAL_VAR']);
    });

    it('adds a flat service var the component does not declare itself', async () => {
        await generateWith(
            componentRequiring(['catalog'], ['OWN_VAR']),
            {
                catalog: { requiredEnvVars: ['SERVICE_VAR'] },
            } as unknown as ComponentRegistry['services'],
            'adobe-commerce-paas'
        );

        expect(writtenKeys()).toEqual(['OWN_VAR', 'SERVICE_VAR']);
    });

    it('does not add a flat service var the component already declares', async () => {
        await generateWith(
            componentRequiring(['catalog'], ['SERVICE_VAR']),
            {
                catalog: { requiredEnvVars: ['SERVICE_VAR'] },
            } as unknown as ComponentRegistry['services'],
            'adobe-commerce-paas'
        );

        expect(writtenKeys()).toEqual(['SERVICE_VAR']);
    });

    it('does not add a service var the component declares as OPTIONAL either', async () => {
        await generateWith(
            componentRequiring(['catalog'], [], ['SERVICE_VAR']),
            {
                catalog: { requiredEnvVars: ['SERVICE_VAR'] },
            } as unknown as ComponentRegistry['services'],
            'adobe-commerce-paas'
        );

        expect(writtenKeys()).toEqual(['SERVICE_VAR']);
    });

    it('adds nothing for a service the registry does not define', async () => {
        await generateWith(
            componentRequiring(['missing-service'], ['OWN_VAR']),
            {},
            'adobe-commerce-paas'
        );

        expect(writtenKeys()).toEqual(['OWN_VAR']);
    });

    it('adds only the chosen backend arm of a backend-specific service', async () => {
        await generateWith(
            componentRequiring(['commerce'], ['OWN_VAR']),
            {
                commerce: {
                    backendSpecific: true,
                    requiredEnvVarsByBackend: {
                        'adobe-commerce-paas': ['PAAS_ONLY_VAR'],
                        'adobe-commerce-accs': ['ACCS_ONLY_VAR'],
                    },
                },
            } as unknown as ComponentRegistry['services'],
            'adobe-commerce-paas'
        );

        expect(writtenKeys()).toEqual(['OWN_VAR', 'PAAS_ONLY_VAR']);
    });

    it('adds nothing when the backend has no arm in a backend-specific service', async () => {
        await generateWith(
            componentRequiring(['commerce'], ['OWN_VAR']),
            {
                commerce: {
                    backendSpecific: true,
                    requiredEnvVarsByBackend: { 'adobe-commerce-paas': ['PAAS_ONLY_VAR'] },
                },
            } as unknown as ComponentRegistry['services'],
            'adobe-commerce-accs'
        );

        expect(writtenKeys()).toEqual(['OWN_VAR']);
    });

    it('does not repeat a backend-specific service var the component already declares', async () => {
        await generateWith(
            componentRequiring(['commerce'], ['PAAS_ONLY_VAR']),
            {
                commerce: {
                    backendSpecific: true,
                    requiredEnvVarsByBackend: { 'adobe-commerce-paas': ['PAAS_ONLY_VAR'] },
                },
            } as unknown as ComponentRegistry['services'],
            'adobe-commerce-paas'
        );

        expect(writtenKeys()).toEqual(['PAAS_ONLY_VAR']);
    });

    it('ignores a backend-specific service that carries no per-backend map', async () => {
        await generateWith(
            componentRequiring(['commerce'], ['OWN_VAR']),
            {
                commerce: {
                    backendSpecific: true,
                    requiredEnvVars: ['SERVICE_VAR'],
                },
            } as unknown as ComponentRegistry['services'],
            'adobe-commerce-paas'
        );

        expect(writtenKeys()).toEqual(['OWN_VAR', 'SERVICE_VAR']);
    });

    it('falls back to the flat list for a service that is not backendSpecific', async () => {
        await generateWith(
            componentRequiring(['commerce'], ['OWN_VAR']),
            {
                commerce: {
                    backendSpecific: false,
                    requiredEnvVarsByBackend: { 'adobe-commerce-paas': ['PAAS_ONLY_VAR'] },
                    requiredEnvVars: ['SERVICE_VAR'],
                },
            } as unknown as ComponentRegistry['services'],
            'adobe-commerce-paas'
        );

        expect(writtenKeys()).toEqual(['OWN_VAR', 'SERVICE_VAR']);
    });

    it('folds in no service vars when the registry declares no services section', async () => {
        const context = createMockSetupContext({
            registry: { envVars: ENV_VARS, services: undefined },
            config: { projectName: 'test-project', components: { backend: 'adobe-commerce-paas' } },
        });

        await generateComponentEnvFile(
            TEST_COMPONENT_PATH,
            'test-component',
            componentRequiring(['catalog'], ['OWN_VAR']),
            context
        );

        expect(writtenKeys()).toEqual(['OWN_VAR']);
    });

    it('folds in no service vars at all when the project has no backend chosen', async () => {
        await generateWith(
            componentRequiring(['catalog'], ['OWN_VAR']),
            {
                catalog: { requiredEnvVars: ['SERVICE_VAR'] },
            } as unknown as ComponentRegistry['services'],
            undefined
        );

        expect(writtenKeys()).toEqual(['OWN_VAR']);
    });

    it('folds in no service vars when the component names none', async () => {
        await generateWith(
            componentRequiring(undefined, ['OWN_VAR']),
            {
                catalog: { requiredEnvVars: ['SERVICE_VAR'] },
            } as unknown as ComponentRegistry['services'],
            'adobe-commerce-paas'
        );

        expect(writtenKeys()).toEqual(['OWN_VAR']);
    });

    it('accumulates vars across every named service', async () => {
        await generateWith(
            componentRequiring(['catalog', 'commerce'], ['OWN_VAR']),
            {
                catalog: { requiredEnvVars: ['SERVICE_VAR'] },
                commerce: {
                    backendSpecific: true,
                    requiredEnvVarsByBackend: { 'adobe-commerce-paas': ['PAAS_ONLY_VAR'] },
                },
            } as unknown as ComponentRegistry['services'],
            'adobe-commerce-paas'
        );

        expect(writtenKeys()).toEqual(['OWN_VAR', 'SERVICE_VAR', 'PAAS_ONLY_VAR']);
    });
});

/** Every registry category is searched when an installed component is looked up. */
describe('registry lookup across categories', () => {
    const secretsFake = createMockSecretStorage().secrets;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    function registryWith(
        category: 'frontends' | 'backends' | 'dependencies' | 'mesh' | 'integrations'
    ): ComponentRegistry {
        return {
            envVars: ENV_VARS,
            components: { [category]: [componentRequiring(undefined, ['OWN_VAR'])] },
            services: {},
        } as unknown as ComponentRegistry;
    }

    it.each(['frontends', 'backends', 'dependencies', 'mesh', 'integrations'] as const)(
        'finds a component filed under %s',
        async (category) => {
            await regenerateComponentEnvFile(
                createMockProject({ path: '/p' }),
                registryWith(category),
                createMockLogger(),
                'test-component',
                '/p/component',
                secretsFake
            );

            expect(writtenKeys()).toEqual(['OWN_VAR']);
        }
    );

    it('throws, naming the component, when no category holds the id', async () => {
        await expect(
            regenerateComponentEnvFile(
                createMockProject({ path: '/p' }),
                registryWith('frontends'),
                createMockLogger(),
                'not-in-registry',
                '/p/component',
                secretsFake
            )
        ).rejects.toThrow(
            'No registry definition for component "not-in-registry" — cannot generate its .env.'
        );
        expect(fsPromises.writeFile).not.toHaveBeenCalled();
    });

    it('regenerates for a project that never recorded a backend selection', async () => {
        await regenerateProjectEnvFiles(
            createMockProject({
                path: '/p',
                componentSelections: undefined,
                componentInstances: {
                    'test-component': {
                        id: 'test-component',
                        name: 'test-component',
                        status: 'ready',
                        path: '/p/component',
                    },
                },
            }),
            registryWith('frontends'),
            createMockLogger(),
            secretsFake
        );

        expect(writtenKeys()).toEqual(['OWN_VAR']);
    });

    it('skips an instance recorded with no install path', async () => {
        await regenerateProjectEnvFiles(
            createMockProject({
                path: '/p',
                componentInstances: {
                    'test-component': {
                        id: 'test-component',
                        name: 'test-component',
                        status: 'ready',
                    },
                },
            }),
            registryWith('frontends'),
            createMockLogger(),
            secretsFake
        );

        expect(fsPromises.writeFile).not.toHaveBeenCalled();
    });
});
