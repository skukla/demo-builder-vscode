import {
    parseSettingsFile,
    isValidSettingsFile,
    isNewerVersion,
    extractSettingsFromProject,
    createExportSettings,
    getSuggestedFilename,
    inferPackageFromTemplate,
} from '@/features/projects-dashboard/services/settingsSerializer';
import type { Project } from '@/types/base';
import { SETTINGS_FILE_VERSION } from '@/features/projects-dashboard/types/settingsFile';

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

            const result = extractSettingsFromProject(project);

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

            expect(result.selections).toEqual({});
            expect(result.configs).toEqual({});
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

        it('should default includesSecrets to false', () => {
            const result = createExportSettings(project, '1.0.0');

            expect(result.includesSecrets).toBe(false);
        });

        it('should allow including secrets when requested', () => {
            const result = createExportSettings(project, '1.0.0', true);

            expect(result.includesSecrets).toBe(true);
        });
    });

    describe('inferPackageFromTemplate', () => {
        it('should return package ID when template matches', () => {
            // citisignal package has eds-paas storefront with demo-system-stores/accs-citisignal
            const result = inferPackageFromTemplate(
                'demo-system-stores',
                'accs-citisignal',
                'eds-paas',
            );

            expect(result).toBe('citisignal');
        });

        it('should return undefined when no template owner', () => {
            const result = inferPackageFromTemplate(undefined, 'accs-citisignal', 'eds-paas');

            expect(result).toBeUndefined();
        });

        it('should return undefined when no template repo', () => {
            const result = inferPackageFromTemplate('demo-system-stores', undefined, 'eds-paas');

            expect(result).toBeUndefined();
        });

        it('should return undefined when no stack', () => {
            const result = inferPackageFromTemplate('demo-system-stores', 'accs-citisignal', undefined);

            expect(result).toBeUndefined();
        });

        it('should return undefined when no matching package found', () => {
            const result = inferPackageFromTemplate('unknown-owner', 'unknown-repo', 'eds-paas');

            expect(result).toBeUndefined();
        });
    });

    describe('extractSettingsFromProject - backward compatibility', () => {
        it('should infer selectedPackage from EDS metadata when not set', () => {
            const project: Project = {
                name: 'legacy-project',
                created: new Date(),
                lastModified: new Date(),
                path: '/path/to/project',
                status: 'ready',
                componentSelections: { frontend: 'eds-storefront' },
                componentConfigs: {},
                // No selectedPackage - simulates legacy project
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
            expect(result.selectedStack).toBe('eds-paas');
        });

        it('should keep existing selectedPackage when already set', () => {
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
            expect(getSuggestedFilename('my--project---name')).toBe('my-project-name.demo-builder.json');
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
