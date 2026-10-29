/**
 * What a sign-in did besides signing in, handed to the caller that collects it.
 */
import { collectSignInNotices, reportSignInNotice } from '@/core/auth/signInNotices';

describe('signInNotices', () => {
    it('hands a notice reported deep inside the sign-in to the caller collecting', async () => {
        const { result, notices } = await collectSignInNotices(async () => {
            await Promise.resolve();
            expect(reportSignInNotice('Signed out of DA.live.')).toBe(true);
            return 'signed in';
        });

        expect(result).toBe('signed in');
        expect(notices).toStrictEqual(['Signed out of DA.live.']);
    });

    it('says nobody heard it outside a collector, so the reporter tells the SC itself', () => {
        expect(reportSignInNotice('Signed out of DA.live.')).toBe(false);
    });

    it('keeps two concurrent collectors apart', async () => {
        const first = collectSignInNotices(async () => {
            await new Promise((resolve) => setImmediate(resolve));
            reportSignInNotice('first');
        });
        const second = collectSignInNotices(async () => {
            reportSignInNotice('second');
        });

        expect((await first).notices).toStrictEqual(['first']);
        expect((await second).notices).toStrictEqual(['second']);
    });
});
