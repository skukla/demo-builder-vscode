/**
 * updateSelections.computeUpdateSelections — the same check over several projects (PL-80).
 *
 * Check for Updates asks about every project at once. The one-project form the agent uses
 * is this with one project (its suite, `updateSelections.test.ts`, is unchanged). What only
 * the multi-project form can get wrong: a template repository two projects share is one fork
 * sync, components are asked about in one call, and one project's failing check costs that
 * project only.
 */

// FIRST: this module owns the jest.mock calls the imports below must see.
import {
    edsProject,
    mockCheckAllProjectsForUpdates,
    mockCheckForkStatus,
    mockCheckMcpUpdates,
    mockCheckTemplateUpdates,
    recordsIntegrationProbe,
    resetFakes,
} from './updateApplyService.testUtils';
import { computeUpdateSelections } from '@/features/updates/services/updateSelections';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

const RELEASE = {
    version: '2.0.0',
    downloadUrl: 'https://example.com/mesh.zip',
    releaseNotes: '',
    publishedAt: '',
    isPrerelease: false,
};

const alpha = () => edsProject({ name: 'alpha', path: '/p/alpha' });
const beta = () => edsProject({ name: 'beta', path: '/p/beta' });

beforeEach(() => {
    resetFakes();
});

describe('computeUpdateSelections', () => {
    it('asks about a template repository two projects share once, and selects one fork sync', async () => {
        mockCheckForkStatus.mockResolvedValue({ isFork: true, behindBy: 2, defaultBranch: 'main' });

        const sel = await computeUpdateSelections([alpha(), beta()], createMockHandlerContext(), recordsIntegrationProbe());

        expect(mockCheckForkStatus).toHaveBeenCalledTimes(1);
        expect(sel.forkSync).toEqual([{ owner: 'adobe', repo: 'aem-boilerplate-commerce', branch: 'main' }]);
    });

    it('asks the update manager about every project in one call, and selects each outdated one', async () => {
        const [a, b] = [alpha(), beta()];
        mockCheckAllProjectsForUpdates.mockResolvedValue([
            {
                componentId: 'mesh',
                latestVersion: '2.0.0',
                releaseInfo: RELEASE,
                outdatedProjects: [
                    { project: a, currentVersion: '1.0.0' },
                    { project: b, currentVersion: '1.0.0' },
                ],
            },
        ]);

        const sel = await computeUpdateSelections([a, b], createMockHandlerContext(), recordsIntegrationProbe());

        expect(mockCheckAllProjectsForUpdates).toHaveBeenCalledTimes(1);
        expect(mockCheckAllProjectsForUpdates).toHaveBeenCalledWith([a, b]);
        expect(sel.component.map((c) => c.project.path)).toEqual(['/p/alpha', '/p/beta']);
    });

    it('asks each project its own template and Adobe MCP questions, in project order', async () => {
        const [a, b] = [alpha(), beta()];
        mockCheckTemplateUpdates.mockResolvedValue({ hasUpdates: true });
        mockCheckMcpUpdates.mockResolvedValue({ hasUpdate: true, latestVersion: '2', packageName: 'p' });

        const sel = await computeUpdateSelections([a, b], createMockHandlerContext(), recordsIntegrationProbe());

        expect(sel.template.map((t) => t.project.path)).toEqual(['/p/alpha', '/p/beta']);
        expect(sel.adobeMcp.map((m) => m.project.path)).toEqual(['/p/alpha', '/p/beta']);
    });

    it("costs a failing project only its own answer: the other project's template update stays", async () => {
        const [a, b] = [alpha(), beta()];
        mockCheckTemplateUpdates.mockImplementation(async (project: { path: string }) => {
            if (project.path === '/p/alpha') throw new Error('boom');
            return { hasUpdates: true };
        });
        const handlerCtx = createMockHandlerContext();

        const sel = await computeUpdateSelections([a, b], handlerCtx, recordsIntegrationProbe());

        expect(sel.template.map((t) => t.project.path)).toEqual(['/p/beta']);
        expect(handlerCtx.logger.warn).toHaveBeenCalledTimes(1);
    });

    it('selects nothing, and asks nothing, for no projects', async () => {
        const sel = await computeUpdateSelections([], createMockHandlerContext(), recordsIntegrationProbe());

        expect(mockCheckAllProjectsForUpdates).not.toHaveBeenCalled();
        expect(sel.template).toStrictEqual([]);
        expect(sel.component).toStrictEqual([]);
    });
});
