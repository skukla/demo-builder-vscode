/**
 * Deleting a storefront's repository AND AEM's copy of its code (EDS-67).
 *
 * AEM keeps its own copy of a site's code. Deleting the repository leaves it there:
 * after skukla/scratch-1022-b was deleted, `scripts/aem.js` still answered 200 on
 * aem.live while every page answered 404. The Admin API removes code one file at a
 * time, so the files have to be known, and once the repository is gone nothing can
 * list them. Hence the order these pin:
 *
 *   1. list the repository's files (it still exists);
 *   2. delete the repository;
 *   3. delete each file from the code bus;
 *   4. ask aem.live for `scripts/aem.js` and say whether it still answers.
 *
 * Whether a DELETE is refused while the file still exists in GitHub is unknown, which
 * is why 3 comes after 2 and not before. Every assertion reads what a collaborator was
 * handed, or the result, never a value a fake made up.
 */

import { OPERATION_STAGES } from '@/core/utils/operationStages';
import {
    deleteStorefrontRepository,
    KEPT_FOR_SITE_CODE,
    KEPT_SIGN_IN_UNCHECKED,
    type CodeRemovalHelix,
    type StorefrontRepoDeletionDeps,
} from '@/features/eds/services/storefront/storefrontCodeRemoval';
import { createMockLogger } from '../../../../helpers/loggerFake';

const TARGET = { owner: 'acme', repo: 'site' };
const TREE = ['scripts/aem.js', 'scripts/scripts.js', 'styles/styles.css', 'head.html'];

/** One shared timeline, so the ORDER across collaborators can be read back. */
let calls: string[];

function deps(over: Partial<StorefrontRepoDeletionDeps> = {}): StorefrontRepoDeletionDeps & {
    helix: { deleteCode: jest.Mock };
} {
    const helix = {
        deleteCode: jest.fn(async (_o: string, _r: string, path: string) => {
            calls.push(`deleteCode ${path}`);
        }),
    };
    return {
        files: {
            listRepoFiles: jest.fn(async () => {
                calls.push('listRepoFiles');
                return TREE.map((path) => ({ path }));
            }),
        },
        deleteRepository: jest.fn(async () => {
            calls.push('deleteRepository');
        }),
        tokenProvider: { getAccessToken: async () => 'da-live-token' },
        checkSignIn: jest.fn(async () => 'valid' as const),
        logger: createMockLogger(),
        makeHelix: jest.fn((): CodeRemovalHelix => helix),
        checkLive: jest.fn(async (url: string) => {
            calls.push(`checkLive ${url}`);
            return 404;
        }),
        ...over,
        helix,
    };
}

beforeEach(() => {
    calls = [];
});

