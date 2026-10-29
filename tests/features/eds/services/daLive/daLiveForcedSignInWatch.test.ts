/**
 * After a forced Adobe sign-in, is the DA.live sign-in still there? (2026-10-28: a
 * forced sign-in cancelled one with 23 hours left.) The reader is handed in, so these
 * drive the decision alone: who is told, and when nobody is.
 */
import type { DaLiveSignIn } from '@/features/eds/services/daLive/daLiveAuthService';
import {
    createDaLiveForcedSignInWatch,
    DA_LIVE_SIGNED_OUT_BY_ADOBE,
} from '@/features/eds/services/daLive/daLiveForcedSignInWatch';

const TOKEN = { accessToken: 'stored', expiresAt: Date.now() + 3_600_000 };
const as = (state: 'valid' | 'refused' | 'unknown'): DaLiveSignIn => ({ state, token: TOKEN });
const NONE: DaLiveSignIn = { state: 'none' };

/** The reader answers `before`, then `after`. */
function run(before: DaLiveSignIn, after: DaLiveSignIn) {
    const checkSignIn = jest.fn().mockResolvedValueOnce(before).mockResolvedValueOnce(after);
    const tell = jest.fn();
    const watch = createDaLiveForcedSignInWatch({ checkSignIn }, tell);
    return { checkSignIn, tell, go: async () => (await watch())() };
}

describe('createDaLiveForcedSignInWatch', () => {
    it('tells the SC when a working DA.live sign-in is refused after the forced sign-in', async () => {
        const { tell, go } = run(as('valid'), as('refused'));

        await go();

        expect(tell).toHaveBeenCalledWith('Signing in to Adobe again also signed you out of DA.live.');
        expect(tell).toHaveBeenCalledWith(DA_LIVE_SIGNED_OUT_BY_ADOBE);
    });

    it('says nothing when DA.live still works afterwards', async () => {
        const { tell, go } = run(as('valid'), as('valid'));
        await go();
        expect(tell).not.toHaveBeenCalled();
    });

    it('says nothing, and checks once, for an SC with no DA.live sign-in stored', async () => {
        const { tell, checkSignIn, go } = run(NONE, as('refused'));
        await go();
        expect(tell).not.toHaveBeenCalled();
        expect(checkSignIn).toHaveBeenCalledTimes(1);
    });

    it('says nothing when the sign-in was already refused before: this sign-in did not end it', async () => {
        const { tell, go } = run(as('refused'), as('refused'));
        await go();
        expect(tell).not.toHaveBeenCalled();
    });

    it('says nothing when IMS could not answer, before or after: nothing was shown lost', async () => {
        const before = run(as('unknown'), as('refused'));
        await before.go();
        expect(before.tell).not.toHaveBeenCalled();

        const after = run(as('valid'), as('unknown'));
        await after.go();
        expect(after.tell).not.toHaveBeenCalled();
    });
});
