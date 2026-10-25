/**
 * signInSession — the running Adobe sign-in's link, and its Cancel.
 *
 * The printed text below is what `aio auth login` wrote to stderr on 2026-10-23
 * (captured from a real run; the link's id and port replaced).
 */

import {
    beginSignIn,
    cancelSignIn,
    signInLink,
    signInLinkIn,
    signInWasCancelled,
} from '@/core/auth/signInSession';

const LINK = 'https://aio-login.adobeioruntime.net/api/v1/web/default/applogin?id=abc&port=50649';
const PRINTED = `  Visit this url to log in:\n${LINK}\n- Waiting for browser login...\n`;

describe('signInLinkIn', () => {
    it('finds the link aio auth login prints', () => {
        expect(signInLinkIn(PRINTED)).toBe(LINK);
    });

    it("finds the link the login library prints when it cannot open a browser", () => {
        const printed = `Login URI (for manual use if browser does not open automatically):\n${LINK}\n`;
        expect(signInLinkIn(printed)).toBe(LINK);
    });

    it('waits for the link while only the line before it has arrived', () => {
        expect(signInLinkIn('  Visit this url to log in:\n')).toBeUndefined();
    });
});

describe('the running sign-in', () => {
    it('hands the link to whatever started waiting before the sign-in began', async () => {
        const waiting = signInLink();
        const run = beginSignIn();

        run.announceLink(LINK);

        await expect(waiting).resolves.toBe(LINK);
        run.end();
    });

    it('hands the link straight back once it has been printed', async () => {
        const run = beginSignIn();
        run.announceLink(LINK);

        await expect(signInLink()).resolves.toBe(LINK);
        run.end();
    });

    it('stops the sign-in on Cancel, and remembers it was the SC who stopped it', () => {
        const run = beginSignIn();

        cancelSignIn();

        expect(run.signal.aborted).toBe(true);
        expect(signInWasCancelled()).toBe(true);
        run.end();
    });

    it('forgets a cancel when the next sign-in begins', () => {
        const first = beginSignIn();
        cancelSignIn();
        first.end();

        const next = beginSignIn();

        expect(signInWasCancelled()).toBe(false);
        expect(next.signal.aborted).toBe(false);
        next.end();
    });

    it('has nothing to cancel once the sign-in has ended', () => {
        const run = beginSignIn();
        run.end();

        cancelSignIn();

        expect(run.signal.aborted).toBe(false);
        expect(signInWasCancelled()).toBe(false);
    });
});
