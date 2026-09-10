/**
 * Prerequisites Check Handler — decision coverage (PL-22): The per-prerequisite loop: ordering, error recovery and the completion summary.
 *
 * The pre-existing checkHandler suites assert with `expect.objectContaining`, so most
 * fields of the payloads the handler builds are unconstrained: flipping a ternary or
 * deleting a mapped property leaves every one of them green. These suites assert the
 * WHOLE payload the handler hands to `sendMessage`, and the ARGUMENTS it hands to its
 * collaborators, for each branch of each decision the handler makes.
 */


jest.mock('@/features/prerequisites/handlers/shared', () => {
    const actual = jest.requireActual('@/features/prerequisites/handlers/shared');
    return {
        ...actual,
        getNodeVersionMapping: jest.fn(),
        getNodeVersionIdMapping: jest.fn(),
        checkPerNodeVersionStatus: jest.fn(),
        areDependenciesInstalled: jest.fn(),
        hasNodeVersions: jest.fn(),
        getNodeVersionKeys: jest.fn(),
        getPluginNodeVersions: jest.fn(),
        handlePrerequisiteCheckError: jest.fn(),
    };
});

jest.mock('@/features/components/services/demoPackageLoader', () => ({
    getStackById: jest.fn(),
}));

jest.mock('@/core/utils/sleep', () => ({ sleep: jest.fn().mockResolvedValue(undefined) }));

import { handleCheckPrerequisites } from '@/features/prerequisites/handlers/checkHandler';
import * as shared from '@/features/prerequisites/handlers/shared';
import { getStackById } from '@/features/components/services/demoPackageLoader';
import { sleep } from '@/core/utils/sleep';
import { cleanupTests } from './checkHandler.testUtils';
import { payloadsOfType, contextFor, NODE_PREREQ, GIT_PREREQ, status } from './checkHandler-decisions.testUtils';
import type { PrerequisiteDefinition } from '@/features/prerequisites/services/PrerequisitesManager';

