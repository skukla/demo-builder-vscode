/**
 * ProjectDashboardWebviewCommand — the payload the dashboard is built from.
 *
 * Everything on the dashboard is decided once, here, and never recomputed: which
 * tiles exist, which URLs they open, whether the Sample Data tile is offered at
 * all. Three independent signals can each turn the mesh tile on, and a project
 * can be missing any field in the chain, so the assertions below are about which
 * SIGNAL produced the answer rather than the answer alone.
 */

import * as vscode from 'vscode';
import { ProjectDashboardWebviewCommand } from '@/features/dashboard/commands/showDashboard';
import { ConfigurationLoader } from '@/core/config/ConfigurationLoader';
import { loadDemoPackages } from '@/features/components/services/demoPackageLoader';
import { isDataInstallerConfigured } from '@/features/data-installer/services/dataInstallerConfig';
import type { Project } from '@/types/base';
import type { DashboardInitialData } from '@/types/webviewPayloads';
import { internals } from '../../../helpers/commandInternals';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

jest.mock('@/features/components/services/demoPackageLoader', () => ({
    loadDemoPackages: jest.fn(async () => []),
}));
jest.mock('@/core/config/ConfigurationLoader', () => ({
    ConfigurationLoader: jest.fn().mockImplementation(() => ({
        load: jest.fn().mockResolvedValue({ stacks: [] }),
    })),
}));
jest.mock('@/features/data-installer/services/dataInstallerConfig', () => ({
    isDataInstallerConfigured: jest.fn(() => true),
}));
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getEwCanvasBranch: jest.fn(() => ''),
    resolveProjectAuthoringExperience: jest.fn(() => 'da-live-classic'),
}));

/** The command, wired to a given project. */
function commandFor(project: Project | undefined): ProjectDashboardWebviewCommand {
    const stateManager = createMockStateManager({
        getCurrentProject: jest.fn().mockResolvedValue(project),
    });
    return new ProjectDashboardWebviewCommand(
        createMockExtensionContext({}, '/mock/extension/path'),
        stateManager,
        createMockLogger()
    );
}

function initialData(project: Project | undefined): Promise<DashboardInitialData> {
    return internals(commandFor(project)).getInitialData<DashboardInitialData>();
}

