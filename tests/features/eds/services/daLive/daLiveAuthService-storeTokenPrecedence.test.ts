/**
 * DA.live auth — which source wins when storing a token.
 *
 * `storeToken` takes expiry and email from two places: pre-validated `opts` from
 * the caller, and the JWT's own claims. The guards that keep those apart were
 * unconstrained (PL-22, MUT-07) — every mutant that made the JWT overwrite a
 * pre-validated value, or that skipped filling in the half `opts` did not
 * supply, survived. The failure mode is quiet in both directions: a token stored
 * with the wrong expiry reads as valid past its life, and one stored with no
 * expiry never mirrors to the helper cache at all.
 */

jest.mock('@/features/eds/services/daAuthHelperToken', () => ({
    readDaAuthHelperToken: jest.fn(() => null),
    writeDaAuthHelperToken: jest.fn(() => true),
}));

import { DaLiveAuthService } from './daLiveAuthService.testUtils';
import { writeDaAuthHelperToken } from '@/features/eds/services/daAuthHelperToken';
import {
    createMockExtensionContext,
    createStatefulGlobalState,
} from '../../../../helpers/extensionContextFake';

const writeMock = writeDaAuthHelperToken as jest.Mock;

/** A JWT whose payload is `payload`. The signature is not checked by this code. */
function jwtWith(payload: Record<string, unknown>): string {
    const part = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64');
    return `${part({ alg: 'HS256' })}.${part(payload)}.test-signature`;
}

/** created_at + expires_in = 3000, deliberately unlike any opts value below. */
const JWT_CLAIMS = { email: 'jwt@x.test', created_at: '1000', expires_in: '2000' };
const JWT_EXPIRES_AT = 3000;
const OPTS_EXPIRES_AT = 111;

describe('DaLiveAuthService.storeToken — opts versus JWT claims', () => {
    let service: DaLiveAuthService;
    let store: Map<string, unknown>;

    function makeService() {
        const stateful = createStatefulGlobalState();
        store = stateful.store;
        service = new DaLiveAuthService(
            createMockExtensionContext({ globalState: stateful.globalState }),
        );
    }

    beforeEach(() => {
        jest.clearAllMocks();
        makeService();
    });

    afterEach(() => {
        service.dispose();
    });

    it('fills in the email from the JWT when only the expiry was pre-validated', async () => {
        await service.storeToken(jwtWith(JWT_CLAIMS), { expiresAt: OPTS_EXPIRES_AT });

        expect(store.get('daLive.userEmail')).toBe('jwt@x.test');
        // And the pre-validated expiry is NOT overwritten by the JWT's.
        expect(store.get('daLive.tokenExpiration')).toBe(OPTS_EXPIRES_AT);
    });

    it('fills in the expiry from the JWT when only the email was pre-validated', async () => {
        await service.storeToken(jwtWith(JWT_CLAIMS), { email: 'opts@x.test' });

        expect(store.get('daLive.tokenExpiration')).toBe(JWT_EXPIRES_AT);
        // And the pre-validated email is NOT overwritten by the JWT's.
        expect(store.get('daLive.userEmail')).toBe('opts@x.test');
    });

    it('stores no email at all when the JWT carries neither claim', async () => {
        await service.storeToken(jwtWith({ created_at: '1000', expires_in: '2000' }), {
            expiresAt: OPTS_EXPIRES_AT,
        });

        expect(store.get('daLive.userEmail')).toBeUndefined();
    });

    it('reads the email from preferred_username when there is no email claim', async () => {
        await service.storeToken(jwtWith({ preferred_username: 'alt@x.test' }), {
            expiresAt: OPTS_EXPIRES_AT,
        });

        expect(store.get('daLive.userEmail')).toBe('alt@x.test');
    });

    it('does not mirror to the helper cache when no expiry could be determined', async () => {
        // The mirror writes {accessToken, expiresAt}; with no expiry it would
        // write an undefined one, which the helper cache cannot age out.
        await service.storeToken(jwtWith({ email: 'jwt@x.test' }));

        expect(store.get('daLive.tokenExpiration')).toBeUndefined();
        expect(writeMock).not.toHaveBeenCalled();
    });

    it('mirrors once an expiry is known', async () => {
        const token = jwtWith(JWT_CLAIMS);

        await service.storeToken(token);

        expect(writeMock).toHaveBeenCalledWith({
            accessToken: token,
            expiresAt: JWT_EXPIRES_AT,
        });
    });

    it('stops notifying sign-in listeners once disposed', async () => {
        const seen: number[] = [];
        service.onDidSignIn(() => seen.push(1));

        service.dispose();
        await service.storeToken(jwtWith(JWT_CLAIMS));

        expect(seen).toEqual([]);
    });
});
