/**
 * Addressing an install by the prerequisite's OWN id rather than by index.
 *
 * The index is a position in a list rebuilt per check from the stack and the
 * optional dependencies, and it is looked up in `sharedState` — which the
 * headless context recreates on every call. So an agent addressing by index
 * could only ever fail with "state not found", no matter how correct the index
 * was. That is the defect this path removes.
 *
 * The id path deliberately does NOT read `sharedState`: it re-resolves the list
 * from config, so it works whether or not a check ran first.
 */

jest.mock('vscode', () => ({ env: { openExternal: jest.fn() }, Uri: { parse: (u: string) => ({ url: u }) } }), {
    virtual: true,
});

import { handleInstallPrerequisite } from '@/features/prerequisites/handlers/installHandler';
import type { HandlerContext } from '@/types/handlers';
import { createMockLogger } from '../../../helpers/loggerFake';

const DOCKER = {
    id: 'docker',
    name: 'Docker',
    description: 'containers',
    optional: true,
};
const NODE = { id: 'node', name: 'Node.js', description: 'runtime' };

/** Resolved order is deterministic from config — docker sits at index 1 here. */
const RESOLVED = [NODE, DOCKER];

function createContext(): HandlerContext {
    return {
        logger: createMockLogger(),
        debugLogger: { debug: jest.fn() },
        errorLogger: { logError: jest.fn() },
        sendMessage: jest.fn().mockResolvedValue(undefined),
        // Empty, exactly as the headless factory leaves it. Nothing in the id
        // path may depend on this being populated.
        sharedState: {},
        panel: undefined,
        prereqManager: {
            loadConfig: jest.fn().mockResolvedValue({ prerequisites: RESOLVED }),
            resolveDependencies: jest.fn(() => RESOLVED),
            getInstallSteps: jest.fn(() => ({ manual: true, url: 'https://example.test/docker' })),
            checkPrerequisite: jest.fn(),
        },
    } as unknown as HandlerContext;
}

describe('install-prerequisite addressed by prerequisiteId', () => {
    it('resolves a prerequisite by its id with an EMPTY sharedState', async () => {
        const ctx = createContext();

        const result = await handleInstallPrerequisite(ctx, { prerequisiteId: 'docker' });

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({ manual: true, prerequisite: 'Docker' });
    });

    it('carries the resolved INDEX into the status push', async () => {
        const ctx = createContext();

        await handleInstallPrerequisite(ctx, { prerequisiteId: 'docker' });

        // The index is still the row identity every `prerequisite-status`
        // carries; resolving by id must not make it wrong.
        expect(ctx.sendMessage).toHaveBeenCalledWith(
            'prerequisite-status',
            expect.objectContaining({ index: 1, name: 'Docker' }),
        );
    });

    it('names the unknown id rather than reporting missing state', async () => {
        const ctx = createContext();

        const result = await handleInstallPrerequisite(ctx, { prerequisiteId: 'not-a-prereq' });

        expect(result.success).toBe(false);
        // "state not found for ID undefined" sent the reader looking for a check
        // that never needed to run.
        expect(result.error).toMatch(/not-a-prereq/);
        expect(result.error).toMatch(/check_prerequisites/);
    });

    it('says which address is missing when neither is given', async () => {
        const ctx = createContext();

        const result = await handleInstallPrerequisite(ctx, {});

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/prerequisiteId/);
    });

    it('prefers the id when both addresses are supplied', async () => {
        const ctx = createContext();
        // An index pointing at a DIFFERENT prerequisite, to prove which one won.
        ctx.sharedState.currentPrerequisiteStates = new Map([[0, { prereq: NODE, result: {} }]]) as never;

        const result = await handleInstallPrerequisite(ctx, {
            prerequisiteId: 'docker',
            prereqId: 0,
        });

        expect(result.data).toMatchObject({ prerequisite: 'Docker' });
    });
});
