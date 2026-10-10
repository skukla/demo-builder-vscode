/**
 * deployMeshHeadless — what it TELLS its caller while it works.
 *
 * The status telegraph drives the dashboard's mesh badge and the progress
 * callback drives the notification. Both are optional (the deploy_mesh MCP tool
 * passes neither), and both carry a state value the caller branches on, so a
 * wrong one is a wrong badge with no error anywhere. The suite beside this one
 * asserts what gets persisted; this one asserts what gets said, and that saying
 * it to nobody is safe.
 */

import {
    arrangeSuccessfulDeploy,
    deployMeshHeadless,
    deps,
    mockDeploy,
    mockRequiresAppBuilder,
    mockSubscribe,
    useAuthManager,
} from './deployMeshHeadless.testUtils';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import type { Project } from '@/types/base';
import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

/** Any message at all: the wording is free to change, an empty badge is not. */
const SOMETHING_SAID = expect.stringMatching(/\S/);

const DEPLOYED = { success: true, data: { meshId: 'mesh-1', endpoint: 'https://new/graphql' } };

/** A caller without the Developer role, with or without a reason from the probe. */
function withoutDeveloperRole(error?: string): void {
    mockRequiresAppBuilder.mockReturnValue(true);
    useAuthManager(
        createMockAuthenticationService({
            testDeveloperPermissions: jest.fn().mockResolvedValue({ hasPermissions: false, error }),
        }),
    );
}

describe('deployMeshHeadless — status and progress', () => {
    beforeEach(arrangeSuccessfulDeploy);

    describe('the status telegraph', () => {
        it('says deploying before the checks, deploying again at the start, then deployed', async () => {
            // Each call is asserted in its own position: "was called with deploying"
            // is satisfied by either of the first two, so one could say anything.
            const onStatus = jest.fn();

            await deployMeshHeadless(deps({ onStatus }));

            expect(onStatus.mock.calls).toStrictEqual([
                ['deploying', SOMETHING_SAID],
                ['deploying', SOMETHING_SAID],
                ['deployed', undefined, 'https://new/graphql'],
            ]);
        });

        it('says error, with a reason, when the Developer role is missing', async () => {
            withoutDeveloperRole('no role');
            const onStatus = jest.fn();

            await deployMeshHeadless(deps({ onStatus }));

            expect(onStatus.mock.calls).toStrictEqual([
                ['deploying', SOMETHING_SAID],
                ['error', SOMETHING_SAID],
            ]);
        });

        it('says error, with a reason, when the deploy itself fails', async () => {
            mockDeploy.mockResolvedValue({ success: false, error: 'boom' });
            const onStatus = jest.fn();

            await deployMeshHeadless(deps({ onStatus }));

            expect(onStatus).toHaveBeenLastCalledWith('error', SOMETHING_SAID);
        });
    });

    describe('a failure always carries a reason', () => {
        it('gives its own reason when the permission probe reports none', async () => {
            // The probe can answer "no" without saying why. The caller shows
            // `error` as the message, so an empty one is a blank dialog.
            withoutDeveloperRole(undefined);

            const result = await deployMeshHeadless(deps());

            expect(result).toStrictEqual({
                success: false,
                blockedBy: 'permission',
                error: SOMETHING_SAID,
            });
        });

        it('gives its own reason when the deploy fails without one', async () => {
            mockDeploy.mockResolvedValue({ success: false });

            const result = await deployMeshHeadless(deps());

            expect(result).toStrictEqual({ success: false, error: SOMETHING_SAID });
        });
    });

    it('saves the mesh as deploying before the deploy runs', async () => {
        // The first save is what the dashboard reads while the deploy is in flight.
        // The instance is one object mutated later, so the status is read AT the save.
        const statusAtEachSave: (string | undefined)[] = [];
        const saveProject = jest.fn(async (saved: Project) => {
            statusAtEachSave.push(saved.componentInstances?.['commerce-mesh']?.status);
        });

        await deployMeshHeadless(deps({ stateManager: createMockStateManager({ saveProject }) }));

        expect(statusAtEachSave[0]).toBe('deploying');
        expect(mockDeploy.mock.invocationCallOrder[0]).toBeGreaterThan(
            saveProject.mock.invocationCallOrder[0],
        );
    });

    describe('progress from the collaborators', () => {
        it("forwards each of the subscribe's steps under the subscribing stage", async () => {
            const onProgress = jest.fn();
            mockSubscribe.mockImplementation(async (options) => {
                options.onStep?.('Checking API Mesh API');
                return [];
            });

            await deployMeshHeadless(deps({ onProgress }));

            expect(onProgress).toHaveBeenCalledWith(
                OPERATION_STAGES.subscribingApis.label,
                'Checking API Mesh API',
            );
        });

        it("forwards the deploy's own progress lines unchanged", async () => {
            const onProgress = jest.fn();
            mockDeploy.mockImplementation(async (_path, _executor, _logger, report) => {
                report?.('Deploying mesh', 'attempt 2');
                return DEPLOYED;
            });

            await deployMeshHeadless(deps({ onProgress }));

            expect(onProgress).toHaveBeenCalledWith('Deploying mesh', 'attempt 2');
        });

        it('deploys for a caller that listens to nothing, though both collaborators report', async () => {
            // The deploy_mesh MCP tool passes neither callback. The subscribe and the
            // deploy still report, and a report into a missing listener must be a
            // no-op: thrown here, it lands in the catch and persists a mesh error.
            mockSubscribe.mockImplementation(async (options) => {
                options.onStep?.('Checking API Mesh API');
                return [];
            });
            mockDeploy.mockImplementation(async (_path, _executor, _logger, report) => {
                report?.('Deploying mesh');
                return DEPLOYED;
            });

            const result = await deployMeshHeadless(deps());

            expect(result).toStrictEqual({
                success: true,
                meshId: 'mesh-1',
                endpoint: 'https://new/graphql',
            });
        });
    });
});
