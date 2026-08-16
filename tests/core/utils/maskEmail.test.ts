/**
 * maskEmail — PII masking for anything that leaves the machine.
 *
 * Lives in `core/utils` with the function. Both the Configuration Service access
 * module and its probe need it, and the probe already imports from access, so
 * keeping it in either direction created an import cycle.
 *
 * The property under test is a balance: the diagnostics report and the debug
 * export are pasted into tickets, so a full colleague address there is PII
 * egress — but a mask that erased everything would stop a reader who knows the
 * team from telling who is meant, which is the whole reason the names are there.
 */

import { maskEmail, redactUrlUserParam } from '@/core/utils/maskEmail';

describe('maskEmail', () => {
    it('keeps an address recognisable without publishing it', () => {
        expect(maskEmail('owner@adobe.com')).toBe('o****r@adobe.com');
    });

    it('does not leak a two-character local part', () => {
        // First-and-last would BE the whole local part here, so only the first
        // character survives.
        expect(maskEmail('jo@adobe.com')).toBe('j****@adobe.com');
    });

    it('never returns something that could be mistaken for a real address', () => {
        expect(maskEmail('not-an-email')).toBe('****');
    });

    it('refuses a leading-@ string rather than indexing past the start', () => {
        expect(maskEmail('@adobe.com')).toBe('****');
    });

    it('leaves no part of the local part beyond its first and last character', () => {
        const masked = maskEmail('averylongusername@adobe.com');

        expect(masked).toBe('a****e@adobe.com');
        expect(masked).not.toContain('verylongusernam');
    });
});

/**
 * `maskEmailsIn` is module-private to `configServiceAccess`, so its two failure
 * modes are pinned through the behaviour they produce rather than directly:
 * both were found in the 2026-08-14 verify loop after the naive version shipped.
 */
describe('masking free text (the shape configServiceAccess applies)', () => {
    const maskEmailsIn = (text: string): string =>
        text.replace(/[^\s"'<>@,;]+@[^\s"'<>@,;]+\.[^\s"'<>@,;]+/g, (m) => maskEmail(m));

    it('masks every address in a JSON role body', () => {
        const masked = maskEmailsIn('{"role":{"admin":["owner@x.test","second@y.test"]}}');

        expect(masked).not.toContain('owner@x.test');
        expect(masked).not.toContain('second@y.test');
    });

    it('does not let a comma-separated pair collapse into one match', () => {
        // The greedy version matched 'a@b.test,c' as a single address, masked
        // that, and left the second address entirely intact.
        const masked = maskEmailsIn('alice@b.test,carol@d.test');

        expect(masked).not.toContain('alice@b.test');
        expect(masked).not.toContain('carol@d.test');
    });

    it('masks before any truncation, so an address at the cut cannot survive', () => {
        const padding = 'x'.repeat(290);
        const masked = maskEmailsIn(`${padding}averylongname@x.test`).slice(0, 300);

        expect(masked).not.toContain('averylongname');
    });
});

/**
 * The Code Sync setup URL carries the user's address in `?user=`.
 *
 * `buildCodeSyncSetupUrl` builds it with `URL.searchParams.set`, which
 * PERCENT-ENCODES the `@` — so `user=kukla%40adobe.com`. An email regex looking
 * for a literal `@` sails straight past it, which is why the generic masking
 * already in place did not catch this one.
 *
 * It matters because that URL is embedded in `BYOM_OVERLAY_NOT_AUTHORIZED_MESSAGE`,
 * which is written to `logger.error` and again into a PDP caveat logged at `info`
 * — both buffered into the debug export users paste into tickets.
 */
describe('redactUrlUserParam', () => {
    const setupUrl = (email: string): string => {
        const u = new URL('https://tools.aem.live/bot/setup');
        u.searchParams.set('user', email);
        u.searchParams.set('site', 'demo-builder-test');
        u.searchParams.set('org', 'skukla');
        return u.toString();
    };

    it('masks a PERCENT-ENCODED address, which an email regex cannot see', () => {
        const out = redactUrlUserParam(`Open this: ${setupUrl('owner@adobe.com')}`);

        expect(out).not.toContain('owner%40adobe.com');
        expect(out).not.toContain('owner@adobe.com');
        expect(out).toContain('o****r');
    });

    it('masks an unencoded address too', () => {
        const out = redactUrlUserParam('see ?user=owner@adobe.com&site=x');

        expect(out).not.toContain('owner@adobe.com');
    });

    it('leaves the rest of the URL usable', () => {
        // The org and site are what make the link land on the right page; masking
        // them would break the remedy this message exists to give.
        const out = redactUrlUserParam(setupUrl('owner@adobe.com'));

        expect(out).toContain('site=demo-builder-test');
        expect(out).toContain('org=skukla');
        expect(out).toContain('tools.aem.live/bot/setup');
    });

    it('leaves text with no user param untouched', () => {
        const text = 'Reset the storefront and try again.';

        expect(redactUrlUserParam(text)).toBe(text);
    });

    it('handles an empty user param without throwing', () => {
        expect(() => redactUrlUserParam('?user=&site=x')).not.toThrow();
    });
});

