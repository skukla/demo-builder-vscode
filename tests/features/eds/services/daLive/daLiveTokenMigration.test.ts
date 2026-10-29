/**
 * Moving the DA.live access token out of globalState and into SecretStorage.
 *
 * Before 2026-10-09 the token sat in globalState, which VS Code keeps as plain,
 * unencrypted data on disk, while every other credential the extension holds was
 * already in SecretStorage (the OS keychain). This is the one-time move for an SC
 * who signed in before that change, so nobody has to sign in again.
 *
 * The sequencing is the whole safety property, copied from
 * `commerceSecretMigration`: write, read back, and only then remove the old copy.
 * A keychain that refuses the write, or accepts it and stores nothing, must leave
 * the globalState copy exactly where it was.
 */

import { createStatefulGlobalState } from '../../../../helpers/extensionContextFake';
import { fakeJwt } from '../../../../helpers/jwtFake';
import { createMockSecretStorage } from '../../../../helpers/secretStorageFake';
import {
    DA_LIVE_TOKEN_SECRET_KEY,
    LEGACY_TOKEN_STATE_KEY,
    migrateDaLiveTokenToSecretStorage,
} from '@/features/eds/services/daLive/daLiveTokenMigration';

const token = fakeJwt({ note: 'legacy-session' });

/** The non-secret session fields that stay in globalState. */
const NON_SECRET_STATE = {
    'daLive.tokenExpiration': 1_900_000_000_000,
    'daLive.userEmail': 'sc@x.test',
    'daLive.orgName': 'demo-org',
};

describe('migrateDaLiveTokenToSecretStorage', () => {
    it('moves a globalState token into SecretStorage and removes the plaintext copy', async () => {
        const { globalState, store: state } = createStatefulGlobalState({
            [LEGACY_TOKEN_STATE_KEY]: token,
        });
        const { secrets, store: keychain } = createMockSecretStorage();

        const result = await migrateDaLiveTokenToSecretStorage(globalState, secrets);

        expect(result).toBe('moved');
        expect(keychain.get(DA_LIVE_TOKEN_SECRET_KEY)).toBe(token);
        expect(state.has(LEGACY_TOKEN_STATE_KEY)).toBe(false);
    });

    it('verifies by reading back BEFORE it removes the globalState copy', async () => {
        const { globalState } = createStatefulGlobalState({ [LEGACY_TOKEN_STATE_KEY]: token });
        const { secrets } = createMockSecretStorage();

        await migrateDaLiveTokenToSecretStorage(globalState, secrets);

        const readBack = secrets.get.mock.invocationCallOrder[0];
        const removal = (globalState.update as jest.Mock).mock.invocationCallOrder[0];
        expect(readBack).toBeLessThan(removal);
    });

    it('leaves expiry, email and org in globalState — they are not secrets', async () => {
        const { globalState, store: state } = createStatefulGlobalState({
            [LEGACY_TOKEN_STATE_KEY]: token,
            ...NON_SECRET_STATE,
        });
        const { secrets } = createMockSecretStorage();

        await migrateDaLiveTokenToSecretStorage(globalState, secrets);

        expect(Object.fromEntries(state)).toEqual(NON_SECRET_STATE);
    });

    it('leaves globalState untouched when the keychain refuses the write', async () => {
        const { globalState, store: state } = createStatefulGlobalState({
            [LEGACY_TOKEN_STATE_KEY]: token,
        });
        const { secrets } = createMockSecretStorage();
        secrets.store.mockRejectedValue(new Error('keychain locked'));

        const result = await migrateDaLiveTokenToSecretStorage(globalState, secrets);

        expect(result).toBe('retained');
        expect(state.get(LEGACY_TOKEN_STATE_KEY)).toBe(token);
        expect(globalState.update).not.toHaveBeenCalled();
    });

    it('leaves globalState untouched when the write reports success but stores nothing', async () => {
        const { globalState, store: state } = createStatefulGlobalState({
            [LEGACY_TOKEN_STATE_KEY]: token,
        });
        const { secrets } = createMockSecretStorage();
        secrets.store.mockResolvedValue(undefined); // claims success, keeps nothing

        const result = await migrateDaLiveTokenToSecretStorage(globalState, secrets);

        expect(result).toBe('retained');
        expect(state.get(LEGACY_TOKEN_STATE_KEY)).toBe(token);
    });

    it('does nothing when there is no globalState token', async () => {
        const { globalState } = createStatefulGlobalState(NON_SECRET_STATE);
        const { secrets } = createMockSecretStorage();

        const result = await migrateDaLiveTokenToSecretStorage(globalState, secrets);

        expect(result).toBe('none');
        expect(secrets.store).not.toHaveBeenCalled();
        expect(globalState.update).not.toHaveBeenCalled();
    });

    it('is idempotent: a second run finds nothing to move and keeps the stored token', async () => {
        const { globalState } = createStatefulGlobalState({ [LEGACY_TOKEN_STATE_KEY]: token });
        const { secrets, store: keychain } = createMockSecretStorage();

        await migrateDaLiveTokenToSecretStorage(globalState, secrets);
        const second = await migrateDaLiveTokenToSecretStorage(globalState, secrets);

        expect(second).toBe('none');
        expect(keychain.get(DA_LIVE_TOKEN_SECRET_KEY)).toBe(token);
    });

    it('lets a globalState copy win over an older stored one', async () => {
        // Only an older build writes the globalState key, so a copy found there
        // is the newest sign-in (an SC who ran an older build after this one).
        const older = fakeJwt({ note: 'older-session' });
        const { globalState } = createStatefulGlobalState({ [LEGACY_TOKEN_STATE_KEY]: token });
        const { secrets, store: keychain } = createMockSecretStorage({
            [DA_LIVE_TOKEN_SECRET_KEY]: older,
        });

        await migrateDaLiveTokenToSecretStorage(globalState, secrets);

        expect(keychain.get(DA_LIVE_TOKEN_SECRET_KEY)).toBe(token);
    });

    it('never puts the token in a log line', async () => {
        const lines: string[] = [];
        const log = (line: string) => lines.push(line);

        const ok = createStatefulGlobalState({ [LEGACY_TOKEN_STATE_KEY]: token });
        await migrateDaLiveTokenToSecretStorage(ok.globalState, createMockSecretStorage().secrets, log);

        const refused = createStatefulGlobalState({ [LEGACY_TOKEN_STATE_KEY]: token });
        const { secrets } = createMockSecretStorage();
        secrets.store.mockRejectedValue(new Error(`refused ${token}`));
        await migrateDaLiveTokenToSecretStorage(refused.globalState, secrets, log);

        expect(lines.length).toBeGreaterThan(0);
        expect(lines.some((line) => line.includes(token))).toBe(false);
    });
});
