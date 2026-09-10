/**
 * The store structure must never reach a generated `.env`.
 *
 * `.env` values are deployed: the mesh queries the website whose CODE is in
 * there. The structure is a human-facing catalog, so it lives on the project
 * under `commerceStoreStructure` and nowhere near `componentConfigs`.
 *
 * `generateComponentEnvFile` only walks keys declared in the shared envVars
 * dictionary, so a name could not leak today even if one were filed among the
 * configs — but "it happens not to leak" is the kind of guarantee that quietly
 * stops being true. This pins it.
 */

import { promises as fsPromises } from 'fs';
import { generateComponentEnvFile } from '@/features/project-creation/helpers/envFileGenerator';
import type { EnvVarDefinition, TransformedComponentDefinition } from '@/types/components';
import { createMockSetupContext, TEST_COMPONENT_PATH } from './envFileGenerator.testUtils';

import { createMockProject } from '../../../helpers/projectFake';
jest.mock('fs', () => ({ promises: { writeFile: jest.fn() } }));
jest.mock('@/features/project-creation/helpers/formatters', () => ({
    formatGroupName: (g: string) => g,
}));

const BACKEND_ID = 'adobe-commerce-accs';

const ENV_VARS: Record<string, Omit<EnvVarDefinition, 'key'>> = {
    ACCS_WEBSITE_CODE: { label: 'Website', type: 'text', description: 'Website code' },
};

const meshComponent = {
    id: 'eds-accs-mesh',
    name: 'API Mesh',
    type: 'mesh',
    configuration: {
        requiredEnvVars: ['ACCS_WEBSITE_CODE'],
        optionalEnvVars: [],
    },
} as unknown as TransformedComponentDefinition;

beforeEach(() => jest.clearAllMocks());

it('writes the store CODE and never the name it was picked by', async () => {
    const componentConfigs = { [BACKEND_ID]: { ACCS_WEBSITE_CODE: 'citisignal' } };
    const project = createMockProject({
        name: 'p',
        path: '/p',
        componentConfigs,
        // The names live HERE, beside componentConfigs — never inside it.
        commerceStoreStructure: {
            websites: [{ id: 2, code: 'citisignal', name: 'CitiSignal' }],
            storeGroups: [],
            storeViews: [],
        },
        componentSelections: { backend: BACKEND_ID },
    });
    const context = createMockSetupContext({
        registry: { envVars: ENV_VARS },
        project,
        config: {
            projectName: 'test-project',
            componentConfigs,
            components: { backend: BACKEND_ID },
        },
    });

    await generateComponentEnvFile(TEST_COMPONENT_PATH, 'eds-accs-mesh', meshComponent, context);

    const calls = (fsPromises.writeFile as jest.Mock).mock.calls;
    const content = String(calls[calls.length - 1][1]);

    expect(content).toContain('ACCS_WEBSITE_CODE=citisignal');
    expect(content).not.toContain('CitiSignal');
});