beforeEach(() => {
    jest.clearAllMocks();
    (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({});
    (shared.getNodeVersionIdMapping as jest.Mock).mockResolvedValue({});
    (shared.areDependenciesInstalled as jest.Mock).mockReturnValue(true);
    (shared.hasNodeVersions as jest.Mock).mockImplementation(
        (m: Record<string, string>) => !!m && Object.keys(m).length > 0,
    );
    (shared.handlePrerequisiteCheckError as jest.Mock).mockResolvedValue(undefined);
    (getStackById as jest.Mock).mockReturnValue(undefined);
    (sleep as jest.Mock).mockResolvedValue(undefined);
});

afterEach(() => {
    cleanupTests();
});

describe('the check loop', () => {
    it('announces every prerequisite as checking before reporting any result', async () => {
        const context = contextFor([GIT_PREREQ, { ...GIT_PREREQ, id: 'curl', name: 'curl' } as PrerequisiteDefinition]);
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(
            status({ id: 'x', name: 'x', installed: true }),
        );

        await handleCheckPrerequisites(context);

        const sent = payloadsOfType(context, 'prerequisite-status') as Record<string, unknown>[];
        expect(sent.map((p) => [p.index, p.status])).toEqual([
            [0, 'checking'], [0, 'success'], [1, 'checking'], [1, 'success'],
        ]);
        expect(sent[0]).toEqual({
            index: 0, name: 'Git', status: 'checking', description: 'Version control', required: true,
        });
    });

    it('hands the failing prerequisite, its index and the error to the shared error path, then carries on', async () => {
        const boom = new Error('check exploded');
        const context = contextFor([GIT_PREREQ, { ...GIT_PREREQ, id: 'curl', name: 'curl' } as PrerequisiteDefinition]);
        (context.prereqManager!.checkPrerequisite as jest.Mock)
            .mockRejectedValueOnce(boom)
            .mockResolvedValueOnce(status({ id: 'curl', name: 'curl', installed: true }));

        const result = await handleCheckPrerequisites(context);

        expect(shared.handlePrerequisiteCheckError).toHaveBeenCalledWith(context, GIT_PREREQ, 0, boom);
        expect(result).toEqual({ success: true });
        const sent = payloadsOfType(context, 'prerequisite-status') as Record<string, unknown>[];
        expect(sent.map((p) => [p.index, p.status])).toEqual([
            [0, 'checking'], [1, 'checking'], [1, 'success'],
        ]);
    });

    it('leaves a failed prerequisite out of the completion summary entirely', async () => {
        const context = contextFor([GIT_PREREQ]);
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockRejectedValue(new Error('x'));

        await handleCheckPrerequisites(context);

        expect(payloadsOfType(context, 'prerequisites-complete')).toEqual([
            { allInstalled: true, prerequisites: [] },
        ]);
    });

    it('records no result for a prerequisite the manager answers about with nothing', async () => {
        const context = contextFor([GIT_PREREQ]);
        (context.prereqManager!.checkPrerequisite as jest.Mock).mockResolvedValue(undefined);

        await handleCheckPrerequisites(context);

        const sent = payloadsOfType(context, 'prerequisite-status') as Record<string, unknown>[];
        expect(sent.map((p) => p.status)).toEqual(['checking']);
        expect(payloadsOfType(context, 'prerequisites-complete')).toEqual([
            { allInstalled: true, prerequisites: [] },
        ]);
    });

    it('summarises each checked prerequisite by index, id, requiredness, version and installability', async () => {
        const optionalCurl = { ...GIT_PREREQ, id: 'curl', name: 'curl', optional: true } as PrerequisiteDefinition;
        const context = contextFor([GIT_PREREQ, optionalCurl]);
        (context.prereqManager!.checkPrerequisite as jest.Mock)
            .mockResolvedValueOnce(status({ id: 'git', name: 'Git', installed: true, version: '2.4' }))
            .mockResolvedValueOnce(status({
                id: 'curl', name: 'curl', installed: false, canInstall: true, optional: true,
            }));

        await handleCheckPrerequisites(context);

        expect(payloadsOfType(context, 'prerequisites-complete')).toEqual([
            {
                allInstalled: true,
                prerequisites: [
                    { id: 0, prereqId: 'git', name: 'Git', required: true, installed: true, version: '2.4', canInstall: false },
                    { id: 1, prereqId: 'curl', name: 'curl', required: false, installed: false, version: undefined, canInstall: true },
                ],
            },
        ]);
    });

    it('reports allInstalled false when a REQUIRED prerequisite is missing', async () => {
        const context = contextFor([GIT_PREREQ, { ...GIT_PREREQ, id: 'curl', name: 'curl' } as PrerequisiteDefinition]);
        (context.prereqManager!.checkPrerequisite as jest.Mock)
            .mockResolvedValueOnce(status({ id: 'git', name: 'Git', installed: true }))
            .mockResolvedValueOnce(status({ id: 'curl', name: 'curl', installed: false }));

        await handleCheckPrerequisites(context);

        expect((payloadsOfType(context, 'prerequisites-complete')[0] as Record<string, unknown>).allInstalled).toBe(false);
    });

    it('reports allInstalled true when the only missing prerequisite is optional', async () => {
        const optionalCurl = { ...GIT_PREREQ, id: 'curl', name: 'curl', optional: true } as PrerequisiteDefinition;
        const context = contextFor([GIT_PREREQ, optionalCurl]);
        (context.prereqManager!.checkPrerequisite as jest.Mock)
            .mockResolvedValueOnce(status({ id: 'git', name: 'Git', installed: true }))
            .mockResolvedValueOnce(status({ id: 'curl', name: 'curl', installed: false, optional: true }));

        await handleCheckPrerequisites(context);

        expect((payloadsOfType(context, 'prerequisites-complete')[0] as Record<string, unknown>).allInstalled).toBe(true);
    });

    it('records the Node check’s own version list, not the per-node variant list, for Node', async () => {
        (shared.getNodeVersionMapping as jest.Mock).mockResolvedValue({ '20': 'backend' });
        const context = contextFor([NODE_PREREQ]);
        const versions = [{ version: 'Node 20', component: 'backend', installed: true }];
        (context.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockResolvedValue(versions);

        await handleCheckPrerequisites(context);

        expect(context.sharedState.currentPrerequisiteStates!.get(0)).toEqual({
            prereq: NODE_PREREQ,
            result: expect.objectContaining({ id: 'node', installed: true }),
            nodeVersionStatus: versions,
        });
    });
});

