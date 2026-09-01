/**
 * The BACKEND component owns the Commerce store scope in generated `.env` files.
 *
 * `componentConfigs` carries a duplicate copy of website / store / store view on
 * mesh components, and only the backend's copy is updated when the user changes
 * them. The value lookup here resolved by ITERATION ORDER — "first component
 * that defines the key wins" — so whichever entry happened to come first in the
 * manifest decided the answer.
 *
 * Live 2026-08-10: `eds-accs-mesh` came first and still held the previous
 * website, so the mesh deployed against `base` while the project had been moved
 * to `citisignal`. The storefront queried a website with no products; every PDP
 * returned a valid 200 with an empty product block; mesh deploy and republish
 * both reported success.
 *
 * Sibling of the same rule in `mergeComponentConfigs` — two resolvers, two
 * different arbitrary tiebreaks, one shared key list (BACKEND_OWNED_SCOPE_KEYS).
 */

import { promises as fsPromises } from 'fs';
import type { ComponentConfigs } from '@/types/components';
import { generateComponentEnvFile } from '@/features/project-creation/helpers/envFileGenerator';
import { TransformedComponentDefinition } from '@/types/components';
import { createMockSetupContext, TEST_COMPONENT_PATH } from './envFileGenerator.testUtils';

import { createMockProject } from '../../../helpers/projectFake';
jest.mock('fs', () => ({ promises: { writeFile: jest.fn() } }));
jest.mock('@/features/project-creation/helpers/formatters', () => ({
    formatGroupName: (g: string) => g,
}));

const ENV_VARS = {
    ACCS_WEBSITE_CODE: { label: 'Website', type: 'text', description: 'Website code' },
    ACCS_GRAPHQL_ENDPOINT: { label: 'Endpoint', type: 'text', description: 'GraphQL endpoint' },
};

const meshComponent = {
    id: 'eds-accs-mesh',
    name: 'API Mesh',
    type: 'mesh',
    configuration: {
        requiredEnvVars: ['ACCS_WEBSITE_CODE', 'ACCS_GRAPHQL_ENDPOINT'],
        optionalEnvVars: [],
    },
} as unknown as TransformedComponentDefinition;

/** Mesh entry FIRST — the order that produced the live failure. */
const CONFIGS_MESH_FIRST = {
    'eds-accs-mesh': {
        ACCS_WEBSITE_CODE: 'base',
        ACCS_GRAPHQL_ENDPOINT: 'https://mesh.example/graphql',
    },
    'adobe-commerce-accs': {
        ACCS_WEBSITE_CODE: 'citisignal',
        ACCS_GRAPHQL_ENDPOINT: 'https://backend.example/graphql',
    },
};

async function envFor(componentConfigs: ComponentConfigs, backendId?: string) {
    const project = createMockProject({
        name: 'p',
        path: '/p',
        componentConfigs,
        componentSelections: { backend: backendId },
    });
    const context = createMockSetupContext({
        registry: { envVars: ENV_VARS } as never,
        project,
        // getBackendId() reads config.components.backend — not componentSelections.
        config: { projectName: 'test-project', componentConfigs, components: { backend: backendId } },
    });

    await generateComponentEnvFile(
        TEST_COMPONENT_PATH,
        'eds-accs-mesh',
        meshComponent,
        context,
    );
    const calls = (fsPromises.writeFile as jest.Mock).mock.calls;
    return String(calls[calls.length - 1][1]);
}

beforeEach(() => jest.clearAllMocks());

describe('generated .env takes the store scope from the backend', () => {
    it("uses the backend's website code even when a mesh entry comes first", async () => {
        // THE regression. Mesh-first ordering previously returned `base`.
        const content = await envFor(CONFIGS_MESH_FIRST, 'adobe-commerce-accs');

        expect(content).toContain('ACCS_WEBSITE_CODE=citisignal');
        expect(content).not.toContain('ACCS_WEBSITE_CODE=base');
    });

    it('is not merely order-dependent the other way', async () => {
        const reversed = {
            'adobe-commerce-accs': CONFIGS_MESH_FIRST['adobe-commerce-accs'],
            'eds-accs-mesh': CONFIGS_MESH_FIRST['eds-accs-mesh'],
        };

        expect(await envFor(reversed, 'adobe-commerce-accs')).toContain(
            'ACCS_WEBSITE_CODE=citisignal',
        );
    });

    it('leaves non-scope keys on the old first-wins rule — the control', async () => {
        // Only the scope keys change behaviour. Without this, "backend always
        // wins" would pass the cases above while silently changing every key.
        const content = await envFor(CONFIGS_MESH_FIRST, 'adobe-commerce-accs');

        expect(content).toContain('ACCS_GRAPHQL_ENDPOINT=https://mesh.example/graphql');
    });

    it('falls back to first-wins when no backend is selected', async () => {
        // Nothing to be authoritative, so behaviour must not change.
        const content = await envFor(CONFIGS_MESH_FIRST, undefined);

        expect(content).toContain('ACCS_WEBSITE_CODE=base');
    });
});
