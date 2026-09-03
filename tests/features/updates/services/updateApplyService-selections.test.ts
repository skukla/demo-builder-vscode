/**
 * updateApplyService.computeProjectUpdateSelections — one project, every
 * checker, each category degrading on its own.
 *
 * What each checker is built with and asked, which answers become a selection
 * and in what shape, and that a throwing checker costs only its own category.
 * Plus countSelections, the number the MCP tool reports.
 */

// FIRST: this module owns the jest.mock calls the imports below must see.
import {
    AddonUpdateCheckerCtor,
    AdobeMcpUpdateCheckerCtor,
    ForkSyncServiceCtor,
    TemplateUpdateCheckerCtor,
    UpdateManagerCtor,
    edsProject,
    emptySelections,
    installedLibrary,
    mockCheckAllProjectsForUpdates,
    mockCheckBlockLibraries,
    mockCheckForkStatus,
    mockCheckInspectorSdk,
    mockCheckMcpUpdates,
    mockCheckTemplateUpdates,
    resetFakes,
} from './updateApplyService.testUtils';
import {
    computeProjectUpdateSelections,
    countSelections,
} from '@/features/updates/services/updateApplyService';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';

const RELEASE = {
    version: '2.0.0',
    downloadUrl: 'https://example.com/mesh.zip',
    releaseNotes: '',
    publishedAt: '',
    isPrerelease: false,
};

function componentResult(overrides: Record<string, unknown> = {}, project = edsProject()) {
    return {
        componentId: 'mesh',
        latestVersion: '2.0.0',
        releaseInfo: RELEASE,
        outdatedProjects: [{ project, currentVersion: '1.0.0' }],
        ...overrides,
    };
}

beforeEach(() => {
    resetFakes();
});

