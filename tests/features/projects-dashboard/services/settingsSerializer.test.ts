/**
 * settingsSerializer — the project file's writer: extract and export.
 *
 * The reader (parse, validate, version-1 migration) is `readProjectFile`, tested
 * in tests/core/state/projectFileReader.test.ts; a file written here is read back
 * through it below.
 *
 * The App Builder integration derivation tests (§E: appBuilderComponentSources
 * derived from the keyed map, and the API picks) live in the sibling
 * settingsSerializer-integrations.test.ts.
 */

import {
    extractSettingsFromProject,
    createExportSettings,
    getSuggestedFilename,
} from '@/features/projects-dashboard/services/settingsSerializer';
import type { Project } from '@/types/base';
import { SECRET_ENV_KEYS } from '@/core/config/envVarKeys';
import { readProjectFile } from '@/core/state/projectFileReader';
import { PROJECT_FILE_VERSION } from '@/types/projectFile';
import type { CustomBlockLibrary } from '@/types/blockLibraries';
import { createMockProject, edsStorefrontInstance } from '../../../helpers/projectFake';

/** Read written text back through the one reader; a refusal fails the test with its reason. */
function readBack(json: string) {
    const read = readProjectFile(json);
    if (!read.ok) throw new Error(`the written file did not read back: ${read.error}`);
    return read;
}

