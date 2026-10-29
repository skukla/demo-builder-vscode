/**
 * The project the project-file round-trip suites share (PL-56c/d/e): every field
 * the project file carries, set to something other than its default, and the
 * export-then-read a receiving machine performs.
 *
 * Extracted 2026-10-04 from projectFileRoundTrip.test.tsx when the Copy and Edit
 * round trip (projectCopyEditRoundTrip.test.tsx) needed the same project.
 */

import { CATALOG_API_KEY } from '@/core/config/envVarKeys';
import { readProjectFile } from '@/core/state/projectFileReader';
import { createExportSettings } from '@/features/projects-dashboard/services/settingsSerializer';
import type { Project } from '@/types/base';
import type { ImportedSettings } from '@/types/wizard';
import { createMockProject, edsStorefrontInstance } from '../../../../helpers/projectFake';

export const CUSTOM_APP = 'acme-pricing';
export const MESH = 'eds-accs-mesh';

const STORE_STRUCTURE: NonNullable<Project['commerceStoreStructure']> = {
    websites: [{ id: 1, code: 'bodea', name: 'Bodea' }],
    storeGroups: [{ id: 2, code: 'bodea_store', name: 'Bodea Store', website_id: 1, root_category_id: 3 }],
    storeViews: [
        { id: 4, code: 'bodea_us', name: 'US', store_group_id: 2, website_id: 1, is_active: true },
    ],
};

/** Every field the project file carries, set to something other than its default. */
export function everyFieldProject(): Project {
    return createMockProject({
        name: 'bodea-demo',
        title: 'Bodea Demo',
        selectedPackage: 'added:someone/bodea',
        demo: {
            kind: 'demo',
            version: 1,
            name: 'Bodea',
            source: { owner: 'someone', repo: 'bodea', branch: 'main' },
            storefrontKind: 'eds',
        },
        selectedStack: 'eds-accs',
        selectedAddons: ['adobe-commerce-aco'],
        selectedBlockLibraries: ['isle5'],
        customBlockLibraries: [{ name: 'partner-blocks', source: { owner: 'partner', repo: 'blocks', branch: 'main' } }],
        componentSelections: {
            frontend: 'eds-storefront',
            backend: 'adobe-commerce-accs',
            dependencies: [MESH],
            integrations: [],
            appBuilder: [CUSTOM_APP],
        },
        componentConfigs: {
            'adobe-commerce-accs': {
                ACCS_GRAPHQL_ENDPOINT: 'https://example.invalid/graphql',
                ACCS_WEBSITE_CODE: 'bodea',
                ACCS_STORE_CODE: 'bodea_store',
                ACCS_STORE_VIEW_CODE: 'bodea_us',
                [CATALOG_API_KEY]: 'fake-test-pw-not-a-secret',
            },
        },
        appBuilderComponents: {
            [CUSTOM_APP]: {
                kind: 'integration',
                status: 'deployed',
                name: 'Pricing',
                source: { owner: 'acme', repo: 'pricing', branch: 'main' },
            },
        },
        componentApiPicks: { [CUSTOM_APP]: ['CommerceCloudService'] },
        datapack: { name: 'bodea-catalog', version: '1.2.0' },
        commerceStoreStructure: STORE_STRUCTURE,
        commerce: {
            type: 'software-as-a-service',
            instance: {
                url: 'https://example.invalid',
                environmentId: 'env-1',
                storeView: 'bodea_us',
                websiteCode: 'bodea',
                storeCode: 'bodea_store',
            },
        },
        aiPrompts: [{ id: 'p1', title: 'Explain', prompt: 'Explain this demo' }],
        adobe: {
            organization: 'ORG@AdobeOrg',
            organizationName: 'Example Org',
            projectId: 'p-123',
            projectName: '833BronzeShark',
            projectTitle: 'Bodea Console Project',
            workspace: 'w-456',
            workspaceName: 'Stage',
            workspaceTitle: 'Stage Workspace',
        },
        componentInstances: {
            'eds-storefront': {
                ...edsStorefrontInstance(),
                metadata: { githubRepo: 'someone/bodea-demo', daLiveOrg: 'someone' },
            },
        },
    });
}

/** Export, write to text, read back: what the receiving machine holds. */
export function exportThenRead(project: Project): ImportedSettings {
    const text = JSON.stringify(createExportSettings(project, '1.0.0-test'));
    const read = readProjectFile(text);
    if (!read.ok) throw new Error(`the exported file did not read back: ${read.error}`);
    expect(read.migratedFrom).toBeUndefined();
    return read.file;
}
