/**
 * Publish-key renewal sweep.
 *
 * Helix Admin API keys expire in about a year. Until this sweep existed, nothing
 * renewed them: registration happened only on a site config write (setup, reset,
 * repair, rename), so a storefront that simply RAN lost runtime PDP self-heal
 * roughly a year after it was created — staggered per site, silent, and visible
 * only as PDPs that 404.
 *
 * The sweep also owns the stamp. Other registration paths deliberately do not
 * write `publishKeyRegisteredAt`: threading a project through them is exactly
 * the coupling that let two callers forget `registerPublishKey` in the first
 * place. The cost is that the sweep may re-register a key some other path just
 * refreshed — two requests, at most once every 30 days per project.
 */

jest.mock('@/features/eds/services/publishKeyRegistrar', () => ({
    registerPublishKey: jest.fn().mockResolvedValue({ registered: true }),
}));

import {
    renewPublishKeys,
    PUBLISH_KEY_RENEWAL_INTERVAL_MS,
} from '@/features/eds/services/publishKeyRenewalSweep';
import { registerPublishKey } from '@/features/eds/services/publishKeyRegistrar';
import { COMPONENT_IDS } from '@/core/constants';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';

const registerMock = registerPublishKey as jest.Mock;

const NOW = Date.parse('2026-08-15T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
} as unknown as Logger;

function edsProject(name: string, registeredAt?: string, githubRepo = 'skukla/a-store'): Project {
    return {
        name,
        publishKeyRegisteredAt: registeredAt,
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                metadata: { daLiveOrg: 'skukla', daLiveSite: 'a-store', githubRepo },
            },
        },
    } as unknown as Project;
}

/** A project with no EDS storefront at all — a mesh-only or App Builder demo. */
function nonEdsProject(name: string): Project {
    return { name, componentInstances: {} } as unknown as Project;
}

function run(projects: Project[], overrides: Partial<Parameters<typeof renewPublishKeys>[0]> = {}) {
    const saveProject = jest.fn().mockResolvedValue(undefined);
    const tokenProvider = { getAccessToken: jest.fn().mockResolvedValue('da-live-token') };
    const promise = renewPublishKeys({
        projects,
        tokenProvider,
        saveProject,
        logger,
        now: NOW,
        ...overrides,
    });
    return { promise, saveProject, tokenProvider };
}

describe('renewPublishKeys', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        registerMock.mockResolvedValue({ registered: true });
    });

    it('renews a storefront that has never been stamped', async () => {
        // Every storefront created before this feature is in this state, so it is
        // the case that actually runs on the first activation after upgrading.
        const { promise } = run([edsProject('a')]);
        await promise;

        expect(registerMock).toHaveBeenCalledTimes(1);
        expect(registerMock).toHaveBeenCalledWith(
            expect.anything(),
            { owner: 'skukla', repo: 'a-store' },
            logger
        );
    });

    it('leaves a storefront stamped inside the window alone', async () => {
        const fresh = new Date(NOW - 5 * DAY_MS).toISOString();

        const { promise, saveProject } = run([edsProject('a', fresh)]);
        await promise;

        expect(registerMock).not.toHaveBeenCalled();
        expect(saveProject).not.toHaveBeenCalled();
    });

    it('renews a storefront stamped past the window', async () => {
        const stale = new Date(NOW - (PUBLISH_KEY_RENEWAL_INTERVAL_MS + DAY_MS)).toISOString();

        const { promise } = run([edsProject('a', stale)]);
        await promise;

        expect(registerMock).toHaveBeenCalledTimes(1);
    });

    it('stamps and persists the project after a successful renewal', async () => {
        const project = edsProject('a');

        const { promise, saveProject } = run([project]);
        await promise;

        expect(project.publishKeyRegisteredAt).toBe(new Date(NOW).toISOString());
        expect(saveProject).toHaveBeenCalledWith(project);
    });

    it('does NOT stamp when the registration failed', async () => {
        // Stamping a failure would suppress the retry for 30 days — the storefront
        // would sit with a dead key and the sweep would consider it handled.
        registerMock.mockResolvedValue({ registered: false, reason: 'could not mint' });
        const project = edsProject('a');

        const { promise, saveProject } = run([project]);
        await promise;

        expect(project.publishKeyRegisteredAt).toBeUndefined();
        expect(saveProject).not.toHaveBeenCalled();
    });

    it('ignores projects with no EDS storefront', async () => {
        const { promise } = run([nonEdsProject('mesh-only')]);
        await promise;

        expect(registerMock).not.toHaveBeenCalled();
    });

    it('ignores an EDS storefront whose githubRepo is not owner/repo', async () => {
        const { promise } = run([edsProject('a', undefined, 'not-a-pair')]);
        await promise;

        expect(registerMock).not.toHaveBeenCalled();
    });

    it('carries on to the next project when one throws', async () => {
        // `registerPublishKey` is documented never to throw, but a save can. One
        // bad project must not cost every project after it its renewal.
        registerMock
            .mockRejectedValueOnce(new Error('network died'))
            .mockResolvedValue({ registered: true });

        const { promise } = run([edsProject('a'), edsProject('b')]);
        await promise;

        expect(registerMock).toHaveBeenCalledTimes(2);
    });

    it('does nothing at all when there is no DA.live session', async () => {
        // Activation must not nag. Someone who has not signed in for a year is not
        // using the storefront either, and the next config write re-registers.
        const tokenProvider = { getAccessToken: jest.fn().mockResolvedValue(null) };

        const { promise } = run([edsProject('a')], { tokenProvider });
        await promise;

        expect(registerMock).not.toHaveBeenCalled();
        expect(logger.warn).not.toHaveBeenCalled();
    });

    it('does nothing when no token provider could be built', async () => {
        const { promise } = run([edsProject('a')], { tokenProvider: undefined });
        await promise;

        expect(registerMock).not.toHaveBeenCalled();
        expect(logger.warn).not.toHaveBeenCalled();
    });
});
