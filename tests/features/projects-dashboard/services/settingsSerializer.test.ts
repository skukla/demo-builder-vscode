/**
 * settingsSerializer — core parse/validate/extract/export slice.
 *
 * The App Builder integration derivation tests (§E: appBuilderComponentSources
 * derived from the keyed map + additionalConsoleApis) live in the sibling
 * settingsSerializer-integrations.test.ts.
 */

import {
    parseSettingsFile,
    isValidSettingsFile,
    isNewerVersion,
    extractSettingsFromProject,
    createExportSettings,
    getSuggestedFilename,
} from '@/features/projects-dashboard/services/settingsSerializer';
import type { Project } from '@/types/base';
import { SETTINGS_FILE_VERSION } from '@/types/settingsFile';
import type { CustomBlockLibrary } from '@/types/blockLibraries';

describe('settingsSerializer', () => {
    describe('parseSettingsFile', () => {
        it('should parse valid JSON settings file', () => {
            const json = JSON.stringify({
                version: 1,
                exportedAt: '2024-01-01T00:00:00Z',
                source: { project: 'test' },
                includesSecrets: false,
                selections: {},
                configs: {},
            });

            const result = parseSettingsFile(json);

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.settings.version).toBe(1);
            }
        });

        it('should return error for invalid JSON', () => {
            const result = parseSettingsFile('{ invalid json }');

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toContain('corrupted');
            }
        });

        it('should return error for non-settings object', () => {
            const json = JSON.stringify({ foo: 'bar' });

            const result = parseSettingsFile(json);

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toContain('Demo Builder settings');
            }
        });
    });

    describe('isValidSettingsFile', () => {
        it('should return true for valid settings structure', () => {
            expect(isValidSettingsFile({ version: 1 })).toBe(true);
        });

        it('should return false for null', () => {
            expect(isValidSettingsFile(null)).toBe(false);
        });

        it('should return false for non-object', () => {
            expect(isValidSettingsFile('string')).toBe(false);
            expect(isValidSettingsFile(123)).toBe(false);
        });

        it('should return false for missing version', () => {
            expect(isValidSettingsFile({})).toBe(false);
        });

        it('should return false for non-numeric version', () => {
            expect(isValidSettingsFile({ version: 'v1' })).toBe(false);
        });
    });

    describe('isNewerVersion', () => {
        it('should return true when version is newer', () => {
            const settings = { version: SETTINGS_FILE_VERSION + 1 } as any;
            expect(isNewerVersion(settings)).toBe(true);
        });

        it('should return false when version is current', () => {
            const settings = { version: SETTINGS_FILE_VERSION } as any;
            expect(isNewerVersion(settings)).toBe(false);
        });

        it('should return false when version is older', () => {
            const settings = { version: SETTINGS_FILE_VERSION - 1 } as any;
            expect(isNewerVersion(settings)).toBe(false);
        });
    });

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

            const result = extractSettingsFromProject(project, false);

            expect(result.version).toBe(SETTINGS_FILE_VERSION);
            expect(result.source.project).toBe('test-project');
            expect(result.selections).toEqual(project.componentSelections);
            expect(result.configs).toEqual(project.componentConfigs);
        });

        it('should include includesSecrets flag', () => {
            const project = createProject();

            const withSecrets = extractSettingsFromProject(project, true);
            const withoutSecrets = extractSettingsFromProject(project, false);

            expect(withSecrets.includesSecrets).toBe(true);
            expect(withoutSecrets.includesSecrets).toBe(false);
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

            const result = extractSettingsFromProject(project, false);

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

            const result = extractSettingsFromProject(project, false);

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

            const result = extractSettingsFromProject(project, false);

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

            const result = extractSettingsFromProject(project, false);

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

            const result = extractSettingsFromProject(project, false);

            expect(result.adobe).toBeUndefined();
        });

        it('should handle empty component selections', () => {
            const project = createProject({
                componentSelections: undefined,
                componentConfigs: undefined,
            });

            const result = extractSettingsFromProject(project, false);

            expect(result.selections).toEqual({});
            expect(result.configs).toEqual({});
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

            const result = extractSettingsFromProject(project, false);

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

            const result = extractSettingsFromProject(project, false);

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
            const exported = extractSettingsFromProject(project, false);
            const json = JSON.stringify(exported);

            // Import (parse)
            const parseResult = parseSettingsFile(json);
            expect(parseResult.success).toBe(true);
            if (parseResult.success) {
                expect(parseResult.settings.customBlockLibraries).toEqual(customLibs);
            }
        });
    });

    describe('extractSettingsFromProject - installedBlockLibraries handling', () => {
        it('should include installedBlockLibraries when present in project', () => {
            const installedLibs = [
                {
                    name: 'Isle5',
                    source: { owner: 'adobe', repo: 'isle5', branch: 'main' },
                    commitSha: 'abc123',
                    blockIds: ['hero-cta', 'newsletter'],
                    installedAt: '2025-06-15T10:30:00.000Z',
                },
            ];

            const project: Project = {
                name: 'project-with-installed-libs',
                created: new Date(),
                lastModified: new Date(),
                path: '/path/to/project',
                status: 'ready',
                componentSelections: {},
                componentConfigs: {},
                installedBlockLibraries: installedLibs,
            };

            const result = extractSettingsFromProject(project, false);

            expect(result.installedBlockLibraries).toEqual(installedLibs);
        });

        it('should omit installedBlockLibraries when absent from project', () => {
            const project: Project = {
                name: 'project-without-installed-libs',
                created: new Date(),
                lastModified: new Date(),
                path: '/path/to/project',
                status: 'ready',
                componentSelections: {},
                componentConfigs: {},
            };

            const result = extractSettingsFromProject(project, false);

            expect(result.installedBlockLibraries).toBeUndefined();
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
            const result = createExportSettings(project, '1.2.3', false);

            expect(result.source.extension).toBe('1.2.3');
        });

        it('should allow including secrets when requested', () => {
            const result = createExportSettings(project, '1.0.0', true);

            expect(result.includesSecrets).toBe(true);
        });
    });

    /**
     * The `includesSecrets` label used to be the ONLY thing the flag controlled —
     * configs were emitted whole either way. So `includeSecrets: false` produced a
     * file containing the admin password and stamped it `includesSecrets: false`,
     * against an MCP description promising "a secret-free copy". These pin the
     * label and the content agreeing.
     */
    describe('includeSecrets actually removes secret values', () => {
        const withSecrets: Project = {
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
                'some-integration': {
                    ACO_API_KEY: 'aco-key-value',
                    EXPERIENCE_PLATFORM_API_KEY: 'ep-key-value',
                },
            },
        } as unknown as Project;

        it('strips every secret-valued key when includeSecrets is false', () => {
            const result = extractSettingsFromProject(withSecrets, false);

            const paas = result.configs['adobe-commerce-paas'];
            expect(paas.ADOBE_COMMERCE_ADMIN_PASSWORD).toBeUndefined();
            // Typed `text` in components.json, so a `type: 'password'` filter would
            // have missed it and shipped a key in a "secret-free" file.
            expect(paas.ADOBE_CATALOG_API_KEY).toBeUndefined();
            const integration = result.configs['some-integration'];
            expect(integration.ACO_API_KEY).toBeUndefined();
            expect(integration.EXPERIENCE_PLATFORM_API_KEY).toBeUndefined();
        });

        it('keeps non-secret config so the file is still importable', () => {
            const result = extractSettingsFromProject(withSecrets, false);

            const paas = result.configs['adobe-commerce-paas'];
            expect(paas.ADOBE_COMMERCE_URL).toBe('https://shop.example.com');
            // A username is half a credential, not a secret — and re-import needs it.
            expect(paas.ADOBE_COMMERCE_ADMIN_USERNAME).toBe('admin');
        });

        it('keeps secrets when includeSecrets is true (the local-backup case)', () => {
            const result = extractSettingsFromProject(withSecrets, true);

            expect(result.configs['adobe-commerce-paas'].ADOBE_COMMERCE_ADMIN_PASSWORD).toBe(
                'fake-test-pw-not-a-secret'
            );
            expect(result.includesSecrets).toBe(true);
        });

        it('does not mutate the live project when stripping', () => {
            // Callers hand this `project.componentConfigs` directly; a mutating
            // strip would empty the running project's credentials.
            extractSettingsFromProject(withSecrets, false);

            expect(
                withSecrets.componentConfigs?.['adobe-commerce-paas'].ADOBE_COMMERCE_ADMIN_PASSWORD
            ).toBe('fake-test-pw-not-a-secret');
        });

        it('the label never claims secret-free while carrying a secret', () => {
            // The invariant the defect violated, stated directly.
            for (const flag of [true, false]) {
                const result = extractSettingsFromProject(withSecrets, flag);
                const hasSecret = Object.values(result.configs).some(
                    (c) => c.ADOBE_COMMERCE_ADMIN_PASSWORD !== undefined
                );
                expect(hasSecret).toBe(result.includesSecrets);
            }
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

            const result = extractSettingsFromProject(project, false);

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

            const result = extractSettingsFromProject(project, false);

            expect(result.selectedPackage).toBeUndefined();
        });
    });

    describe('getSuggestedFilename', () => {
        it('should create valid filename from project name', () => {
            expect(getSuggestedFilename('my-project')).toBe('my-project.demo-builder.json');
        });

        it('should convert to lowercase', () => {
            expect(getSuggestedFilename('My-Project')).toBe('my-project.demo-builder.json');
        });

        it('should replace spaces and special characters', () => {
            expect(getSuggestedFilename('My Project! @#$')).toBe('my-project.demo-builder.json');
        });

        it('should collapse multiple hyphens', () => {
            expect(getSuggestedFilename('my--project---name')).toBe(
                'my-project-name.demo-builder.json'
            );
        });

        it('should trim leading and trailing hyphens', () => {
            expect(getSuggestedFilename('-my-project-')).toBe('my-project.demo-builder.json');
        });

        it('should use default name for empty string', () => {
            expect(getSuggestedFilename('')).toBe('project.demo-builder.json');
        });

        it('should use default name for all special characters', () => {
            expect(getSuggestedFilename('!@#$%^&*()')).toBe('project.demo-builder.json');
        });
    });
});
