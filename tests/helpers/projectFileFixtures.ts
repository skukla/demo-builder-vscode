/**
 * Typed fixtures for the project file (v2) and the version-1 settings file it
 * migrates from. Distinct from `projectFake.ts` (an in-memory `Project`) and
 * `webviewFixtures.ts` (webview init payloads): this is the on-disk EXPORT shape.
 *
 * WHY TYPED: a shape written where the compiler cannot read it will be invented
 * (see `webviewFixtures.ts` for the five that were). These are typed to the
 * real interfaces, so `npm run typecheck:tests` rejects a field the type does
 * not have.
 *
 * WHERE THE V1 SHAPE CAME FROM: the field set `extractSettingsFromProject`
 * emits (`settingsSerializer.ts:156-202`, read 2026-09-11), with every value a
 * placeholder. Real exports carry store codes, Adobe ids and an ACCS tenant
 * host, none of which belong in a public repo; the KEYS are what the migration
 * is tested against, and the type pins them.
 */

import { CATALOG_API_KEY, PAAS_ADMIN_PASSWORD } from '@/core/config/envVarKeys';
import type { SettingsFile } from '@/types/settingsFile';

/** A version-1 export as the serializer writes it today, secrets included. */
export function settingsFileV1WithSecrets(): SettingsFile {
    return {
        version: 1,
        exportedAt: '2026-09-11T00:00:00.000Z',
        source: { project: 'bodea', extension: '1.0.0-beta.146' },
        includesSecrets: true,
        selections: {
            frontend: 'eds-storefront',
            backend: 'adobe-commerce-accs',
            dependencies: ['eds-accs-mesh'],
            integrations: [],
            appBuilder: [],
        },
        configs: {
            'adobe-commerce-accs': {
                ACCS_WEBSITE_CODE: 'bodea',
                ACCS_STORE_CODE: 'bodea_store',
                ACCS_STORE_VIEW_CODE: 'bodea_us',
                ACCS_GRAPHQL_ENDPOINT: 'https://example.invalid/graphql',
                [CATALOG_API_KEY]: 'fake-test-pw-not-a-secret',
            },
            'adobe-commerce-paas': {
                [PAAS_ADMIN_PASSWORD]: 'fake-test-pw-not-a-secret',
            },
        },
        adobe: {
            orgId: 'ORG@AdobeOrg',
            projectId: '123',
            projectName: '833BronzeShark',
            projectTitle: 'Bodea Demo',
            workspaceId: '456',
            workspaceTitle: 'Production',
        },
        selectedPackage: 'bodea',
        selectedStack: 'eds-accs',
        selectedAddons: [],
        selectedBlockLibraries: ['bodea-blocks'],
        customBlockLibraries: [],
        installedBlockLibraries: [],
        edsConfig: {
            daLiveOrg: 'someone',
            daLiveSite: 'bodea-demo',
            githubOwner: 'someone',
            repoName: 'bodea-demo',
            repoUrl: 'https://github.com/someone/bodea-demo',
        },
        appBuilderComponentSources: {
            'someone-pricing-app': {
                owner: 'someone',
                repo: 'pricing-app',
                branch: 'main',
                name: 'Pricing',
            },
        },
        additionalConsoleApis: ['CommerceCloudService'],
        componentApiPicks: { 'someone-pricing-app': ['CommerceCloudService'] },
    };
}
