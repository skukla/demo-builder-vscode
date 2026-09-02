/**
 * The projects-list staleness read must be org-targeted, per project.
 *
 * `orgContextEnv`'s docblock is explicit that an unwrapped `aio` path is not
 * "untargeted, therefore harmless": the CLI falls back to its process-global
 * `aio console where` selection, which this extension deliberately stopped
 * writing, so it holds whatever an earlier session or another tool left there.
 * That is how deployMeshHeadless deployed into a DELETED project for two days.
 *
 * The WRITE paths were wrapped after that incident; this READ path was not.
 * Evidence from one user session (2026-08-04) — the same api-mesh:describe,
 * the same mesh, minutes apart:
 *
 *   21:34:03  code=2  "Unable to get mesh details"   <- status/startup, unwrapped
 *   21:34:55  code=0  succeeded                      <- deploy path, wrapped
 *
 * `detectMeshChanges` reaches the CLI whenever the staleness baseline is empty
 * (it fetches the deployed config to establish one), which is every mesh added
 * from the dashboard before the record-parity fix.
 *
 * These assert the WRAPPING, not the CLI result: the wrap is the contract, and
 * its absence is invisible from the outside because an unwrapped call still
 * "works" whenever the ambient selection happens to be right.
 */

import * as os from 'os';
import * as path from 'path';
import { handleGetProjects } from './dashboardHandlers.testUtils';
import { createProjectsDashboardProject, createProjectsDashboardContext } from '../testUtils';

// Org targeting is ambient (AsyncLocalStorage), so the only way to observe it is
// to watch the wrapper. Pass-through, so the wrapped work still runs.
const mockWithOrgContext = jest.fn((_t: unknown, fn: () => Promise<unknown>) => fn());
const mockBuildOrgTarget = jest.fn((adobe?: { organization?: string }) => ({
    orgId: adobe?.organization ?? '',
}));
jest.mock('@/core/shell/orgContextEnv', () => ({
    ...jest.requireActual('@/core/shell/orgContextEnv'),
    withOrgContext: (t: unknown, fn: () => Promise<unknown>) => mockWithOrgContext(t, fn),
    buildOrgTargetFromProjectAdobe: (adobe?: { organization?: string }) =>
        mockBuildOrgTarget(adobe),
}));

describe('handleGetProjects — org targeting', () => {
    describe('mesh staleness enrichment', () => {
        // `detectMeshChanges` reaches the `aio` CLI whenever the staleness baseline
        // is empty (it fetches the deployed config to establish one). Unwrapped,
        // that call inherits the CLI's process-global console selection — which
        // this extension deliberately stopped writing — so it queries whatever org
        // some earlier session left selected. Observed 2026-08-04: the same
        // api-mesh:describe returned code=2 here and code=0 inside the deploy's
        // wrapper, minutes apart, against the same mesh.
        it('runs the staleness read inside withOrgContext', async () => {
            const { hasMeshDeploymentRecord } = require('@/core/state/appBuilderComponentState');
            const { determineMeshStatus } = require('@/features/mesh/services/meshStatusResolver');
            const { detectMeshChanges } = require('@/features/mesh/services/stalenessDetector');

            const project = createProjectsDashboardProject({
                componentConfigs: { 'api-mesh': { SOME_VAR: 'value' } },
                adobe: { organization: 'org-A', projectId: 'p1', projectName: 'p1', workspace: 'w1', authenticated: true },
            });
            const context = createProjectsDashboardContext([project]);

            hasMeshDeploymentRecord.mockReturnValue(true);
            detectMeshChanges.mockResolvedValue({ hasChanges: false });
            determineMeshStatus.mockResolvedValue('deployed');

            await handleGetProjects(context);

            expect(mockWithOrgContext).toHaveBeenCalled();
            expect(mockBuildOrgTarget).toHaveBeenCalledWith(
                expect.objectContaining({ organization: 'org-A' })
            );
        });

        // The loop walks EVERY project, so one wrapper around the whole loop would
        // target every project at the first one's org — which is worse than no
        // wrapper, because it would confidently query the wrong org.
        it('targets each project at its OWN org, not the first one seen', async () => {
            const { hasMeshDeploymentRecord } = require('@/core/state/appBuilderComponentState');
            const { determineMeshStatus } = require('@/features/mesh/services/meshStatusResolver');
            const { detectMeshChanges } = require('@/features/mesh/services/stalenessDetector');

            const projectA = createProjectsDashboardProject({
                name: 'a',
                path: path.join(os.homedir(), '.demo-builder', 'projects', 'a'),
                componentConfigs: { 'api-mesh': { V: '1' } },
                adobe: { organization: 'org-A', projectId: 'p1', projectName: 'p1', workspace: 'w1', authenticated: true },
            });
            const projectB = createProjectsDashboardProject({
                name: 'b',
                path: path.join(os.homedir(), '.demo-builder', 'projects', 'b'),
                componentConfigs: { 'api-mesh': { V: '2' } },
                adobe: { organization: 'org-B', projectId: 'p2', projectName: 'p2', workspace: 'w2', authenticated: true },
            });
            const context = createProjectsDashboardContext([projectA, projectB]);

            hasMeshDeploymentRecord.mockReturnValue(true);
            detectMeshChanges.mockResolvedValue({ hasChanges: false });
            determineMeshStatus.mockResolvedValue('deployed');

            await handleGetProjects(context);

            const orgs = mockBuildOrgTarget.mock.calls.map(([adobe]) => adobe?.organization);
            expect(orgs).toEqual(expect.arrayContaining(['org-A', 'org-B']));
        });

    });
});