describe('settingsSerializer', () => {
    describe('extractSettingsFromProject', () => {
        const createProject = (overrides?: Partial<Project>): Project => ({
            name: 'test-project',
            created: new Date(),
            lastModified: new Date(),
            path: '/path/to/project',
            status: 'ready',
            componentSelections: {
                frontend: 'citisignal',
                dependencies: ['commerce-mesh'],
            },
            componentConfigs: {
                citisignal: { API_URL: 'https://api.example.com' },
            },
            ...overrides,
        });

        it('should extract basic settings from project', () => {
            const project = createProject();

            const result = extractSettingsFromProject(project);

            expect(result.kind).toBe('project');
            expect(result.version).toBe(PROJECT_FILE_VERSION);
            expect(result.source.project).toBe('test-project');
            expect(result.selections).toEqual(project.componentSelections);
            expect(result.configs).toEqual(project.componentConfigs);
        });

        it('carries no includesSecrets stamp (D24: no field says whether credentials are in)', () => {
            const result = extractSettingsFromProject(createProject());

            expect(result).not.toHaveProperty('includesSecrets');
        });

        it('should include Adobe context when present', () => {
            const project = createProject({
                adobe: {
                    projectId: 'proj-123',
                    projectName: '833BronzeShark',
                    organization: 'org-789', // This is actually the org ID
                    workspace: 'ws-456', // This is the workspace ID
                    authenticated: true,
                },
            });

            const result = extractSettingsFromProject(project);

            expect(result.adobe).toBeDefined();
            expect(result.adobe?.orgId).toBe('org-789');
            expect(result.adobe?.projectId).toBe('proj-123');
            expect(result.adobe?.workspaceId).toBe('ws-456');
            expect(result.adobe?.projectName).toBe('833BronzeShark');
        });

        it('should include projectTitle when present', () => {
            const project = createProject({
                adobe: {
                    projectId: 'proj-123',
                    projectName: '833BronzeShark',
                    projectTitle: 'Citisignal Headless',
                    organization: 'My Org',
                    workspace: 'ws-456',
                    authenticated: true,
                },
            });

            const result = extractSettingsFromProject(project);

            expect(result.adobe?.projectName).toBe('833BronzeShark');
            expect(result.adobe?.projectTitle).toBe('Citisignal Headless');
        });

        it('should include workspaceTitle when present', () => {
            const project = createProject({
                adobe: {
                    projectId: 'proj-123',
                    projectName: '833BronzeShark',
                    organization: 'org-789',
                    workspace: 'ws-456',
                    workspaceTitle: 'Staging Environment',
                    authenticated: true,
                },
            });

            const result = extractSettingsFromProject(project);

            expect(result.adobe?.workspaceId).toBe('ws-456');
            expect(result.adobe?.workspaceTitle).toBe('Staging Environment');
        });

        it('should include both titles when both present', () => {
            const project = createProject({
                adobe: {
                    projectId: 'proj-123',
                    projectName: '833BronzeShark',
                    projectTitle: 'Citisignal Headless',
                    organization: 'org-789',
                    workspace: 'ws-456',
                    workspaceTitle: 'Staging Environment',
                    authenticated: true,
                },
            });

            const result = extractSettingsFromProject(project);

            expect(result.adobe).toEqual({
                orgId: 'org-789',
                projectId: 'proj-123',
                workspaceId: 'ws-456',
                projectName: '833BronzeShark',
                projectTitle: 'Citisignal Headless',
                workspaceTitle: 'Staging Environment',
            });
        });

        it('should not include adobe field when no adobe config', () => {
            const project = createProject({ adobe: undefined });

            const result = extractSettingsFromProject(project);

            expect(result.adobe).toBeUndefined();
        });

        it('should handle empty component selections', () => {
            const project = createProject({
                componentSelections: undefined,
                componentConfigs: undefined,
            });

            const result = extractSettingsFromProject(project);

            expect(result.selections).toStrictEqual({});
            expect(result.configs).toStrictEqual({});
        });
    });

    describe('extractSettingsFromProject - customBlockLibraries handling', () => {
        it('should include customBlockLibraries when present in project', () => {
            const customLibs: CustomBlockLibrary[] = [
                {
                    name: 'my-blocks',
                    source: { owner: 'user', repo: 'blocks', branch: 'main' },
                },
            ];

            const project: Project = {
                name: 'project-with-custom-libs',
                created: new Date(),
                lastModified: new Date(),
                path: '/path/to/project',
                status: 'ready',
                componentSelections: {},
                componentConfigs: {},
                customBlockLibraries: customLibs,
            };

            const result = extractSettingsFromProject(project);

            expect(result.customBlockLibraries).toEqual(customLibs);
        });

        it('should omit customBlockLibraries when absent from project', () => {
            const project: Project = {
                name: 'project-without-custom-libs',
                created: new Date(),
                lastModified: new Date(),
                path: '/path/to/project',
                status: 'ready',
                componentSelections: {},
                componentConfigs: {},
                // No customBlockLibraries
            };

            const result = extractSettingsFromProject(project);

            expect(result.customBlockLibraries).toBeUndefined();
        });

        it('should round-trip: export then parse preserves customBlockLibraries', () => {
            const customLibs: CustomBlockLibrary[] = [
                {
                    name: 'partner-blocks',
                    source: {
                        owner: 'partner',
                        repo: 'blocks',
                        branch: 'develop',
                    },
                },
                {
                    name: 'internal-blocks',
                    source: { owner: 'corp', repo: 'blocks', branch: 'main' },
                },
            ];

            const project: Project = {
                name: 'roundtrip-project',
                created: new Date(),
                lastModified: new Date(),
                path: '/path/to/project',
                status: 'ready',
                componentSelections: {},
                componentConfigs: {},
                customBlockLibraries: customLibs,
            };

            // Export (serialize)
            const exported = extractSettingsFromProject(project);
            const json = JSON.stringify(exported);

            // Import (the one reader)
            expect(readBack(json).file.customBlockLibraries).toEqual(customLibs);
        });
    });

    describe('extractSettingsFromProject - installedBlockLibraries handling', () => {
        // Install tracking (commit SHA, block ids) describes THIS project's checkout.
        // Nothing reads it back from a settings file — a project built from one
        // records its own on install — so it is not exported (PL-56b).
        it('leaves install tracking out of the settings, even when the project has it', () => {
            const project: Project = {
                name: 'project-with-installed-libs',
                created: new Date(),
                lastModified: new Date(),
                path: '/path/to/project',
                status: 'ready',
                componentSelections: {},
                componentConfigs: {},
                installedBlockLibraries: [
                    {
                        name: 'Isle5',
                        source: { owner: 'adobe', repo: 'isle5', branch: 'main' },
                        commitSha: 'abc123',
                        blockIds: ['hero-cta', 'newsletter'],
                        installedAt: '2025-06-15T10:30:00.000Z',
                    },
                ],
            };

            const result = extractSettingsFromProject(project);

            expect(result).not.toHaveProperty('installedBlockLibraries');
        });
    });

    describe('createExportSettings', () => {
        const project: Project = {
            name: 'export-test',
            created: new Date(),
            lastModified: new Date(),
            path: '/path/to/project',
            status: 'ready',
            componentSelections: {},
            componentConfigs: {},
        };

        it('should include extension version in source', () => {
            const result = createExportSettings(project, '1.2.3');

            expect(result.source.extension).toBe('1.2.3');
        });

        it('writes a version-2 project file that reads back as one, not as a migration', () => {
            const read = readBack(JSON.stringify(createExportSettings(project, '1.2.3')));

            expect(read.file.kind).toBe('project');
            expect(read.file.version).toBe(PROJECT_FILE_VERSION);
            expect(read.migratedFrom).toBeUndefined();
        });

        it('carries what the version-1 file dropped: title, Commerce, store structure, datapack, prompts', () => {
            const full = createMockProject({
                name: 'full',
                title: 'Full Demo',
                commerce: {
                    type: 'software-as-a-service',
                    instance: {
                        url: 'https://example.invalid',
                        environmentId: 'env-1',
                        storeView: 'us',
                        websiteCode: 'base',
                        storeCode: 'main',
                    },
                },
                commerceStoreStructure: { websites: [], storeGroups: [], storeViews: [] },
                datapack: { name: 'catalog', version: '1.0.0' },
                aiPrompts: [{ id: 'p1', title: 'Explain', prompt: 'Explain this demo' }],
            });

            const file = createExportSettings(full, '1.2.3');

            expect(file.title).toBe('Full Demo');
            expect(file.source.title).toBe('Full Demo');
            expect(file.commerce).toStrictEqual(full.commerce);
            expect(file.commerceStoreStructure).toStrictEqual(full.commerceStoreStructure);
            expect(file.datapack).toStrictEqual(full.datapack);
            expect(file.aiPrompts).toStrictEqual(full.aiPrompts);
        });

        it('writes the Adobe org and workspace NAMES, which version 1 read and never wrote', () => {
            const file = createExportSettings(
                createMockProject({
                    adobe: { organization: 'ORG', organizationName: 'Example Org', workspace: 'W', workspaceName: 'Stage' },
                }),
                '1.2.3',
            );

            expect(file.adobe?.orgName).toBe('Example Org');
            expect(file.adobe?.workspaceName).toBe('Stage');
        });

        it('carries the storefront as provenance only, never as a setting', () => {
            const file = createExportSettings(
                createMockProject({
                    componentInstances: {
                        'eds-storefront': {
                            ...edsStorefrontInstance(),
                            metadata: { githubRepo: 'acme-org/demo-storefront', daLiveOrg: 'acme' },
                        },
                    },
                }),
                '1.2.3',
            );

            expect(file.source.storefront).toStrictEqual({
                githubRepo: 'acme-org/demo-storefront',
                daLiveOrg: 'acme',
                daLiveSite: 'demo-storefront',
            });
            expect(file).not.toHaveProperty('edsConfig');
        });
    });

    /**
     * An exported file never carries a credential (owner decision D24, PL-56c).
     *
     * There used to be an `includeSecrets` flag. First it controlled only the
     * `includesSecrets` label while configs went out whole; then it was fixed to
     * strip; and on a project whose credentials had moved to SecretStorage,
     * "with secrets" wrote none and still stamped the file as carrying them. The
     * flag and the stamp are gone: the file is credential-free whoever asks.
     */
    describe('an exported file never carries a credential', () => {
        const withSecrets: Project = createMockProject({
            name: 'secret-test',
            created: new Date(),
            lastModified: new Date(),
            path: '/path/to/project',
            status: 'ready',
            componentSelections: {},
            componentConfigs: {
                'adobe-commerce-paas': {
                    ADOBE_COMMERCE_URL: 'https://shop.example.com',
                    ADOBE_COMMERCE_ADMIN_USERNAME: 'admin',
                    ADOBE_COMMERCE_ADMIN_PASSWORD: 'fake-test-pw-not-a-secret',
                    ADOBE_CATALOG_API_KEY: 'catalog-key-value',
                },
                'adobe-commerce-accs': {
                    ACCS_GRAPHQL_ENDPOINT: 'https://example.invalid/graphql',
                    ACCS_OAUTH_CLIENT_SECRET: 'fake-test-pw-not-a-secret',
                },
                'some-integration': {
                    ACO_API_KEY: 'aco-key-value',
                    EXPERIENCE_PLATFORM_API_KEY: 'ep-key-value',
                },
            },
        });

        it('the fixture holds every registered credential key — control', () => {
            // If SECRET_ENV_KEYS grows and this fixture does not, the test below
            // would pass without checking the new key.
            const held = Object.values(withSecrets.componentConfigs ?? {}).flatMap((c) =>
                Object.keys(c),
            );
            expect(SECRET_ENV_KEYS.filter((key) => !held.includes(key))).toStrictEqual([]);
        });

        it('has no SECRET_ENV_KEYS key present in any component config', () => {
            const result = createExportSettings(withSecrets, '1.0.0');

            const present = Object.values(result.configs).flatMap((config) =>
                Object.keys(config).filter((key) => SECRET_ENV_KEYS.includes(key)),
            );
            expect(present).toStrictEqual([]);
            expect(JSON.stringify(result)).not.toContain('fake-test-pw-not-a-secret');
        });

        it('carries no includesSecrets stamp', () => {
            expect(createExportSettings(withSecrets, '1.0.0')).not.toHaveProperty(
                'includesSecrets',
            );
        });

        it('keeps non-secret config so the file is still importable', () => {
            const result = createExportSettings(withSecrets, '1.0.0');

            const paas = result.configs['adobe-commerce-paas'];
            expect(paas.ADOBE_COMMERCE_URL).toBe('https://shop.example.com');
            // A username is half a credential, not a secret — and re-import needs it.
            expect(paas.ADOBE_COMMERCE_ADMIN_USERNAME).toBe('admin');
        });

        it('does not mutate the live project when stripping', () => {
            // A mutating strip would empty the running project's credentials.
            createExportSettings(withSecrets, '1.0.0');

            expect(
                withSecrets.componentConfigs?.['adobe-commerce-paas'].ADOBE_COMMERCE_ADMIN_PASSWORD
            ).toBe('fake-test-pw-not-a-secret');
        });

        it('the in-memory copy/edit seed keeps what the SC typed (it is not a file)', () => {
            // Copy-from-project and Edit feed the wizard on the same machine and
            // never touch disk; stripping here would blank the Commerce fields.
            const result = extractSettingsFromProject(withSecrets);

            expect(result.configs['adobe-commerce-paas'].ADOBE_COMMERCE_ADMIN_PASSWORD).toBe(
                'fake-test-pw-not-a-secret'
            );
        });
    });

    describe('extractSettingsFromProject - selectedPackage handling', () => {
        it('should preserve selectedPackage from project when set', () => {
            const project: Project = {
                name: 'modern-project',
                created: new Date(),
                lastModified: new Date(),
                path: '/path/to/project',
                status: 'ready',
                componentSelections: { frontend: 'eds-storefront' },
                componentConfigs: {},
                selectedPackage: 'citisignal',
                selectedStack: 'eds-paas',
                componentInstances: {
                    'eds-storefront': {
                        id: 'eds-storefront',
                        name: 'EDS Storefront',
                        type: 'frontend',
                        status: 'ready',
                        lastUpdated: new Date(),
                        metadata: {
                            templateOwner: 'demo-system-stores',
                            templateRepo: 'accs-citisignal',
                        },
                    },
                },
            };

            const result = extractSettingsFromProject(project);

            expect(result.selectedPackage).toBe('citisignal');
        });

        it('should return undefined selectedPackage when no EDS metadata', () => {
            const project: Project = {
                name: 'headless-project',
                created: new Date(),
                lastModified: new Date(),
                path: '/path/to/project',
                status: 'ready',
                componentSelections: { frontend: 'headless' },
                componentConfigs: {},
                // No selectedPackage and no EDS metadata
                selectedStack: 'headless-paas',
            };

            const result = extractSettingsFromProject(project);

            expect(result.selectedPackage).toBeUndefined();
        });
    });

    describe('extractSettingsFromProject - edsConfig extraction', () => {
        const edsMetadata = {
            daLiveOrg: 'acme',
            daLiveSite: 'demo-storefront',
            githubRepo: 'acme-org/demo-storefront',
            repoUrl: 'https://github.com/acme-org/demo-storefront',
            // Derived from brand+stack on import, so deliberately NOT exported.
            templateOwner: 'demo-system-stores',
            templateRepo: 'accs-citisignal',
        };

        function projectWithEdsMetadata(metadata: Record<string, unknown>): Project {
            return createMockProject({
                componentInstances: {
                    'eds-storefront': { ...edsStorefrontInstance(), metadata },
                },
            });
        }

        it('maps the eds-storefront metadata into edsConfig', () => {
            // The whole object, not a field: this is the shape an import reads
            // back, and the derived template fields must not ride along.
            const result = extractSettingsFromProject(projectWithEdsMetadata(edsMetadata));

            expect(result.edsConfig).toEqual({
                daLiveOrg: 'acme',
                daLiveSite: 'demo-storefront',
                githubOwner: 'acme-org',
                repoName: 'demo-storefront',
                repoUrl: 'https://github.com/acme-org/demo-storefront',
            });
        });

        // THE regression this derivation exists for. The loader STRIPS daLiveSite
        // on load (the site name IS the repo name), so every migrated project
        // reaches here without one. Read raw, that gave the edit wizard an
        // incomplete storefront config and a refusal at the LAST step, after the
        // SC had walked the whole wizard with nothing wrong on screen (owner,
        // 2026-09-20, on Bodea).
        it('derives the DA.live site from the repo when the metadata has none', () => {
            const { daLiveSite: _stripped, ...withoutSite } = edsMetadata;

            const result = extractSettingsFromProject(projectWithEdsMetadata(withoutSite));

            expect(result.edsConfig).toEqual({
                daLiveOrg: 'acme',
                daLiveSite: 'demo-storefront',
                githubOwner: 'acme-org',
                repoName: 'demo-storefront',
                repoUrl: 'https://github.com/acme-org/demo-storefront',
            });
        });

        // The org half of the same rule: republish and the agent's storefront
        // tools both fall back to the repo OWNER, because the DA.live org is the
        // GitHub namespace. Bodea had one stored, so this half never bit — a
        // project without one would have died at the same step.
        it('derives the DA.live org from the repo owner when the metadata has none', () => {
            const { daLiveOrg: _stripped, ...withoutOrg } = edsMetadata;

            const result = extractSettingsFromProject(projectWithEdsMetadata(withoutOrg));

            expect(result.edsConfig?.daLiveOrg).toBe('acme-org');
        });

        // An unmigrated project's own site name still wins: there the DA content
        // really does live somewhere other than the repo name.
        it('keeps a stored site name that differs from the repo', () => {
            const result = extractSettingsFromProject(projectWithEdsMetadata({ ...edsMetadata, daLiveSite: 'somewhere-else' }));

            expect(result.edsConfig?.daLiveSite).toBe('somewhere-else');
        });

        it('splits githubRepo on the slash — owner first, repo second', () => {
            const result = extractSettingsFromProject(projectWithEdsMetadata({ githubRepo: 'owner-side/repo-side' }));

            expect(result.edsConfig?.githubOwner).toBe('owner-side');
            expect(result.edsConfig?.repoName).toBe('repo-side');
        });

        it('leaves owner and repo undefined when there is no githubRepo', () => {
            const result = extractSettingsFromProject(projectWithEdsMetadata({ daLiveOrg: 'acme' }));

            expect(result.edsConfig?.githubOwner).toBeUndefined();
            expect(result.edsConfig?.repoName).toBeUndefined();
        });

        it('omits edsConfig when the instance carries no metadata', () => {
            const noMetadata = createMockProject({
                componentInstances: { 'eds-storefront': edsStorefrontInstance() },
            });

            expect(extractSettingsFromProject(noMetadata).edsConfig).toBeUndefined();
        });

        it('reads the eds-storefront instance BY ID and no other', () => {
            // The control. A same-shaped instance under a different id must not
            // be mistaken for the storefront.
            const otherComponent = createMockProject({
                componentInstances: {
                    'adobe-commerce-accs': { ...edsStorefrontInstance(), metadata: edsMetadata },
                },
            });

            expect(extractSettingsFromProject(otherComponent).edsConfig).toBeUndefined();
        });
    });

    describe('getSuggestedFilename', () => {
        it('should create valid filename from project name', () => {
            expect(getSuggestedFilename('my-project')).toBe('my-project.project.demo-builder.json');
        });

        it('should convert to lowercase', () => {
            expect(getSuggestedFilename('My-Project')).toBe('my-project.project.demo-builder.json');
        });

        it('should replace spaces and special characters', () => {
            expect(getSuggestedFilename('My Project! @#$')).toBe('my-project.project.demo-builder.json');
        });

        it('should collapse multiple hyphens', () => {
            expect(getSuggestedFilename('my--project---name')).toBe(
                'my-project-name.project.demo-builder.json'
            );
        });

        it('should trim leading and trailing hyphens', () => {
            expect(getSuggestedFilename('-my-project-')).toBe('my-project.project.demo-builder.json');
        });

        it('should use default name for empty string', () => {
            expect(getSuggestedFilename('')).toBe('project.project.demo-builder.json');
        });

        it('should use default name for all special characters', () => {
            expect(getSuggestedFilename('!@#$%^&*()')).toBe('project.project.demo-builder.json');
        });
    });
});