describe('the order', () => {
    it('lists the files, deletes the repository, then removes each file and checks the live site', async () => {
        const d = deps();

        await deleteStorefrontRepository(TARGET, d);

        expect(calls[0]).toBe('listRepoFiles');
        expect(calls[1]).toBe('deleteRepository');
        expect(calls.slice(2, 6).sort()).toStrictEqual(
            ['/head.html', '/scripts/aem.js', '/scripts/scripts.js', '/styles/styles.css'].map((p) => `deleteCode ${p}`),
        );
        expect(calls[6]).toMatch(/^checkLive /);
        expect(calls).toHaveLength(7);
    });

    it('lists and deletes THE repository, on main, and removes its code from the same site', async () => {
        const d = deps();

        await deleteStorefrontRepository(TARGET, d);

        expect(d.files.listRepoFiles).toHaveBeenCalledWith('acme', 'site', 'main');
        expect(d.deleteRepository).toHaveBeenCalledWith('acme', 'site');
        for (const path of TREE) {
            expect(d.helix.deleteCode).toHaveBeenCalledWith('acme', 'site', `/${path}`, 'main');
        }
    });

    it('builds the Helix client on the DA.live sign-in it was handed', async () => {
        const d = deps({ tokenProvider: { getAccessToken: async () => 'the-da-live-token' } });

        await deleteStorefrontRepository(TARGET, d);

        const [logger, tokenProvider] = (d.makeHelix as jest.Mock).mock.calls[0] as [
            unknown,
            { getAccessToken(): Promise<string | null> },
        ];
        expect(logger).toBe(d.logger);
        expect(await tokenProvider.getAccessToken()).toBe('the-da-live-token');
    });

    it("checks the site's own scripts/aem.js on aem.live, past the CDN cache", async () => {
        const d = deps();

        await deleteStorefrontRepository(TARGET, d);

        const [url] = (d.checkLive as jest.Mock).mock.calls[0] as [string];
        expect(url).toMatch(/^https:\/\/main--site--acme\.aem\.live\/scripts\/aem\.js\?\w+=\d+$/);
    });

    it('reports the step after the repository is gone', async () => {
        const onStep = jest.fn((step: string) => calls.push(`step ${step}`));

        await deleteStorefrontRepository(TARGET, deps({ onStep }));

        expect(onStep).toHaveBeenCalledWith(OPERATION_STAGES.removingSiteCode.label);
        expect(calls.indexOf(`step ${OPERATION_STAGES.removingSiteCode.label}`)).toBe(2);
    });

    it('removes no more than a few files at once', async () => {
        let inFlight = 0;
        let most = 0;
        const many = Array.from({ length: 20 }, (_, i) => ({ path: `blocks/b${i}/b${i}.js` }));
        const d = deps({ files: { listRepoFiles: async () => [{ path: 'scripts/aem.js' }, ...many] } });
        d.helix.deleteCode.mockImplementation(async () => {
            inFlight++;
            most = Math.max(most, inFlight);
            await Promise.resolve();
            inFlight--;
        });

        await deleteStorefrontRepository(TARGET, d);

        expect(d.helix.deleteCode).toHaveBeenCalledTimes(21);
        expect(most).toBeGreaterThan(1);
        expect(most).toBeLessThanOrEqual(5);
    });
});