describe('ProjectDashboardWebviewCommand - getInitialData', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (loadDemoPackages as jest.Mock).mockResolvedValue([]);
        (isDataInstallerConfigured as jest.Mock).mockReturnValue(true);
        (ConfigurationLoader as jest.Mock).mockImplementation(() => ({
            load: jest.fn().mockResolvedValue({ stacks: [] }),
        }));
        vscode.window.activeColorTheme = { kind: vscode.ColorThemeKind.Dark };
    });

    describe('theme', () => {
        it('reports the dark theme as dark', async () => {
            expect((await initialData(createMockProject())).theme).toBe('dark');
        });

        it('reports every non-dark theme as light', async () => {
            vscode.window.activeColorTheme = { kind: vscode.ColorThemeKind.HighContrastLight };

            expect((await initialData(createMockProject())).theme).toBe('light');
        });
    });

    describe('hasMesh — three independent signals', () => {
        it('is true for a DEPLOYED mesh component instance', async () => {
            const project = createMockProject({
                componentInstances: {
                    mesh: {
                        id: 'mesh',
                        name: 'API Mesh',
                        status: 'ready',
                        subType: 'mesh',
                    },
                } as Project['componentInstances'],
            });

            expect((await initialData(project)).hasMesh).toBe(true);
        });

        it('ignores a component instance that is not a mesh', async () => {
            const project = createMockProject({
                componentInstances: {
                    api: { id: 'api', name: 'API', status: 'ready', subType: 'service' },
                } as Project['componentInstances'],
            });

            expect((await initialData(project)).hasMesh).toBe(false);
        });

        it('is true from a SELECTED mesh dependency before anything is deployed', async () => {
            const project = createMockProject({
                componentInstances: {},
                componentSelections: { dependencies: ['api-mesh'] },
            });

            expect((await initialData(project)).hasMesh).toBe(true);
        });

        it('ignores selected dependencies that are not mesh', async () => {
            const project = createMockProject({
                componentInstances: {},
                componentSelections: { dependencies: ['adobe-commerce-accs'] },
            });

            expect((await initialData(project)).hasMesh).toBe(false);
        });

        it('is false for a project with no instances, no keyed mesh and no dependencies', async () => {
            expect((await initialData(createMockProject({ componentInstances: {} }))).hasMesh).toBe(
                false
            );
        });

        it('is false — not a crash — when there is no project at all', async () => {
            const data = await initialData(undefined);

            expect(data.hasMesh).toBe(false);
            expect(data.project).toBeNull();
        });
    });

    describe('project summary', () => {
        it('sends the display name and path for a real project', async () => {
            const data = await initialData(
                createMockProject({ name: 'citisignal', path: '/projects/citisignal' })
            );

            expect(data.project).toEqual({
                name: expect.any(String),
                path: '/projects/citisignal',
            });
        });

        it('telegraphs the org check only for a project that HAS an Adobe org', async () => {
            const withOrg = await initialData(
                createMockProject({ adobe: { organization: 'Acme' } })
            );
            const withoutOrg = await initialData(createMockProject({ adobe: undefined }));

            expect(withOrg.hasAdobeContext).toBe(true);
            expect(withoutOrg.hasAdobeContext).toBe(false);
        });

        it('forwards the persisted storefront status so the tile opens in the right state', async () => {
            const data = await initialData(
                createMockProject({ edsStorefrontStatusSummary: 'update-declined' })
            );

            expect(data.initialEdsStorefrontStatus).toBe('update-declined');
        });

        it('forwards the keyed appBuilderComponents map that seeds the integrations tile', async () => {
            const components = {
                'erp-sync': {
                    kind: 'integration' as const,
                    status: 'deployed' as const,
                    source: { owner: 'acme', repo: 'erp' },
                },
            };

            const data = await initialData(createMockProject({ appBuilderComponents: components }));

            expect(data.appBuilderComponents).toEqual(components);
        });

        it('sends no components map for a project that has none', async () => {
            const data = await initialData(createMockProject({ appBuilderComponents: undefined }));

            expect(data.appBuilderComponents).toBeUndefined();
        });

        it('offers the Sample Data tile only when the data installer is configured', async () => {
            (isDataInstallerConfigured as jest.Mock).mockReturnValue(false);

            expect((await initialData(createMockProject())).dataInstallerAvailable).toBe(false);
        });
    });

    describe('package and stack names', () => {
        it('sends neither name for a project that selected neither', async () => {
            const data = await initialData(
                createMockProject({ selectedPackage: undefined, selectedStack: undefined })
            );

            expect(data.packageName).toBeUndefined();
            expect(data.stackName).toBeUndefined();
            // Nothing is loaded when there is nothing to resolve.
            expect(loadDemoPackages).not.toHaveBeenCalled();
            expect(ConfigurationLoader).not.toHaveBeenCalled();
        });

        it('resolves the package id to its display name', async () => {
            (loadDemoPackages as jest.Mock).mockResolvedValue([
                { id: 'citisignal', name: 'CitiSignal' },
                { id: 'bodea', name: 'Bodea' },
            ]);

            const data = await initialData(
                createMockProject({ selectedPackage: 'bodea', selectedStack: undefined })
            );

            expect(data.packageName).toBe('Bodea');
        });

        it('never loads the package catalog for a stack-only project', async () => {
            await initialData(
                createMockProject({ selectedPackage: undefined, selectedStack: 'eds-accs' })
            );

            expect(loadDemoPackages).not.toHaveBeenCalled();
        });

        it('never loads the stacks config for a package-only project', async () => {
            await initialData(
                createMockProject({ selectedPackage: 'citisignal', selectedStack: undefined })
            );

            expect(ConfigurationLoader).not.toHaveBeenCalled();
        });

        it('still resolves the STACK when the package id is unknown', async () => {
            (loadDemoPackages as jest.Mock).mockResolvedValue([]);
            (ConfigurationLoader as jest.Mock).mockImplementation(() => ({
                load: jest.fn().mockResolvedValue({ stacks: [{ id: 'eds-accs', name: 'EDS' }] }),
            }));

            const data = await initialData(
                createMockProject({ selectedPackage: 'retired', selectedStack: 'eds-accs' })
            );

            // An unresolvable package must not take the stack name down with it —
            // the whole resolver shares one catch.
            expect(data.packageName).toBeUndefined();
            expect(data.stackName).toBe('EDS');
        });

        it('still resolves the PACKAGE when the stack id is unknown', async () => {
            (loadDemoPackages as jest.Mock).mockResolvedValue([
                { id: 'citisignal', name: 'CitiSignal' },
            ]);
            (ConfigurationLoader as jest.Mock).mockImplementation(() => ({
                load: jest.fn().mockResolvedValue({ stacks: [] }),
            }));

            const data = await initialData(
                createMockProject({ selectedPackage: 'citisignal', selectedStack: 'retired' })
            );

            expect(data.packageName).toBe('CitiSignal');
            expect(data.stackName).toBeUndefined();
        });

        it('hides the package field when the id matches nothing in the catalog', async () => {
            (loadDemoPackages as jest.Mock).mockResolvedValue([{ id: 'citisignal', name: 'C' }]);

            const data = await initialData(
                createMockProject({ selectedPackage: 'retired-package' })
            );

            expect(data.packageName).toBeUndefined();
        });

        it('resolves the stack id from the stacks config, loaded from the extension path', async () => {
            (ConfigurationLoader as jest.Mock).mockImplementation(() => ({
                load: jest.fn().mockResolvedValue({
                    stacks: [
                        { id: 'eds-accs', name: 'EDS + ACCS' },
                        { id: 'nextjs-accs', name: 'Next.js + ACCS' },
                    ],
                }),
            }));

            const data = await initialData(
                createMockProject({ selectedPackage: undefined, selectedStack: 'nextjs-accs' })
            );

            expect(data.stackName).toBe('Next.js + ACCS');
            expect(ConfigurationLoader).toHaveBeenCalledWith(
                '/mock/extension/path/src/features/project-creation/config/stacks.json'
            );
        });

        it('hides the stack field when the id matches nothing in the config', async () => {
            (ConfigurationLoader as jest.Mock).mockImplementation(() => ({
                load: jest.fn().mockResolvedValue({ stacks: [{ id: 'eds-accs', name: 'E' }] }),
            }));

            const data = await initialData(createMockProject({ selectedStack: 'retired-stack' }));

            expect(data.stackName).toBeUndefined();
        });

        it('hides BOTH fields rather than failing the dashboard when a load throws', async () => {
            (loadDemoPackages as jest.Mock).mockRejectedValue(new Error('config missing'));

            const data = await initialData(
                createMockProject({ selectedPackage: 'citisignal', selectedStack: 'eds-accs' })
            );

            expect(data.packageName).toBeUndefined();
            expect(data.stackName).toBeUndefined();
        });
    });
});
