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
import type { HandlerContext, PrerequisiteCheckState } from '@/types/handlers';
import type { PrerequisiteDefinition } from '@/features/prerequisites/services/types';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

const DOCKER: PrerequisiteDefinition = {
    id: 'docker',
    name: 'Docker',
    description: 'containers',
    optional: true,
    check: { command: 'docker --version' },
};
const NODE: PrerequisiteDefinition = {
    id: 'node',
    name: 'Node.js',
    description: 'runtime',
    check: { command: 'node --version' },
};

/** Resolved order is deterministic from config — docker sits at index 1 here. */
const RESOLVED = [NODE, DOCKER];

function createContext(): HandlerContext {
    return createMockHandlerContext({
        errorLogger: { logError: jest.fn() } as unknown as HandlerContext['errorLogger'],
        // Empty, exactly as the headless factory leaves it
        // (`headlessHandlerContext.ts`: `{ isAuthenticating: false }`). Nothing in
        // the id path may depend on this being populated.
        sharedState: { isAuthenticating: false },
        panel: undefined,
        // No PrerequisitesManager builder exists; four methods stand in for it.
        prereqManager: {
            loadConfig: jest.fn().mockResolvedValue({ prerequisites: RESOLVED }),
            resolveDependencies: jest.fn(() => RESOLVED),
            getInstallSteps: jest.fn(() => ({ manual: true, url: 'https://example.test/docker' })),
            checkPrerequisite: jest.fn(),
        } as unknown as HandlerContext['prereqManager'],
    });
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
        ctx.sharedState.currentPrerequisiteStates = new Map<number, PrerequisiteCheckState>([
            [
                0,
                {
                    prereq: NODE,
                    result: {
                        id: 'node',
                        name: 'Node.js',
                        description: 'runtime',
                        installed: true,
                        optional: false,
                        canInstall: false,
                    },
                },
            ],
        ]);

        const result = await handleInstallPrerequisite(ctx, {
            prerequisiteId: 'docker',
            prereqId: 0,
        });

        expect(result.data).toMatchObject({ prerequisite: 'Docker' });
    });

    /**
     * An agent can ask for a prerequisite before anything has loaded the config — the
     * headless context builds fresh per call and nothing guarantees a prior read. When
     * that read comes back with nothing, the resolver must still be handed a LIST, not
     * a missing value, and the answer must be "no such prerequisite" rather than a
     * crash inside dependency resolution.
     */
    it('answers cleanly when the config read comes back empty', async () => {
        const ctx = createContext();
        (ctx.prereqManager!.loadConfig as jest.Mock).mockResolvedValue(undefined);
        (ctx.prereqManager!.resolveDependencies as jest.Mock).mockReturnValue([]);

        const result = await handleInstallPrerequisite(ctx, { prerequisiteId: 'docker' });

        // Asserting the ARGUMENT: the empty list is the whole point. Handing the
        // resolver `undefined` instead is invisible against a mock and throws against
        // the real one.
        expect(ctx.prereqManager!.resolveDependencies).toHaveBeenCalledWith([]);
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/docker/);
    });

});