describe('what it says', () => {
    it('says nothing is left when every file went and aem.live no longer serves the code', async () => {
        const result = await deleteStorefrontRepository(TARGET, deps());

        expect(result.code).toStrictEqual({ removed: 4, failed: [], stillServing: false });
    });

    it('names each file that could not be removed, with why, and says some code may still be served', async () => {
        const d = deps();
        d.helix.deleteCode.mockImplementation(async (_o: string, _r: string, path: string) => {
            if (path === '/styles/styles.css') throw new Error('Failed to delete code /styles/styles.css: 503 Busy');
        });

        const result = await deleteStorefrontRepository(TARGET, d);

        expect(result.code?.removed).toBe(3);
        expect(result.code?.failed).toStrictEqual([
            { path: '/styles/styles.css', reason: 'Failed to delete code /styles/styles.css: 503 Busy' },
        ]);
        expect(result.code?.summary).toMatch(/1 of the site's 4 code files could not be removed from aem\.live/);
    });

    it('says the code still answers when aem.live serves scripts/aem.js after the removal', async () => {
        const result = await deleteStorefrontRepository(TARGET, deps({ checkLive: async () => 200 }));

        expect(result.code?.stillServing).toBe(true);
        expect(result.code?.summary).toMatch(/still serves/);
    });

    it('says it could not tell when aem.live does not answer', async () => {
        const result = await deleteStorefrontRepository(TARGET, deps({ checkLive: async () => 0 }));

        expect(result.code?.stillServing).toBe('unknown');
        expect(result.code?.summary).toMatch(/could not be checked/);
    });
});

// Owner, 2026-10-28: once the repository is gone its files can never be listed again,
// so a storefront deleted without a working DA.live sign-in strands its code for good.
// The same day a forced Adobe sign-in cancelled a DA.live token with 23 hours left, so
// the sign-in is put to IMS, not just looked for.
describe('when there is no working DA.live sign-in', () => {
    it.each([
        ['no DA.live sign-in at all', { tokenProvider: null }],
        ['a DA.live sign-in with no token', { tokenProvider: { getAccessToken: async () => null } }],
        ['a DA.live sign-in that throws', { tokenProvider: { getAccessToken: async () => Promise.reject(new Error('expired')) } }],
        ['a token IMS no longer accepts', { checkSignIn: async () => 'refused' as const }],
    ])('keeps the repository with %s, touches nothing, and says to sign in and delete again', async (_name, over) => {
        const d = deps(over);

        const result = await deleteStorefrontRepository(TARGET, d);

        expect(d.deleteRepository).not.toHaveBeenCalled();
        expect(d.helix.deleteCode).not.toHaveBeenCalled();
        expect(d.checkLive).not.toHaveBeenCalled();
        expect(result).toStrictEqual({ kept: KEPT_FOR_SITE_CODE });
        expect(result.kept).toBe(
            'The repository was kept so its site code can still be removed. Sign in to DA.live and delete again.',
        );
    });

    it('keeps it too when IMS cannot be asked, and says that instead of "sign in"', async () => {
        const d = deps({ checkSignIn: async () => 'unknown' as const });

        const result = await deleteStorefrontRepository(TARGET, d);

        expect(d.deleteRepository).not.toHaveBeenCalled();
        expect(result).toStrictEqual({ kept: KEPT_SIGN_IN_UNCHECKED });
    });

    it('asks IMS about the token the code would be removed with', async () => {
        const d = deps({ tokenProvider: { getAccessToken: async () => 'the-da-live-token' } });

        await deleteStorefrontRepository(TARGET, d);

        expect(d.checkSignIn).toHaveBeenCalledWith('the-da-live-token');
        expect(d.deleteRepository).toHaveBeenCalledTimes(1);
    });

    it('CONTROL: a repository that is not a storefront is deleted with no sign-in at all', async () => {
        const d = deps({
            tokenProvider: null,
            files: { listRepoFiles: async () => [{ path: 'README.md' }] },
        });

        const result = await deleteStorefrontRepository(TARGET, d);

        expect(d.deleteRepository).toHaveBeenCalledWith('acme', 'site');
        expect(d.checkSignIn).not.toHaveBeenCalled();
        expect(result).toStrictEqual({});
    });
});

describe('when the code cannot be removed', () => {
    it('still deletes the repository when its files cannot be listed, and says the code was not removed', async () => {
        const d = deps({
            files: { listRepoFiles: async () => Promise.reject(new Error('GitHub 502')) },
            checkLive: async () => 200,
        });

        const result = await deleteStorefrontRepository(TARGET, d);

        expect(d.deleteRepository).toHaveBeenCalledWith('acme', 'site');
        expect(d.helix.deleteCode).not.toHaveBeenCalled();
        expect(result.code).toMatchObject({ removed: 0, failed: [], stillServing: true });
        expect(result.code?.summary).toMatch(/could not be listed before the repository was deleted/);
    });

    it('removes nothing, and checks nothing, when the repository delete fails: the repository is still there', async () => {
        const d = deps({ deleteRepository: async () => Promise.reject(new Error('403 from GitHub')) });

        await expect(deleteStorefrontRepository(TARGET, d)).rejects.toThrow('403 from GitHub');
        expect(d.helix.deleteCode).not.toHaveBeenCalled();
        expect(d.checkLive).not.toHaveBeenCalled();
    });
});

describe('a repository that is not a storefront', () => {
    it('is deleted with no code removal and no result for it, having no scripts/aem.js', async () => {
        const d = deps({ files: { listRepoFiles: async () => [{ path: 'README.md' }, { path: 'src/index.ts' }] } });

        const result = await deleteStorefrontRepository(TARGET, d);

        expect(d.deleteRepository).toHaveBeenCalledWith('acme', 'site');
        expect(d.helix.deleteCode).not.toHaveBeenCalled();
        expect(d.checkLive).not.toHaveBeenCalled();
        expect(result.code).toBeUndefined();
    });
});
