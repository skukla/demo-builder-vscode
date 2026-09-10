/**
 * DA.live auth — the IMS profile lookup and the email cache.
 *
 * `fetchUserEmail` and `getUserEmail` had NO tests: a focused mutation run
 * (PL-22, MUT-07) found all 23 of their behavioural mutants uncovered. Between
 * them they decide which credential goes on the wire, whether a refusal is read
 * as an answer, and whether the cached email is trusted — none of which was
 * constrained by anything.
 *
 * The helper-cache bridge is mocked out, as in the sibling suites; it has its
 * own coverage in daAuthHelperToken.test and the fallback suite.
 */

jest.mock('@/features/eds/services/daAuthHelperToken', () => ({
    readDaAuthHelperToken: jest.fn(() => null),
    writeDaAuthHelperToken: jest.fn(() => false),
}));

import { DaLiveAuthService } from './daLiveAuthService.testUtils';
import {
    createMockExtensionContext,
    createStatefulGlobalState,
} from '../../../../helpers/extensionContextFake';

const IMS_PROFILE_URL = 'https://ims-na1.adobelogin.com/ims/profile/v1';

describe('DaLiveAuthService — IMS profile email', () => {
    const realFetch = global.fetch;
    let service: DaLiveAuthService;
    let store: Map<string, unknown>;

    /** A service over a globalState pre-loaded with `initial`. */
    function makeService(initial: Record<string, unknown> = {}) {
        const stateful = createStatefulGlobalState(initial);
        store = stateful.store;
        service = new DaLiveAuthService(
            createMockExtensionContext({ globalState: stateful.globalState }),
        );
    }

    /** globalState holding a token that passes the 5-minute expiry buffer. */
    const withStoredToken = (accessToken = 'stored-token') => ({
        'daLive.accessToken': accessToken,
        'daLive.tokenExpiration': Date.now() + 3600_000,
    });

    const imsAnswers = (payload: unknown, status = 200) => {
        global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status }));
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterEach(() => {
        global.fetch = realFetch;
        service.dispose();
    });

    describe('fetchUserEmail', () => {
        it('puts the token it was handed on the wire, not the stored one', async () => {
            makeService(withStoredToken());
            imsAnswers({ email: 'a@x.test' });

            await service.fetchUserEmail('explicit-token');

            expect(global.fetch).toHaveBeenCalledWith(IMS_PROFILE_URL, {
                headers: { Authorization: 'Bearer explicit-token' },
            });
        });

        it('falls back to the stored token when handed none', async () => {
            makeService(withStoredToken());
            imsAnswers({ email: 'a@x.test' });

            await service.fetchUserEmail();

            expect(global.fetch).toHaveBeenCalledWith(IMS_PROFILE_URL, {
                headers: { Authorization: 'Bearer stored-token' },
            });
        });

        it('does not call IMS at all when there is no token to send', async () => {
            makeService();
            global.fetch = jest.fn();

            expect(await service.fetchUserEmail()).toBeNull();
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it('returns the profile email and caches it', async () => {
            makeService(withStoredToken());
            imsAnswers({ email: 'a@x.test' });

            expect(await service.fetchUserEmail()).toBe('a@x.test');
            expect(store.get('daLive.userEmail')).toBe('a@x.test');
        });

        it('caches nothing when the profile carries no email', async () => {
            makeService(withStoredToken());
            imsAnswers({ userId: 'no-email-here' });

            expect(await service.fetchUserEmail()).toBeNull();
            expect(store.get('daLive.userEmail')).toBeUndefined();
        });

        it('ignores the body of a refused response rather than reading an email out of it', async () => {
            // A 500 whose body happens to parse is what separates "checked the
            // status" from "parsed whatever came back".
            makeService(withStoredToken());
            imsAnswers({ email: 'ghost@x.test' }, 500);

            expect(await service.fetchUserEmail()).toBeNull();
            expect(store.get('daLive.userEmail')).toBeUndefined();
        });

        it('returns null when the request throws', async () => {
            makeService(withStoredToken());
            global.fetch = jest.fn().mockRejectedValue(new Error('Network timeout'));

            expect(await service.fetchUserEmail()).toBeNull();
        });
    });

    describe('getUserEmail', () => {
        it('answers from the cache without calling IMS', async () => {
            makeService({ ...withStoredToken(), 'daLive.userEmail': 'cached@x.test' });
            global.fetch = jest.fn();

            expect(await service.getUserEmail()).toBe('cached@x.test');
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it('asks IMS when nothing is cached', async () => {
            makeService(withStoredToken());
            imsAnswers({ email: 'fresh@x.test' });

            expect(await service.getUserEmail()).toBe('fresh@x.test');
        });
    });
});