describe('computeProjectUpdateSelections', () => {
    it('with every checker silent, selects nothing, counts zero, and warns about nothing', async () => {
        const handlerCtx = createMockHandlerContext();

        const sel = await computeProjectUpdateSelections(edsProject(), handlerCtx);

        expect(sel).toEqual(emptySelections());
        expect(countSelections(sel)).toBe(0);
        expect(handlerCtx.logger.warn).not.toHaveBeenCalled();
    });

    it('builds every checker from the handler context secrets and logger', async () => {
        const handlerCtx = createMockHandlerContext();

        await computeProjectUpdateSelections(edsProject(), handlerCtx);

        const { secrets } = handlerCtx.context;
        expect(ForkSyncServiceCtor).toHaveBeenCalledWith(secrets, handlerCtx.logger);
        expect(TemplateUpdateCheckerCtor).toHaveBeenCalledWith(secrets, handlerCtx.logger);
        expect(UpdateManagerCtor).toHaveBeenCalledWith(handlerCtx.context, handlerCtx.logger);
        expect(AdobeMcpUpdateCheckerCtor).toHaveBeenCalledWith(secrets, handlerCtx.logger);
        expect(AddonUpdateCheckerCtor).toHaveBeenCalledWith(secrets, handlerCtx.logger);
    });

    describe('fork sync', () => {
        it('asks about the template source repo and selects a behind-upstream fork on its branch', async () => {
            mockCheckForkStatus.mockResolvedValue({
                isFork: true,
                behindBy: 3,
                defaultBranch: 'develop',
            });

            const sel = await computeProjectUpdateSelections(
                edsProject(),
                createMockHandlerContext()
            );

            expect(mockCheckForkStatus).toHaveBeenCalledWith('adobe', 'aem-boilerplate-commerce');
            expect(sel.forkSync).toEqual([
                { owner: 'adobe', repo: 'aem-boilerplate-commerce', branch: 'develop' },
            ]);
        });

        it('falls back to main when the status names no default branch', async () => {
            mockCheckForkStatus.mockResolvedValue({ isFork: true, behindBy: 1 });

            const sel = await computeProjectUpdateSelections(
                edsProject(),
                createMockHandlerContext()
            );

            expect(sel.forkSync[0].branch).toBe('main');
        });

        it.each([
            ['not a fork', { isFork: false, behindBy: 2 }],
            ['a fork that is up to date', { isFork: true, behindBy: 0 }],
            ['no status at all', null],
        ])('selects nothing for %s, without warning', async (_label, status) => {
            mockCheckForkStatus.mockResolvedValue(status);
            const handlerCtx = createMockHandlerContext();

            const sel = await computeProjectUpdateSelections(edsProject(), handlerCtx);

            expect(sel.forkSync).toEqual([]);
            expect(handlerCtx.logger.warn).not.toHaveBeenCalled();
        });

        it('does not ask at all for a project without a template source', async () => {
            const handlerCtx = createMockHandlerContext();

            const sel = await computeProjectUpdateSelections(
                createMockProject({ componentInstances: {} }),
                handlerCtx
            );

            expect(mockCheckForkStatus).not.toHaveBeenCalled();
            expect(sel.forkSync).toEqual([]);
            expect(handlerCtx.logger.warn).not.toHaveBeenCalled();
        });
    });

    describe('template', () => {
        it('selects the project when the checker reports updates', async () => {
            const project = edsProject();
            mockCheckTemplateUpdates.mockResolvedValue({ hasUpdates: true, commitsBehind: 2 });

            const sel = await computeProjectUpdateSelections(project, createMockHandlerContext());

            expect(mockCheckTemplateUpdates).toHaveBeenCalledWith(project);
            expect(sel.template).toEqual([{ project }]);
        });

        it('selects nothing when it reports none', async () => {
            mockCheckTemplateUpdates.mockResolvedValue({ hasUpdates: false, commitsBehind: 0 });

            const sel = await computeProjectUpdateSelections(
                edsProject(),
                createMockHandlerContext()
            );

            expect(sel.template).toEqual([]);
        });
    });

    describe('components', () => {
        it('asks the update manager about this project only, and selects an outdated component with a download', async () => {
            const project = edsProject();
            mockCheckAllProjectsForUpdates.mockResolvedValue([componentResult({}, project)]);

            const sel = await computeProjectUpdateSelections(project, createMockHandlerContext());

            expect(mockCheckAllProjectsForUpdates).toHaveBeenCalledWith([project]);
            expect(sel.component).toEqual([
                {
                    project,
                    componentId: 'mesh',
                    latestVersion: '2.0.0',
                    downloadUrl: 'https://example.com/mesh.zip',
                },
            ]);
        });

        it('selects the component when THIS project is one of several outdated ones', async () => {
            const project = edsProject();
            mockCheckAllProjectsForUpdates.mockResolvedValue([
                componentResult({
                    outdatedProjects: [
                        { project: edsProject({ path: '/p/other' }), currentVersion: '1.0.0' },
                        { project, currentVersion: '1.0.0' },
                    ],
                }),
            ]);

            const sel = await computeProjectUpdateSelections(project, createMockHandlerContext());

            expect(sel.component).toHaveLength(1);
        });

        it.each([
            [
                'the outdated project is a different one',
                componentResult({}, edsProject({ path: '/p/other' })),
            ],
            ['there is no release to download', componentResult({ releaseInfo: undefined })],
        ])('selects nothing when %s, without warning', async (_label, result) => {
            mockCheckAllProjectsForUpdates.mockResolvedValue([result]);
            const handlerCtx = createMockHandlerContext();

            const sel = await computeProjectUpdateSelections(edsProject(), handlerCtx);

            expect(sel.component).toEqual([]);
            expect(handlerCtx.logger.warn).not.toHaveBeenCalled();
        });
    });

    describe('Adobe MCP', () => {
        it('selects the package and version the checker reports', async () => {
            const project = edsProject();
            mockCheckMcpUpdates.mockResolvedValue({
                hasUpdate: true,
                currentVersion: '1.0.0',
                latestVersion: '1.1.0',
                packageName: 'pkg',
            });

            const sel = await computeProjectUpdateSelections(project, createMockHandlerContext());

            expect(mockCheckMcpUpdates).toHaveBeenCalledWith(project);
            expect(sel.adobeMcp).toEqual([{ project, packageName: 'pkg', latestVersion: '1.1.0' }]);
        });

        it('selects nothing when the checker reports no update', async () => {
            mockCheckMcpUpdates.mockResolvedValue({
                hasUpdate: false,
                currentVersion: '1.0.0',
                latestVersion: '1.0.0',
                packageName: 'pkg',
            });

            const sel = await computeProjectUpdateSelections(
                edsProject(),
                createMockHandlerContext()
            );

            expect(sel.adobeMcp).toEqual([]);
        });
    });

    describe('add-ons', () => {
        it('selects each behind library with its latest commit, and the inspector SDK when it has an update', async () => {
            const project = edsProject();
            const lib = installedLibrary('Lib A');
            mockCheckBlockLibraries.mockResolvedValue([
                { library: lib, latestCommit: 'bbb', commitsBehind: 1 },
            ]);
            mockCheckInspectorSdk.mockResolvedValue({
                hasUpdate: true,
                currentCommit: 'old',
                latestCommit: 'sdk-new',
                commitsBehind: 2,
            });

            const sel = await computeProjectUpdateSelections(project, createMockHandlerContext());

            expect(mockCheckBlockLibraries).toHaveBeenCalledWith(project);
            expect(mockCheckInspectorSdk).toHaveBeenCalledWith(project);
            expect(sel.blockLibrary).toEqual([{ project, library: lib, latestCommit: 'bbb' }]);
            expect(sel.inspector).toEqual([{ project, latestCommit: 'sdk-new' }]);
        });

        it('selects no inspector update when the SDK is current', async () => {
            mockCheckInspectorSdk.mockResolvedValue({
                hasUpdate: false,
                currentCommit: 'x',
                latestCommit: 'x',
                commitsBehind: 0,
            });

            const sel = await computeProjectUpdateSelections(
                edsProject(),
                createMockHandlerContext()
            );

            expect(sel.inspector).toEqual([]);
        });
    });

    describe('a failing checker costs only its own category', () => {
        function everythingHasAnUpdate(project: ReturnType<typeof edsProject>): void {
            mockCheckForkStatus.mockResolvedValue({ isFork: true, behindBy: 1 });
            mockCheckTemplateUpdates.mockResolvedValue({ hasUpdates: true });
            mockCheckAllProjectsForUpdates.mockResolvedValue([componentResult({}, project)]);
            mockCheckMcpUpdates.mockResolvedValue({
                hasUpdate: true,
                latestVersion: '2',
                packageName: 'p',
            });
            mockCheckBlockLibraries.mockResolvedValue([
                { library: installedLibrary('Lib A'), latestCommit: 'b', commitsBehind: 1 },
            ]);
            mockCheckInspectorSdk.mockResolvedValue({ hasUpdate: true, latestCommit: 'n' });
        }

        it.each([
            ['fork', mockCheckForkStatus, 'forkSync'],
            ['template', mockCheckTemplateUpdates, 'template'],
            ['component', mockCheckAllProjectsForUpdates, 'component'],
            ['Adobe MCP', mockCheckMcpUpdates, 'adobeMcp'],
            ['add-on', mockCheckBlockLibraries, 'blockLibrary'],
        ] as const)(
            'a throwing %s checker empties only that category and warns once',
            async (_label, checker, category) => {
                const project = edsProject();
                const handlerCtx = createMockHandlerContext();
                everythingHasAnUpdate(project);
                checker.mockRejectedValue(new Error('boom'));

                const sel = await computeProjectUpdateSelections(project, handlerCtx);

                expect(sel[category]).toEqual([]);
                const others = (Object.keys(sel) as Array<keyof typeof sel>).filter(
                    (k) => k !== category && !(category === 'blockLibrary' && k === 'inspector')
                );
                for (const k of others) expect(sel[k]).toHaveLength(1);
                expect(handlerCtx.logger.warn).toHaveBeenCalledTimes(1);
            }
        );

        it('with nothing failing, every category is selected and counted', async () => {
            const project = edsProject();
            everythingHasAnUpdate(project);

            const sel = await computeProjectUpdateSelections(project, createMockHandlerContext());

            expect(countSelections(sel)).toBe(6);
        });
    });
});

describe('countSelections', () => {
    it('adds every category, weighting none', () => {
        const project = edsProject();
        const sel = {
            forkSync: [{ owner: 'a', repo: 'b', branch: 'main' }],
            template: [{ project }, { project }],
            component: [],
            adobeMcp: [{ project, packageName: 'p', latestVersion: '1' }],
            blockLibrary: [
                { project, library: installedLibrary('x'), latestCommit: 'c' },
                { project, library: installedLibrary('y'), latestCommit: 'c' },
                { project, library: installedLibrary('z'), latestCommit: 'c' },
            ],
            inspector: [{ project, latestCommit: 'c' }],
        };

        expect(countSelections(sel)).toBe(8);
    });
});
